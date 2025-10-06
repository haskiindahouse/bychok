import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handlePlaySoundMessage, type PlaySoundMessage } from '../src/service/audio_offscreen.js';

declare global {
  // eslint-disable-next-line no-var
  var Audio: typeof globalThis.Audio;
}

describe('audio offscreen handler', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    // @ts-expect-error cleanup test double
    delete globalThis.Audio;
  });

  it('plays audio for play-sound message without throwing', () => {
    const playSpy = vi.fn().mockResolvedValue(undefined);

    class FakeAudio {
      public src: string;
      constructor(url: string) {
        this.src = url;
      }

      play = playSpy;
    }

    // @ts-expect-error Allow assigning test double
    globalThis.Audio = FakeAudio;

    const message: PlaySoundMessage = {
      type: 'play-sound',
      payload: { url: 'https://example.com/audio.mp3' }
    };

    expect(() => handlePlaySoundMessage(message)).not.toThrow();
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(playSpy).toHaveBeenCalledWith();
  });

  it('ignores messages without payload URL', () => {
    const playSpy = vi.fn();

    class FakeAudio {
      play = playSpy;
    }

    // @ts-expect-error Allow assigning test double
    globalThis.Audio = FakeAudio;

    handlePlaySoundMessage({ type: 'play-sound', payload: {} });
    expect(playSpy).not.toHaveBeenCalled();
  });
});
