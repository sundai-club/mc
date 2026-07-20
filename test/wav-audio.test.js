const test = require('node:test');
const assert = require('node:assert/strict');

const { compactWaveDurationSeconds } = require('../wav-audio');

function pcm16Wave({ audibleMs, silentMs, sampleRate = 1000 }) {
  const audibleSamples = Math.round(audibleMs * sampleRate / 1000);
  const silentSamples = Math.round(silentMs * sampleRate / 1000);
  const samples = audibleSamples + silentSamples;
  const buffer = Buffer.alloc(44 + (samples * 2));
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < audibleSamples; index += 1) {
    buffer.writeInt16LE(12000, 44 + (index * 2));
  }
  return buffer;
}

test('compacts long transition silence while retaining a natural tail', () => {
  const duration = compactWaveDurationSeconds(pcm16Wave({ audibleMs: 1000, silentMs: 700 }));
  assert.ok(Math.abs(duration - 1.18) < 0.002);
});

test('does not shorten clips that only have a brief natural ending', () => {
  const duration = compactWaveDurationSeconds(pcm16Wave({ audibleMs: 1000, silentMs: 200 }));
  assert.ok(Math.abs(duration - 1.2) < 0.002);
});
