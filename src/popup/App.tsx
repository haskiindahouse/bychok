import React, { useEffect, useMemo, useState } from 'react';
import { SOUND_LIBRARY } from '../shared/audio.js';
import { Settings } from '../shared/types.js';

const AUDIO_OPTIONS = [
  { id: 'chime-soft', label: 'Ламповый дзынь' },
  { id: 'pulse-air', label: 'Пульс неона' },
  { id: 'mute', label: 'Только вибра' }
];

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

const LOGO_URL = new URL('../../assets/icons/icon-128.ico', import.meta.url).href;

const glassCardBase: React.CSSProperties = {
  borderRadius: 24,
  padding: 20,
  backdropFilter: 'blur(22px)',
  border: '1px solid rgba(255,255,255,0.24)',
  boxShadow: '0 24px 60px rgba(15,16,32,0.24)',
  display: 'flex',
  flexDirection: 'column',
  gap: 16
};

const cardVariants = {
  lilac: {
    ...glassCardBase,
    background: 'linear-gradient(140deg, rgba(123,106,255,0.35), rgba(120,236,255,0.18))'
  },
  cyan: {
    ...glassCardBase,
    background: 'linear-gradient(140deg, rgba(46,244,209,0.24), rgba(106,90,249,0.18))'
  },
  ink: {
    ...glassCardBase,
    background: 'linear-gradient(160deg, rgba(20,24,45,0.55), rgba(41,48,78,0.35))',
    color: '#F5F9FF',
    border: '1px solid rgba(106,90,249,0.35)'
  },
  mint: {
    ...glassCardBase,
    background: 'linear-gradient(145deg, rgba(112,255,224,0.28), rgba(123,106,255,0.18))'
  }
} satisfies Record<'lilac' | 'cyan' | 'ink' | 'mint', React.CSSProperties>;

function useSettings(): [Settings, (next: Partial<Settings>) => Promise<void>] {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    async function load() {
      const response = await chrome.runtime.sendMessage({ type: 'settings:read' });
      if (response?.ok && response.settings) {
        setSettings({ ...DEFAULT_SETTINGS, ...response.settings });
      }
    }
    load().catch((error) => console.error('Failed to load settings', error));
  }, []);

  const update = async (next: Partial<Settings>) => {
    const pending = { ...settings, ...next };
    setSettings(pending);
    await chrome.runtime.sendMessage({ type: 'settings:update', payload: next });
  };

  return [settings, update];
}

