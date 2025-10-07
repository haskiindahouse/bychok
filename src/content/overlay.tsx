import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { handlePlaySoundMessage, isPlaySoundMessage } from '../shared/audio.js';
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
  brandPrimary: '#7B6AFF',
  brandSecondary: '#2EF4D1',
  brandAccent: '#6CE7FF',
  neutral900: '#0E1124',
  neutral700: '#242948',
  neutral100: '#EEF2FF',
  neutral50: '#F9FAFF',
  shadow: '0 28px 64px rgba(10, 12, 30, 0.35)'
};

function resolveAsset(path: string): string {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
      return chrome.runtime.getURL(path);
    }
  } catch (_error) {
    // ignore — fallback below
  }
  return path;
}

const LOGO_URL = resolveAsset('assets/icons/icon-32.ico');

const DEFAULT_SETTINGS: Settings = {
  tz: '+00:00',
  quietHours: [[22, 7]],
  notifications: true,
  audioEnabled: true,
  focusEntrySound: 'chime-soft',
  sessionLengthMinutes: 5,
  focusPresets: [5, 15, 25, 45],
  savedSites: [],
  overlayTransparency: 0.8
};

interface OverlayState {
  settings: Settings | null;
  isVisible: boolean;
  isFocusing: boolean;
  remainingMs: number;
  isCentered: boolean;
}

type ActivityStatus = 'idle' | 'armed';

function injectStyles(transparency: number): void {
  let style = document.getElementById('bychok-overlay-styles') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'bychok-overlay-styles';
    document.head.appendChild(style);
  }
  const deepAlpha = Math.min(0.95, 0.55 + transparency * 0.4);
  const lightAlpha = Math.min(0.75, 0.25 + transparency * 0.35);
  const haloAlpha = Math.min(0.45, 0.2 + transparency * 0.3);
  style.textContent = `
    :root {
      --brand-primary: ${TOKENS.brandPrimary};
      --brand-secondary: ${TOKENS.brandSecondary};
      --brand-accent: ${TOKENS.brandAccent};
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
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      pointer-events: none;
      color: var(--neutral-50);
      font-family: "Inter", "SF Pro", "Segoe UI", system-ui;
      z-index: 2147483647;
    }
    .bychok-overlay--centered {
      align-items: center;
      justify-content: center;
    }
    .bychok-overlay--corner {
      align-items: flex-end;
      justify-content: flex-end;
    }
    .bychok-overlay__card {
      position: relative;
      width: 320px;
      max-width: 90vw;
      background: linear-gradient(155deg, rgba(18, 22, 42, ${deepAlpha}), rgba(60, 72, 120, ${lightAlpha}));
      border-radius: var(--radius-lg);
      box-shadow: ${TOKENS.shadow};
      border: 1px solid rgba(120, 130, 200, 0.32);
      backdrop-filter: blur(28px) saturate(140%);
      padding: var(--spacing-md);
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
      overflow: hidden;
      pointer-events: auto;
    }
    .bychok-overlay__card::before {
      content: "";
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at 0% 0%, rgba(108, 231, 255, ${haloAlpha}), transparent 55%),
        radial-gradient(circle at 90% 20%, rgba(46, 244, 209, ${haloAlpha}), transparent 60%);
      pointer-events: none;
    }
    .bychok-overlay__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-sm);
      position: relative;
      z-index: 1;
    }
    .bychok-overlay__brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .bychok-overlay__header-actions {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 8px;
    }
    .bychok-pin-button {
      padding: 6px 12px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.28);
      background: rgba(246, 247, 255, 0.12);
      color: var(--neutral-100);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
    }
    .bychok-pin-button:hover:not([aria-pressed="true"]) {
      background: rgba(246, 247, 255, 0.22);
    }
    .bychok-pin-button[aria-pressed="true"] {
      background: rgba(46, 244, 209, 0.28);
      border-color: rgba(46, 244, 209, 0.55);
      color: var(--brand-secondary);
      box-shadow: 0 12px 26px rgba(46, 244, 209, 0.32);
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
      position: relative;
      z-index: 1;
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
      background: linear-gradient(135deg, rgba(123,106,255,0.95) 0%, rgba(46,244,209,0.88) 100%);
      color: var(--neutral-50);
      box-shadow: 0 18px 38px rgba(46, 244, 209, 0.32);
    }
    .bychok-button--ghost {
      background: rgba(246, 247, 255, 0.16);
      color: var(--neutral-100);
      border: 1px solid rgba(255,255,255,0.24);
    }
    .bychok-overlay__streak {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 14px;
      line-height: 20px;
      position: relative;
      z-index: 1;
    }
  `;
}

