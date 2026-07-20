#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { spawnSync } = require('child_process');

const ENV_DIR = path.join(__dirname, 'kokoro_env');
const PYTHON = process.platform === 'win32'
  ? path.join(ENV_DIR, 'Scripts', 'python.exe')
  : path.join(ENV_DIR, 'bin', 'python');
const MODEL_DIR = path.join(__dirname, 'models', 'kokoro');
const FILES = [
  {
    name: 'kokoro-v1.0.onnx',
    url: 'https://github.com/nazdridoy/kokoro-tts/releases/download/v1.0.0/kokoro-v1.0.onnx',
    sha256: '7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5'
  },
  {
    name: 'voices-v1.0.bin',
    url: 'https://github.com/nazdridoy/kokoro-tts/releases/download/v1.0.0/voices-v1.0.bin',
    sha256: 'd19762d46cf0e6648cb28a7711df1637aad15818185d13f4ff840d57f2f6dfed'
  }
];

function run(command, args) {
  const result = spawnSync(command, args, { cwd: __dirname, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with code ${result.status}`);
}

function canImportKokoro() {
  return fs.existsSync(PYTHON) && spawnSync(PYTHON, ['-c', 'from kokoro_onnx import Kokoro']).status === 0;
}

function fileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const input = fs.createReadStream(filePath);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('end', () => resolve(hash.digest('hex')));
    input.on('error', reject);
  });
}

async function downloadFile(file) {
  const destination = path.join(MODEL_DIR, file.name);
  if (fs.existsSync(destination) && await fileSha256(destination) === file.sha256) {
    console.log(`Kokoro model verified: ${file.name}`);
    return;
  }

  const response = await fetch(file.url, { redirect: 'follow' });
  if (!response.ok || !response.body || new URL(response.url).protocol !== 'https:') {
    throw new Error(`Failed to download ${file.name}: HTTP ${response.status}`);
  }

  const partial = `${destination}.part`;
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(partial, { flags: 'w' }));
  const digest = await fileSha256(partial);
  if (digest !== file.sha256) {
    fs.unlinkSync(partial);
    throw new Error(`Checksum mismatch for ${file.name}`);
  }
  if (fs.existsSync(destination)) fs.unlinkSync(destination);
  fs.renameSync(partial, destination);
  console.log(`Kokoro model downloaded and verified: ${file.name}`);
}

async function main() {
  if (!canImportKokoro()) {
    if (fs.existsSync(ENV_DIR)) {
      throw new Error('kokoro_env exists but is broken. Move it aside, then run npm run setup-tts again.');
    }
    const launcher = process.platform === 'win32' ? 'python' : 'python3';
    run(launcher, ['-m', 'venv', ENV_DIR]);
    run(PYTHON, ['-m', 'pip', 'install', '--upgrade', 'pip']);
    run(PYTHON, ['-m', 'pip', 'install', '-r', 'requirements-kokoro.txt']);
  }

  fs.mkdirSync(MODEL_DIR, { recursive: true });
  for (const file of FILES) await downloadFile(file);
  run(PYTHON, ['kokoro_tts.py', '--list-voices']);
}

main().catch((error) => {
  console.error(`Kokoro setup failed: ${error.message}`);
  process.exitCode = 1;
});
