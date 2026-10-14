# Snip

Streamable-style clip host: upload a video, trim it in the browser, get a link that embeds in Discord.

## How it works

1. You pick a video. It never leaves your machine until you hit Upload.
2. The trimmer (ffmpeg.wasm) cuts the in/out range in the browser.
   - Default: stream copy, near-instant, starts on the nearest keyframe.
   - "Frame-exact cut": re-encodes to H.264 MP4, slower but exact.
3. A JPEG thumbnail is grabbed from the first frame of the clip.
4. The browser uploads the clip and thumbnail straight to Cloudflare R2 using presigned URLs (the Next.js server never touches the video bytes, so Vercel's request size limits don't matter).
5. `/v/<id>` renders the player plus `og:video` / `og:image` tags, which is what Discord reads to show the thumbnail and play the clip inline.

Storage layout in the bucket:

```
clips/<id>/video.mp4   (or .webm)
clips/<id>/thumb.jpg
clips/<id>/meta.json
```

No database needed for now; `meta.json` holds the title, size and dimensions.

## Setup

### 1. Cloudflare R2

1. Create a bucket (e.g. `snip-clips`).
2. Bucket → Settings → Public access: enable the r2.dev URL (or connect a custom domain). That URL is `R2_PUBLIC_URL`.
3. Bucket → Settings → CORS policy, paste:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://your-site.vercel.app"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

4. R2 → Manage API tokens → create a token with Object Read & Write for that bucket. Copy the Access Key ID and Secret.

### 2. Run locally

```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev
```

Open http://localhost:3000.

### 3. Deploy (Vercel)

Push to GitHub, import into Vercel, add the same env vars (set `NEXT_PUBLIC_SITE_URL` to the production URL), deploy. Add the production origin to the R2 CORS list.

## Discord embeds

- Discord only embeds public URLs, so test with the deployed site, not localhost.
- Paste a `/v/<id>` link in a channel. You get the title, thumbnail, and an inline player.
- Discord caches embeds per URL. If you change tags and re-test, use a fresh clip.
- Very large files may show the thumbnail but open externally instead of playing inline. Short clips (the whole point) are fine.
- The embed side stripe color comes from `themeColor` in `app/layout.tsx`.

## Limits and known gaps

- Max upload 1 GB. Trimming happens in browser memory, so very long or very high bitrate videos are slow on weak machines; frame-exact mode especially.
- No accounts, no delete button, no rate limiting. Anyone with the site URL can upload. Before sharing it widely, add auth (e.g. Discord OAuth via Auth.js) and a per-user limit.
- The ffmpeg core loads from unpkg on first trim (~30 MB, cached after).

## Files

```
app/page.tsx                 home: drop zone + trimmer
app/v/[id]/page.tsx          clip page + Open Graph tags
app/api/upload/route.ts      reserves an id, returns presigned PUT URLs
app/api/finalize/route.ts    verifies uploads, writes meta.json
components/Trimmer.tsx       timeline, in/out handles, filmstrip, publish flow
lib/video.ts                 ffmpeg.wasm cutting, thumbnails, upload progress
lib/r2.ts                    R2 client and metadata helpers
```
