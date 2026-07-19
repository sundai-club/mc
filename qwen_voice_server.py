#!/usr/bin/env python3
"""Persistent local TTS worker for cloned and preset Qwen voice profiles."""

import contextlib
import json
import sys
import traceback
import wave
from pathlib import Path

import mlx.core as mx
import numpy as np
from mlx_audio.tts.utils import load_model
from mlx_audio.utils import load_audio


ROOT = Path(__file__).resolve().parent
BASE_MODEL_ID = "mlx-community/Qwen3-TTS-12Hz-0.6B-Base-4bit"
CUSTOM_VOICE_MODEL_ID = "mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-4bit"
VOICE_PROFILES = {
    "cl_frido": {
        "audio": ROOT / "voice_samples" / "frido" / "frido_reference.wav",
        "text": ROOT / "voice_samples" / "frido" / "frido_reference.txt",
    },
    "cl_gabriella": {
        "audio": ROOT / "voice_samples" / "gabriella" / "gabriella_reference.wav",
        "text": ROOT / "voice_samples" / "gabriella" / "gabriella_reference.txt",
    },
}
PRESET_VOICES = {
    "qv_serena": "Serena",
    "qv_vivian": "Vivian",
    "qv_aiden": "Aiden",
}
MAX_TEXT_LENGTH = 1_000
FADE_OUT_MS = 30
TAIL_SILENCE_MS = 300


def emit(payload):
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def save_wav(output_path, audio, sample_rate):
    output = Path(output_path).resolve()
    if output.suffix.lower() != ".wav":
        raise ValueError("Output must be a WAV file")
    output.parent.mkdir(parents=True, exist_ok=True)

    samples = np.asarray(audio, dtype=np.float32).reshape(-1)
    samples = np.clip(samples, -1.0, 1.0)
    fade_samples = min(len(samples), int(sample_rate * FADE_OUT_MS / 1000))
    if fade_samples:
        samples[-fade_samples:] *= np.linspace(1.0, 0.0, fade_samples, dtype=np.float32)
    samples = np.concatenate([
        samples,
        np.zeros(int(sample_rate * TAIL_SILENCE_MS / 1000), dtype=np.float32)
    ])
    pcm = (samples * 32767.0).astype("<i2")
    with wave.open(str(output), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(int(sample_rate))
        wav_file.writeframes(pcm.tobytes())


def find_installed_profiles():
    profiles = {}
    for voice_id, profile in VOICE_PROFILES.items():
        if not profile["audio"].is_file() or not profile["text"].is_file():
            continue
        reference_text = profile["text"].read_text(encoding="utf-8").strip()
        if reference_text:
            profiles[voice_id] = {**profile, "reference_text": reference_text}
    return profiles


def load_voice_model(model_id, installed_profiles):
    with contextlib.redirect_stdout(sys.stderr):
        model = load_model(model_id)
        loaded_profiles = {}
        if model_id == BASE_MODEL_ID:
            for voice_id, profile in installed_profiles.items():
                reference_audio = load_audio(
                    str(profile["audio"]), sample_rate=model.sample_rate
                )
                mx.eval(reference_audio)
                loaded_profiles[voice_id] = {
                    "audio": reference_audio,
                    "text": profile["reference_text"],
                }
    return model, loaded_profiles


def main():
    if sys.platform != "darwin":
        raise RuntimeError("The local Qwen voices currently require Apple Silicon")

    installed_profiles = find_installed_profiles()
    if not installed_profiles and not PRESET_VOICES:
        raise FileNotFoundError("No local Qwen voice profiles are configured")

    emit({
        "type": "ready",
        "models": [BASE_MODEL_ID, CUSTOM_VOICE_MODEL_ID],
        "sampleRate": 24000,
        "voices": [*installed_profiles, *PRESET_VOICES],
    })

    model = None
    active_model_id = None
    loaded_profiles = {}

    for line in sys.stdin:
        request_id = None
        try:
            request = json.loads(line)
            request_id = request.get("id")
            text = request.get("text")
            output = request.get("output")
            voice_id = request.get("voice")
            if not isinstance(text, str) or not text.strip() or len(text) > MAX_TEXT_LENGTH:
                raise ValueError("Text must contain 1 to 1000 characters")
            if not isinstance(output, str) or not output:
                raise ValueError("Output path is required")
            if voice_id in installed_profiles:
                requested_model_id = BASE_MODEL_ID
            elif voice_id in PRESET_VOICES:
                requested_model_id = CUSTOM_VOICE_MODEL_ID
            else:
                raise ValueError(f"Unknown or unavailable Qwen voice: {voice_id}")

            if active_model_id != requested_model_id:
                if model is not None:
                    del model
                    loaded_profiles = {}
                    mx.clear_cache()
                model, loaded_profiles = load_voice_model(
                    requested_model_id, installed_profiles
                )
                active_model_id = requested_model_id

            with contextlib.redirect_stdout(sys.stderr):
                if voice_id in installed_profiles:
                    profile = loaded_profiles[voice_id]
                    results = list(model.generate(
                        text=text.strip(),
                        lang_code="English",
                        ref_audio=profile["audio"],
                        ref_text=profile["text"],
                        temperature=0.8,
                        top_k=40,
                        top_p=0.95,
                        repetition_penalty=1.5,
                    ))
                else:
                    results = list(model.generate(
                        text=text.strip(),
                        voice=PRESET_VOICES[voice_id],
                        lang_code="English",
                        temperature=0.7,
                        top_k=40,
                        top_p=0.9,
                        repetition_penalty=1.1,
                    ))
            if not results:
                raise RuntimeError("Voice model returned no audio")

            audio = mx.concatenate([result.audio for result in results])
            mx.eval(audio)
            save_wav(output, audio, model.sample_rate)
            emit({"type": "result", "id": request_id, "output": output})
            mx.clear_cache()
        except Exception as error:
            traceback.print_exc(file=sys.stderr)
            emit({"type": "error", "id": request_id, "error": str(error)})


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        traceback.print_exc(file=sys.stderr)
        emit({"type": "fatal", "error": str(error)})
        sys.exit(1)
