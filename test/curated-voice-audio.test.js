const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const content = require('../moderator-content');

const projectRoot = path.resolve(__dirname, '..');
const profiles = [
  { id: 'cl_frido', revision: 4, directory: 'frido', prefix: 'frido' },
  { id: 'cl_gabriella', revision: 3, directory: 'gabriella', prefix: 'gabriella' },
  { id: 'cl_abhishek', revision: 1, directory: 'abhishek', prefix: 'abhishek' }
];

function assertWav(filePath) {
  assert.equal(fs.existsSync(filePath), true, `Missing WAV: ${filePath}`);
  const header = fs.readFileSync(filePath).subarray(0, 12);
  assert.equal(header.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(header.subarray(8, 12).toString('ascii'), 'WAVE');
}

test('ships consented clone references and every curated fixed announcement', () => {
  const fixedFilenames = [
    ...content.audioEntries(2, 2).map(({ filename }) => filename),
    'voice_preview.wav'
  ];

  for (const profile of profiles) {
    const referenceRoot = path.join(
      projectRoot,
      'voice_samples',
      profile.directory,
      profile.prefix
    );
    assertWav(`${referenceRoot}_reference.wav`);
    assert.equal(
      fs.readFileSync(`${referenceRoot}_reference.txt`, 'utf8').trim().length > 0,
      true,
      `Missing transcript for ${profile.id}`
    );

    for (const filename of fixedFilenames) {
      const extension = path.extname(filename);
      const stem = path.basename(filename, extension);
      assertWav(path.join(
        projectRoot,
        'pregenerated_audio',
        'voices',
        `${stem}__${profile.id}_r${profile.revision}${extension}`
      ));
    }
  }
});
