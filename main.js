const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const http = require('http');
const { AudioPlaybackQueue } = require('./audio-playback-queue');
const { localAudioCacheDir, migrateLegacyAudioCache } = require('./audio-cache-storage');
const ModeratorContent = require('./moderator-content');
const {
  DEFAULT_SETTINGS,
  QUESTION_MAX_TOKENS,
  QUESTION_MODEL,
  QUESTION_TIMEOUT_MS,
  WHISPER_MODEL_SHA256,
  safeFilename,
  validateGeneratedQuestion,
  validateMediaDevicePreferences,
  validateTimerSettings,
  validateTranscript,
  validateVoice
} = require('./config');

let mainWindow;
let allowWindowClose = false;
let closeFallbackTimer = null;
let recordingsDir;
let generatedAudioDir;
let appTempDir;
let settingsPath;
let persistedSettings = { ...DEFAULT_SETTINGS };

function createWindow() {
  allowWindowClose = false;
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 800,
    fullscreen: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    },
    icon: path.join(__dirname, 'assets/icon.png'),
    titleBarStyle: 'default',
    resizable: true,
    show: false
  });

  mainWindow.loadFile('index.html');

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const currentUrl = mainWindow.webContents.getURL();
    if (navigationUrl !== currentUrl) {
      event.preventDefault();
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('enter-full-screen', () => {
    mainWindow.webContents.send('fullscreen-changed', true);
  });

  mainWindow.on('leave-full-screen', () => {
    mainWindow.webContents.send('fullscreen-changed', false);
  });

  mainWindow.on('close', (event) => {
    if (allowWindowClose) return;
    event.preventDefault();
    if (!mainWindow || mainWindow.isDestroyed()) return;

    mainWindow.webContents.send('app-close-requested');
    if (!closeFallbackTimer) {
      closeFallbackTimer = setTimeout(() => {
        closeFallbackTimer = null;
        allowWindowClose = true;
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
      }, 30_000);
    }
  });

  mainWindow.on('closed', () => {
    if (closeFallbackTimer) {
      clearTimeout(closeFallbackTimer);
      closeFallbackTimer = null;
    }
    mainWindow = null;
  });
}

ipcMain.on('app-close-ready', (event) => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) return;
  allowWindowClose = true;
  if (closeFallbackTimer) {
    clearTimeout(closeFallbackTimer);
    closeFallbackTimer = null;
  }
  mainWindow.close();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

async function writeSettings() {
  const temporaryPath = `${settingsPath}.tmp`;
  await fs.promises.writeFile(temporaryPath, JSON.stringify(persistedSettings, null, 2), 'utf8');
  await fs.promises.rename(temporaryPath, settingsPath);
}

async function initializeStorage() {
  const dataDir = app.getPath('userData');
  const legacyAudioCacheDir = path.join(dataDir, 'audio-cache');
  recordingsDir = app.isPackaged
    ? path.join(app.getPath('videos'), 'Demo Moderator')
    : path.join(__dirname, 'recordings');
  generatedAudioDir = localAudioCacheDir(__dirname);
  appTempDir = path.join(app.getPath('temp'), 'demo-moderator');
  settingsPath = path.join(dataDir, 'settings.json');

  await Promise.all([
    fs.promises.mkdir(recordingsDir, { recursive: true }),
    fs.promises.mkdir(generatedAudioDir, { recursive: true }),
    fs.promises.mkdir(appTempDir, { recursive: true })
  ]);

  await migrateLegacyAudioCache(legacyAudioCacheDir, generatedAudioDir);

  try {
    const stored = JSON.parse(await fs.promises.readFile(settingsPath, 'utf8'));
    const timers = validateTimerSettings(stored);
    const mediaDevicePreferences = validateMediaDevicePreferences(stored);
    persistedSettings = {
      ...DEFAULT_SETTINGS,
      ...timers,
      ...mediaDevicePreferences,
      ttsEnabled: stored.ttsEnabled !== false,
      ttsVoice: validateVoice(stored.ttsVoice || DEFAULT_SETTINGS.ttsVoice),
      ttsUseKokoro: stored.ttsUseKokoro !== false
    };
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('Ignoring invalid settings file:', error.message);
    }
  }
}

