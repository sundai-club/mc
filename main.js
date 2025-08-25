const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webSecurity: false
    },
    icon: path.join(__dirname, 'assets/icon.png'),
    titleBarStyle: 'default',
    resizable: true,
    show: false
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle('save-settings', async (event, settings) => {
  return settings;
});

ipcMain.handle('load-settings', async () => {
  return {
    demoTime: 2 * 60,
    qaTime: 2 * 60
  };
});

// Create recordings directory if it doesn't exist
const recordingsDir = path.join(__dirname, 'recordings');
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir, { recursive: true });
}

ipcMain.handle('get-recordings-path', async () => {
  return recordingsDir;
});

ipcMain.handle('save-recording', async (event, filename, buffer) => {
  try {
    const filePath = path.join(recordingsDir, filename);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  } catch (error) {
    console.error('Error saving recording:', error);
    throw error;
  }
});

// Local Whisper transcription
let whisperModelPath = null;
let isWhisperReady = false;

// Text-to-Speech functionality
let ttsEnabled = true;
let ttsVoice = 'af_sarah'; // Kokoro voice name
let ttsUseKokoro = true;

// Initialize Whisper model on startup
async function initializeWhisper() {
  const modelsDir = path.join(__dirname, 'models');
  const modelPath = path.join(modelsDir, 'ggml-base.en.bin');
  
  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
  }
  
  // Check if model exists
  if (fs.existsSync(modelPath)) {
    whisperModelPath = modelPath;
    isWhisperReady = true;
    console.log('Whisper model found:', modelPath);
    return;
  }
  
  console.log('Whisper model not found. Please download ggml-base.en.bin to models/ folder');
  console.log('Download from: https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin');
}

// Initialize whisper when app is ready
app.whenReady().then(() => {
  createWindow();
  initializeWhisper();
});

ipcMain.handle('check-whisper-ready', async () => {
  return { ready: isWhisperReady, modelPath: whisperModelPath };
});

// Text-to-Speech IPC handlers
ipcMain.handle('tts-speak', async (event, text, options = {}) => {
  if (!ttsEnabled) {
    return { success: false, error: 'TTS is disabled' };
  }
  
  try {
    await speakText(text, options);
    return { success: true };
  } catch (error) {
    console.error('TTS Error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('tts-set-config', async (event, config) => {
  ttsEnabled = config.enabled !== false;
  ttsVoice = config.voice || 'af_sarah';
  ttsUseKokoro = config.useKokoro !== false;
  return { success: true };
});

ipcMain.handle('tts-get-config', async () => {
  return { enabled: ttsEnabled, voice: ttsVoice, useKokoro: ttsUseKokoro };
});

// Get available Kokoro voices
ipcMain.handle('tts-get-kokoro-voices', async () => {
  try {
    const pythonPath = path.join(__dirname, 'kokoro_env', 'bin', 'python');
    const scriptPath = path.join(__dirname, 'kokoro_tts.py');
    
    return new Promise((resolve, reject) => {
      const process = spawn(pythonPath, [scriptPath, '--list-voices']);
      
      let output = '';
      let error = '';
      
      process.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      process.stderr.on('data', (data) => {
        error += data.toString();
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          const lines = output.split('\n');
          const voices = [];
          let inVoicesList = false;
          
          for (const line of lines) {
            if (line.includes('Available voices:')) {
              inVoicesList = true;
              continue;
            }
            if (inVoicesList && line.trim().startsWith('- ')) {
              voices.push(line.trim().substring(2));
            }
          }
          
          resolve({ success: true, voices });
        } else {
          console.error('Error getting Kokoro voices:', error);
          resolve({ success: false, error: error });
        }
      });
    });
  } catch (error) {
    console.error('Error in tts-get-kokoro-voices:', error);
    return { success: false, error: error.message };
  }
});

// Ollama API integration for question generation
ipcMain.handle('generate-question', async (event, transcript) => {
  return new Promise((resolve) => {
    try {
      console.log('Generating question for transcript:', transcript.substring(0, 100) + '...');
      
      const postData = JSON.stringify({
        model: 'gemma3:1b',
        prompt: `Based on this demo transcript, generate ONE short, thoughtful question that combines praise with a direct challenge. Start with something positive about their work, then ask a probing question. Keep it under 20 words total.

Use plain text only - no asterisks, no bold, no formatting, no markdown.

Demo transcript: "${transcript}"

Question:`,
        stream: false
      });

      const options = {
        hostname: '127.0.0.1', // Force IPv4 instead of localhost
        port: 11434,
        path: '/api/generate',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = http.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            console.log('Ollama response received:', response.response?.substring(0, 100));
            resolve({ success: true, question: response.response.trim() });
          } catch (parseError) {
            console.error('Error parsing Ollama response:', parseError);
            console.error('Raw response:', data);
            resolve(getFallbackQuestion());
          }
        });
      });

      req.on('error', (error) => {
        console.error('HTTP request error:', error.message);
        resolve(getFallbackQuestion());
      });

      // Set a simple timeout directly on the request
      req.setTimeout(30000, () => {
        console.error('Request to Ollama timed out after 30s');
        req.destroy();
        resolve(getFallbackQuestion());
      });

      req.write(postData);
      req.end();

    } catch (error) {
      console.error('Error in generate-question handler:', error.message);
      resolve(getFallbackQuestion());
    }
  });
});

