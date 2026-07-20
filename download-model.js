#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');
const { WHISPER_MODEL_SHA256 } = require('./config');

const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin';
const MODELS_DIR = path.join(__dirname, 'models');
const MODEL_PATH = path.join(MODELS_DIR, 'ggml-base.en.bin');
const PARTIAL_PATH = `${MODEL_PATH}.part`;

function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function download(url, redirectsRemaining = 5) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'https:') {
      reject(new Error(`Refusing non-HTTPS model URL: ${parsedUrl.href}`));
      return;
    }

    const request = https.get(parsedUrl, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        if (redirectsRemaining === 0 || !response.headers.location) {
          reject(new Error('Too many or invalid redirects while downloading model'));
          return;
        }
        resolve(download(new URL(response.headers.location, parsedUrl).href, redirectsRemaining - 1));
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Model download returned HTTP ${response.statusCode}`));
        return;
      }

      const totalBytes = Number(response.headers['content-length']) || 0;
      let downloadedBytes = 0;
      const output = fs.createWriteStream(PARTIAL_PATH, { flags: 'w' });

      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (totalBytes) {
          const percent = ((downloadedBytes / totalBytes) * 100).toFixed(1);
          process.stdout.write(`\rDownloading Whisper base.en: ${percent}%`);
        }
      });
      response.on('error', reject);
      output.on('error', reject);
      output.on('finish', () => output.close(resolve));
      response.pipe(output);
    });

    request.setTimeout(30000, () => request.destroy(new Error('Model download timed out')));
    request.on('error', reject);
  });
}

async function main() {
  fs.mkdirSync(MODELS_DIR, { recursive: true });

  if (fs.existsSync(MODEL_PATH) && await sha256(MODEL_PATH) === WHISPER_MODEL_SHA256) {
    console.log(`Whisper model verified: ${MODEL_PATH}`);
    return;
  }

  if (fs.existsSync(PARTIAL_PATH)) {
    fs.unlinkSync(PARTIAL_PATH);
  }

  try {
    await download(MODEL_URL);
    process.stdout.write('\n');
    const digest = await sha256(PARTIAL_PATH);
    if (digest !== WHISPER_MODEL_SHA256) {
      throw new Error(`Whisper model checksum mismatch: received ${digest}`);
    }
    fs.renameSync(PARTIAL_PATH, MODEL_PATH);
    console.log(`Whisper model downloaded and verified: ${MODEL_PATH}`);
  } catch (error) {
    if (fs.existsSync(PARTIAL_PATH)) {
      fs.unlinkSync(PARTIAL_PATH);
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(`Model setup failed: ${error.message}`);
  process.exitCode = 1;
});
