// Browser-only helpers: call these from client components.
import type { FFmpeg } from "@ffmpeg/ffmpeg";

// ---------- small helpers ----------

export function seek(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      v.removeEventListener("seeked", done);
      resolve();
    };
    v.addEventListener("seeked", done);
    v.currentTime = t;
  });
}

function loadVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = src;
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new Error("This browser can't read that video."));
  });
}

export { timecode } from "./format";

// ---------- filmstrip + thumbnail ----------

export async function filmstrip(
  src: string,
  duration: number,
  count: number,
  isCancelled: () => boolean,
  onFrame: (frames: string[]) => void,
) {
  const v = await loadVideo(src);
  const canvas = document.createElement("canvas");
  const h = 72;
  const w = Math.round((v.videoWidth / v.videoHeight || 16 / 9) * h);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const frames: string[] = [];
  for (let i = 0; i < count; i++) {
    if (isCancelled()) return;
    await seek(v, Math.min(duration - 0.05, ((i + 0.5) / count) * duration));
    ctx.drawImage(v, 0, 0, w, h);
    frames.push(canvas.toDataURL("image/jpeg", 0.6));
    onFrame([...frames]);
  }
  v.removeAttribute("src");
  v.load();
}

export async function captureThumb(src: string, t: number) {
  const v = await loadVideo(src);
  await seek(v, t);
  const scale = Math.min(1, 1280 / v.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(v.videoWidth * scale);
  canvas.height = Math.round(v.videoHeight * scale);
  canvas.getContext("2d")!.drawImage(v, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make a thumbnail."))), "image/jpeg", 0.85),
  );
  return { blob, width: v.videoWidth, height: v.videoHeight };
}

// ---------- cutting ----------

let ffmpeg: FFmpeg | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg) return ffmpeg;
  const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
    import("@ffmpeg/ffmpeg"),
    import("@ffmpeg/util"),
  ]);
  const ff = new FFmpeg();
  // Single-threaded core: works without cross-origin isolation headers.
  const base = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
  await ff.load({
    coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
  });
  ffmpeg = ff;
  return ff;
}

export type CutResult = { blob: Blob; type: "video/mp4" | "video/webm" };

/**
 * Cut [start, end] out of the file.
 * Fast mode stream-copies (no re-encode, starts on the nearest keyframe).
 * Precise mode, or any file stream-copy can't handle, re-encodes to H.264 MP4.
 */
export async function cutClip(
  file: File,
  start: number,
  end: number,
  duration: number,
  precise: boolean,
  onStatus: (label: string, pct: number | null) => void,
): Promise<CutResult> {
  const isWebm = file.type === "video/webm" || /\.webm$/i.test(file.name);
  const isMp4 = file.type === "video/mp4" || /\.(mp4|m4v)$/i.test(file.name);
  const whole = start <= 0.05 && end >= duration - 0.05;

  // Nothing to cut and already web-playable: upload as-is.
  if (whole && !precise && (isMp4 || isWebm)) {
    return { blob: file, type: isWebm ? "video/webm" : "video/mp4" };
  }

  onStatus("Loading trimmer", null);
  const ff = await getFFmpeg();
  const { FFFSType } = await import("@ffmpeg/ffmpeg");

  const dir = "/input";
  try {
    await ff.createDir(dir);
  } catch {
    /* already exists */
  }
  // WORKERFS reads the File in place instead of copying it into wasm memory.
  await ff.mount(FFFSType.WORKERFS, { files: [file] }, dir);
  const input = `${dir}/${file.name}`;

  const s = start.toFixed(3);
  const d = (end - start).toFixed(3);
  const onProgress = ({ progress }: { progress: number }) =>
    onStatus(precise ? "Re-encoding clip" : "Cutting clip", Math.max(0, Math.min(1, progress)));
  ff.on("progress", onProgress);

  const read = async (name: string, type: CutResult["type"]): Promise<CutResult | null> => {
    try {
      const data = (await ff.readFile(name)) as Uint8Array;
      await ff.deleteFile(name);
      return data.length > 1024 ? { blob: new Blob([new Uint8Array(data)], { type }), type } : null;
    } catch {
      return null;
    }
  };

  try {
    if (!precise) {
      onStatus("Cutting clip", null);
      const ext = isWebm ? "webm" : "mp4";
      const out = `out.${ext}`;
      const args = ["-ss", s, "-i", input, "-t", d, "-map", "0:v:0", "-map", "0:a:0?", "-c", "copy", "-avoid_negative_ts", "make_zero"];
      if (ext === "mp4") args.push("-movflags", "+faststart");
      args.push(out);
      const code = await ff.exec(args);
      if (code === 0) {
        const res = await read(out, isWebm ? "video/webm" : "video/mp4");
        if (res) return res;
      }
      // Fall through to re-encode (e.g. a .mov with codecs MP4 can't hold).
    }

    onStatus("Re-encoding clip", 0);
    const out = "out_enc.mp4";
    const code = await ff.exec([
      "-ss", s, "-i", input, "-t", d,
      "-map", "0:v:0", "-map", "0:a:0?",
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      out,
    ]);
    const res = code === 0 ? await read(out, "video/mp4") : null;
    if (!res) throw new Error("Couldn't cut this video. Try exporting it as MP4 first.");
    return res;
  } finally {
    ff.off("progress", onProgress);
    try {
      await ff.unmount(dir);
    } catch {
      /* ignore */
    }
  }
}

// ---------- upload ----------

export function putWithProgress(
  url: string,
  blob: Blob,
  contentType: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status}). Check the bucket's CORS settings.`));
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and the bucket's CORS settings."));
    xhr.send(blob);
  });
}
