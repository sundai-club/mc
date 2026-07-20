function readWaveInfo(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44 ||
      buffer.toString('ascii', 0, 4) !== 'RIFF' ||
      buffer.toString('ascii', 8, 12) !== 'WAVE') {
    return null;
  }

  let format = null;
  let data = null;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = Math.min(start + size, buffer.length);
    if (id === 'fmt ' && size >= 16 && end >= start + 16) {
      format = {
        audioFormat: buffer.readUInt16LE(start),
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        blockAlign: buffer.readUInt16LE(start + 12),
        bitsPerSample: buffer.readUInt16LE(start + 14)
      };
    } else if (id === 'data') {
      data = { start, size: end - start };
    }
    offset = start + size + (size % 2);
  }

  if (!format || !data || !format.sampleRate || !format.blockAlign) return null;
  return { ...format, ...data };
}

function sampleMagnitude(buffer, offset, audioFormat, bitsPerSample) {
  if (audioFormat === 1 && bitsPerSample === 16) {
    return Math.abs(buffer.readInt16LE(offset)) / 32768;
  }
  if (audioFormat === 1 && bitsPerSample === 24) {
    return Math.abs(buffer.readIntLE(offset, 3)) / 8388608;
  }
  if (audioFormat === 1 && bitsPerSample === 32) {
    return Math.abs(buffer.readInt32LE(offset)) / 2147483648;
  }
  if (audioFormat === 3 && bitsPerSample === 32) {
    return Math.abs(buffer.readFloatLE(offset));
  }
  return null;
}

function compactWaveDurationSeconds(buffer, options = {}) {
  const info = readWaveInfo(buffer);
  if (!info) return null;

  const fullFrames = Math.floor(info.size / info.blockAlign);
  const fullDuration = fullFrames / info.sampleRate;
  const bytesPerSample = info.bitsPerSample / 8;
  if (![2, 3, 4].includes(bytesPerSample) ||
      ![1, 3].includes(info.audioFormat)) {
    return fullDuration;
  }

  const silenceThreshold = options.silenceThreshold ?? 0.003;
  const retainedTailMs = options.retainedTailMs ?? 180;
  const minimumTrimMs = options.minimumTrimMs ?? 100;
  let lastAudibleFrame = -1;

  for (let frame = fullFrames - 1; frame >= 0; frame -= 1) {
    const frameOffset = info.start + (frame * info.blockAlign);
    let audible = false;
    for (let channel = 0; channel < info.channels; channel += 1) {
      const magnitude = sampleMagnitude(
        buffer,
        frameOffset + (channel * bytesPerSample),
        info.audioFormat,
        info.bitsPerSample
      );
      if (magnitude == null) return fullDuration;
      if (magnitude >= silenceThreshold) {
        audible = true;
        break;
      }
    }
    if (audible) {
      lastAudibleFrame = frame;
      break;
    }
  }

  if (lastAudibleFrame < 0) return fullDuration;
  const trailingSilenceMs = ((fullFrames - lastAudibleFrame - 1) / info.sampleRate) * 1000;
  const trimMs = trailingSilenceMs - retainedTailMs;
  if (trimMs < minimumTrimMs) return fullDuration;
  return Math.max(0.05, fullDuration - (trimMs / 1000));
}

module.exports = { compactWaveDurationSeconds, readWaveInfo };
