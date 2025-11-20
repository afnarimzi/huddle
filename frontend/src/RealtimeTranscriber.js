import React, { useEffect, useRef, useState } from "react";

export default function RealtimeTranscriber() {
  const [isRecording, setIsRecording] = useState(false);
  const [connected, setConnected] = useState(false);
  const [statusText, setStatusText] = useState("Disconnected");
  const [transcriptBlocks, setTranscriptBlocks] = useState([]);

  const wsRef = useRef(null);
  const mediaRecorderRef = useRef(null);

  // Transcribe every 2 chunks (2 seconds)
  const CHUNKS_PER_SEGMENT = 2;
  const chunkCounterRef = useRef(0);

  // -------------------- WebSocket Connection --------------------
  const connectWebSocket = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    const socket = new WebSocket("ws://127.0.0.1:8000/ws/live");
    socket.binaryType = "arraybuffer";

    socket.onopen = () => {
      wsRef.current = socket;
      setConnected(true);
      setStatusText("Connected");
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "segment_result") {
          const now = new Date();
          const ts = `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;

          setTranscriptBlocks((prev) => [
            ...prev,
            {
              speaker: data.speaker,
              text: data.text,
              timestamp: ts,
            },
          ]);
        }
      } catch (err) {
        console.log("Non-JSON message:", event.data);
      }
    };

    socket.onclose = () => {
      wsRef.current = null;
      setConnected(false);
      setStatusText("Disconnected");
    };
  };

  // -------------------- Start Recording --------------------
  const startRecording = async () => {
    connectWebSocket();

    await new Promise((r) => setTimeout(r, 300));

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      alert("WebSocket not connected. Start backend!");
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        wsRef.current.send(e.data);
        chunkCounterRef.current++;

        if (chunkCounterRef.current >= CHUNKS_PER_SEGMENT) {
          wsRef.current.send(JSON.stringify({ type: "segment_end" }));
          chunkCounterRef.current = 0;
        }
      }
    };

    recorder.onstart = () => {
      setIsRecording(true);
      setStatusText("Recording...");
    };

    recorder.start(1000); // send audio every 1 second
    mediaRecorderRef.current = recorder;
  };

  // -------------------- Stop Recording --------------------
  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }

    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: "segment_end" }));
    }

    setIsRecording(false);
    setStatusText("Stopped");
  };

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // -------------------- UI --------------------
  return (
    <div className="card">
      <h2>🎤 Real-Time Speaker Identification</h2>

      <div style={{ marginBottom: 20 }}>
        {!isRecording ? (
          <button className="record-button" onClick={startRecording}>
            Start Recording
          </button>
        ) : (
          <button className="stop-button" onClick={stopRecording}>
            Stop Recording
          </button>
        )}

        <span style={{ marginLeft: 15, fontWeight: "bold" }}>
          {connected ? "🟢 WS Connected" : "🔴 Not Connected"}
        </span>
      </div>

      <div className="timeline-box" style={{ minHeight: 250 }}>
        {transcriptBlocks.length === 0 && (
          <p style={{ color: "#aaa" }}>Start talking…</p>
        )}

        {transcriptBlocks.map((b, i) => (
          <div key={i} className="turn">
            <span className="speaker">{b.speaker}</span>
            <span style={{ marginLeft: 10, color: "#999" }}>{b.timestamp}</span>
            <p className="text">{b.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
