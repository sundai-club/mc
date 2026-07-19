(function exposeAudioPlaybackQueue(globalObject) {
  class AudioPlaybackQueue {
    constructor() {
      this.generation = 0;
      this.tail = Promise.resolve();
    }

    invalidate() {
      this.generation += 1;
    }

    enqueue(task) {
      const generation = this.generation;
      const result = this.tail
        .catch(() => {})
        .then(() => {
          if (generation !== this.generation) return undefined;
          return task();
        });
      this.tail = result.catch(() => {});
      return result;
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AudioPlaybackQueue };
  }
  if (globalObject) {
    globalObject.AudioPlaybackQueue = AudioPlaybackQueue;
  }
})(typeof window !== 'undefined' ? window : globalThis);
