import { ActivitySlot, Session, Settings, Streak } from '../shared/types.js';
import { upsertSession, upsertStreak } from '../shared/storage.js';

export interface AggregatedData {
  sessions: Session[];
  streaks: Streak[];
}

export function toDateKey(timestamp: number, tz: string): string {
  const offsetMinutes = parseTzOffsetMinutes(tz);
  const date = new Date(timestamp + offsetMinutes * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

export function parseTzOffsetMinutes(tz: string): number {
  const match = tz.match(/([+-])(\d{2}):(\d{2})/);
  if (!match) {
    return 0;
  }
  const [, sign, hours, minutes] = match;
  const value = Number(hours) * 60 + Number(minutes);
  return sign === '-' ? -value : value;
}

export function mergeActivitySlot(
  slot: ActivitySlot,
  data: AggregatedData,
  settings: Settings
): AggregatedData {
  const { sessions, streaks } = data;
  const dateKey = toDateKey(slot.timestamp, settings.tz);
  const sessionId = `${slot.siteId}:${dateKey}`;
  const minutesDelta = slot.durationSec / 60;

  const existingSession = sessions.find((session) => session.id === sessionId);
  const nextSession: Session = existingSession
    ? { ...existingSession, activeMinutes: roundMinutes(existingSession.activeMinutes + minutesDelta) }
    : {
        id: sessionId,
        siteId: slot.siteId,
        date: dateKey,
        activeMinutes: roundMinutes(minutesDelta)
      };

  const nextSessions = upsertSession(sessions, nextSession);
  const nextStreaks = ensureStreakProgress(nextSession, streaks, settings);

  return { sessions: nextSessions, streaks: nextStreaks };
}

function roundMinutes(value: number): number {
  return Math.round(value * 100) / 100;
}

export function ensureStreakProgress(session: Session, streaks: Streak[], settings: Settings): Streak[] {
  const existing = streaks.find((item) => item.siteId === session.siteId);
  const requiredMinutes = Math.max(settings.sessionLengthMinutes, 1);
  if (session.activeMinutes < requiredMinutes) {
    return streaks;
  }

  const today = session.date;
  if (!existing) {
    const newStreak: Streak = { siteId: session.siteId, length: 1, lastDate: today };
    return upsertStreak(streaks, newStreak);
  }

  if (existing.lastDate === today) {
    return streaks;
  }

  const lastDate = new Date(existing.lastDate);
  const currentDate = new Date(today);
  const diffDays = Math.round((currentDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 1) {
    const updated: Streak = {
      ...existing,
      length: existing.length + 1,
      lastDate: today
    };
    return upsertStreak(streaks, updated);
  }

  // streak broken, start over
  const reset: Streak = { siteId: session.siteId, length: 1, lastDate: today };
  return upsertStreak(streaks, reset);
}

export function evaluateQuietHours(settings: Settings, date: Date): { withinQuietHours: boolean; range: [number, number] | null } {
  if (settings.quietHours.length === 0) {
    return { withinQuietHours: false, range: null };
  }

  const localHour = date.getHours();
  for (const [start, end] of settings.quietHours) {
    if (start === end) {
      continue; // empty range
    }
    if (start < end) {
      if (localHour >= start && localHour < end) {
        return { withinQuietHours: true, range: [start, end] };
      }
    } else {
      // overnight range e.g. 22-7
      if (localHour >= start || localHour < end) {
        return { withinQuietHours: true, range: [start, end] };
      }
    }
  }
  return { withinQuietHours: false, range: null };
}

export function shouldWarnStreakExpiry(streak: Streak, now: Date, settings: Settings): boolean {
  if (streak.length === 0) {
    return false;
  }
  const lastDate = new Date(streak.lastDate + 'T00:00:00');
  const diffHours = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60);
  // warn 21 hours after last recorded day (~3 hours before midnight)
  return diffHours >= 21 && diffHours < 48 && settings.notifications;
}
