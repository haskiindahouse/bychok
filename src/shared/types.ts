export interface Session {
  id: string;
  siteId: string;
  date: string; // ISO date string YYYY-MM-DD in user tz
  activeMinutes: number;
}

export interface Streak {
  siteId: string;
  length: number;
  lastDate: string;
  frozenDaysLeft?: number;
}

export interface Settings {
  tz: string; // offset format +HH:MM
  quietHours: Array<[number, number]>; // start-end in local hours
  notifications: boolean;
  audioEnabled: boolean;
  focusEntrySound: string | null;
  sessionLengthMinutes: number;
  focusPresets: number[]; // minutes
  savedSites: string[];
  overlayTransparency: number; // 0..1
}

export interface ActivitySlot {
  siteId: string;
  url: string;
  durationSec: number;
  timestamp: number; // epoch ms
}

export interface FocusModeState {
  siteId: string;
  startedAt: number;
  durationMinutes: number;
}

export interface QuietHoursEvaluation {
  withinQuietHours: boolean;
  activeRange: [number, number] | null;
}
