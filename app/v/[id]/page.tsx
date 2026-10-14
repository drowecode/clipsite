import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMeta, publicUrl } from "@/lib/r2";
import { timecode } from "@/lib/format";
import CopyLink from "@/components/CopyLink";

type Props = { params: Promise<{ id: string }> };

// These tags are what Discord (and Twitter/X, iMessage, Slack...) read to build the embed:
// og:image = thumbnail, og:video = the mp4/webm Discord plays inline.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const clip = await getMeta(id);
  if (!clip) return { title: "Clip not found" };

  const video = publicUrl(clip.video.key);
  const thumb = publicUrl(clip.thumb.key);
  const { width, height, type } = clip.video;

  return {
    title: clip.title,
    description: `${timecode(clip.video.duration)} clip on Snip`,
    openGraph: {
      type: "video.other",
      siteName: "Snip",
      title: clip.title,
      url: `/v/${clip.id}`,
      images: [{ url: thumb, width, height }],
      videos: [{ url: video, secureUrl: video, type, width, height }],
    },
    twitter: {
      card: "player",
      title: clip.title,
      images: [thumb],
      players: [{ playerUrl: video, streamUrl: video, width, height }],
    },
  };
}

export default async function ClipPage({ params }: Props) {
  const { id } = await params;
  const clip = await getMeta(id);
  if (!clip) notFound();

  return (
    <article className="clip">
      <div className="stage stage--clip">
        <video
          src={publicUrl(clip.video.key)}
          poster={publicUrl(clip.thumb.key)}
          controls
          playsInline
          preload="metadata"
          style={{ aspectRatio: `${clip.video.width} / ${clip.video.height}` }}
        />
      </div>
      <div className="clip__info">
        <h1>{clip.title}</h1>
        <p className="clip__meta">
          <span>{timecode(clip.video.duration)}</span>
          <span>{clip.video.width}×{clip.video.height}</span>
          <span>{new Date(clip.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
        </p>
      </div>
      <CopyLink path={`/v/${clip.id}`} />
    </article>
  );
}
