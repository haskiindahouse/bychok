import React, { useEffect, useMemo, useState } from 'react';
import { Settings } from '../shared/types.js';

const AUDIO_OPTIONS = [
  { id: 'chime-soft', label: 'Мягкий звонок' },
  { id: 'pulse-air', label: 'Пульс воздуха' },
  { id: 'mute', label: 'Без звука' }
];

const DEFAULT_SETTINGS: Settings = {
  tz: '+00:00',
  quietHours: [[22, 7]],
  notifications: true,
  audioEnabled: true,
  focusEntrySound: 'chime-soft',
  sessionLengthMinutes: 5,
  focusPresets: [5, 15, 25, 45],
  overlayTransparency: 0.8
};

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
  const quietHoursString = useMemo(
    () =>
      settings.quietHours
        .map(([start, end]) => `${formatHour(start)} – ${formatHour(end)}`)
        .join(', '),
    [settings.quietHours]
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

  return (
    <div role="presentation" aria-label="Настройки Bychok" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Фокус-режим</h1>
        <p style={{ margin: 0, fontSize: 14, color: '#262842' }}>
          Настройте длительность, пресеты и тихие часы. В любое время можно сбросить на значения по умолчанию.
        </p>
      </header>

      <section aria-labelledby="session-length-title" style={{ background: 'rgba(246,247,255,0.72)', borderRadius: 24, padding: 16 }}>
        <h2 id="session-length-title" style={{ marginTop: 0 }}>Длительность сессии</h2>
        <label htmlFor="session-length" style={{ display: 'block', fontSize: 14 }}>
          Минуты
        </label>
        <input
          id="session-length"
          type="number"
          min={1}
          max={180}
          value={settings.sessionLengthMinutes}
          onChange={(event) => handlePresetSelect(Number(event.target.value))}
          style={{ width: '100%', padding: 12, borderRadius: 16, border: '1px solid rgba(15,16,32,0.12)' }}
        />
        <div role="group" aria-label="Пресеты" style={{ display: 'flex', gap: 12, marginTop: 12 }}>
          {settings.focusPresets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => handlePresetSelect(preset)}
              className="preset-button"
              style={{
                flex: 1,
                padding: '12px 0',
                borderRadius: 16,
                border: preset === settings.sessionLengthMinutes ? '2px solid var(--brand-primary)' : '1px solid rgba(15,16,32,0.12)',
                background: preset === settings.sessionLengthMinutes ? 'linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))' : '#fff',
                color: preset === settings.sessionLengthMinutes ? 'var(--neutral-50)' : 'var(--neutral-900)',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {preset} мин
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="quiet-hours-title" style={{ background: 'rgba(15,16,32,0.08)', borderRadius: 24, padding: 16 }}>
        <h2 id="quiet-hours-title" style={{ marginTop: 0 }}>Тихие часы</h2>
        <p style={{ marginTop: 0 }}>Во время тихих часов пуши и звуки отключаются. Сейчас: {quietHoursString || 'выключены'}.</p>
        {settings.quietHours.map(([start, end], index) => (
          <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'center', marginBottom: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="sr-only">Начало интервала</span>
              <select
                aria-label={`Начало интервала ${index + 1}`}
                value={start}
                onChange={(event) => handleQuietHoursChange(index, 'start', Number(event.target.value))}
                style={selectStyle}
              >
                {hoursOptions()}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="sr-only">Конец интервала</span>
              <select
                aria-label={`Конец интервала ${index + 1}`}
                value={end}
                onChange={(event) => handleQuietHoursChange(index, 'end', Number(event.target.value))}
                style={selectStyle}
              >
                {hoursOptions()}
              </select>
            </label>
            <button type="button" onClick={() => handleRemoveQuietRange(index)} aria-label={`Удалить интервал ${index + 1}`} style={iconButtonStyle}>
              ✕
            </button>
          </div>
        ))}
        <button type="button" onClick={handleAddQuietRange} style={ghostButtonStyle}>
          Добавить интервал
        </button>
      </section>

      <section aria-labelledby="notifications-title" style={{ background: 'rgba(255,255,255,0.85)', borderRadius: 24, padding: 16 }}>
        <h2 id="notifications-title" style={{ marginTop: 0 }}>Уведомления и звук</h2>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span>Браузерные уведомления</span>
          <input
            type="checkbox"
            role="switch"
            aria-checked={settings.notifications}
            checked={settings.notifications}
            onChange={(event) => void updateSettings({ notifications: event.target.checked })}
          />
        </div>
        <label htmlFor="audio-select" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          Звук входа в фокус
          <select
            id="audio-select"
            value={settings.focusEntrySound ?? 'mute'}
            onChange={(event) => handleAudioChange(event.target.value)}
            style={selectStyle}
          >
            {AUDIO_OPTIONS.map((option) => (
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
  padding: '10px 12px',
  borderRadius: 16,
  border: '1px solid rgba(15,16,32,0.12)',
  fontSize: 14,
  background: '#fff'
};

const ghostButtonStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderRadius: 16,
  border: '1px dashed rgba(106,90,249,0.6)',
  background: 'transparent',
  color: '#6A5AF9',
  fontWeight: 600,
  cursor: 'pointer'
};

const iconButtonStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: '50%',
  border: '1px solid rgba(15,16,32,0.12)',
  background: '#fff',
  cursor: 'pointer'
};

function hoursOptions(): JSX.Element[] {
  return Array.from({ length: 24 }, (_, hour) => (
    <option key={hour} value={hour}>
      {formatHour(hour)}
    </option>
  ));
}
