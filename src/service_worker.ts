import { isPlaySoundMessage, PlaySoundMessage, resolveSoundAsset } from './shared/audio.js';
import { loadSessions, loadSettings, loadStreaks, saveSessions, saveSettings, saveStreaks } from './shared/storage.js';
import { ActivitySlot, FocusModeState, Session, Settings, Streak } from './shared/types.js';
import { AggregatedData, evaluateQuietHours, mergeActivitySlot, shouldWarnStreakExpiry } from './service/activity.js';

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

let cachedSettings: Settings | null = null;
let cachedSessions: Session[] = [];
let cachedStreaks: Streak[] = [];
let focusMode: FocusModeState | null = null;
let focusEndingNotified = false;
async function ensureCaches(): Promise<void> {
  if (!cachedSettings) {
    cachedSettings = await loadSettings(DEFAULT_SETTINGS);
  }
  if (cachedSessions.length === 0) {
    cachedSessions = await loadSessions();
  }
  if (cachedStreaks.length === 0) {
    cachedStreaks = await loadStreaks();
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (isPlaySoundMessage(message)) {
    return false;
  }

  void ensureCaches().then(async () => {
    switch (message?.type) {
      case 'activity-slot': {
        await handleActivitySlot(message.payload as ActivitySlot);
        sendResponse({ ok: true });
        break;
      }
      case 'focus-mode:start': {
        await startFocusMode(message.payload as FocusModeState);
        sendResponse({ ok: true });
        break;
      }
      case 'focus-mode:stop': {
        await stopFocusMode();
        sendResponse({ ok: true });
        break;
      }
      case 'settings:update': {
        cachedSettings = { ...cachedSettings!, ...(message.payload as Partial<Settings>) };
        await saveSettings(cachedSettings!);
        sendResponse({ ok: true, settings: cachedSettings });
        break;
      }
      case 'settings:read': {
        sendResponse({ ok: true, settings: cachedSettings });
        break;
      }
      default:
        sendResponse({ ok: false, reason: 'unknown-message' });
    }
  });
  return true;
});

async function handleActivitySlot(slot: ActivitySlot): Promise<void> {
  if (!cachedSettings) {
    cachedSettings = DEFAULT_SETTINGS;
  }

  const aggregated: AggregatedData = { sessions: cachedSessions, streaks: cachedStreaks };
  const next = mergeActivitySlot(slot, aggregated, cachedSettings);
  cachedSessions = next.sessions;
  cachedStreaks = next.streaks;

  await Promise.all([saveSessions(cachedSessions), saveStreaks(cachedStreaks)]);

  await maybeNotifyStreaks();
  await maybeNotifyFocus(slot.timestamp);
}

async function startFocusMode(payload: FocusModeState): Promise<void> {
  focusMode = { ...payload };
  focusEndingNotified = false;
  await maybeEmitFocusEntry();
}

async function stopFocusMode(): Promise<void> {
  focusMode = null;
  focusEndingNotified = false;
}

async function maybeEmitFocusEntry(): Promise<void> {
  if (!focusMode || !cachedSettings) {
    return;
  }
  const now = new Date();
  if (evaluateQuietHours(cachedSettings, now).withinQuietHours) {
    return;
  }
  if (cachedSettings.notifications) {
    await createNotification('focus-start', {
      title: 'Фокус включён',
      message: `Держим темп ${focusMode.durationMinutes} минут на ${focusMode.siteId}`
    });
  }
  if (cachedSettings.audioEnabled && cachedSettings.focusEntrySound) {
    await playSound(cachedSettings.focusEntrySound);
  }
}

async function maybeNotifyFocus(nowTs: number): Promise<void> {
  if (!focusMode || !cachedSettings) {
    return;
  }
  const now = new Date(nowTs);
  const endTs = focusMode.startedAt + focusMode.durationMinutes * 60 * 1000;
  const remaining = endTs - nowTs;
  if (remaining <= 60_000 && remaining > 0 && !focusEndingNotified) {
    if (evaluateQuietHours(cachedSettings, now).withinQuietHours) {
      return;
    }
    if (cachedSettings.notifications) {
      await createNotification('focus-ending', {
        title: 'Финиш близко',
        message: 'Осталась минута до конца серии. Добавим огня?'
      });
    }
    focusEndingNotified = true;
  }
}

async function maybeNotifyStreaks(): Promise<void> {
  if (!cachedSettings) {
    return;
  }
  const now = new Date();
  const quiet = evaluateQuietHours(cachedSettings, now);
  if (quiet.withinQuietHours) {
    return;
  }
  for (const streak of cachedStreaks) {
    if (shouldWarnStreakExpiry(streak, now, cachedSettings)) {
      await createNotification(`streak-${streak.siteId}`, {
        title: 'Серия на волоске',
        message: `${streak.siteId}: добавьте ${cachedSettings.sessionLengthMinutes} минут, чтобы спасти день`
      });
    }
  }
}

async function createNotification(id: string, options: { title: string; message: string }): Promise<void> {
  await chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: 'assets/icon-128.png',
    title: options.title,
    message: options.message
  });
}

async function playSound(soundId: string): Promise<void> {
  try {
    const assetPath = resolveSoundAsset(soundId);
    if (!assetPath) {
      console.warn('Unknown sound id', soundId);
      return;
    }
    const url = chrome.runtime.getURL(assetPath);
    const message: PlaySoundMessage = { type: 'play-sound', payload: { url } };
    await dispatchToOverlays(message);
  } catch (error) {
    console.warn('Unable to play sound', error);
  }
}

async function dispatchToOverlays(message: PlaySoundMessage): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({});
    const targetHost = focusMode?.siteId ?? null;
    await Promise.all(
      tabs
        .filter((tab) => {
          if (tab.id == null) {
            return false;
          }
          if (!targetHost) {
            return true;
          }
          try {
            return tab.url ? new URL(tab.url).hostname === targetHost : false;
          } catch (_error) {
            return false;
          }
        })
        .map(async (tab) => {
          if (tab.id == null) {
            return;
          }
          try {
            await chrome.tabs.sendMessage(tab.id, message);
          } catch (error) {
            if (!isIgnorableMessageError(error)) {
              console.warn('No overlay to receive audio message', { tabId: tab.id, error });
            }
          }
        })
    );
  } catch (error) {
    console.warn('Failed to query tabs for audio dispatch', error);
  }
}

function isIgnorableMessageError(error: unknown): boolean {
  if (!error) {
    return false;
  }
  let message: string | undefined;
  if (typeof error === 'string') {
    message = error;
  } else if (typeof error === 'object' && 'message' in error) {
    const candidate = (error as { message?: unknown }).message;
    if (typeof candidate === 'string') {
      message = candidate;
    }
  }
  if (!message) {
    return false;
  }
  return message.includes('Could not establish connection') || message.includes('Receiving end does not exist');
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'refresh-settings') {
    cachedSettings = await loadSettings(DEFAULT_SETTINGS);
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('refresh-settings', { periodInMinutes: 30 });
});