ipcMain.handle('save-settings', async (event, settings) => {
  const timers = validateTimerSettings(settings);
  persistedSettings = { ...persistedSettings, ...timers };
  await writeSettings();
  return timers;
});

ipcMain.handle('load-settings', async () => ({
  demoTime: persistedSettings.demoTime,
  qaTime: persistedSettings.qaTime
}));

ipcMain.handle('save-media-device-preferences', async (event, preferences) => {
  const mediaDevicePreferences = validateMediaDevicePreferences(preferences);
  persistedSettings = { ...persistedSettings, ...mediaDevicePreferences };
  await writeSettings();
  return mediaDevicePreferences;
});

ipcMain.handle('load-media-device-preferences', async () => ({
  cameraId: persistedSettings.cameraId,
  microphoneId: persistedSettings.microphoneId
}));

ipcMain.handle('get-recordings-path', async () => {
  return recordingsDir;
});

ipcMain.handle('toggle-fullscreen', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    throw new Error('Application window is not available');
  }
  const fullscreen = !mainWindow.isFullScreen();
  mainWindow.setFullScreen(fullscreen);
  return { fullscreen };
});

ipcMain.handle('save-recording', async (event, filename, buffer, transcriptData) => {
  try {
    const safeVideoFilename = safeFilename(filename, /^demo-(demo|qa)-[\w-]+\.webm$/, 'recording');
    if (!(buffer instanceof Uint8Array) || buffer.byteLength === 0) {
      throw new Error('Recording data is empty or invalid');
    }
    if (typeof transcriptData !== 'string' || transcriptData.length > 10 * 1024 * 1024) {
      throw new Error('Transcript data is invalid or too large');
    }

    // Create demo-specific subfolder
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const demoFolder = path.join(recordingsDir, `demo-${timestamp}`);
    await fs.promises.mkdir(demoFolder, { recursive: true });

    // Save video file
    const videoPath = path.join(demoFolder, safeVideoFilename);
    await fs.promises.writeFile(videoPath, buffer);

    // Save transcript file if provided
    if (transcriptData) {
      const transcriptFilename = safeVideoFilename.replace(/\.[^.]+$/, '.txt');
      const transcriptPath = path.join(demoFolder, transcriptFilename);
      await fs.promises.writeFile(transcriptPath, transcriptData, 'utf8');
    }

    return { videoPath, demoFolder };
  } catch (error) {
    console.error('Error saving recording:', error);
    throw error;
  }
});

// Local Whisper transcription
let whisperModelPath = null;
let isWhisperReady = false;

// Text-to-Speech functionality
let ttsEnabled = DEFAULT_SETTINGS.ttsEnabled;
let ttsVoice = DEFAULT_SETTINGS.ttsVoice;
let ttsUseKokoro = DEFAULT_SETTINGS.ttsUseKokoro;
const CLONED_VOICES = Object.freeze({
  cl_frido: {
    label: 'Frido',
    referenceDir: 'frido',
    referencePrefix: 'frido',
    cacheRevision: 4
  },
  cl_gabriella: {
    label: 'Gabriella',
    referenceDir: 'gabriella',
    referencePrefix: 'gabriella',
    cacheRevision: 3
  }
});
const QWEN_PRESET_VOICES = Object.freeze({
  qv_serena: {
    label: 'Serena · Qwen',
    speaker: 'Serena',
    cacheRevision: 1
  },
  qv_vivian: {
    label: 'Vivian · Qwen',
    speaker: 'Vivian',
    cacheRevision: 1
  },
  qv_aiden: {
    label: 'Aiden · Qwen',
    speaker: 'Aiden',
    cacheRevision: 1
  },
  qv_eric: {
    label: 'Eric · Qwen',
    speaker: 'Eric',
    cacheRevision: 1
  }
});
const KOKORO_VOICES = Object.freeze({
  af_heart: {
    label: 'Heart · Kokoro',
    cacheRevision: 1
  },
  af_bella: {
    label: 'Bella · Kokoro',
    cacheRevision: 1
  },
  am_michael: {
    label: 'Michael · Kokoro',
    cacheRevision: 1
  },
  am_fenrir: {
    label: 'Fenrir · Kokoro',
    cacheRevision: 1
  }
});
let clonedVoiceProcess = null;
let clonedVoiceReadyPromise = null;
let clonedVoiceReadyResolve = null;
let clonedVoiceReadyReject = null;
let clonedVoiceStdout = '';
let clonedVoiceRequestId = 0;
const clonedVoiceRequests = new Map();
const audioGenerationJobs = new Map();
const nativeAudioPlaybackQueue = new AudioPlaybackQueue();

