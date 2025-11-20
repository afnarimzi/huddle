import os
from pathlib import Path
from resemblyzer import VoiceEncoder, preprocess_wav
import numpy as np

SPEAKER_NAMES = ["Afna Rimzi", "Sinana", "Telna Chacko"]

SAMPLES_DIR = Path("samples")  # <--- FORCE DIRECTORY

print("Looking in directory:", SAMPLES_DIR.resolve())

def find_audio_file(name):
    print(f"Searching for: {name} inside {SAMPLES_DIR.resolve()}")
    for ext in [".mp3", ".wav", ".flac", ".m4a"]:
        fp = SAMPLES_DIR / f"{name}{ext}"
        print("Checking:", fp.resolve())
        if fp.exists():
            print("FOUND:", fp.resolve())
            return fp
    print("NOT FOUND:", name)
    return None

print("Loading VoiceEncoder model...")
encoder = VoiceEncoder()

for name in SPEAKER_NAMES:
    print("\nProcessing:", name)
    audio = find_audio_file(name)

    if not audio:
        print("❌ File missing:", name)
        continue

    wav = preprocess_wav(audio)
    fp = encoder.embed_utterance(wav)

    out = SAMPLES_DIR / f"{name}_fingerprint.npy"
    np.save(out, fp)
    print("✅ Saved fingerprint:", out.resolve())

print("\n DONE \n")
