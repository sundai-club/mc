# Use Ubuntu as base image for better compatibility
FROM ubuntu:22.04

# Prevent interactive prompts during build
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies including Electron dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    python3 \
    python3-pip \
    python3-venv \
    nodejs \
    npm \
    xvfb \
    x11-utils \
    libasound2-dev \
    ffmpeg \
    git \
    build-essential \
    cmake \
    ca-certificates \
    gnupg \
    lsb-release \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libxss1 \
    libasound2 \
    libcups2 \
    libgtk-3-0 \
    libgdk-pixbuf2.0-0 \
    libgconf-2-4 \
    && rm -rf /var/lib/apt/lists/*

# Install Ollama
RUN curl -fsSL https://ollama.ai/install.sh | sh

# Set work directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Create Python virtual environment for Kokoro TTS
RUN python3 -m venv kokoro_env

# Install Kokoro TTS and dependencies
RUN . kokoro_env/bin/activate && pip install --upgrade pip && \
    pip install kokoro-tts numpy

# Download Kokoro model files
RUN mkdir -p kokoro_env/kokoro_models && \
    cd kokoro_env/kokoro_models && \
    wget https://github.com/nazdridoy/kokoro-tts/releases/download/v1.0.0/voices-v1.0.bin && \
    wget https://github.com/nazdridoy/kokoro-tts/releases/download/v1.0.0/kokoro-v1.0.onnx

# Clone and build whisper.cpp
RUN git clone https://github.com/ggml-org/whisper.cpp.git /tmp/whisper.cpp && \
    cd /tmp/whisper.cpp && \
    cmake -B build && \
    cmake --build build -j --config Release && \
    cp build/bin/whisper-cli /usr/local/bin/whisper-cli

# Copy application files
COPY . .

# Create necessary directories
RUN mkdir -p models temp recordings pregenerated_audio

# Download Whisper model
RUN node download-model.js

# Set up display for Electron
ENV DISPLAY=:99

# Configure Ollama to listen on all interfaces
ENV OLLAMA_HOST=0.0.0.0:11434

# Expose port 8484 for the application and 11434 for Ollama
EXPOSE 8484 11434

# Create startup script that starts Ollama, pulls Gemma model, and starts the app
RUN echo '#!/bin/bash\n\
# Start virtual display\n\
Xvfb :99 -screen 0 1024x768x24 > /dev/null 2>&1 &\n\
sleep 3\n\
# Start Ollama server in background\n\
ollama serve &\n\
# Wait for Ollama to start\n\
sleep 10\n\
# Pull Gemma model\n\
ollama pull gemma3:1b\n\
# Start the Electron application with Docker flags\n\
npm start -- --no-sandbox --disable-dev-shm-usage --disable-gpu --disable-web-security' > start.sh && chmod +x start.sh

CMD ["./start.sh"]