function getKokoroPythonPath() {
  if (process.env.KOKORO_PYTHON) {
    return process.env.KOKORO_PYTHON;
  }
  return process.platform === 'win32'
    ? path.join(__dirname, 'kokoro_env', 'Scripts', 'python.exe')
    : path.join(__dirname, 'kokoro_env', 'bin', 'python');
}

function kokoroRuntimeIsInstalled() {
  const modelLocations = [
    path.join(__dirname, 'models', 'kokoro'),
    path.join(__dirname, 'kokoro_env', 'kokoro_models'),
    path.join(__dirname, 'kokoro_env')
  ];
  return fs.existsSync(getKokoroPythonPath()) &&
    fs.existsSync(path.join(__dirname, 'kokoro_tts.py')) &&
    modelLocations.some(directory =>
      fs.existsSync(path.join(directory, 'kokoro-v1.0.onnx')) &&
      fs.existsSync(path.join(directory, 'voices-v1.0.bin'))
    );
}

function getClonedVoicePythonPath() {
  if (process.env.CLONED_VOICE_PYTHON) {
    return process.env.CLONED_VOICE_PYTHON;
  }
  return process.platform === 'win32'
    ? path.join(__dirname, 'qwen_tts_env', 'Scripts', 'python.exe')
    : path.join(__dirname, 'qwen_tts_env', 'bin', 'python');
}

function qwenVoiceRuntimeIsInstalled() {
  return process.platform === 'darwin' && process.arch === 'arm64' &&
    fs.existsSync(getClonedVoicePythonPath()) &&
    fs.existsSync(path.join(__dirname, 'qwen_voice_server.py'));
}

function qwenVoiceModelIsInstalled(modelDirectory) {
  const modelSnapshots = path.join(
    __dirname,
    'models',
    'qwen3-tts-cache',
    'hub',
    modelDirectory,
    'snapshots'
  );
  return fs.existsSync(modelSnapshots);
}

function clonedVoiceIsInstalled(voice) {
  const profile = CLONED_VOICES[voice];
  if (!profile || !qwenVoiceRuntimeIsInstalled() || !qwenVoiceModelIsInstalled(
    'models--mlx-community--Qwen3-TTS-12Hz-0.6B-Base-4bit'
  )) return false;
  const referenceBase = path.join(__dirname, 'voice_samples', profile.referenceDir, profile.referencePrefix);
  return fs.existsSync(`${referenceBase}_reference.wav`) &&
    fs.existsSync(`${referenceBase}_reference.txt`);
}

function qwenPresetVoiceIsInstalled(voice) {
  return Object.hasOwn(QWEN_PRESET_VOICES, voice) &&
    qwenVoiceRuntimeIsInstalled() &&
    qwenVoiceModelIsInstalled('models--mlx-community--Qwen3-TTS-12Hz-0.6B-CustomVoice-4bit');
}

function isClonedVoice(voice) {
  return Object.hasOwn(CLONED_VOICES, voice);
}

