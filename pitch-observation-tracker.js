(function exposePitchObservationTracker(globalObject) {
  const PROJECT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function validSnapshot(snapshot) {
    return snapshot &&
      PROJECT_ID_PATTERN.test(snapshot.projectId) &&
      typeof snapshot.projectTitle === 'string' &&
      snapshot.projectTitle.trim();
  }

  class PitchObservationTracker {
    constructor({ now = Date.now } = {}) {
      this.now = now;
      this.running = false;
      this.active = null;
      this.durations = new Map();
    }

    start(initialSnapshot = null) {
      this.running = true;
      this.active = null;
      this.durations.clear();
      this.observe(initialSnapshot);
    }

    observe(snapshot, observedAt = this.now()) {
      if (!this.running) return;
      this.accrue(observedAt);
      this.active = validSnapshot(snapshot)
        ? { snapshot: { ...snapshot }, since: observedAt }
        : null;
    }

    accrue(observedAt) {
      if (!this.active) return;
      const durationMs = Math.max(0, observedAt - this.active.since);
      const existing = this.durations.get(this.active.snapshot.projectId);
      this.durations.set(this.active.snapshot.projectId, {
        snapshot: this.active.snapshot,
        durationMs: (existing?.durationMs || 0) + durationMs
      });
    }

    finish(finishedAt = this.now()) {
      if (!this.running) return null;
      this.accrue(finishedAt);
      this.running = false;
      this.active = null;

      const dominant = [...this.durations.values()]
        .sort((left, right) => right.durationMs - left.durationMs)[0];
      return dominant
        ? { ...dominant.snapshot, observedDurationMs: dominant.durationMs }
        : null;
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PitchObservationTracker };
  }
  if (globalObject) {
    globalObject.PitchObservationTracker = PitchObservationTracker;
  }
})(typeof window !== 'undefined' ? window : globalThis);
