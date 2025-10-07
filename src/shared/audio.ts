export type PlaySoundMessage = {
  type: 'play-sound';
  payload?: {
    url?: string;
  };
};

export function isPlaySoundMessage(message: unknown): message is PlaySoundMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'play-sound'
  );
}

export const SOUND_LIBRARY: Record<string, string> = {
  'chime-soft': 'assets/audio/chime-soft.mp3',
  'pulse-air': 'assets/audio/pulse-air.wav'
};

export function resolveSoundAsset(soundId: string | null | undefined): string | null {
  if (!soundId) {
    return null;
  }
  const asset = SOUND_LIBRARY[soundId];
  return asset ?? null;
}

export function handlePlaySoundMessage(message: PlaySoundMessage): void {
  const url = message.payload?.url;
  if (!url) {
    return;
  }

  if (typeof Audio === 'undefined') {
    return;
  }

  try {
    const audio = new Audio(url);
    const playback = audio.play?.();
    if (playback && typeof playback.catch === 'function') {
      playback.catch((error) => {
        console.warn('Audio playback failed', error);
      });
    }
  } catch (error) {
    console.warn('Audio playback failed', error);
  }
}