function getFallbackQuestion() {
  // Fallback questions if Ollama is not available
  const fallbackQuestions = [
    "Great work! What's the biggest challenge you faced building this?",
    "Nice solution! How would this handle 10x more users?",
    "Impressive demo! What's your biggest concern about this approach?",
    "Well done! What would you change if rebuilding from scratch?",
    "Solid work! What assumptions might not hold in production?",
    "Cool project! What's the riskiest part of your architecture?"
  ];
  
  const randomQuestion = fallbackQuestions[Math.floor(Math.random() * fallbackQuestions.length)];
  return { success: true, question: randomQuestion, fallback: true };
}

// Text-to-Speech implementation
async function speakText(text, options = {}) {
  console.log(`Speaking: "${text}" using voice: ${ttsVoice}`);
  
  if (ttsUseKokoro) {
    return await speakWithKokoro(text, options);
  } else {
    return await speakWithSystem(text, options);
  }
}

async function speakWithKokoro(text, options = {}) {
  return new Promise((resolve, reject) => {
    const pythonPath = path.join(__dirname, 'kokoro_env', 'bin', 'python');
    const scriptPath = path.join(__dirname, 'kokoro_tts.py');
    const voice = options.voice || ttsVoice;
    
    // Create temporary file for audio output
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const timestamp = Date.now();
    const tempAudioPath = path.join(tempDir, `tts_${timestamp}.wav`);
    
    const args = [
      scriptPath,
      '--text', text,
      '--voice', voice,
      '--output', tempAudioPath,
      '--no-play'
    ];
    
    const ttsProcess = spawn(pythonPath, args);
    
    let error = '';
    
    ttsProcess.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    ttsProcess.on('close', (code) => {
      if (code === 0) {
        // Play the generated audio file
        playAudioFile(tempAudioPath)
          .then(() => {
            // Clean up temp file
            try {
              fs.unlinkSync(tempAudioPath);
            } catch (e) {
              console.warn('Could not delete temp audio file:', e.message);
            }
            resolve();
          })
          .catch(reject);
      } else {
        // Clean up temp file even on error
        try {
          if (fs.existsSync(tempAudioPath)) {
            fs.unlinkSync(tempAudioPath);
          }
        } catch (e) {
          console.warn('Could not delete temp audio file:', e.message);
        }
        reject(new Error(`Kokoro TTS failed with code ${code}: ${error}`));
      }
    });
    
    ttsProcess.on('error', (err) => {
      reject(new Error(`Failed to start Kokoro TTS: ${err.message}`));
    });
  });
}

async function speakWithSystem(text, options = {}) {
  return new Promise((resolve, reject) => {
    let command, args;
    
    if (process.platform === 'darwin') {
      // macOS - use built-in 'say' command
      command = 'say';
      args = ['-v', options.voice || ttsVoice, text];
    } else if (process.platform === 'win32') {
      // Windows - use PowerShell with built-in TTS
      command = 'powershell';
      args = ['-Command', `Add-Type -AssemblyName System.Speech; $speak = New-Object System.Speech.Synthesis.SpeechSynthesizer; $speak.Speak('${text.replace(/'/g, "''")}')`];
    } else {
      // Linux - use espeak if available
      command = 'espeak';
      args = [text];
    }
    
    const ttsProcess = spawn(command, args);
    
    let error = '';
    
    ttsProcess.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    ttsProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`TTS failed with code ${code}: ${error}`));
      }
    });
    
    ttsProcess.on('error', (err) => {
      reject(new Error(`Failed to start TTS: ${err.message}`));
    });
  });
}

