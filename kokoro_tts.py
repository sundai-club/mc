#!/usr/bin/env python3
"""
Kokoro TTS integration script for Sundai
Uses the Kokoro ONNX model for text-to-speech synthesis
"""

import os
import sys
import argparse
import tempfile
import subprocess
import numpy as np
import wave
from pathlib import Path

# Import kokoro_onnx
try:
    from kokoro_onnx import Kokoro
except ImportError:
    print("Error: kokoro_onnx not installed. Please install it first.", file=sys.stderr)
    sys.exit(1)

def get_model_paths():
    """Get the paths to the Kokoro model files"""
    # Check both possible locations
    base_dir = Path(__file__).parent
    kokoro_env_dir = base_dir / "kokoro_env"
    kokoro_models_dir = kokoro_env_dir / "kokoro_models"
    
    # Try kokoro_models directory first
    model_path = kokoro_models_dir / "kokoro-v1.0.onnx"
    voices_path = kokoro_models_dir / "voices-v1.0.bin"
    
    if model_path.exists() and voices_path.exists():
        return str(model_path), str(voices_path)
    
    # Try kokoro_env directory
    model_path = kokoro_env_dir / "kokoro-v1.0.onnx" 
    voices_path = kokoro_env_dir / "voices-v1.0.bin"
    
    if model_path.exists() and voices_path.exists():
        return str(model_path), str(voices_path)
        
    raise FileNotFoundError("Kokoro model files not found in expected locations")

def list_voices(kokoro_instance):
    """List available voices from the Kokoro instance"""
    try:
        return kokoro_instance.get_voices()
    except Exception as e:
        print(f"Error loading voices: {e}", file=sys.stderr)
        return []

def save_audio_wav(audio, sample_rate, output_path):
    """Save audio data as WAV file"""
    # Convert float32 to int16 for WAV format
    if audio.dtype == np.float32:
        audio_int16 = (audio * 32767).astype(np.int16)
    else:
        audio_int16 = audio.astype(np.int16)
    
    with wave.open(output_path, 'wb') as wav_file:
        wav_file.setnchannels(1)  # mono
        wav_file.setsampwidth(2)  # 16-bit
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(audio_int16.tobytes())

def synthesize_speech(text, voice="af", output_path=None, play_audio=True):
    """
    Synthesize speech using Kokoro TTS
    
    Args:
        text: Text to synthesize
        voice: Voice name to use (default: "af")
        output_path: Path to save audio file (optional)
        play_audio: Whether to play the audio (default: True)
    
    Returns:
        Path to generated audio file
    """
    try:
        # Get model paths
        model_path, voices_path = get_model_paths()
        
        # Initialize Kokoro
        kokoro = Kokoro(model_path, voices_path)
        
        # Generate audio
        print(f"Generating speech with voice '{voice}': {text[:50]}...", file=sys.stderr)
        audio, sample_rate = kokoro.create(text, voice=voice)
        
        # Determine output path
        if output_path is None:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                output_path = f.name
        
        # Save audio using wave module
        save_audio_wav(audio, sample_rate, output_path)
        
        print(f"Audio saved to: {output_path}", file=sys.stderr)
        
        # Play audio if requested
        if play_audio:
            play_audio_file(output_path)
            
        return output_path
        
    except Exception as e:
        print(f"Error synthesizing speech: {e}", file=sys.stderr)
        raise

def play_audio_file(file_path):
    """Play audio file using system audio player"""
    try:
        if sys.platform == "darwin":  # macOS
            subprocess.run(["afplay", file_path], check=True)
        elif sys.platform == "win32":  # Windows
            subprocess.run(["powershell", "-c", f'(New-Object Media.SoundPlayer "{file_path}").PlaySync()'], check=True)
        else:  # Linux
            # Try multiple players
            players = ["aplay", "paplay", "play"]
            for player in players:
                try:
                    subprocess.run([player, file_path], check=True)
                    break
                except (subprocess.CalledProcessError, FileNotFoundError):
                    continue
            else:
                print("No audio player found", file=sys.stderr)
    except subprocess.CalledProcessError as e:
        print(f"Error playing audio: {e}", file=sys.stderr)
    except Exception as e:
        print(f"Unexpected error playing audio: {e}", file=sys.stderr)

def main():
    parser = argparse.ArgumentParser(description="Kokoro TTS for Sundai")
    parser.add_argument("--list-voices", action="store_true", help="List available voices")
    parser.add_argument("--text", type=str, help="Text to synthesize")
    parser.add_argument("--voice", type=str, default="af", help="Voice to use (default: af)")
    parser.add_argument("--output", type=str, help="Output audio file path")
    parser.add_argument("--no-play", action="store_true", help="Don't play the audio")
    
    args = parser.parse_args()
    
    try:
        # Get model paths first to validate setup
        model_path, voices_path = get_model_paths()
        
        if args.list_voices:
            # Initialize Kokoro to get voices
            kokoro = Kokoro(model_path, voices_path)
            voices = list_voices(kokoro)
            if voices:
                print("Available voices:")
                for voice in sorted(voices):
                    print(f"  - {voice}")
            else:
                print("No voices found")
            return
            
        if not args.text:
            parser.error("--text is required when not listing voices")
            
        # Synthesize speech
        output_path = synthesize_speech(
            args.text, 
            args.voice, 
            args.output,
            not args.no_play
        )
        
        # Print output path for the calling application
        print(output_path)
        
    except FileNotFoundError as e:
        print(f"Setup error: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()