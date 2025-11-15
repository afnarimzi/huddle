import os
import uvicorn
import tempfile
import json
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import whisper
import google.generativeai as genai
from dotenv import load_dotenv
from pydub import AudioSegment
import numpy as np
from resemblyzer import VoiceEncoder, preprocess_wav
from pathlib import Path
from scipy.spatial.distance import cosine

# --- 1. SETTINGS & LOAD KEYS ---

load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    print("="*50)
    print("ERROR: GEMINI_API_KEY not found in your .env file!")
    print("="*50)
    exit()

try:
    genai.configure(api_key=GEMINI_API_KEY)
except Exception as e:
    print(f"Error configuring Gemini: {e}")
    exit()

# --- 2. LOAD AI MODELS AT STARTUP ---
print("Loading AI models into memory... (This may take a moment)")
try:
    gemini_model = genai.GenerativeModel('gemini-2.5-flash')
    print("✅ Gemini model loaded.")
    
    whisper_model = whisper.load_model("base")
    print("✅ Whisper model loaded.")
    
    voice_encoder = VoiceEncoder()
    print("✅ VoiceEncoder model loaded.")
    
except Exception as e:
    print(f"Error loading models: {e}")
    exit()

# --- 3. LOAD ENROLLED FINGERPRINTS ---
ENROLLED_SPEAKERS = [
    "Afna Rimzi",
    "Sinana",
    "Telna Chacko"
]

print("Loading speaker fingerprints...")
speaker_fingerprints = {}
for name in ENROLLED_SPEAKERS:
    fingerprint_file = f"{name}_fingerprint.npy"
    if not os.path.exists(fingerprint_file):
        print(f"⚠️ WARNING: Fingerprint file not found for {name}. Skipping.")
    else:
        speaker_fingerprints[name] = np.load(fingerprint_file)
        print(f"  -> Loaded fingerprint for {name}")

print("✅ Fingerprints loaded.")

# --- 4. CREATE FASTAPI APP & CONFIGURE CORS ---
app = FastAPI()

origins = [
    "http://localhost:3000", ] 

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 5. THE AI "BRAIN" FUNCTIONS ---

def detect_speakers_by_pauses(transcription, pause_threshold=0.8): # More sensitive pause
    print(f"👥 Detecting speakers by pauses (threshold: {pause_threshold}s)...")
    segments = transcription['segments']
    speaker_segments = []
    current_speaker_id = 0
    if not segments: return []
    first_seg = segments[0]
    speaker_segments.append({
        'speaker': f'SPEAKER_{current_speaker_id:02d}',
        'start': first_seg['start'],
        'end': first_seg['end'],
        'text': first_seg['text']
    })
    for i in range(1, len(segments)):
        current_seg = segments[i]
        prev_seg = segments[i-1]
        pause_duration = current_seg['start'] - prev_seg['end']
        if pause_duration >= pause_threshold:
            current_speaker_id += 1
        speaker_segments.append({
            'speaker': f'SPEAKER_{current_speaker_id:02d}',
            'start': current_seg['start'],
            'end': current_seg['end'],
            'text': current_seg['text']
        })
    print(f"✅ Detected {current_speaker_id + 1} potential speakers based on pauses.")
    return speaker_segments

# *** THIS IS THE PROMPT ***
def detect_speakers_with_gemini(transcription):
    print("👥 Using Gemini AI to detect speakers...")
    segments = transcription['segments']
    transcript_text = "\n".join([f"[{seg['start']:.1f}s - {seg['end']:.1f}s]: {seg['text']}" for seg in segments])

    # We get the list of names from our enrolled speakers
    speaker_names = ", ".join(ENROLLED_SPEAKERS) # "Afna Rimzi, Sinana, Telna chacko"

    prompt = f"""You are an expert in conversation analysis.
Your task is to analyze this transcript and assign one of the known speaker names to each segment.
The speakers in this meeting are: {speaker_names}.

Analyze the text of the conversation. Look for cues like "Hi, this is Fawaz" or one person replying to another.
Use these clues to assign the correct name to each segment.

Respond ONLY with a valid JSON array, with one entry for each segment.
Use "Unknown" if you are not sure.

Example:
[
  {{"timestamp": "[0.0s - 5.2s]", "speaker": "Sinana"}},
  {{"timestamp": "[5.2s - 10.1s]", "speaker": "Afna Rimzi"}},
  {{"timestamp": "[10.5s - 15.1s]", "speaker": "Telna chacko"}}
]

TRANSCRIPT:
{transcript_text}

JSON_ARRAY:
"""

    try:
        response = gemini_model.generate_content(prompt)
        result_text = response.text.strip().replace("```json", "").replace("```", "").strip()
        speaker_data = json.loads(result_text)
        
        speaker_segments = []
        for i, seg in enumerate(segments):
            # Get the name directly from the AI
            speaker = speaker_data[i].get('speaker', 'Unknown') 
            speaker_segments.append({
                'speaker': speaker,
                'start': seg['start'],
                'end': seg['end'],
                'text': seg['text']
            })
        print(f"✅ Gemini detected and named speakers.")
        return speaker_segments
        
    except Exception as e:
        print(f"⚠️ Gemini speaker detection FAILED: {e}. Falling back to pause-based detection.")
        # Fallback if Gemini fails
        return detect_speakers_by_pauses(transcription)