export function PopupApp(): JSX.Element {
  const [settings, updateSettings] = useSettings();
  const [newSiteValue, setNewSiteValue] = useState('');
  const quietHoursString = useMemo(
    () =>
      settings.quietHours
        .map(([start, end]) => `${formatHour(start)} – ${formatHour(end)}`)
        .join(', '),
    [settings.quietHours]
  );
  const audioChoices = useMemo(
    () => AUDIO_OPTIONS.filter((option) => option.id === 'mute' || option.id in SOUND_LIBRARY),
    []
  );

  const handlePresetSelect = (value: number) => {
    void updateSettings({ sessionLengthMinutes: value });
  };

  const handleQuietHoursChange = (index: number, position: 'start' | 'end', value: number) => {
    const next = settings.quietHours.map((range, i) =>
      i === index ? (position === 'start' ? [value, range[1]] : [range[0], value]) : range
    ) as Settings['quietHours'];
    void updateSettings({ quietHours: next });
  };

  const handleAddQuietRange = () => {
    const next = [...settings.quietHours, [0, 0] as [number, number]];
    void updateSettings({ quietHours: next });
  };

  const handleRemoveQuietRange = (index: number) => {
    const next = settings.quietHours.filter((_, i) => i !== index) as Settings['quietHours'];
    void updateSettings({ quietHours: next });
  };

  const handleAudioChange = (audioId: string) => {
    const audioEnabled = audioId !== 'mute';
    void updateSettings({ focusEntrySound: audioId === 'mute' ? null : audioId, audioEnabled });
  };

  const isAddDisabled = newSiteValue.trim().length === 0;

  const handleSavedSiteSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeSiteInput(newSiteValue);
    setNewSiteValue('');
    if (!normalized) {
      return;
    }
    if (settings.savedSites.includes(normalized)) {
      return;
    }
    const next = [...settings.savedSites, normalized].sort();
    void updateSettings({ savedSites: next });
  };

  const handleSavedSiteRemove = (siteId: string) => {
    const next = settings.savedSites.filter((site) => site !== siteId);
    void updateSettings({ savedSites: next });
  };

  return (
    <div role="presentation" aria-label="Настройки Bychok" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <img src={LOGO_URL} alt="Логотип Бычка" width={48} height={48} style={{ borderRadius: 18, boxShadow: '0 12px 28px rgba(15,16,32,0.28)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h1 style={{ fontSize: 22, margin: 0, color: '#101328' }}>Фокус-режим Бычка</h1>
            <p style={{ margin: 0, fontSize: 14, color: '#303452' }}>
              Настрой длительность, ночной режим и звук — всё, чтобы держать фокус без лишних pings.
            </p>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: '#445' }}>
          Чтобы начать отсчёт, просто открой вкладку и жми «Гоу» в оверлее. Бычок сам зафиксирует сайт и пошлёт уведомление в конце.
        </p>
      </header>

      <section aria-labelledby="session-length-title" style={cardVariants.lilac}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 id="session-length-title" style={{ margin: 0, fontSize: 18 }}>Сколько фокусимся</h2>
          <span style={{ fontSize: 13, color: 'rgba(15,16,32,0.65)' }}>в минутах</span>
        </div>
        <input
          id="session-length"
          type="number"
          min={1}
          max={180}
          value={settings.sessionLengthMinutes}
          onChange={(event) => handlePresetSelect(Number(event.target.value))}
          style={{
            width: '100%',
            padding: '14px 16px',
            borderRadius: 18,
            border: '1px solid rgba(15,16,32,0.18)',
            background: 'rgba(255,255,255,0.65)',
            fontSize: 16,
            fontWeight: 600,
            color: '#16192e'
          }}
          aria-describedby="session-length-helper"
        />
        <p id="session-length-helper" style={{ margin: 0, fontSize: 12, color: '#2a2f4d' }}>
          Пресеты ниже сохраняются, так что можно быстро прыгать между спринтами.
        </p>
        <div role="group" aria-label="Пресеты" style={{ display: 'flex', gap: 12, marginTop: 4 }}>
          {settings.focusPresets.map((preset) => {
            const isActive = preset === settings.sessionLengthMinutes;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => handlePresetSelect(preset)}
                className="preset-button"
                style={{
                  flex: 1,
                  padding: '12px 0',
                  borderRadius: 16,
                  border: isActive ? '2px solid rgba(46,244,209,0.95)' : '1px solid rgba(15,16,32,0.12)',
                  background: isActive
                    ? 'linear-gradient(135deg, rgba(106,90,249,0.92), rgba(46,244,209,0.92))'
                    : 'rgba(255,255,255,0.75)',
                  color: isActive ? '#F6F7FF' : '#16192e',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'transform 0.2s ease',
                  boxShadow: isActive ? '0 16px 30px rgba(46,244,209,0.28)' : 'none'
                }}
              >
                {preset} мин
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="saved-sites-title" style={cardVariants.mint}>
        <h2 id="saved-sites-title" style={{ margin: 0, fontSize: 18 }}>Сайты для фокуса</h2>
        <p style={{ margin: 0, fontSize: 13, color: '#163343' }}>
          Сохраняй домены — и Бычок подсветит их в оверлее, чтобы ты быстрее входил в фокус.
        </p>
        <form onSubmit={handleSavedSiteSubmit} style={{ display: 'flex', gap: 12, marginTop: 14 }}>
          <input
            type="text"
            value={newSiteValue}
            onChange={(event) => setNewSiteValue(event.target.value)}
            placeholder="leetcode.com"
            style={textInputStyle}
            aria-label="Добавить сайт"
          />
          <button
            type="submit"
            style={{ ...addSiteButtonStyle, opacity: isAddDisabled ? 0.45 : 1, pointerEvents: isAddDisabled ? 'none' : 'auto' }}
            disabled={isAddDisabled}
          >
            Сохранить
          </button>
        </form>
        {settings.savedSites.length > 0 ? (
          <ul style={savedSitesListStyle}>
            {settings.savedSites.map((site) => (
              <li key={site} style={savedSiteItemStyle}>
                <span style={{ fontWeight: 600 }}>{site}</span>
                <button
                  type="button"
                  onClick={() => handleSavedSiteRemove(site)}
                  style={savedSiteRemoveButtonStyle}
                  aria-label={`Удалить сайт ${site} из списка`}
                >
                  Удалить
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ margin: '14px 0 0 0', fontSize: 12, color: '#1c2740' }}>
            Пока пусто. Добавь адрес вручную или нажми «Сохранить» прямо в оверлее.
          </p>
        )}
      </section>

      <section aria-labelledby="quiet-hours-title" style={cardVariants.cyan}>
        <h2 id="quiet-hours-title" style={{ margin: 0, fontSize: 18 }}>Тихие часы</h2>
        <p style={{ margin: 0, fontSize: 13, color: '#162136' }}>
          Когда в силе: {quietHoursString || 'выключены'}. Во время молчаливого окна Бычок не тревожит звуками и пушами.
        </p>
        {settings.quietHours.map(([start, end], index) => (
          <div
            key={index}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr auto',
              gap: 12,
              alignItems: 'center',
              marginTop: 12,
              background: 'rgba(255,255,255,0.55)',
              padding: 12,
              borderRadius: 16,
              border: '1px solid rgba(106,90,249,0.25)'
            }}
          >
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, color: '#1b1f33' }}>c</span>
              <select
                aria-label={`Начало интервала ${index + 1}`}
                value={start}
                onChange={(event) => handleQuietHoursChange(index, 'start', Number(event.target.value))}
                style={selectStyle}
              >
                {hoursOptions()}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, color: '#1b1f33' }}>до</span>
              <select
                aria-label={`Конец интервала ${index + 1}`}
                value={end}
                onChange={(event) => handleQuietHoursChange(index, 'end', Number(event.target.value))}
                style={selectStyle}
              >
                {hoursOptions()}
              </select>
            </label>
            <button
              type="button"
              onClick={() => handleRemoveQuietRange(index)}
              aria-label={`Удалить интервал ${index + 1}`}
              style={{
                ...iconButtonStyle,
                background: 'rgba(15,16,32,0.08)',
                border: '1px solid rgba(15,16,32,0.18)',
                color: '#1b1f33'
              }}
            >
              ✕
            </button>
          </div>
        ))}
        <button type="button" onClick={handleAddQuietRange} style={ghostButtonStyle}>
          Добавить окно тишины
        </button>
      </section>

      <section aria-labelledby="notifications-title" style={cardVariants.ink}>
        <h2 id="notifications-title" style={{ margin: 0, fontSize: 18 }}>Уведомления и звук</h2>
        <p style={{ margin: 0, fontSize: 13 }}>
          Пуши помогают не проспать финал спринта. А звук — это фирменный «пшш» при старте.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
          <span>Браузерные уведомления</span>
          <input
            type="checkbox"
            role="switch"
            aria-checked={settings.notifications}
            checked={settings.notifications}
            onChange={(event) => void updateSettings({ notifications: event.target.checked })}
          />
        </div>
        <label htmlFor="audio-select" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          Звук запуска
          <select
            id="audio-select"
            value={settings.focusEntrySound ?? 'mute'}
            onChange={(event) => handleAudioChange(event.target.value)}
            style={{ ...selectStyle, background: 'rgba(15,16,32,0.32)', color: '#F6F7FF', border: '1px solid rgba(46,244,209,0.45)' }}
          >
            {audioChoices.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </section>
    </div>
  );
}

