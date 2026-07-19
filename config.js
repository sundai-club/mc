const path = require('path');

const DEFAULT_SETTINGS = Object.freeze({
  demoTime: 2 * 60,
  qaTime: 2 * 60,
  ttsEnabled: true,
  ttsVoice: 'cl_frido',
  ttsUseKokoro: true,
  sundaiEnabled: true,
  cameraId: null,
  microphoneId: null
});

const QUESTION_MODEL = process.env.OLLAMA_QUESTION_MODEL || 'qwen3.5:4b-mlx';
const QUESTION_MAX_TOKENS = 256;
const QUESTION_TIMEOUT_MS = 120000;
const WHISPER_MODEL_SHA256 = 'a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002';

function validateTimerSettings(settings) {
  const demoTime = Number(settings?.demoTime);
  const qaTime = Number(settings?.qaTime);
  if (!Number.isInteger(demoTime) || !Number.isInteger(qaTime) ||
      demoTime < 60 || demoTime > 3600 || qaTime < 60 || qaTime > 3600) {
    throw new Error('Timer values must be whole minutes between 1 and 60');
  }
  return { demoTime, qaTime };
}

function validateVoice(voice) {
  if (typeof voice !== 'string' || !/^[a-z]{2}_[a-z0-9_]+$/i.test(voice)) {
    throw new Error('Invalid TTS voice');
  }
  return voice;
}

function validateSundaiEnabled(value) {
  if (typeof value !== 'boolean') {
    throw new Error('Sundai mode must be enabled or disabled');
  }
  return value;
}

function validateMediaDevicePreferences(preferences) {
  const validateDeviceId = (deviceId, label) => {
    if (deviceId == null || deviceId === '') {
      return null;
    }
    if (typeof deviceId !== 'string' || deviceId.length > 2048 || /[\u0000-\u001f]/.test(deviceId)) {
      throw new Error(`Invalid ${label} device ID`);
    }
    return deviceId;
  };

  return {
    cameraId: validateDeviceId(preferences?.cameraId, 'camera'),
    microphoneId: validateDeviceId(preferences?.microphoneId, 'microphone')
  };
}

function validateGeneratedQuestion(question) {
  if (typeof question !== 'string') {
    throw new Error('Generated question is not text');
  }

  const normalized = question.replace(/\s+/g, ' ').trim();
  const wordCount = normalized ? normalized.split(' ').length : 0;
  const questionMarkCount = (normalized.match(/\?/g) || []).length;
  if (!normalized || wordCount > 20 || questionMarkCount !== 1 ||
      !normalized.endsWith('?') || /[*#`]/.test(normalized)) {
    throw new Error('Generated question does not match the required format');
  }
  return normalized;
}

function validateTranscript(transcript) {
  const normalized = typeof transcript === 'string' ? transcript.trim() : '';
  if (!normalized || normalized.length > 100000) {
    throw new Error('Transcript is empty or too large');
  }
  return normalized;
}

function safeFilename(filename, pattern, label) {
  if (typeof filename !== 'string' || path.basename(filename) !== filename || !pattern.test(filename)) {
    throw new Error(`Invalid ${label} filename`);
  }
  return filename;
}

module.exports = {
  DEFAULT_SETTINGS,
  QUESTION_MAX_TOKENS,
  QUESTION_MODEL,
  QUESTION_TIMEOUT_MS,
  WHISPER_MODEL_SHA256,
  safeFilename,
  validateGeneratedQuestion,
  validateMediaDevicePreferences,
  validateSundaiEnabled,
  validateTimerSettings,
  validateTranscript,
  validateVoice
};
