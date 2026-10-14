import { NextResponse } from "next/server";
import { assertConfigured, exists, isValidId, keys, putMeta, VIDEO_TYPES, type ClipMeta } from "@/lib/r2";

type Body = {
  id?: string;
  title?: string;
  videoType?: string;
  width?: number;
  height?: number;
  duration?: number;
};

const num = (n: unknown, fallback: number) =>
  typeof n === "number" && Number.isFinite(n) && n > 0 ? n : fallback;

// Step 2: after both uploads land, confirm they exist and write the clip's metadata.
export async function POST(req: Request) {
  try {
    assertConfigured();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Missing: unknown";
    return NextResponse.json({ error: `Storage isn't configured. ${msg}` }, { status: 500 });
  }

  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const ext = body?.videoType ? VIDEO_TYPES[body.videoType] : undefined;
    if (!body?.id || !isValidId(body.id) || !ext) {
      return NextResponse.json({ error: "Bad request." }, { status: 400 });
    }

    const k = keys(body.id, ext);
    const [videoSize, thumbSize] = await Promise.all([exists(k.video), exists(k.thumb)]);
    if (videoSize === null || thumbSize === null) {
      return NextResponse.json({ error: "Upload didn't finish. Try again." }, { status: 409 });
    }

    const meta: ClipMeta = {
      id: body.id,
      title: (body.title ?? "").trim().slice(0, 100) || "Untitled clip",
      createdAt: new Date().toISOString(),
      video: {
        key: k.video,
        type: body.videoType!,
        width: Math.round(num(body.width, 1280)),
        height: Math.round(num(body.height, 720)),
        duration: num(body.duration, 0),
        size: videoSize,
      },
      thumb: { key: k.thumb },
    };
    await putMeta(meta);

    return NextResponse.json({ id: meta.id, path: `/v/${meta.id}` });
  } catch (err) {
    console.error("finalize failed", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Couldn't save the clip: ${msg}` }, { status: 500 });
  }
}
