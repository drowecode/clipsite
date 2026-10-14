import { NextResponse } from "next/server";
import { assertConfigured, keys, newId, presignPut, VIDEO_TYPES } from "@/lib/r2";

const MAX_BYTES = 1024 * 1024 * 1024; // 1 GB

// Step 1: reserve an id and hand back presigned PUT URLs for the clip and its thumbnail.
export async function POST(req: Request) {
  try {
    assertConfigured();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Missing: unknown";
    return NextResponse.json({ error: `Storage isn't configured. ${msg}` }, { status: 500 });
  }

  try {
    const body = (await req.json().catch(() => null)) as { videoType?: string; size?: number } | null;
    const ext = body?.videoType ? VIDEO_TYPES[body.videoType] : undefined;
    if (!ext) {
      return NextResponse.json({ error: "Clips must be MP4 or WebM." }, { status: 400 });
    }
    if (!body?.size || body.size > MAX_BYTES) {
      return NextResponse.json({ error: "Clips can be up to 1 GB." }, { status: 400 });
    }

    const id = newId();
    const k = keys(id, ext);
    const [videoUrl, thumbUrl] = await Promise.all([
      presignPut(k.video, body.videoType!),
      presignPut(k.thumb, "image/jpeg"),
    ]);

    return NextResponse.json({ id, videoUrl, thumbUrl });
  } catch (err) {
    console.error("upload failed", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Couldn't start the upload: ${msg}` }, { status: 500 });
  }
}
