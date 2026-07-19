#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const ENV_DIR = path.join(ROOT, 'qwen_tts_env');
const PYTHON = process.platform === 'win32'
  ? path.join(ENV_DIR, 'Scripts', 'python.exe')
  : path.join(ENV_DIR, 'bin', 'python');
const MODEL_CACHE = path.join(ROOT, 'models', 'qwen3-tts-cache');
const MODEL_IDS = [
  'mlx-community/Qwen3-TTS-12Hz-0.6B-Base-4bit',
  'mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-4bit'
];
const VOICE_PROFILES = [
  {
    name: 'Frido',
    audio: path.join(ROOT, 'voice_samples', 'frido', 'frido_reference.wav'),
    text: path.join(ROOT, 'voice_samples', 'frido', 'frido_reference.txt')
  },
  {
    name: 'Gabriella',
    audio: path.join(ROOT, 'voice_samples', 'gabriella', 'gabriella_reference.wav'),
    text: path.join(ROOT, 'voice_samples', 'gabriella', 'gabriella_reference.txt')
  }
];

function run(command, args, extra = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, HF_HOME: MODEL_CACHE, TOKENIZERS_PARALLELISM: 'false' },
    ...extra
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with code ${result.status}`);
}

function canImportMlxAudio() {
  return fs.existsSync(PYTHON) && spawnSync(
    PYTHON,
    ['-c', 'from mlx_audio.tts.utils import load_model'],
    { stdio: 'ignore' }
  ).status === 0;
}

function main() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error('The local cloned voices currently require an Apple Silicon Mac.');
  }
  const installedProfiles = VOICE_PROFILES.filter(({ audio, text }) => (
    fs.existsSync(audio) && fs.existsSync(text)
  ));
  if (installedProfiles.length === 0) {
    throw new Error('No consented voice reference files were found. Build at least one profile first.');
  }

  if (!canImportMlxAudio()) {
    if (fs.existsSync(ENV_DIR)) {
      throw new Error('qwen_tts_env exists but is incomplete. Move it aside, then rerun this setup.');
    }
    const launcher = process.env.QWEN_SETUP_PYTHON || 'python3';
    run(launcher, ['-m', 'venv', ENV_DIR]);
    run(PYTHON, ['-m', 'pip', 'install', '--upgrade', 'pip']);
    run(PYTHON, ['-m', 'pip', 'install', '-r', 'requirements-qwen-tts.txt']);
  }

  fs.mkdirSync(MODEL_CACHE, { recursive: true });
  for (const modelId of MODEL_IDS) {
    run(PYTHON, [
      '-c',
      `from huggingface_hub import snapshot_download; snapshot_download(${JSON.stringify(modelId)})`
    ]);
  }
  console.log(`Local Qwen voices are ready: ${installedProfiles.map(({ name }) => name).join(', ')}, Serena, Vivian, Aiden.`);
}

try {
  main();
} catch (error) {
  console.error(`Cloned voice setup failed: ${error.message}`);
  process.exitCode = 1;
}