function createRootContainer(): HTMLElement {
  let container = document.getElementById('bychok-overlay-root');
  if (!container) {
    container = document.createElement('div');
    container.id = 'bychok-overlay-root';
    container.className = 'bychok-overlay bychok-overlay--centered';
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
    remainingMs: 0,
    isCentered: true
  });
  const [activity, setActivity] = useState<ActivityStatus>('idle');
  const activityRef = useRef<ActivityStatus>('idle');
  const lastHeartbeatRef = useRef<number>(Date.now());
  const focusStartedAt = useRef<number | null>(null);
  const heartbeatTimer = useRef<number | null>(null);
  const siteId = useMemo(() => window.location.hostname || 'unknown-site', []);
  const sessionMinutes = state.settings?.sessionLengthMinutes ?? DEFAULT_SETTINGS.sessionLengthMinutes;
  const savedSites = state.settings?.savedSites ?? [];
  const isSaved = useMemo(() => savedSites.includes(siteId), [savedSites, siteId]);

  useEffect(() => {
    async function fetchSettings() {
      const response = await chrome.runtime.sendMessage({ type: 'settings:read' });
      if (response?.ok && response.settings) {
        const merged: Settings = {
          ...DEFAULT_SETTINGS,
          ...response.settings,
          savedSites: response.settings.savedSites ?? []
        };
        injectStyles(merged.overlayTransparency);
        setState((prev) => ({ ...prev, settings: merged }));
      } else {
        injectStyles(DEFAULT_SETTINGS.overlayTransparency);
        setState((prev) => ({ ...prev, settings: { ...DEFAULT_SETTINGS } }));
      }
    }
    fetchSettings().catch((error) => console.error('Settings read failed', error));
  }, []);

  useEffect(() => {
    const container = document.getElementById('bychok-overlay-root');
    if (!container) {
      return;
    }
    container.classList.toggle('bychok-overlay--centered', state.isCentered);
    container.classList.toggle('bychok-overlay--corner', !state.isCentered);
  }, [state.isCentered]);

  useEffect(() => {
    if (!chrome.runtime?.onMessage) {
      return;
    }

    const listener: Parameters<typeof chrome.runtime.onMessage.addListener>[0] = (message) => {
      if (isPlaySoundMessage(message)) {
        handlePlaySoundMessage(message);
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
    };
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
    const settings = state.settings ?? DEFAULT_SETTINGS;
    const durationMinutes = settings.sessionLengthMinutes;
    const payload: FocusModeState = {
      siteId,
      startedAt: Date.now(),
      durationMinutes
    };
    focusStartedAt.current = payload.startedAt;
    setState((prev) => ({ ...prev, isFocusing: true, remainingMs: durationMinutes * 60_000, isCentered: false }));
    await chrome.runtime.sendMessage({ type: 'focus-mode:start', payload });
  };

  const handleStopFocus = async () => {
    focusStartedAt.current = null;
    setState((prev) => ({ ...prev, isFocusing: false, remainingMs: 0 }));
    await chrome.runtime.sendMessage({ type: 'focus-mode:stop' });
  };

  const handleToggleSaved = async () => {
    const previousSettings = state.settings;
    const sourceSettings = previousSettings ?? DEFAULT_SETTINGS;
    const nextSet = new Set(sourceSettings.savedSites ?? []);
    if (nextSet.has(siteId)) {
      nextSet.delete(siteId);
    } else {
      nextSet.add(siteId);
    }
    const nextSavedSites = Array.from(nextSet).sort((a, b) => a.localeCompare(b));
    const optimisticSettings = previousSettings
      ? { ...previousSettings, savedSites: nextSavedSites }
      : { ...DEFAULT_SETTINGS, savedSites: nextSavedSites };
    setState((prev) => ({ ...prev, settings: optimisticSettings }));
    try {
      const response = await chrome.runtime.sendMessage({ type: 'settings:update', payload: { savedSites: nextSavedSites } });
      if (response?.ok && response.settings) {
        const merged: Settings = {
          ...DEFAULT_SETTINGS,
          ...response.settings,
          savedSites: response.settings.savedSites ?? nextSavedSites
        };
        injectStyles(merged.overlayTransparency);
        setState((prev) => ({ ...prev, settings: merged }));
      }
    } catch (error) {
      console.error('Failed to update saved sites', error);
      if (previousSettings) {
        injectStyles(previousSettings.overlayTransparency);
        setState((prev) => ({ ...prev, settings: previousSettings }));
      } else {
        injectStyles(DEFAULT_SETTINGS.overlayTransparency);
        setState((prev) => ({ ...prev, settings: { ...DEFAULT_SETTINGS } }));
      }
    }
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
        <div className="bychok-overlay__brand">
          <img
            src={LOGO_URL}
            alt="Логотип Бычка"
            width={36}
            height={36}
            style={{ borderRadius: 12, boxShadow: '0 8px 18px rgba(46,244,209,0.32)' }}
          />
          <div>
            <p style={{ fontSize: '13px', margin: 0, color: TOKENS.brandSecondary, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Focus vibe
            </p>
            <h2 style={{ fontSize: '20px', lineHeight: '26px', margin: 0 }}>На {siteId}</h2>
          </div>
        </div>
        <div className="bychok-overlay__header-actions">
          <button
            type="button"
            className="bychok-pin-button"
            onClick={() => void handleToggleSaved()}
            aria-pressed={isSaved}
            title={isSaved ? 'Сайт сохранён для фокус-режима' : 'Добавить сайт в список фокуса'}
          >
            {isSaved ? 'В списке' : 'Сохранить'}
          </button>
          <span className="bychok-overlay__timer" aria-live="polite">
            {state.isFocusing ? formatDuration(state.remainingMs) : `${sessionMinutes}:00`}
          </span>
        </div>
      </header>
      <section aria-live="polite">
        {state.isFocusing ? (
          <p style={{ margin: 0 }}>
            Поток пошёл! Держим {sessionMinutes}-минутный спринт, Бычок уже считает секунды.
          </p>
        ) : (
          <p style={{ margin: 0 }}>
            Жми «Гоу» — Bychok зафиксирует вкладку и подаст сигнал, когда таймер дойдёт до нуля.
            {isSaved ? ' Сайт уже в твоём фокус-листе.' : ' Сохрани сайт, чтобы возвращаться сюда одним кликом.'}
          </p>
        )}
      </section>
      <div className="bychok-overlay__actions">
        {state.isFocusing ? (
          <button
            type="button"
            className="bychok-button bychok-button--ghost"
            onClick={handleStopFocus}
          >
            Стоп
          </button>
        ) : (
          <button
            type="button"
            className="bychok-button bychok-button--primary"
            onClick={handleStartFocus}
          >
            Гоу
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
        <span>Слот: 12 с активности</span>
        <span aria-live="polite">
          {activity === 'armed' ? 'Записываю движ' : 'Жду движений'}
          {isSaved ? ' • В фокус-листе' : ''}
        </span>
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

function initOverlay(): void {
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
