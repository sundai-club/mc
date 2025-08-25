#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin';
const MODELS_DIR = path.join(__dirname, 'models');
const MODEL_PATH = path.join(MODELS_DIR, 'ggml-base.en.bin');

console.log('🎤 Downloading Whisper base.en model for local transcription...');
console.log('Model size: ~142MB - this may take a few minutes');

// Create models directory if it doesn't exist
if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
}

// Check if model already exists
if (fs.existsSync(MODEL_PATH)) {
    console.log('✅ Model already exists at:', MODEL_PATH);
    process.exit(0);
}

// Download the model with redirect handling
function downloadFile(url, attempt = 1) {
    const file = fs.createWriteStream(MODEL_PATH);
    let downloadedBytes = 0;
    let totalBytes = 0;

    https.get(url, (response) => {
        // Handle redirects
        if (response.statusCode === 302 || response.statusCode === 301) {
            if (attempt > 3) {
                console.error('❌ Too many redirects');
                process.exit(1);
            }
            console.log(`🔄 Redirecting... (${response.headers.location})`);
            file.close();
            fs.unlinkSync(MODEL_PATH);
            return downloadFile(response.headers.location, attempt + 1);
        }

        if (response.statusCode !== 200) {
            console.error('❌ Failed to download model. Status:', response.statusCode);
            file.close();
            fs.unlinkSync(MODEL_PATH);
            process.exit(1);
        }

    totalBytes = parseInt(response.headers['content-length'], 10);
    console.log(`📥 Starting download... (${Math.round(totalBytes / 1024 / 1024)}MB)`);

    response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        const percent = ((downloadedBytes / totalBytes) * 100).toFixed(1);
        const downloadedMB = (downloadedBytes / 1024 / 1024).toFixed(1);
        const totalMB = (totalBytes / 1024 / 1024).toFixed(1);
        
        process.stdout.write(`\r📊 Progress: ${percent}% (${downloadedMB}/${totalMB} MB)`);
    });

    response.pipe(file);

    file.on('finish', () => {
        file.close();
        console.log('\n✅ Whisper model downloaded successfully!');
        console.log('📍 Location:', MODEL_PATH);
        console.log('🎯 You can now use local transcription in the demo moderator app.');
    });

    }).on('error', (err) => {
        console.error('\n❌ Download failed:', err.message);
        file.close();
        if (fs.existsSync(MODEL_PATH)) {
            fs.unlinkSync(MODEL_PATH);
        }
        process.exit(1);
    });
}

// Start the download
downloadFile(MODEL_URL);