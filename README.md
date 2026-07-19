# Demo Moderator

A desktop application built with Electron for moderating demo presentations with built-in timer, recording, and **local speech-to-text** capabilities.

## Features

- **Configurable Timer**: Set custom durations for demo and Q&A phases (default: 2 minutes each)
- **Visual Progress**: Real-time progress bar and countdown display
- **Timer Controls**: Start, pause, resume, reset, and skip to next phase
- **Video Recording**: Record demos with webcam and microphone
- **Local Speech-to-Text**: Real-time transcription using an on-device Whisper model (local, private)
- **Local Moderator Voices**: Consented Frido and Gabriella clones, curated Qwen presets, and four top-ranked Kokoro voices run locally
- **Live Transcript Panel**: See your speech as text in real-time on the right side
- **Automatic Saving**: All recordings saved to `recordings/` folder with timestamps
- **Live Preview**: See your webcam feed during recording
- **Stage-readable UI**: Full-screen pixel-art interface with a large green/yellow/red timer
- **Live Pitch Context**: Shows the current hack in the header and current project above the stage status

## Prerequisites

- Node.js 20 or newer
- npm (comes with Node.js)
- Webcam and microphone (for recording features)
- **Whisper CLI** (for local speech-to-text): Install with `brew install whisper-cpp` on macOS or [download from GitHub](https://github.com/ggerganov/whisper.cpp)
- **FFmpeg** (for audio format conversion): Install with `brew install ffmpeg` on macOS
- **Ollama** (for local question generation): Install from [ollama.com](https://ollama.com)
- **Python 3** (for local Kokoro text-to-speech)
- **Apple Silicon Mac** (for the optional Qwen3-TTS voice clones)

## Installation

### Quick Setup (Recommended)
```bash
# Clone or download the project
cd mc

# Install dependencies and all local models
npm run setup
```

The first setup downloads Whisper `base.en`, Kokoro v1.0, and `qwen3.5:4b-mlx` through Ollama. On Apple Silicon it also installs the local Qwen voice runtime and models; other platforms skip that optional step. Setup can require more than 5 GB of disk space.

### Manual Setup
1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Download Whisper Model** (required for transcription):
   ```bash
   npm run download-model
   ```
   This downloads a ~142MB Whisper model for local speech-to-text.

3. **Set up Kokoro and the local question model**:
   ```bash
   npm run setup-tts
   npm run pull-question-model
   ```

4. **Set up the local Qwen voices** (Apple Silicon only):
   ```bash
   npm run setup-cloned-voice
   ```
   The repository includes the two small, consented reference WAV/transcript pairs required for the Frido and Gabriella voices, plus audited pre-recorded copies of their fixed announcements and Settings previews. Original/full recordings, extracted segments, manifests, runtime-generated questions, cache files, and downloaded models stay local and are ignored by Git. The setup downloads the local 4-bit Qwen3-TTS Base model for clones and CustomVoice model for preset voices, using roughly 3.2 GB combined. The four curated Kokoro voices come from the separate `npm run setup-tts` step above.

   If you have the private source recordings locally and need to rebuild either reference pair, run these before setup:
   ```bash
   node scripts/build-consented-voice-samples.js
   node scripts/build-consented-voice-samples.js gabriella
   ```

5. **Install Whisper CLI** (if not already installed):
   - **macOS**: `brew install whisper-cpp`
   - **Linux**: Follow [whisper.cpp installation guide](https://github.com/ggerganov/whisper.cpp)
   - **Windows**: Download from [whisper.cpp releases](https://github.com/ggerganov/whisper.cpp/releases)

6. **Install FFmpeg** (required for audio conversion):
   - **macOS**: `brew install ffmpeg`
   - **Linux**: `sudo apt install ffmpeg` or equivalent for your distribution
   - **Windows**: Download from [ffmpeg.org](https://ffmpeg.org/download.html)

## Running the Application

Start the demo moderator app:
```bash
npm start
```

On macOS, you can instead double-click `Launch Demo Moderator.command` in Finder. Its Terminal window closes automatically after a normal app exit and stays open when startup fails so the error remains visible.

The application will:
- Open full-screen by default with a stage-readable timer and transcript panel
- Request camera and microphone permissions
- Show Whisper model status in Settings
- Generate one transcript-aware question locally with `qwen3.5:4b-mlx`
- Fetch the current project title from Sundai's public event API for the small debug line above the stage status

## How to Use

### Basic Timer Operation
1. **Start Demo**: Click "Start Demo", press Space, or press Enter to begin the demo phase timer
2. **Pause/Resume**: Use the pause button to temporarily stop the timer
3. **Next Phase**: Skip to Q&A, or let the demo timer transition automatically
4. **Automatic Finish**: At Q&A `00:00`, the timed session completes automatically; the display then counts negative overrun while camera and transcript capture continue
5. **Next Presenter**: Press Space or Enter once to stop, save, clear, and return to READY; press again to start the next demo

### Recording Demos
1. **Grant Permissions**: Allow camera and microphone access when prompted
2. **Start Recording**: Start the demo; recording and transcription begin together
3. **Live Preview**: Your webcam feed appears in the video preview window
4. **After Time Expires**: Recording continues as a safety buffer after the timed session completes
5. **Stop Recording**: Click "Stop & Clear" or press Space/Enter after completion to save, clear the on-screen session, and return to READY; closing the app also saves
6. **Files Saved**: Each session folder under `recordings/` contains the video, transcript, and `metadata.json` with the project title and Sundai link

The saved project is the queue item observed for the greatest amount of recording time. This tolerates the Sundai pitch controller switching away from the previous project shortly after recording starts or advancing to the next project shortly before recording stops.

### Using Live Transcription
1. **Check Status**: Go to Settings to verify Whisper model is ready (green checkmark)
2. **Choose a Microphone**: Select the input in Settings; the choice is remembered on this computer
3. **Start the Demo**: Recording and local transcription begin together
4. **Real-time Text**: Your speech appears as timestamped messages
5. **Stop/Clear**: Use "Stop & Clear" to save the recording, clear the session, and return to READY
6. **Runs Locally**: Transcription stays on this computer

The live-pitch debug line is the one network-backed display: it reads public event and queue state from `www.sundai.club`. Camera, microphone, transcript, recording, question, and voice data are never sent with that request.

### Customize Settings
1. **Open Settings**: Click the "Settings" button in the top right
2. **Adjust Times**: Set demo and Q&A durations (1-60 minutes)
3. **Check Transcription**: View Whisper model status (✅ ready or ❌ needs setup)
4. **Choose Event Mode**: Keep `Sundai` for the live hack/project feed, or select `Non-Sundai` to hide it and stop all Sundai API requests
5. **Save Settings**: Click "Save Settings" to apply changes

The voice menu groups the local voices by engine. Qwen includes `Frido`, `Gabriella`, `Serena`, `Vivian`, `Aiden`, and `Eric`. Kokoro includes its highest-ranked American-English female voices, `Heart` and `Bella`, plus two of its highest-ranked American-English male voices, `Michael` and `Fenrir`. Frido remains the default when his local reference is installed. Transition phrases and Settings previews are cached separately per voice, so changing the selection cannot replay audio generated with another voice.

The local moderator prompt and fixed announcements use the same voice-independent wording rules for every speaker. Voice selection changes only the sound of the moderator, not the wording or personality of generated questions.

## File Structure

```
mc/
├── main.js           # Electron main process with local Whisper integration
├── preload.js        # Restricted bridge between the UI and Electron
├── config.js         # Shared defaults and input validation
├── index.html        # Application interface with transcript panel
├── renderer.js       # Application logic and transcription handling
├── styles.css        # Styling and layout with transcript panel styles
├── package.json      # Project configuration with Whisper dependencies
├── download-model.js # Script to download Whisper model
├── setup-tts.js      # Kokoro runtime/model setup and verification
├── setup-cloned-voice.js # Local MLX/Qwen voice-clone setup
├── qwen_voice_server.py  # Persistent consented-clone worker
├── moderator-content.js  # Voice-independent prompt, fallback questions, and announcement copy
├── audio-playback-queue.js # Prevents announcements from overlapping across sessions
├── scripts/build-consented-voice-samples.js # Rebuilds isolated local samples
├── scripts/close-launcher-terminal.applescript # Closes the Finder launcher tab after exit
├── pregenerated_audio/voices/ # Audited fixed Frido/Gabriella announcements
├── recordings/       # Auto-created folder for video files
├── audio-cache/      # Runtime-generated audio cache (ignored by Git)
├── models/          # Auto-created folder for verified Whisper/Kokoro weights
├── temp/            # Auto-created folder for temporary audio processing
└── README.md        # This file
```

## Recording Files

- **Location**: All recordings are saved in the `recordings/` folder
- **Format**: WebM video format with VP9 codec
- **Quality**: 1280x720 HD video with audio
- **Naming**: `demo-[phase]-[timestamp].webm`
  - Example: `demo-demo-2025-08-24T16-07-25-833Z.webm`

## Keyboard Shortcuts

- **Space or Enter in READY**: Start the demo
- **Space or Enter after completion**: Stop, save, clear, and return to READY
- Keyboard shortcuts are ignored while editing a field or using a button/select control

## Troubleshooting

### Transcription Issues
- **Model Not Ready**: Run `npm run download-model` to download the Whisper model
- **Whisper CLI Missing**: Install whisper-cpp with `brew install whisper-cpp` (macOS) or from GitHub
- **No Transcription**: Check Settings panel for model status and error messages
- **Slow Transcription**: Model runs locally - performance depends on your CPU

### Camera/Microphone Issues
- **Permission Denied**: Check your system's privacy settings to allow camera/microphone access
- **No Video Preview**: Restart the application and grant permissions when prompted
- **Recording Failed**: Ensure no other applications are using your camera/microphone

### Application Issues
- **Won't Start**: Make sure you ran `npm install` or `npm run setup` first
- **Timer Not Working**: Use "Stop & Clear" to return to READY, then start a new session
- **Questions Use Fallbacks**: Run `npm run pull-question-model` and verify Ollama is running
- **First Question Is Slow**: The first `qwen3.5:4b-mlx` request loads the model; subsequent questions are faster while it remains loaded
- **Kokoro Not Ready**: Run `npm run setup-tts`; if a copied virtualenv is broken, move `kokoro_env` aside first
- **Settings Not Saving**: Check write access to Electron's per-user application-data directory

### Performance
- **Slow Performance**: Close other applications using camera/microphone
- **Large File Sizes**: Recordings are high quality - consider shorter sessions for smaller files
- **Memory Usage**: Local Whisper model uses ~500MB RAM during transcription

## Development

To modify or extend the application:

1. **Edit Files**: Modify `renderer.js` for functionality, `styles.css` for appearance
2. **Test Changes**: Run `npm start` to see changes
3. **Electron Documentation**: Visit [electronjs.org](https://electronjs.org) for advanced features

Run the automated checks with `npm test`.

## License

MIT License - Feel free to modify and distribute as needed.

## Support

For issues or feature requests, check the project documentation or create an issue in the project repository.