function isQwenVoice(voice) {
  return isClonedVoice(voice) || Object.hasOwn(QWEN_PRESET_VOICES, voice);
}

function qwenVoiceIsInstalled(voice) {
  return isClonedVoice(voice)
    ? clonedVoiceIsInstalled(voice)
    : qwenPresetVoiceIsInstalled(voice);
}

function getInstalledQwenVoices() {
  return [...Object.entries(CLONED_VOICES), ...Object.entries(QWEN_PRESET_VOICES)]
    .filter(([voice]) => qwenVoiceIsInstalled(voice))
    .map(([id, profile]) => ({ id, label: profile.label }));
}

function getInstalledKokoroVoices() {
  if (!kokoroRuntimeIsInstalled()) return [];
  return Object.entries(KOKORO_VOICES).map(([id, profile]) => ({
    id,
    label: profile.label
  }));
}

function ttsVoiceIsInstalled(voice) {
  if (isQwenVoice(voice)) return qwenVoiceIsInstalled(voice);
  return kokoroRuntimeIsInstalled() &&
    (voice === 'af_sarah' || Object.hasOwn(KOKORO_VOICES, voice));
}

function voiceCacheFilename(filename, voice = ttsVoice) {
  const extension = path.extname(filename);
  const stem = path.basename(filename, extension);
  const validatedVoice = validateVoice(voice);
  const voiceProfile = CLONED_VOICES[validatedVoice] ||
    QWEN_PRESET_VOICES[validatedVoice] ||
    KOKORO_VOICES[validatedVoice];
  const cacheVoice = voiceProfile
    ? `${validatedVoice}_r${voiceProfile.cacheRevision}`
    : validatedVoice;
  return `${stem}__${cacheVoice}${extension}`;
}

function bundledVoiceAudioPath(filename, voice = ttsVoice) {
  return path.join(
    __dirname,
    'pregenerated_audio',
    'voices',
    voiceCacheFilename(filename, voice)
  );
}

function rejectClonedVoiceRequests(error) {
  for (const request of clonedVoiceRequests.values()) {
    clearTimeout(request.timeout);
    request.reject(error);
  }
  clonedVoiceRequests.clear();
}

function clearClonedVoiceProcess(error = null) {
  if (error && clonedVoiceReadyReject) {
    clonedVoiceReadyReject(error);
  }
  if (error) {
    rejectClonedVoiceRequests(error);
  }
  clonedVoiceProcess = null;
  clonedVoiceReadyPromise = null;
  clonedVoiceReadyResolve = null;
  clonedVoiceReadyReject = null;
  clonedVoiceStdout = '';
}

function handleClonedVoiceMessage(message) {
  if (message.type === 'ready') {
    console.log(`Qwen voice worker ready: ${(message.models || [message.model]).filter(Boolean).join(', ')}`);
    if (clonedVoiceReadyResolve) clonedVoiceReadyResolve();
    clonedVoiceReadyResolve = null;
    clonedVoiceReadyReject = null;
    return;
  }

  if (message.type === 'fatal') {
    clearClonedVoiceProcess(new Error(message.error || 'Cloned voice worker failed'));
    return;
  }

  const pending = clonedVoiceRequests.get(String(message.id));
  if (!pending) return;
  clearTimeout(pending.timeout);
  clonedVoiceRequests.delete(String(message.id));
  if (message.type === 'result') {
    pending.resolve(message.output);
  } else {
    pending.reject(new Error(message.error || 'Cloned voice synthesis failed'));
  }
}

