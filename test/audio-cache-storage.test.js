const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { localAudioCacheDir, migrateLegacyAudioCache } = require('../audio-cache-storage');

test('uses a project-local audio cache directory', () => {
  assert.equal(localAudioCacheDir('/project/demo-moderator'), '/project/demo-moderator/audio-cache');
});

test('moves legacy WAV cache files without overwriting local files', async (context) => {
  const temporaryDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'demo-moderator-cache-'));
  context.after(() => fs.promises.rm(temporaryDirectory, { recursive: true, force: true }));

  const legacyDirectory = path.join(temporaryDirectory, 'legacy');
  const targetDirectory = path.join(temporaryDirectory, 'local');
  await Promise.all([
    fs.promises.mkdir(legacyDirectory),
    fs.promises.mkdir(targetDirectory)
  ]);
  await Promise.all([
    fs.promises.writeFile(path.join(legacyDirectory, 'new.wav'), 'new audio'),
    fs.promises.writeFile(path.join(legacyDirectory, 'existing.wav'), 'legacy audio'),
    fs.promises.writeFile(path.join(legacyDirectory, 'leave.txt'), 'not audio'),
    fs.promises.writeFile(path.join(targetDirectory, 'existing.wav'), 'local audio')
  ]);

  const migratedCount = await migrateLegacyAudioCache(legacyDirectory, targetDirectory);

  assert.equal(migratedCount, 1);
  assert.equal(await fs.promises.readFile(path.join(targetDirectory, 'new.wav'), 'utf8'), 'new audio');
  assert.equal(await fs.promises.readFile(path.join(targetDirectory, 'existing.wav'), 'utf8'), 'local audio');
  assert.equal(await fs.promises.readFile(path.join(legacyDirectory, 'existing.wav'), 'utf8'), 'legacy audio');
  assert.equal(await fs.promises.readFile(path.join(legacyDirectory, 'leave.txt'), 'utf8'), 'not audio');
  await assert.rejects(fs.promises.access(path.join(legacyDirectory, 'new.wav')));
});
