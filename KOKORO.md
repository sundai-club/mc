# Kokoro TTS Integration

Kokoro is a Text-to-Speech (TTS) system integrated into this demo moderator application. It provides high-quality voice synthesis using the ONNX runtime for fast, local inference.

## Overview

Kokoro TTS is used to convert text into natural-sounding speech audio files. This integration allows the demo moderator to provide audio feedback, announcements, or read text aloud during presentations.

## Prerequisites

- Python 3.9 - 3.12 (Python 3.13+ is not supported)
- Virtual environment support (venv)
- macOS with Homebrew (for current setup)

## Installation

### 1. Set up Python Virtual Environment

The Kokoro TTS system uses a dedicated Python virtual environment located at `kokoro_env/`.

```bash
# Create the virtual environment (if not already created)
python3 -m venv kokoro_env

# Activate the virtual environment
source kokoro_env/bin/activate
```

### 2. Install Kokoro ONNX

Install the required kokoro_onnx package:

```bash
# With virtual environment activated
pip install kokoro-tts
```

### 3. Download Model Files

```
cd kokoro_env/
mkdir kokoro_models
cd kokoro_models

# Download voice data (bin format is preferred)
wget https://github.com/nazdridoy/kokoro-tts/releases/download/v1.0.0/voices-v1.0.bin

# Download the model
wget https://github.com/nazdridoy/kokoro-tts/releases/download/v1.0.0/kokoro-v1.0.onnx
```
