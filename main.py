import os
import uvicorn
import tempfile
import json
import asyncio
from fastapi import FastAPI, UploadFile, File, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import whisper
import google.generativeai as genai
from dotenv import load_dotenv
from pydub import AudioSegment
import numpy as np
from resemblyzer import VoiceEncoder, preprocess_wav
from pathlib import Path
from scipy.spatial.distance import cosine

# =========================================================
# 1. ENV + GEMINI
# =========================================================
load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    gemini_model = genai.GenerativeModel("gemini-2.5-flash")
else:
    gemini_model = None

# =========================================================
# 2. LOAD MODELS
# =========================================================
print("Loading Whisper + VoiceEncoder...")
whisper_model = whisper.load_model("base")
voice_encoder = VoiceEncoder()

# =========================================================
# 3. LOAD SPEAKER FINGERPRINTS
# =========================================================
ENROLLED_SPEAKERS = ["Afna Rimzi", "Sinana", "Telna Chacko"]

speaker_fingerprints = {}
samples_dir = Path("samples")

for name in ENROLLED_SPEAKERS:
    fp_path = samples_dir / f"{name}_fingerprint.npy"
    if fp_path.exists():
        speaker_fingerprints[name] = np.load(str(fp_path))
        print(f"Loaded fingerprint → {name}")
    else:
        print(f"❌ Missing fingerprint for {name}")

# =========================================================
# 4. FASTAPI APP + CORS
# =========================================================
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================================================
# 5. HELPER FUNCTIONS
# =========================================================
def transcribe_file(path):
    result = whisper_model.transcribe(path, word_timestamps=True)
    text = result.get("text", "")
    return text


def match_speaker(wav_path, threshold=0.45):
    try:
        wav = preprocess_wav(wav_path)
        emb = voice_encoder.embed_utterance(wav)
    except Exception as e:
        print("Embedding error:", e)
        return "Unknown"

    best_name = "Unknown"
    best_dist = 1.0

    for name, fp in speaker_fingerprints.items():
        dist = float(cosine(fp, emb))
        if dist < best_dist:
            best_dist = dist
            best_name = name

    return best_name if best_dist <= threshold else "Unknown"


def convert_to_wav(input_path, output_path):
    audio = AudioSegment.from_file(input_path)
    audio.export(output_path, format="wav")


# =========================================================
# 6. UPLOAD MODE (POST /analyze/)
# =========================================================
@app.post("/analyze/")
async def analyze_audio(file: UploadFile = File(...)):
    try:
        # Save uploaded file
        with tempfile.NamedTemporaryFile(delete=False, suffix=file.filename) as temp_file:
            temp_file.write(await file.read())
            temp_path = temp_file.name

        # Convert to WAV
        wav_path = tempfile.NamedTemporaryFile(delete=False, suffix=".wav").name
        convert_to_wav(temp_path, wav_path)

        # Transcribe
        text = transcribe_file(wav_path)

        # Try to identify the speaker using the first 3 seconds
        short_clip = AudioSegment.from_file(wav_path)[:3000]
        short_path = tempfile.NamedTemporaryFile(delete=False, suffix=".wav").name
        short_clip.export(short_path, format="wav")

        speaker = match_speaker(short_path)

        # Clean temp
        os.remove(temp_path)
        os.remove(wav_path)
        os.remove(short_path)

        # Build transcript output
        timeline = [{
            "speaker": speaker,
            "text": text.strip()
        }]

        # Basic summary placeholder
        summary = "Summary placeholder (you can enable Gemini summarization later)."

        return {
            "summary": summary,
            "timeline": timeline,
            "full_transcript_text": text
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =========================================================
# 7. LIVE MODE (WEBSOCKET)
# =========================================================
@app.websocket("/ws/live")
async def websocket_live(ws: WebSocket):
    await ws.accept()
    print("WebSocket connected.")

    conn_dir = tempfile.TemporaryDirectory()
    conn_dir_path = conn_dir.name
    acc_file = os.path.join(conn_dir_path, "chunk.webm")
    open(acc_file, "wb").close()

    try:
        while True:
            data = await ws.receive()

            # Binary audio chunk
            if "bytes" in data and data["bytes"]:
                with open(acc_file, "ab") as f:
                    f.write(data["bytes"])

            # Text messages
            if "text" in data and data["text"]:
                msg = json.loads(data["text"])

                # Finish segment
                if msg["type"] == "segment_end":
                    wav_out = os.path.join(conn_dir_path, "segment.wav")

                    try:
                        convert_to_wav(acc_file, wav_out)
                    except Exception as e:
                        await ws.send_text(json.dumps({"type": "error", "detail": str(e)}))
                        open(acc_file, "wb").close()
                        continue

                    # Transcribe
                    text = transcribe_file(wav_out)

                    # Speaker match
                    speaker = match_speaker(wav_out)

                    # Send result
                    await ws.send_text(json.dumps({
                        "type": "segment_result",
                        "speaker": speaker,
                        "text": text.strip()
                    }))

                    # Reset
                    open(acc_file, "wb").close()
                    os.remove(wav_out)

                if msg["type"] == "end_connection":
                    await ws.close()
                    break

    except WebSocketDisconnect:
        print("WebSocket disconnected.")
    finally:
        conn_dir.cleanup()


# =========================================================
# 8. RUN SERVER
# =========================================================
if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
