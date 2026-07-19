# Kokoro TTS Integration

Kokoro is a Text-to-Speech (TTS) system integrated into this demo moderator application. It provides high-quality voice synthesis using the ONNX runtime for fast, local inference.

## Overview

Kokoro TTS is used to convert text into natural-sounding speech audio files. This integration allows the demo moderator to provide audio feedback, announcements, or read text aloud during presentations.

## Prerequisites

- Python 3.10 or newer
- Virtual environment support (venv)
- macOS with Homebrew (for current setup)

## Installation

### Recommended setup

The runtime uses a replaceable virtual environment at `kokoro_env/`. Model weights live separately under `models/kokoro/` so rebuilding the environment does not delete them.

```bash
npm run setup-tts
```

This installs the pinned runtime, downloads both v1.0 model files, verifies their SHA-256 checksums, and lists the installed voices.

### Manual runtime setup

Install the required kokoro_onnx package:

```bash
python3 -m venv kokoro_env
kokoro_env/bin/python -m pip install -r requirements-kokoro.txt
```

### 3. Download Model Files

```
mkdir -p models/kokoro
cd models/kokoro

# Download voice data (bin format is preferred)
wget https://github.com/nazdridoy/kokoro-tts/releases/download/v1.0.0/voices-v1.0.bin

# Download the model
wget https://github.com/nazdridoy/kokoro-tts/releases/download/v1.0.0/kokoro-v1.0.onnx
```
