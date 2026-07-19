const test = require('node:test');
const assert = require('node:assert/strict');

const { AudioPlaybackQueue } = require('../audio-playback-queue');

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test('serializes announcements so audio jobs never overlap', async () => {
  const queue = new AudioPlaybackQueue();
  const firstCanFinish = deferred();
  const events = [];
  let active = 0;
  let maximumActive = 0;

  const first = queue.enqueue(async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    events.push('first:start');
    await firstCanFinish.promise;
    events.push('first:end');
    active -= 1;
  });
  const second = queue.enqueue(async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    events.push('second:start');
    active -= 1;
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ['first:start']);
  firstCanFinish.resolve();
  await Promise.all([first, second]);

  assert.equal(maximumActive, 1);
  assert.deepEqual(events, ['first:start', 'first:end', 'second:start']);
});

test('drops queued announcements from an invalidated demo session', async () => {
  const queue = new AudioPlaybackQueue();
  const firstCanFinish = deferred();
  const events = [];

  const active = queue.enqueue(async () => {
    events.push('old:active');
    await firstCanFinish.promise;
  });
  const stale = queue.enqueue(() => events.push('old:queued'));

  await new Promise((resolve) => setImmediate(resolve));
  queue.invalidate();
  const current = queue.enqueue(() => events.push('new:queued'));
  firstCanFinish.resolve();
  await Promise.all([active, stale, current]);

  assert.deepEqual(events, ['old:active', 'new:queued']);
});
