"use client";

import { useRef, useState } from "react";
import Trimmer from "./Trimmer";

const MAX_BYTES = 1024 * 1024 * 1024;

export default function Uploader() {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  function pick(f: File | undefined) {
    setError(null);
    if (!f) return;
    if (!f.type.startsWith("video/") && !/\.(mp4|m4v|mov|webm|mkv)$/i.test(f.name)) {
      setError("That isn't a video file. Try an MP4, MOV or WebM.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("That file is over 1 GB. Trim it down in another app first, or pick a shorter video.");
      return;
    }
    setFile(f);
  }

  if (file) return <Trimmer file={file} onReset={() => setFile(null)} />;

  return (
    <section className="drop-wrap">
      <button
        type="button"
        className={`drop${over ? " drop--over" : ""}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          pick(e.dataTransfer.files[0]);
        }}
      >
        <span className="drop__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 16V4M6 10l6-6 6 6M4 20h16" />
          </svg>
        </span>
        <span className="drop__title">Drop a video here</span>
        <span className="drop__hint">or click to choose a file · MP4, MOV, WebM · up to 1 GB</span>
      </button>
      <input
        ref={input}
        id="file"
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => pick(e.target.files?.[0])}
      />
      {error && <p className="error" role="alert">{error}</p>}
      <ol className="steps">
        <li><b>Upload</b> any clip from your PC</li>
        <li><b>Trim</b> it to the moment that matters</li>
        <li><b>Paste the link</b> in Discord and it embeds</li>
      </ol>
    </section>
  );
}
