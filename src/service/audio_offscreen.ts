export type PlaySoundMessage = {
  type: 'play-sound';
  payload?: {
    url?: string;
  };
};

function isPlaySoundMessage(message: unknown): message is PlaySoundMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'play-sound'
  );
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

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message) => {
    if (isPlaySoundMessage(message)) {
      handlePlaySoundMessage(message);
    }
  });
}
