import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FocusModeState, Settings } from '../shared/types.js';

const SLOT_DURATION_MS = 12_000;
const HEARTBEAT_EVENTS: Array<keyof DocumentEventMap> = [
  'visibilitychange',
  'keydown',
  'pointerdown',
  'pointermove',
  'wheel',
  'scroll'
];

const TOKENS = {
  brandPrimary: '#6A5AF9',
  brandSecondary: '#2EF4D1',
  brandWarm: '#FFD166',
  neutral900: '#0F1020',
  neutral700: '#262842',
  neutral100: '#E8EAFF',
  neutral50: '#F6F7FF',
  shadow: '0 12px 28px rgba(15, 16, 32, 0.18)'
};

interface OverlayState {
  settings: Settings | null;
  isVisible: boolean;
  isFocusing: boolean;
  remainingMs: number;
}

type ActivityStatus = 'idle' | 'armed';

function injectStyles(transparency: number): void {
  let style = document.getElementById('bychok-overlay-styles') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'bychok-overlay-styles';
    document.head.appendChild(style);
  }
  style.textContent = `
    :root {
      --brand-primary: ${TOKENS.brandPrimary};
      --brand-secondary: ${TOKENS.brandSecondary};
      --brand-warm: ${TOKENS.brandWarm};
      --neutral-900: ${TOKENS.neutral900};
      --neutral-700: ${TOKENS.neutral700};
      --neutral-100: ${TOKENS.neutral100};
      --neutral-50: ${TOKENS.neutral50};
      --overlay-alpha: ${transparency};
      --radius-lg: 24px;
      --spacing-md: 16px;
      --spacing-sm: 12px;
    }
    .bychok-overlay {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 320px;
      max-width: 90vw;
      color: var(--neutral-50);
      font-family: "Inter", "SF Pro", "Segoe UI", system-ui;
      z-index: 2147483647;
    }
    .bychok-overlay__card {
      background: rgba(15, 16, 32, var(--overlay-alpha));
      border-radius: var(--radius-lg);
      box-shadow: ${TOKENS.shadow};
      border: 1px solid rgba(110, 115, 145, 0.2);
      backdrop-filter: blur(12px);
      padding: var(--spacing-md);
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }
    .bychok-overlay__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-sm);
    }
    .bychok-overlay__timer {
      font-family: "JetBrains Mono", "Inter", monospace;
      font-size: 24px;
      line-height: 28px;
      font-weight: 600;
      letter-spacing: 0.04em;
    }
    .bychok-overlay__actions {
      display: flex;
      gap: var(--spacing-sm);
    }
    .bychok-button {
      flex: 1;
      padding: 12px;
      border-radius: 16px;
      border: none;
      cursor: pointer;
      font-size: 16px;
      font-weight: 600;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .bychok-button:focus-visible {
      outline: 3px solid var(--brand-secondary);
      outline-offset: 3px;
    }
    .bychok-button--primary {
      background: linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-secondary) 100%);
      color: var(--neutral-50);
    }
    .bychok-button--ghost {
      background: rgba(246, 247, 255, 0.12);
      color: var(--neutral-100);
    }
    .bychok-overlay__streak {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 14px;
      line-height: 20px;
    }
  `;
}

