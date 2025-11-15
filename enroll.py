import os
from pathlib import Path
from resemblyzer import VoiceEncoder, preprocess_wav
import numpy as np

# --- 1. CONFIGURE YOUR SPEAKERS ---

SPEAKER_NAMES = [
    "Afna Rimzi",
    "Sinana",
    "Telna Chacko"
]

# Find audio files (supports .mp3, .wav, .flac)
def find_audio_file(name):
    extensions = ['.mp3', '.wav', '.flac', '.m4a']
    for ext in extensions:
        file_path = Path(f"{name}{ext}")
        if file_path.exists():
            return file_path
    return None

# Load the VoiceEncoder model
print("Loading VoiceEncoder model...")
encoder = VoiceEncoder()

print("\nStarting enrollment process...")
fingerprints = {}

for name in SPEAKER_NAMES:
    print(f"\nProcessing: {name}")
    
    # 1. Find the audio file
    audio_path = find_audio_file(name)
    if not audio_path:
        print(f"  ❌ ERROR: Could not find audio file for '{name}'.")
        print(f"           Make sure '{name}.mp3' or '{name}.wav' exists.")
        continue

    try:
        # 2. Load and preprocess the audio
        wav = preprocess_wav(audio_path)
        
        # 3. Create the voice fingerprint (embedding)
        fingerprint = encoder.embed_utterance(wav)
        fingerprints[name] = fingerprint
        
        # 4. Save the fingerprint to a new file
        output_filename = f"{name}_fingerprint.npy"
        np.save(output_filename, fingerprint)
        
        print(f"  ✅ Success! Fingerprint saved to {output_filename}")

    except Exception as e:
        print(f"  ❌ ERROR processing {name}: {e}")

print("\n--- Enrollment Complete! ---")
print("You now have .npy files for each speaker.")
print("You can now restart your main server (`python3 main.py`)")