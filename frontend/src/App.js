import React, { useState } from 'react';
import axios from 'axios';
import './App.css';
import RealtimeTranscriber from "./RealtimeTranscriber"; // NEW IMPORT

function App() {

  const [mode, setMode] = useState("upload"); // upload | live

  // Upload mode states
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('IDLE');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
    // We can't clear the blob, so we just set the file
    // The handleUpload function will prioritize the file
  };

  const handleUpload = async () => {
    let audioFile;
    let fileName;

    // --- LOGIC ---
    // We will prioritize the file upload. 
    // If a file is selected, we use it.
    // If no file is selected, we try to use the recording.
    
    if (file) {
      // --- A. Use the FILE UPLOAD ---
      audioFile = file;
      fileName = file.name;
    } else if (mediaBlobUrl) {
      // --- B. Use the RECORDER ---
      const audioBlob = await fetch(mediaBlobUrl).then((res) => res.blob());
      audioFile = new File([audioBlob], "live_recording.mp3", { type: "audio/mp3" });
      fileName = "live_recording.mp3";
    } else {
      alert('Please select a file or record some audio first!');
      return;
    }

    setStatus('UPLOADING');
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append('file', audioFile, fileName);

    try {
      setStatus('PROCESSING');

      const response = await axios.post('http://127.0.0.1:8000/analyze/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setStatus('COMPLETED');
      setResult(response.data);
    } catch (err) {
      setStatus('FAILED');
      setError(err.response ? err.response.data.detail : 'An unknown error occurred');
    }
  };

  const handleStartOver = () => {
    setStatus('IDLE');
    setResult(null);
    setError(null);
    setFile(null);
    // Reload the window to clear the mediaBlobUrl
    window.location.reload();
  };

  const isUploading = status === 'PROCESSING';

  return (
    <div className="App">
      <header className="App-header">

<h1 style={{color: "yellow"}}>TEST LINE — APP UPDATED</h1>

        <div style={{ marginBottom: "20px" }}>
          <button onClick={() => setMode("upload")}>Upload Mode</button>
          <button onClick={() => setMode("live")} style={{ marginLeft: "10px" }}>
            Live Mode
          </button>
        </div>

        {/* Upload Mode */}
        {mode === "upload" && (
          <>
            <div className="card">
              <h3>Step 1: Upload Your Audio File</h3>
              <p>Select an MP3 or WAV file to analyze.</p>

              <input type="file" onChange={handleFileChange} accept="audio/*" />

              <button onClick={handleUpload} disabled={status === 'PROCESSING'}>
                {status === 'PROCESSING' ? 'Analyzing... Please Wait...' : 'Analyze Audio'}
              </button>
            </div>

            {status === 'PROCESSING' && (
              <div className="card">
                <h2>Processing...</h2>
                <p>This may take a few minutes for long audio files.</p>
                <div className="spinner"></div>
              </div>
            )}

            {status === 'FAILED' && (
              <div className="card error">
                <h2>Analysis Failed</h2>
                <p>{error}</p>
              </div>
            )}

            {status === 'COMPLETED' && result && (
              <div className="card">
                <h2>✅ Analysis Complete!</h2>

                <div className="result-section">
                  <h3>Summary</h3>
                  <pre className="summary-box">{result.summary}</pre>
                </div>

                <div className="result-section">
                  <h3>Full Transcript</h3>
                  <div className="timeline-box">
                    {result.timeline.map((turn, index) => (
                      <div key={index} className="turn">
                        <span className="speaker">{turn.speaker}:</span>
                        <p className="text">{turn.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Real-Time Mode */}
        {mode === "live" && <RealtimeTranscriber />}

      </header>
    </div>
  );
}

export default App;
