import { describe, expect, it } from 'vitest';
import { mergeActivitySlot, evaluateQuietHours, ensureStreakProgress, shouldWarnStreakExpiry } from '../src/service/activity.js';
import { ActivitySlot, Session, Settings, Streak } from '../src/shared/types.js';

const SETTINGS: Settings = {
  tz: '+00:00',
  quietHours: [[22, 7]],
  notifications: true,
  audioEnabled: true,
  focusEntrySound: 'chime-soft',
  sessionLengthMinutes: 5,
  focusPresets: [5, 15, 25, 45],
  overlayTransparency: 0.8
};

describe('mergeActivitySlot', () => {
  it('creates a new session and streak when none exist', () => {
    const slot: ActivitySlot = {
      siteId: 'example.com',
      url: 'https://example.com',
      durationSec: 600,
      timestamp: Date.UTC(2023, 0, 1, 12, 0, 0)
    };
    const result = mergeActivitySlot(slot, { sessions: [], streaks: [] }, SETTINGS);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].activeMinutes).toBeCloseTo(10, 5);
    expect(result.streaks).toHaveLength(1);
    expect(result.streaks[0].length).toBe(1);
  });

  it('accumulates minutes in existing session', () => {
    const slot: ActivitySlot = {
      siteId: 'example.com',
      url: 'https://example.com',
      durationSec: 300,
      timestamp: Date.UTC(2023, 0, 1, 12, 10, 0)
    };
    const session: Session = {
      id: 'example.com:2023-01-01',
      siteId: 'example.com',
      date: '2023-01-01',
      activeMinutes: 6
    };
    const streak: Streak = { siteId: 'example.com', length: 1, lastDate: '2023-01-01' };
    const result = mergeActivitySlot(slot, { sessions: [session], streaks: [streak] }, SETTINGS);
    expect(result.sessions[0].activeMinutes).toBeCloseTo(11, 5);
  });
});

describe('ensureStreakProgress', () => {
  it('increments streak on consecutive day above threshold', () => {
    const yesterday: Session = {
      id: 'example.com:2023-01-01',
      siteId: 'example.com',
      date: '2023-01-01',
      activeMinutes: 5
    };
    const today: Session = {
      id: 'example.com:2023-01-02',
      siteId: 'example.com',
      date: '2023-01-02',
      activeMinutes: 7
    };
    const streaks = ensureStreakProgress(today, [{ siteId: 'example.com', length: 1, lastDate: '2023-01-01' }], SETTINGS);
    expect(streaks[0].length).toBe(2);
    expect(streaks[0].lastDate).toBe(today.date);
  });
});

describe('evaluateQuietHours', () => {
  it('detects quiet hours across midnight', () => {
    const date = new Date('2023-05-01T23:00:00Z');
    const result = evaluateQuietHours(SETTINGS, date);
    expect(result.withinQuietHours).toBe(true);
    expect(result.activeRange).toEqual([22, 7]);
  });
});

describe('shouldWarnStreakExpiry', () => {
  it('warns after 21 hours since last activity when notifications enabled', () => {
    const streak: Streak = { siteId: 'example.com', length: 5, lastDate: '2023-01-01' };
    const now = new Date('2023-01-02T00:30:00Z');
    expect(shouldWarnStreakExpiry(streak, now, SETTINGS)).toBe(true);
  });

  it('does not warn when notifications disabled', () => {
    const streak: Streak = { siteId: 'example.com', length: 5, lastDate: '2023-01-01' };
    const now = new Date('2023-01-02T00:30:00Z');
    expect(shouldWarnStreakExpiry(streak, now, { ...SETTINGS, notifications: false })).toBe(false);
  });
});