def transcribe_audio(audio_path):
    print(f"🎤 Transcribing: {audio_path}")
    try:
        result = whisper_model.transcribe(audio_path, word_timestamps=True)
        print("✅ Transcription complete.")
        return result
    except Exception as e:
        print(f"❌ Whisper Error: {e}")
        raise HTTPException(status_code=500, detail=f"Whisper failed: {e}")

def create_timeline(speaker_segments):
    print("🔗 Creating speaker timeline...")
    timeline = []
    if not speaker_segments: return []
    current_speaker = speaker_segments[0]['speaker']
    current_text = [speaker_segments[0]['text']]
    current_start = speaker_segments[0]['start']
    current_end = speaker_segments[0]['end']
    for seg in speaker_segments[1:]:
        if seg['speaker'] == current_speaker:
            current_text.append(seg['text'])
            current_end = seg['end']
        else:
            timeline.append({
                'speaker': current_speaker,
                'text': ' '.join(current_text),
                'start': current_start,
                'end': current_end
            })
            current_speaker = seg['speaker']
            current_text = [seg['text']]
            current_start = seg['start']
            current_end = seg['end']
    timeline.append({
        'speaker': current_speaker,
        'text': ' '.join(current_text),
        'start': current_start,
        'end': current_end
    })
    print("✅ Timeline created.")
    return timeline

def generate_summary(timeline):
    print("📝 Generating summary with Gemini...")
    transcript_text = "\n".join([f"**{turn['speaker']}**: {turn['text']}" for turn in timeline])
    prompt = f"""You are an expert meeting summarizer. Based on the following transcript, please provide:
1.  A short, one-paragraph summary.
2.  A bulleted list of the main topics.
3.  A bulleted list of any action items or decisions.

TRANSCRIPT:
{transcript_text}
"""
    try:
        response = gemini_model.generate_content(prompt)
        print("✅ Summary generated.")
        return response.text
    except Exception as e:
        print(f"❌ Gemini Summary Error: {e}")
        raise HTTPException(status_code=500, detail=f"Summary failed: {e}")

# This function is NO LONGER NEEDED with the new prompt
# but we leave it in case we want to use it later.
def match_speakers_to_fingerprints(timeline, meeting_audio_path):
    print("🤖 Matching unknown speakers to enrolled fingerprints...")
    print("✅ Speaker renaming complete.")
    return timeline


# --- 6. THE API ENDPOINTS (UPDATED) ---

@app.get("/")
def read_root():
    return {"message": "AI Meeting Assistant Server is running!"}

@app.post("/analyze/")
async def analyze_audio(file: UploadFile = File(...)):
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=file.filename) as temp_file:
            temp_file.write(await file.read())
            temp_file_path = temp_file.name
        
        print(f"--- New Job Started: {file.filename} ---")
        
        # --- Run the Full AI Pipeline ---
        
        # 1. Transcribe
        transcription = transcribe_audio(temp_file_path)
        
        # 2. Detect Speakers (Generic)
        speaker_segments = detect_speakers_with_gemini(transcription)
        
        # 3. Create Timeline
        timeline = create_timeline(speaker_segments)
        
        # 4. Auto-Rename Speakers
        # This step is now LESS important because Gemini is already adding names,
        # but we run it anyway to "double-check" and match fingerprints.
        renamed_timeline = match_speakers_to_fingerprints(timeline, temp_file_path)
        
        # 5. Summarize
        summary = generate_summary(renamed_timeline)
        
        # ---------------------------------
        
        os.remove(temp_file_path)
        print(f"--- Job Finished: {file.filename} ---")
        
        return {
            "summary": summary,
            "timeline": renamed_timeline,
            "full_transcript_text": transcription['text']
        }

    except Exception as e:
        if 'temp_file_path' in locals() and os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        print(f"--- Job FAILED: {e} ---")
        if isinstance(e, HTTPException):
            raise e
        else:
            raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {e}")

# --- 7. RUN THE SERVER ---
if __name__ == "__main__":
    print("Starting Uvicorn server...")
    uvicorn.run(app, host="127.0.0.1", port=8000)