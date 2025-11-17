import React, { useState } from 'react';
import axios from 'axios';
import './App.css';
import { useReactMediaRecorder } from 'react-media-recorder';

// --- SVG Icons for a cleaner UI ---
const UploadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const RecordIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="3" fill="#f44336" stroke="none" />
  </svg>
);

const AppTitle = () => (
  <div className="title-container">
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C11.4477 2 11 2.44772 11 3V11C11 11.5523 11.4477 12 12 12C12.5523 12 13 11.5523 13 11V3C13 2.44772 12.5523 2 12 2Z" fill="#61dafb"/>
      <path d="M12 12C11.4477 12 11 12.4477 11 13V21C11 21.5523 11.4477 22 12 22C12.5523 22 13 21.5523 13 21V13C13 12.4477 12.5523 12 12 12Z" fill="#61dafb"/>
      <path d="M19 10C18.4477 10 18 10.4477 18 11V13C18 13.5523 18.4477 14 19 14C19.5523 14 20 13.5523 20 13V11C20 10.4477 19.5523 10 19 10Z" fill="#61dafb" opacity="0.7"/>
      <path d="M5 10C4.44772 10 4 10.4477 4 11V13C4 13.5523 4.44772 14 5 14C5.55228 14 6 13.5523 6 13V11C6 10.4477 5.55228 10 5 10Z" fill="#61dafb" opacity="0.7"/>
      <path d="M16 6C15.4477 6 15 6.44772 15 7V17C15 17.5523 15.4477 18 16 18C16.5523 18 17 17.5523 17 17V7C17 6.44772 16.5523 6 16 6Z" fill="#61dafb" opacity="0.7"/>
      <path d="M8 6C7.44772 6 7 6.44772 7 7V17C7 17.5523 7.44772 18 8 18C8.55228 18 9 17.5523 9 17V7C9 6.44772 8.55228 6 8 6Z" fill="#61dafb" opacity="0.7"/>
    </svg>
    <h1>AI Meeting Assistant</h1>
  </div>
);

function App() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('IDLE'); // IDLE, UPLOADING, PROCESSING, COMPLETED, FAILED
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const {
    status: recordStatus,
    startRecording,
    stopRecording,
    mediaBlobUrl,
    // clearBlob, // <-- This function does not exist in all versions, so we removed it
  } = useReactMediaRecorder({ audio: true, video: false });

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

    setStatus('PROCESSING');
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append('file', audioFile, fileName);

    try {
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
        <AppTitle />
        
        {status === 'COMPLETED' && result ? (
          // --- RESULTS ---
          <div className="results-container">
            <div className="card summary-card">
              <h3>Summary</h3>
              <pre className="summary-box">{result.summary}</pre>
            </div>
            <div className="card transcript-card">
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
            <button onClick={handleStartOver} className="start-over-button">
              Analyze Another File
            </button>
          </div>
        ) : (
          // --- UPLOAD FORM ---
          <div className="form-container">
            <div className="card">
              <h4><RecordIcon /> Record Live Audio</h4>
              <p>Status: <span className="status-text">{recordStatus}</span></p>
              <div className="button-group">
                <button 
                  onClick={startRecording} 
                  disabled={recordStatus === 'recording'}
                  className="record-button"
                >
                  Start Recording
                </button>
                <button 
                  onClick={stopRecording} 
                  disabled={recordStatus !== 'recording'}
                  className="stop-button"
                >
                  Stop Recording
                </button>
              </div>
              {mediaBlobUrl && (
                <audio src={mediaBlobUrl} controls className="audio-player" />
              )}
            </div>

            <p className="or-divider">--- OR ---</p>

            <div className="card">
              <h4><UploadIcon /> Upload an Audio File</h4>
              <input 
                type="file" 
                onChange={handleFileChange} 
                accept="audio/*" 
                id="file-upload"
                className="file-input"
              />
              <label htmlFor="file-upload" className="file-label">
                {file ? file.name : 'Choose a file...'}
              </label>
            </div>

            <button 
              className="analyze-button" 
              onClick={handleUpload} 
              disabled={isUploading || (!file && !mediaBlobUrl)}
            >
              {isUploading ? 'Analyzing...' : 'Analyze Audio'}
            </button>

            {isUploading && (
              <div className="spinner-container">
                <div className="spinner"></div>
                <p>This may take a minute...</p>
              </div>
            )}

            {status === 'FAILED' && (
              <div className="card error">
                <h2>Analysis Failed</h2>
                <p>{error}</p>
              </div>
            )}
          </div>
        )}
      </header>
    </div>
  );
}

export default App;