function createRootContainer(): HTMLElement {
  let container = document.getElementById('bychok-overlay-root');
  if (!container) {
    container = document.createElement('div');
    container.id = 'bychok-overlay-root';
    container.className = 'bychok-overlay';
    container.setAttribute('role', 'complementary');
    container.setAttribute('aria-label', 'Bychok focus companion');
    document.body.appendChild(container);
  }
  return container;
}

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function Overlay(): JSX.Element {
  const [state, setState] = useState<OverlayState>({
    settings: null,
    isVisible: true,
    isFocusing: false,
    remainingMs: 0
  });
  const [activity, setActivity] = useState<ActivityStatus>('idle');
  const activityRef = useRef<ActivityStatus>('idle');
  const lastHeartbeatRef = useRef<number>(Date.now());
  const focusStartedAt = useRef<number | null>(null);
  const heartbeatTimer = useRef<number | null>(null);
  const siteId = useMemo(() => window.location.hostname || 'unknown-site', []);

  useEffect(() => {
    async function fetchSettings() {
      const response = await chrome.runtime.sendMessage({ type: 'settings:read' });
      if (response?.ok && response.settings) {
        injectStyles(response.settings.overlayTransparency);
        setState((prev) => ({ ...prev, settings: response.settings }));
      } else {
        injectStyles(0.8);
      }
    }
    fetchSettings().catch((error) => console.error('Settings read failed', error));
  }, []);

  useEffect(() => {
    function markActive() {
      lastHeartbeatRef.current = Date.now();
      activityRef.current = 'armed';
      setActivity('armed');
    }

    const listeners: Array<[keyof DocumentEventMap, EventListener]> = HEARTBEAT_EVENTS.map((eventName) => {
      const handler = () => markActive();
      document.addEventListener(eventName, handler, { passive: true });
      return [eventName, handler];
    });

    return () => {
      listeners.forEach(([eventName, handler]) => document.removeEventListener(eventName, handler));
    };
  }, []);

  useEffect(() => {
    heartbeatTimer.current = window.setInterval(() => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      const now = Date.now();
      if (now - lastHeartbeatRef.current > 30_000) {
        activityRef.current = 'idle';
        setActivity('idle');
        return;
      }
      if (activityRef.current === 'armed') {
        sendHeartbeat(siteId);
        activityRef.current = 'idle';
        setActivity('idle');
      }
    }, SLOT_DURATION_MS);

    return () => {
      if (heartbeatTimer.current) {
        window.clearInterval(heartbeatTimer.current);
      }
    };
  }, [siteId]);

  const handleStartFocus = async () => {
    const settings = state.settings ?? {
      sessionLengthMinutes: 5
    } as Settings;
    const durationMinutes = settings.sessionLengthMinutes;
    const payload: FocusModeState = {
      siteId,
      startedAt: Date.now(),
      durationMinutes
    };
    focusStartedAt.current = payload.startedAt;
    setState((prev) => ({ ...prev, isFocusing: true, remainingMs: durationMinutes * 60_000 }));
    await chrome.runtime.sendMessage({ type: 'focus-mode:start', payload });
  };

  const handleStopFocus = async () => {
    focusStartedAt.current = null;
    setState((prev) => ({ ...prev, isFocusing: false, remainingMs: 0 }));
    await chrome.runtime.sendMessage({ type: 'focus-mode:stop' });
  };

  useEffect(() => {
    if (!state.isFocusing) {
      return;
    }
    const timer = window.setInterval(() => {
      if (!focusStartedAt.current) return;
      const elapsed = Date.now() - focusStartedAt.current;
      const total = (state.settings?.sessionLengthMinutes ?? 5) * 60_000;
      setState((prev) => ({ ...prev, remainingMs: Math.max(0, total - elapsed) }));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [state.isFocusing, state.settings]);

  if (!state.isVisible) {
    return <></>;
  }

  return (
    <div className="bychok-overlay__card">
      <header className="bychok-overlay__header">
        <div>
          <p style={{ fontSize: '14px', margin: 0, color: TOKENS.brandSecondary }}>Focus run</p>
          <h2 style={{ fontSize: '20px', lineHeight: '28px', margin: 0 }}>Сайт: {siteId}</h2>
        </div>
        <span className="bychok-overlay__timer" aria-live="polite">
          {state.isFocusing ? formatDuration(state.remainingMs) : `${state.settings?.sessionLengthMinutes ?? 5}:00`}
        </span>
      </header>
      <section aria-live="polite">
        {state.isFocusing ? (
          <p style={{ margin: 0 }}>Держим темп! Серия продолжается.</p>
        ) : (
          <p style={{ margin: 0 }}>Готовы на {state.settings?.sessionLengthMinutes ?? 5} минут фокуса?</p>
        )}
      </section>
      <div className="bychok-overlay__actions">
        {state.isFocusing ? (
          <button
            type="button"
            className="bychok-button bychok-button--ghost"
            onClick={handleStopFocus}
          >
            Пауза
          </button>
        ) : (
          <button
            type="button"
            className="bychok-button bychok-button--primary"
            onClick={handleStartFocus}
          >
            Старт
          </button>
        )}
        <button
          type="button"
          className="bychok-button bychok-button--ghost"
          onClick={() => setState((prev) => ({ ...prev, isVisible: false }))}
          aria-label="Скрыть оверлей"
        >
          Скрыть
        </button>
      </div>
      <footer className="bychok-overlay__streak">
        <span>Слот: 12 с</span>
        <span aria-live="polite">{activity === 'armed' ? 'Активность' : 'Ожидание'}</span>
      </footer>
    </div>
  );
}

async function sendHeartbeat(siteId: string): Promise<void> {
  const slot = {
    siteId,
    url: window.location.href,
    durationSec: SLOT_DURATION_MS / 1000,
    timestamp: Date.now()
  };
  await chrome.runtime.sendMessage({ type: 'activity-slot', payload: slot });
}

export function initOverlay(): void {
  injectStyles(0.8);
  const container = createRootContainer();
  const root = createRoot(container);
  root.render(<Overlay />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initOverlay());
} else {
  initOverlay();
}
