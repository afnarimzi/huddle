import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  // State variables to hold our data
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('IDLE'); // IDLE, UPLOADING, PROCESSING, COMPLETED, FAILED
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // 1. This function runs when the user selects a file
  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
  };

  // 2. This function runs when the user clicks "Upload"
  const handleUpload = async () => {
    if (!file) {
      alert('Please select a file first!');
      return;
    }

    // Reset state
    setStatus('UPLOADING');
    setError(null);
    setResult(null);

    // Create a FormData object to send the file
    const formData = new FormData();
    formData.append('file', file);

    try {
      // Send the file to our FastAPI backend
      // This is the "blocking" call, so we wait...
      setStatus('PROCESSING');
      
      const response = await axios.post('http://127.0.0.1:8000/analyze/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      // Once it's done, set the results
      setStatus('COMPLETED');
      setResult(response.data);

    } catch (err) {
      // Handle any errors
      setStatus('FAILED');
      setError(err.response ? err.response.data.detail : 'An unknown error occurred');
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>🎙️ AI Meeting & Podcast Assistant</h1>
        
        {/* --- 1. UPLOAD FORM --- */}
        <div className="card">
          <h3>Step 1: Upload Your Audio File</h3>
          <p>Select an MP3 or WAV file to analyze.</p>
          <input type="file" onChange={handleFileChange} accept="audio/*" />
          <button onClick={handleUpload} disabled={status === 'PROCESSING'}>
            {status === 'PROCESSING' ? 'Analyzing... Please Wait...' : 'Analyze Audio'}
          </button>
        </div>

        {/* --- 2. STATUS & RESULTS --- */}
        {status === 'PROCESSING' && (
          <div className="card">
            <h2>Processing...</h2>
            <p>This may take a few minutes for long audio files. Please keep this tab open.</p>
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
            
            {/* --- SUMMARY --- */}
            <div className="result-section">
              <h3>Summary</h3>
              {/* We use <pre> to keep the line breaks from the summary */}
              <pre className="summary-box">{result.summary}</pre>
            </div>
            
            {/* --- TIMELINE --- */}
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
      </header>
    </div>
  );
}

export default App;