function formatHour(hour: number): string {
  return `${hour.toString().padStart(2, '0')}:00`;
}

const selectStyle: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: 16,
  border: '1px solid rgba(15,16,32,0.14)',
  fontSize: 14,
  fontWeight: 600,
  background: 'rgba(255,255,255,0.92)',
  color: '#16192e'
};

const textInputStyle: React.CSSProperties = {
  flex: 1,
  padding: '12px 14px',
  borderRadius: 16,
  border: '1px solid rgba(15,16,32,0.14)',
  fontSize: 14,
  fontWeight: 600,
  background: 'rgba(255,255,255,0.92)',
  color: '#16192e'
};

const ghostButtonStyle: React.CSSProperties = {
  padding: '13px 18px',
  borderRadius: 18,
  border: '1px dashed rgba(106,90,249,0.55)',
  background: 'rgba(255,255,255,0.45)',
  color: '#4331d8',
  fontWeight: 700,
  letterSpacing: '0.04em',
  cursor: 'pointer'
};

const iconButtonStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: '50%',
  border: '1px solid rgba(15,16,32,0.12)',
  background: 'rgba(255,255,255,0.85)',
  cursor: 'pointer'
};

const addSiteButtonStyle: React.CSSProperties = {
  padding: '12px 18px',
  borderRadius: 16,
  border: '1px solid rgba(106,90,249,0.45)',
  background: 'linear-gradient(135deg, rgba(106,90,249,0.9), rgba(46,244,209,0.9))',
  color: '#F6F7FF',
  fontWeight: 700,
  letterSpacing: '0.03em',
  cursor: 'pointer',
  boxShadow: '0 12px 28px rgba(46,244,209,0.24)',
  transition: 'transform 0.2s ease'
};

const savedSitesListStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: '16px 0 0 0',
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 12
};

const savedSiteItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px',
  borderRadius: 16,
  background: 'rgba(255,255,255,0.6)',
  border: '1px solid rgba(106,90,249,0.22)',
  color: '#162136'
};

const savedSiteRemoveButtonStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 14,
  border: '1px solid rgba(15,16,32,0.16)',
  background: 'rgba(15,16,32,0.08)',
  color: '#1b1f33',
  fontWeight: 600,
  cursor: 'pointer'
};

function hoursOptions(): JSX.Element[] {
  return Array.from({ length: 24 }, (_, hour) => (
    <option key={hour} value={hour}>
      {formatHour(hour)}
    </option>
  ));
}

function normalizeSiteInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = trimmed.toLowerCase();
  try {
    const url = normalized.includes('://') ? new URL(normalized) : new URL(`https://${normalized}`);
    const hostname = url.hostname.replace(/^www\./, '');
    return hostname || null;
  } catch (_error) {
    const fallbackHost = normalized.replace(/^www\./, '').split(/[/?#]/)[0];
    return fallbackHost || null;
  }
}
