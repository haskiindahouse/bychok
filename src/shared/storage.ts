import { Session, Settings, Streak } from './types.js';

const STORAGE_KEYS = {
  sessions: 'sessions',
  streaks: 'streaks',
  settings: 'settings'
} as const;

type StorageShape = {
  [STORAGE_KEYS.sessions]: Session[];
  [STORAGE_KEYS.streaks]: Streak[];
  [STORAGE_KEYS.settings]: Settings | null;
};

function getStorage(): chrome.storage.LocalStorageArea {
  if (!chrome?.storage?.local) {
    throw new Error('chrome.storage.local is not available in this context');
  }
  return chrome.storage.local;
}

export async function loadSettings(defaults: Settings): Promise<Settings> {
  const storage = getStorage();
  const result = await storage.get(STORAGE_KEYS.settings) as Partial<StorageShape>;
  return { ...defaults, ...(result[STORAGE_KEYS.settings] ?? {}) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  const storage = getStorage();
  await storage.set({ [STORAGE_KEYS.settings]: settings });
}

export async function loadSessions(): Promise<Session[]> {
  const storage = getStorage();
  const result = await storage.get(STORAGE_KEYS.sessions) as Partial<StorageShape>;
  return result[STORAGE_KEYS.sessions] ?? [];
}

export async function saveSessions(sessions: Session[]): Promise<void> {
  const storage = getStorage();
  await storage.set({ [STORAGE_KEYS.sessions]: sessions });
}

export async function loadStreaks(): Promise<Streak[]> {
  const storage = getStorage();
  const result = await storage.get(STORAGE_KEYS.streaks) as Partial<StorageShape>;
  return result[STORAGE_KEYS.streaks] ?? [];
}

export async function saveStreaks(streaks: Streak[]): Promise<void> {
  const storage = getStorage();
  await storage.set({ [STORAGE_KEYS.streaks]: streaks });
}

export function upsertSession(sessions: Session[], session: Session): Session[] {
  const index = sessions.findIndex((item) => item.id === session.id);
  if (index >= 0) {
    const next = [...sessions];
    next[index] = session;
    return next;
  }
  return [...sessions, session];
}

export function upsertStreak(streaks: Streak[], streak: Streak): Streak[] {
  const index = streaks.findIndex((item) => item.siteId === streak.siteId);
  if (index >= 0) {
    const next = [...streaks];
    next[index] = streak;
    return next;
  }
  return [...streaks, streak];
}
