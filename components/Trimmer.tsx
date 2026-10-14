"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { captureThumb, cutClip, filmstrip, putWithProgress, timecode } from "@/lib/video";

type Stage =
  | { kind: "idle" }
  | { kind: "working"; label: string; pct: number | null }
  | { kind: "error"; msg: string };

type Drag = "start" | "end" | "head" | null;

const MIN_LEN = 0.5;
const FRAMES = 12;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// Parse a JSON response without choking on an empty or non-JSON body (e.g. a bare 500).
async function readJson<T>(res: Response, fallback: string): Promise<T> {
  const text = await res.text();
  let data: (T & { error?: string }) | null = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) throw new Error(data?.error ?? `${fallback} The server returned an error (status ${res.status}).`);
  if (!data) throw new Error(`${fallback} The server sent an unreadable response (status ${res.status}).`);
  return data;
}

export default function Trimmer({ file, onReset }: { file: File; onReset: () => void }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag>(null);

  const [src, setSrc] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [frames, setFrames] = useState<string[]>([]);
  const [title, setTitle] = useState(file.name.replace(/\.[^.]+$/, "").slice(0, 100));
  const [precise, setPrecise] = useState(false);
  const [stage, setStage] = useState<Stage>({ kind: "idle" });

  const busy = stage.kind === "working";

  // Object URL for the local file.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Filmstrip once we know the duration.
  useEffect(() => {
    if (!src || !duration) return;
    let cancelled = false;
    setFrames([]);
    filmstrip(src, duration, FRAMES, () => cancelled, setFrames).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [src, duration]);

  // Smooth playhead + loop inside the selection while playing.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v) {
        if (v.currentTime >= end || v.currentTime < start - 0.25) v.currentTime = start;
        setTime(v.currentTime);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, start, end]);

  function onLoaded() {
    const v = videoRef.current!;
    if (!Number.isFinite(v.duration)) {
      // Some WebM files report Infinity until you seek to the end.
      v.currentTime = 1e9;
      v.ondurationchange = () => {
        if (Number.isFinite(v.duration)) {
          v.ondurationchange = null;
          v.currentTime = 0;
          init(v.duration);
        }
      };
      return;
    }
    init(v.duration);
  }

  function init(d: number) {
    setDuration(d);
    setStart(0);
    setEnd(d);
  }

  const goTo = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = t;
    setTime(t);
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v || !duration) return;
    if (v.paused) {
      if (v.currentTime < start || v.currentTime >= end - 0.05) v.currentTime = start;
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [duration, start, end]);

  // Keyboard: space play/pause, I / O set in/out at the playhead.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || busy) return;
      const t = videoRef.current?.currentTime ?? 0;
      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "i" || e.key === "I") {
        setStart(clamp(t, 0, end - MIN_LEN));
      } else if (e.key === "o" || e.key === "O") {
        setEnd(clamp(t, start + MIN_LEN, duration));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, start, end, duration, busy]);

  // ---------- timeline pointer handling ----------

  const timeAt = (clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect();
    return clamp((clientX - r.left) / r.width, 0, 1) * duration;
  };

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!duration || busy) return;
    const role = (e.target as HTMLElement).dataset.role as Drag | undefined;
    drag.current = role ?? "head";
    trackRef.current!.setPointerCapture(e.pointerId);
    videoRef.current?.pause();
    move(e.clientX);
  }

  function move(clientX: number) {
    const t = timeAt(clientX);
    if (drag.current === "start") {
      const s = clamp(t, 0, end - MIN_LEN);
      setStart(s);
      goTo(s);
    } else if (drag.current === "end") {
      const en = clamp(t, start + MIN_LEN, duration);
      setEnd(en);
      goTo(en);
    } else if (drag.current === "head") {
      goTo(t);
    }
  }

  // ---------- publish ----------

  async function publish() {
    const v = videoRef.current;
    if (!v || !src) return;
    v.pause();
    try {
      const status = (label: string, pct: number | null) => setStage({ kind: "working", label, pct });

      const clip = await cutClip(file, start, end, duration, precise, status);

      status("Making thumbnail", null);
      const thumb = await captureThumb(src, Math.min(start + 0.1, end - 0.05));

      status("Uploading", 0);
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoType: clip.type, size: clip.blob.size }),
      });
      const up = await readJson<{ id: string; videoUrl: string; thumbUrl: string }>(res, "Couldn't start the upload.");

      await putWithProgress(up.thumbUrl, thumb.blob, "image/jpeg", () => {});
      await putWithProgress(up.videoUrl, clip.blob, clip.type, (p) => status("Uploading", p));

      status("Finishing up", null);
      const fin = await fetch("/api/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: up.id,
          title,
          videoType: clip.type,
          width: thumb.width,
          height: thumb.height,
          duration: end - start,
        }),
      });
      const done = await readJson<{ id: string; path: string }>(fin, "Couldn't save the clip.");

      router.push(done.path);
    } catch (err) {
      setStage({ kind: "error", msg: err instanceof Error ? err.message : "Something went wrong." });
    }
  }

  const pct = (t: number) => (duration ? (t / duration) * 100 : 0);
  const length = end - start;

  return (
    <section className="trimmer">
      <div className="stage">
        {src && (
          <video
            ref={videoRef}
            src={src}
            playsInline
            onLoadedMetadata={onLoaded}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onClick={togglePlay}
          />
        )}
      </div>

      <div className="readout" aria-live="polite">
        <span className="tc"><em>IN</em>{timecode(start)}</span>
        <span className="tc tc--len"><em>LENGTH</em>{timecode(length)}</span>
        <span className="tc"><em>OUT</em>{timecode(end)}</span>
      </div>

      <div
        className="track"
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => drag.current && move(e.clientX)}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <div className="strip" aria-hidden="true">
          {Array.from({ length: FRAMES }, (_, i) => (
            <div key={i} className="strip__cell" style={frames[i] ? { backgroundImage: `url(${frames[i]})` } : undefined} />
          ))}
        </div>
        <div className="shade" style={{ left: 0, width: `${pct(start)}%` }} />
        <div className="shade" style={{ left: `${pct(end)}%`, right: 0 }} />
        <div className="sel" style={{ left: `${pct(start)}%`, width: `${pct(end) - pct(start)}%` }} />
        <div className="handle handle--in" data-role="start" style={{ left: `${pct(start)}%` }} aria-label="Start of clip" />
        <div className="handle handle--out" data-role="end" style={{ left: `${pct(end)}%` }} aria-label="End of clip" />
        <div className="head" style={{ left: `${pct(time)}%` }} />
      </div>

      <div className="controls">
        <div className="controls__group">
          <button type="button" className="btn btn--ghost" onClick={togglePlay} disabled={!duration || busy}>
            {playing ? "Pause" : "Play selection"}
          </button>
        </div>
        <p className="keys">Space plays · <kbd>I</kbd> sets in · <kbd>O</kbd> sets out</p>
      </div>

      <div className="publish">
        <label className="field" htmlFor="title">
          <span>Title</span>
          <input id="title" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
        </label>
        <label className="check" htmlFor="precise">
          <input id="precise" type="checkbox" checked={precise} onChange={(e) => setPrecise(e.target.checked)} disabled={busy} />
          <span>
            Frame-exact cut
            <small>Slower. Re-encodes so the clip starts on the exact frame instead of the nearest keyframe.</small>
          </span>
        </label>
        <div className="publish__actions">
          <button type="button" className="btn btn--ghost" onClick={onReset} disabled={busy}>Choose another</button>
          <button type="button" className="btn btn--primary" onClick={publish} disabled={!duration || busy}>
            {busy ? "Working…" : "Upload clip"}
          </button>
        </div>

        {stage.kind === "working" && (
          <div className="progress" role="status">
            <span>{stage.label}{stage.pct !== null ? ` · ${Math.round(stage.pct * 100)}%` : "…"}</span>
            <div className="bar"><div className={`bar__fill${stage.pct === null ? " bar__fill--indef" : ""}`} style={stage.pct !== null ? { width: `${stage.pct * 100}%` } : undefined} /></div>
          </div>
        )}
        {stage.kind === "error" && <p className="error" role="alert">{stage.msg}</p>}
      </div>
    </section>
  );
}
