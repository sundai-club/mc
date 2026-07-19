const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_SETTINGS,
  QUESTION_MAX_TOKENS,
  QUESTION_MODEL,
  QUESTION_TIMEOUT_MS,
  safeFilename,
  validateGeneratedQuestion,
  validateMediaDevicePreferences,
  validateTimerSettings,
  validateTranscript,
  validateVoice
} = require('../config');

test('uses the requested Qwen MLX model by default', () => {
  assert.equal(QUESTION_MODEL, 'qwen3.5:4b-mlx');
  assert.equal(QUESTION_MAX_TOKENS, 256);
  assert.equal(QUESTION_TIMEOUT_MS, 120000);
});

test('accepts valid timer settings and rejects invalid values', () => {
  assert.deepEqual(validateTimerSettings({ demoTime: 60, qaTime: 3600 }), {
    demoTime: 60,
    qaTime: 3600
  });
  assert.throws(() => validateTimerSettings({ demoTime: NaN, qaTime: 120 }));
  assert.throws(() => validateTimerSettings({ demoTime: 30, qaTime: 120 }));
  assert.throws(() => validateTimerSettings({ demoTime: 120, qaTime: 3660 }));
});

test('accepts configured voice IDs and rejects command-like values', () => {
  assert.equal(validateVoice('af_sarah'), 'af_sarah');
  assert.equal(validateVoice('cl_frido'), 'cl_frido');
  assert.equal(validateVoice('cl_gabriella'), 'cl_gabriella');
  assert.equal(validateVoice('qv_serena'), 'qv_serena');
  assert.equal(validateVoice('qv_vivian'), 'qv_vivian');
  assert.equal(validateVoice('qv_aiden'), 'qv_aiden');
  assert.equal(DEFAULT_SETTINGS.ttsVoice, 'cl_frido');
  assert.throws(() => validateVoice('Samantha'));
  assert.throws(() => validateVoice('../af_sarah'));
});

test('normalizes and validates saved media-device preferences', () => {
  assert.deepEqual(validateMediaDevicePreferences({
    cameraId: 'camera-device-id',
    microphoneId: 'microphone-device-id'
  }), {
    cameraId: 'camera-device-id',
    microphoneId: 'microphone-device-id'
  });
  assert.deepEqual(validateMediaDevicePreferences({ cameraId: '', microphoneId: null }), {
    cameraId: null,
    microphoneId: null
  });
  assert.deepEqual(validateMediaDevicePreferences(undefined), {
    cameraId: null,
    microphoneId: null
  });
  assert.throws(() => validateMediaDevicePreferences({ cameraId: 'bad\ndevice' }));
  assert.throws(() => validateMediaDevicePreferences({ microphoneId: 42 }));
});

test('accepts only one plain-text question of at most 20 words', () => {
  assert.equal(
    validateGeneratedQuestion('  Strong privacy design;\n how do you measure transcription accuracy?  '),
    'Strong privacy design; how do you measure transcription accuracy?'
  );
  assert.throws(() => validateGeneratedQuestion('This is not a question.'));
  assert.throws(() => validateGeneratedQuestion('One question? Another question?'));
  assert.throws(() => validateGeneratedQuestion('**Strong work; how does this scale?**'));
  assert.throws(() => validateGeneratedQuestion(`${'word '.repeat(20)}question?`));
});

test('normalizes usable transcripts and rejects empty or oversized input', () => {
  assert.equal(validateTranscript('  A useful demo.\n'), 'A useful demo.');
  assert.throws(() => validateTranscript('   '));
  assert.throws(() => validateTranscript(null));
  assert.throws(() => validateTranscript('x'.repeat(100001)));
});

test('keeps IPC filenames inside their assigned directory', () => {
  const pattern = /^question_\d+\.wav$/;
  assert.equal(safeFilename('question_123.wav', pattern, 'audio'), 'question_123.wav');
  assert.throws(() => safeFilename('../question_123.wav', pattern, 'audio'));
  assert.throws(() => safeFilename('question_123.txt', pattern, 'audio'));
});