function startClonedVoiceProcess() {
  if (clonedVoiceReadyPromise) return clonedVoiceReadyPromise;
  if (!qwenVoiceRuntimeIsInstalled() || getInstalledQwenVoices().length === 0) {
    return Promise.reject(new Error('No local Qwen voice is installed. Run npm run setup-cloned-voice.'));
  }

  const pythonPath = getClonedVoicePythonPath();
  const scriptPath = path.join(__dirname, 'qwen_voice_server.py');
  const processInstance = spawn(pythonPath, [scriptPath], {
    cwd: __dirname,
    env: {
      ...process.env,
      HF_HOME: path.join(__dirname, 'models', 'qwen3-tts-cache'),
      TOKENIZERS_PARALLELISM: 'false'
    },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  clonedVoiceProcess = processInstance;
  clonedVoiceReadyPromise = new Promise((resolve, reject) => {
    clonedVoiceReadyResolve = resolve;
    clonedVoiceReadyReject = reject;
  });
  const startupTimeout = setTimeout(() => {
    if (clonedVoiceReadyReject) {
      clonedVoiceReadyReject(new Error('Cloned voice model took too long to start'));
      clonedVoiceReadyReject = null;
    }
    processInstance.kill();
  }, 120000);
  clonedVoiceReadyPromise.finally(() => clearTimeout(startupTimeout)).catch(() => {});

  processInstance.stdout.on('data', (data) => {
    clonedVoiceStdout += data.toString();
    const lines = clonedVoiceStdout.split('\n');
    clonedVoiceStdout = lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        handleClonedVoiceMessage(JSON.parse(trimmed));
      } catch (error) {
        console.log('Cloned voice:', trimmed);
      }
    }
  });
  processInstance.stderr.on('data', (data) => {
    const message = data.toString().trim();
    if (message) console.log('Cloned voice:', message);
  });
  processInstance.on('error', (error) => {
    if (clonedVoiceProcess === processInstance) clearClonedVoiceProcess(error);
  });
  processInstance.on('close', (code) => {
    if (clonedVoiceProcess === processInstance) {
      clearClonedVoiceProcess(new Error(`Cloned voice worker exited with code ${code}`));
    }
  });

  return clonedVoiceReadyPromise;
}

async function synthesizeWithClonedVoice(text, voice, outputPath) {
  if (!qwenVoiceIsInstalled(voice)) {
    const profile = CLONED_VOICES[voice] || QWEN_PRESET_VOICES[voice];
    throw new Error(`${profile?.label || voice} voice is not installed`);
  }
  await startClonedVoiceProcess();
  if (!clonedVoiceProcess || clonedVoiceProcess.killed || !clonedVoiceProcess.stdin.writable) {
    throw new Error('Cloned voice worker is unavailable');
  }

  const id = String(++clonedVoiceRequestId);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      clonedVoiceRequests.delete(id);
      reject(new Error('Cloned voice synthesis timed out'));
    }, 120000);
    clonedVoiceRequests.set(id, { resolve, reject, timeout });
    clonedVoiceProcess.stdin.write(`${JSON.stringify({ id, text, voice, output: outputPath })}\n`, (error) => {
      if (error) {
        clearTimeout(timeout);
        clonedVoiceRequests.delete(id);
        reject(error);
      }
    });
  });
}

function stopClonedVoiceProcess() {
  if (!clonedVoiceProcess) return;
  const processInstance = clonedVoiceProcess;
  clearClonedVoiceProcess(new Error('Application is closing'));
  processInstance.stdin.end();
  processInstance.kill();
}

app.on('before-quit', stopClonedVoiceProcess);

// Initialize Whisper model on startup
async function initializeWhisper() {
  const modelsDir = path.join(__dirname, 'models');
  const modelPath = path.join(modelsDir, 'ggml-base.en.bin');
  
  if (fs.existsSync(modelPath)) {
    const digest = await new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(modelPath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });

    if (digest === WHISPER_MODEL_SHA256) {
      whisperModelPath = modelPath;
      isWhisperReady = true;
      console.log('Whisper model verified:', modelPath);
      return;
    }

    console.error('Whisper model checksum mismatch. Run npm run download-model again.');
    return;
  }
  
  console.log('Whisper model not found. Please download ggml-base.en.bin to models/ folder');
  console.log('Download from: https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin');
}

