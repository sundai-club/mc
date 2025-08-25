# Demo Moderator

A desktop application built with Electron for moderating demo presentations with built-in timer, recording, and **local speech-to-text** capabilities.

## Features

- **Configurable Timer**: Set custom durations for demo and Q&A phases (default: 2 minutes each)
- **Visual Progress**: Real-time progress bar and countdown display
- **Timer Controls**: Start, pause, resume, reset, and skip to next phase
- **Video Recording**: Record demos with webcam and microphone
- **Local Speech-to-Text**: Real-time transcription using local Whisper model (offline, private)
- **Live Transcript Panel**: See your speech as text in real-time on the right side
- **Automatic Saving**: All recordings saved to `recordings/` folder with timestamps
- **Live Preview**: See your webcam feed during recording
- **Professional UI**: Modern gradient design with responsive layout

## Prerequisites

- Node.js (version 14 or higher)
- npm (comes with Node.js)
- Webcam and microphone (for recording features)
- **Whisper CLI** (for local speech-to-text): Install with `brew install whisper-cpp` on macOS or [download from GitHub](https://github.com/ggerganov/whisper.cpp)
- **FFmpeg** (for audio format conversion): Install with `brew install ffmpeg` on macOS

## Installation

### Quick Setup (Recommended)
```bash
# Clone or download the project
cd mc

# Install dependencies AND download Whisper model
npm run setup
```

### Manual Setup
1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Download Whisper Model** (required for transcription):
   ```bash
   npm run download-model
   ```
   This downloads a ~142MB local Whisper model for offline speech-to-text.

3. **Install Whisper CLI** (if not already installed):
   - **macOS**: `brew install whisper-cpp`
   - **Linux**: Follow [whisper.cpp installation guide](https://github.com/ggerganov/whisper.cpp)
   - **Windows**: Download from [whisper.cpp releases](https://github.com/ggerganov/whisper.cpp/releases)

4. **Install FFmpeg** (required for audio conversion):
   - **macOS**: `brew install ffmpeg`
   - **Linux**: `sudo apt install ffmpeg` or equivalent for your distribution
   - **Windows**: Download from [ffmpeg.org](https://ffmpeg.org/download.html)

## Running the Application

Start the demo moderator app:
```bash
npm start
```

The application will:
- Open in a new window (1400x800 for the transcript panel)
- Request camera and microphone permissions
- Show Whisper model status in Settings

## How to Use

### Basic Timer Operation
1. **Start Demo**: Click "Start Demo" to begin the demo phase timer
2. **Pause/Resume**: Use the pause button to temporarily stop the timer
3. **Next Phase**: Skip to Q&A phase or click when demo phase completes
4. **Reset**: Reset timer back to ready state

### Recording Demos
1. **Grant Permissions**: Allow camera and microphone access when prompted
2. **Start Recording**: Click the red "Start Recording" button
3. **Live Preview**: Your webcam feed appears in the video preview window
4. **Stop Recording**: Click "Stop Recording" or recording stops automatically when session ends
5. **Files Saved**: Recordings are automatically saved to the `recordings/` folder

### Using Live Transcription
1. **Check Status**: Go to Settings to verify Whisper model is ready (green checkmark)
2. **Start Transcription**: Click the 🎤 microphone button in the transcript panel (right side)
3. **Real-time Text**: Your speech appears as timestamped messages
4. **Stop/Clear**: Use the stop button or "Clear" to reset transcript
5. **Works Offline**: Everything runs locally - no internet required!

### Customize Settings
1. **Open Settings**: Click the "Settings" button in the top right
2. **Adjust Times**: Set demo and Q&A durations (1-60 minutes)
3. **Check Transcription**: View Whisper model status (✅ ready or ❌ needs setup)
4. **Save Settings**: Click "Save Settings" to apply changes

## File Structure

```
mc/
├── main.js           # Electron main process with local Whisper integration
├── index.html        # Application interface with transcript panel
├── renderer.js       # Application logic and transcription handling
├── styles.css        # Styling and layout with transcript panel styles
├── package.json      # Project configuration with Whisper dependencies
├── download-model.js # Script to download Whisper model
├── recordings/       # Auto-created folder for video files
├── models/          # Auto-created folder for Whisper model (ggml-base.en.bin)
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

The application currently uses mouse/touch controls. All functions are accessible through the graphical interface.

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
- **Timer Not Working**: Try refreshing by clicking Reset button
- **Settings Not Saving**: Ensure you have write permissions in the app directory

### Performance
- **Slow Performance**: Close other applications using camera/microphone
- **Large File Sizes**: Recordings are high quality - consider shorter sessions for smaller files
- **Memory Usage**: Local Whisper model uses ~500MB RAM during transcription

## Development

To modify or extend the application:

1. **Edit Files**: Modify `renderer.js` for functionality, `styles.css` for appearance
2. **Test Changes**: Run `npm start` to see changes
3. **Electron Documentation**: Visit [electronjs.org](https://electronjs.org) for advanced features

## License

MIT License - Feel free to modify and distribute as needed.

## Support

For issues or feature requests, check the project documentation or create an issue in the project repository.