async function playAudioFile(filePath) {
  return new Promise((resolve, reject) => {
    let command, args;
    
    if (process.platform === 'darwin') {
      command = 'afplay';
      args = [filePath];
    } else if (process.platform === 'win32') {
      command = 'powershell';
      args = ['-c', `(New-Object Media.SoundPlayer "${filePath}").PlaySync()`];
    } else {
      // Linux - try multiple players
      command = 'aplay';
      args = [filePath];
    }
    
    const playProcess = spawn(command, args);
    
    let error = '';
    
    playProcess.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    playProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Audio playback failed with code ${code}: ${error}`));
      }
    });
    
    playProcess.on('error', (err) => {
      reject(new Error(`Failed to start audio playback: ${err.message}`));
    });
  });
}


ipcMain.handle('transcribe-audio', async (event, audioBuffer) => {
  if (!isWhisperReady) {
    throw new Error('Whisper model not ready. Please download the model file.');
  }

  try {
    // Create temp directories
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const timestamp = Date.now();
    const tempWebmPath = path.join(tempDir, `temp_audio_${timestamp}.webm`);
    const tempWavPath = path.join(tempDir, `temp_audio_${timestamp}.wav`);
    
    // Save WebM audio buffer first
    fs.writeFileSync(tempWebmPath, audioBuffer);
    
    // Convert WebM to WAV using ffmpeg
    await convertWebmToWav(tempWebmPath, tempWavPath);
    
    // Use whisper.cpp for transcription
    const transcription = await transcribeWithWhisper(tempWavPath);
    
    // Clean up temp files
    if (fs.existsSync(tempWebmPath)) {
      fs.unlinkSync(tempWebmPath);
    }
    if (fs.existsSync(tempWavPath)) {
      fs.unlinkSync(tempWavPath);
    }
    
    return transcription;
  } catch (error) {
    console.error('Error transcribing audio:', error);
    throw error;
  }
});

async function convertWebmToWav(webmPath, wavPath) {
  return new Promise((resolve, reject) => {
    console.log('Converting audio format...');
    
    // Check if input file exists
    if (!fs.existsSync(webmPath)) {
      reject(new Error(`Input WebM file does not exist: ${webmPath}`));
      return;
    }
    
    // Use ffmpeg to convert WebM to WAV
    const ffmpegProcess = spawn('ffmpeg', [
      '-i', webmPath,
      '-acodec', 'pcm_s16le',
      '-ar', '16000',
      '-ac', '1',
      '-y',
      wavPath
    ]);
    
    let error = '';
    
    ffmpegProcess.stderr.on('data', (data) => {
      const text = data.toString();
      error += text;
      // Only log errors and warnings
      if (text.includes('Error') || text.includes('Warning') || text.includes('Failed')) {
        console.log('FFmpeg:', text.trim());
      }
    });
    
    ffmpegProcess.on('close', (code) => {
      
      if (code === 0) {
        // Check if output file was created
        if (fs.existsSync(wavPath)) {
          console.log('Audio conversion complete');
          resolve();
        } else {
          reject(new Error('FFmpeg completed but WAV file was not created'));
        }
      } else {
        console.error('FFmpeg conversion failed:', error);
        reject(new Error(`ffmpeg failed with code ${code}: ${error}`));
      }
    });
    
    ffmpegProcess.on('error', (err) => {
      console.error('Failed to start ffmpeg:', err);
      reject(new Error(`Failed to start ffmpeg: ${err.message}`));
    });
  });
}

async function transcribeWithWhisper(audioFilePath) {
  return new Promise((resolve, reject) => {
    console.log('Transcribing audio...');
    
    // Try to use whisper.cpp command line tool
    const whisperProcess = spawn('whisper-cli', [
      '--model', whisperModelPath,
      '--language', 'en',
      '--no-speech-thold', '0.1',  // Much lower threshold for detecting speech
      '--output-txt',
      '--print-progress',  // Enable progress to see what's happening
      audioFilePath  // File as last argument
    ]);
    
    let output = '';
    let error = '';
    
    whisperProcess.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      // Only log important stdout messages
      if (text.includes('Error') || text.includes('Warning') || text.includes('Failed')) {
        console.log('Whisper stdout:', text.trim());
      }
    });
    
    whisperProcess.stderr.on('data', (data) => {
      const text = data.toString();
      error += text;
      // Only log progress and important messages, suppress verbose model loading
      if (text.includes('progress = 100%') || text.includes('Error') || text.includes('Failed')) {
        console.log('Whisper:', text.trim());
      }
    });
    
    whisperProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`Whisper process failed with code ${code}`);
        console.error('Error details:', error);
      }
      
      if (code === 0) {
        // Try to read the output text file (whisper adds .txt to the full filename)
        const txtFile = audioFilePath + '.txt';
        
        if (fs.existsSync(txtFile)) {
          const transcription = fs.readFileSync(txtFile, 'utf8').trim();
          if (transcription) {
            console.log('Transcription:', transcription);
          } else {
            console.log('Empty transcription result');
          }
          fs.unlinkSync(txtFile); // Clean up
          resolve(transcription || 'Empty transcription');
        } else {
          // Extract text from stdout
          const lines = output.split('\n');
          let transcription = '';
          
          // Look for transcription lines (they typically don't have timestamps in simple output)
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && 
                !trimmed.startsWith('[') && 
                !trimmed.includes('whisper_') && 
                !trimmed.includes('Loading') &&
                !trimmed.includes('processing') &&
                !trimmed.includes('%')) {
              transcription += trimmed + ' ';
            }
          }
          
          transcription = transcription.trim();
          console.log('Extracted transcription:', transcription);
          resolve(transcription || 'No speech detected');
        }
      } else {
        reject(new Error(`Whisper failed with code ${code}: ${error}`));
      }
    });
    
    whisperProcess.on('error', (err) => {
      console.error('Failed to start whisper process:', err);
      reject(new Error(`Failed to start whisper: ${err.message}`));
    });
  });
}