app.whenReady().then(async () => {
  await initializeStorage();
  ttsEnabled = persistedSettings.ttsEnabled;
  ttsVoice = persistedSettings.ttsVoice;
  ttsUseKokoro = persistedSettings.ttsUseKokoro;
  if (!ttsVoiceIsInstalled(ttsVoice)) {
    const firstAvailableVoice = [
      ...getInstalledQwenVoices(),
      ...getInstalledKokoroVoices()
    ][0]?.id;
    if (!firstAvailableVoice) {
      throw new Error('No local TTS voice is installed. Run the voice setup commands.');
    }
    console.warn(`Selected voice is unavailable; falling back to ${firstAvailableVoice}.`);
    ttsVoice = firstAvailableVoice;
    persistedSettings.ttsVoice = ttsVoice;
  }
  await initializeWhisper();
  createWindow();
}).catch((error) => {
  console.error('Application startup failed:', error);
  app.quit();
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
  ttsVoice = validateVoice(config.voice || DEFAULT_SETTINGS.ttsVoice);
  ttsUseKokoro = config.useKokoro !== false;
  persistedSettings = {
    ...persistedSettings,
    ttsEnabled,
    ttsVoice,
    ttsUseKokoro
  };
  await writeSettings();
  return { success: true };
});

ipcMain.handle('tts-get-config', async () => {
  return { enabled: ttsEnabled, voice: ttsVoice, useKokoro: ttsUseKokoro };
});

function synthesizeWithKokoro(text, voice, outputPath) {
  return new Promise((resolve, reject) => {
    const pythonPath = getKokoroPythonPath();
    const scriptPath = path.join(__dirname, 'kokoro_tts.py');
    const ttsProcess = spawn(pythonPath, [
      scriptPath,
      '--text', text,
      '--voice', voice,
      '--output', outputPath,
      '--no-play'
    ]);
    let error = '';
    ttsProcess.stderr.on('data', (data) => {
      error += data.toString();
    });
    ttsProcess.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        resolve(outputPath);
      } else {
        reject(new Error(`Kokoro TTS failed with code ${code}: ${error}`));
      }
    });
    ttsProcess.on('error', (processError) => {
      reject(new Error(`Failed to start Kokoro TTS: ${processError.message}`));
    });
  });
}

async function synthesizeSpeechFile(text, voice, outputPath) {
  if (isQwenVoice(voice)) {
    return synthesizeWithClonedVoice(text, voice, outputPath);
  }
  if (!ttsUseKokoro) {
    throw new Error('System TTS does not support audio-file generation');
  }
  return synthesizeWithKokoro(text, voice, outputPath);
}

// Play pregenerated audio files
ipcMain.handle('play-pregenerated-audio', async (event, filename, requestedVoice = ttsVoice) => {
  const safeAudioFilename = safeFilename(filename, /^(?:[a-z0-9_]+)\.wav$/i, 'audio');
  if (/^question_\d+\.wav$/.test(safeAudioFilename)) {
    const questionPath = path.join(generatedAudioDir, safeAudioFilename);
    if (!fs.existsSync(questionPath)) {
      throw new Error(`Generated question audio file not found: ${filename}`);
    }
    await playAudioFile(questionPath);
    return { success: true };
  }
  const voice = validateVoice(requestedVoice);
  const generatedPath = path.join(generatedAudioDir, voiceCacheFilename(safeAudioFilename, voice));
  const curatedVoicePath = bundledVoiceAudioPath(safeAudioFilename, voice);
  const legacyGeneratedPath = path.join(generatedAudioDir, safeAudioFilename);
  const bundledPath = path.join(__dirname, 'pregenerated_audio', safeAudioFilename);
  const fallbackPaths = voice === 'af_sarah'
    ? [legacyGeneratedPath, bundledPath]
    : [];
  // Curated fixed takes are versioned with the app and intentionally override
  // stale stochastic cache files from an earlier local generation.
  const audioPath = [curatedVoicePath, generatedPath, ...fallbackPaths]
    .find(candidate => fs.existsSync(candidate));

  if (!audioPath) {
    throw new Error(`Pregenerated audio file not found: ${filename}`);
  }

  try {
    await playAudioFile(audioPath);
    return { success: true };
  } catch (error) {
    console.error('Error playing pregenerated audio:', error);
    throw error;
  }
});

// Generate dynamic audio for time-based phrases
ipcMain.handle('generate-dynamic-audio', async (event, text, filename, requestedVoice = ttsVoice) => {
  try {
    if (typeof text !== 'string' || text.length === 0 || text.length > 1000) {
      throw new Error('Invalid TTS text');
    }
    const safeAudioFilename = safeFilename(filename, /^[a-z0-9_]+\.wav$/i, 'audio');
    const voice = validateVoice(requestedVoice);
    const outputPath = path.join(generatedAudioDir, voiceCacheFilename(safeAudioFilename, voice));
    const curatedVoicePath = bundledVoiceAudioPath(safeAudioFilename, voice);
    if (fs.existsSync(outputPath) || fs.existsSync(curatedVoicePath)) {
      return { success: true, filename: safeAudioFilename, cached: true };
    }

    // Use TTS to generate the audio file
    let generationJob = audioGenerationJobs.get(outputPath);
    if (!generationJob) {
      generationJob = synthesizeSpeechFile(text, voice, outputPath)
        .finally(() => audioGenerationJobs.delete(outputPath));
      audioGenerationJobs.set(outputPath, generationJob);
    }
    await generationJob;
    return { success: true, filename: safeAudioFilename };
  } catch (error) {
    console.error('Error in generate-dynamic-audio:', error);
    throw error;
  }
});

// Generate audio for questions
ipcMain.handle('generate-question-audio', async (event, text) => {
  try {
    if (typeof text !== 'string' || text.length === 0 || text.length > 1000) {
      throw new Error('Invalid question text');
    }
    // Generate unique filename for this question
    const timestamp = Date.now();
    const filename = `question_${timestamp}.wav`;
    const outputPath = path.join(generatedAudioDir, filename);
    await synthesizeSpeechFile(text, ttsVoice, outputPath);
    return { success: true, filename };
  } catch (error) {
    console.error('Error in generate-question-audio:', error);
    throw error;
  }
});

ipcMain.handle('delete-question-audio', async (event, filename) => {
  const safeAudioFilename = safeFilename(filename, /^question_\d+\.wav$/, 'question audio');
  const audioPath = path.join(generatedAudioDir, safeAudioFilename);
  try {
    await fs.promises.unlink(audioPath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
  return { success: true };
});

// Expose a curated set of local Qwen and Kokoro voices in Settings.
ipcMain.handle('tts-get-voices', async () => {
  const qwenVoices = getInstalledQwenVoices();
  const kokoroVoices = getInstalledKokoroVoices();
  const voices = [...qwenVoices, ...kokoroVoices];
  return {
    success: voices.length > 0,
    voices: voices.map(({ id }) => id),
    voiceLabels: Object.fromEntries(voices.map(({ id, label }) => [id, label])),
    voiceGroups: Object.fromEntries([
      ...qwenVoices.map(({ id }) => [id, 'Qwen']),
      ...kokoroVoices.map(({ id }) => [id, 'Kokoro'])
    ]),
    error: voices.length > 0 ? undefined : 'No local moderator voices are installed'
  };
});

// Ollama API integration for question generation
ipcMain.handle('generate-question', async (event, transcript) => {
  return new Promise((resolve) => {
    try {
      const normalizedTranscript = validateTranscript(transcript);
      console.log('Generating question for transcript:', normalizedTranscript.substring(0, 100) + '...');
      
      const postData = JSON.stringify({
        model: QUESTION_MODEL,
        system: ModeratorContent.systemPrompt,
        prompt: ModeratorContent.questionPrompt(normalizedTranscript),
        stream: false,
        think: false,
        keep_alive: '10m',
        options: {
          temperature: 0.4,
          num_predict: QUESTION_MAX_TOKENS
        }
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
            if (res.statusCode !== 200 || response.error) {
              throw new Error(response.error || (res.statusCode !== 200
                ? `Ollama returned HTTP ${res.statusCode}`
                : 'Ollama failed to generate a question'));
            }
            const question = validateGeneratedQuestion(response.response);
            console.log('Ollama response received:', question.substring(0, 100));
            resolve({ success: true, question, model: QUESTION_MODEL });
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

      req.setTimeout(QUESTION_TIMEOUT_MS, () => {
        console.error(`Request to Ollama timed out after ${QUESTION_TIMEOUT_MS / 1000}s`);
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
  const questions = ModeratorContent.fallbackQuestions;
  const randomQuestion = questions[Math.floor(Math.random() * questions.length)];
  return { success: true, question: randomQuestion, fallback: true };
}

// Text-to-Speech implementation
async function speakText(text, options = {}) {
  const voice = validateVoice(options.voice || ttsVoice);
  console.log(`Speaking: "${text}" using voice: ${voice}`);
  
  if (isQwenVoice(voice)) {
    return speakWithClonedVoice(text, voice);
  }
  if (ttsUseKokoro) {
    return speakWithKokoro(text, { ...options, voice });
  } else {
    return speakWithSystem(text, { ...options, voice });
  }
}

async function speakWithClonedVoice(text, voice) {
  const timestamp = Date.now();
  const tempAudioPath = path.join(appTempDir, `tts_clone_${timestamp}.wav`);
  try {
    await synthesizeWithClonedVoice(text, voice, tempAudioPath);
    await playAudioFile(tempAudioPath);
  } finally {
    try {
      await fs.promises.unlink(tempAudioPath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('Could not delete cloned voice audio:', error.message);
      }
    }
  }
}

async function speakWithKokoro(text, options = {}) {
  return new Promise((resolve, reject) => {
    const pythonPath = getKokoroPythonPath();
    const scriptPath = path.join(__dirname, 'kokoro_tts.py');
    const voice = options.voice || ttsVoice;
    
    // Create temporary file for audio output
    const timestamp = Date.now();
    const tempAudioPath = path.join(appTempDir, `tts_${timestamp}.wav`);
    
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
  return nativeAudioPlaybackQueue.enqueue(() => playAudioFileNow(filePath));
}

async function playAudioFileNow(filePath) {
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

  let tempWebmPath;
  let tempWavPath;
  try {
    if (!(audioBuffer instanceof Uint8Array) || audioBuffer.byteLength === 0 || audioBuffer.byteLength > 50 * 1024 * 1024) {
      throw new Error('Audio data is empty, invalid, or too large');
    }

    const timestamp = Date.now();
    tempWebmPath = path.join(appTempDir, `temp_audio_${timestamp}.webm`);
    tempWavPath = path.join(appTempDir, `temp_audio_${timestamp}.wav`);
    
    // Save WebM audio buffer first
    await fs.promises.writeFile(tempWebmPath, audioBuffer);
    
    // Convert WebM to WAV using ffmpeg
    await convertWebmToWav(tempWebmPath, tempWavPath);
    
    // Use whisper.cpp for transcription
    const transcription = await transcribeWithWhisper(tempWavPath);
    
    return transcription;
  } catch (error) {
    console.error('Error transcribing audio:', error);
    throw error;
  } finally {
    const temporaryFiles = [tempWebmPath, tempWavPath, tempWavPath && `${tempWavPath}.txt`].filter(Boolean);
    await Promise.all(temporaryFiles.map(async (temporaryFile) => {
      try {
        await fs.promises.unlink(temporaryFile);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.warn('Could not delete temporary audio file:', error.message);
        }
      }
    }));
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
          resolve(transcription);
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
          resolve(transcription);
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
