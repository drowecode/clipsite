import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Snip", template: "%s · Snip" },
  description: "Upload a video, trim it, share the link.",
};

export const viewport: Viewport = {
  themeColor: "#ffb547", // Discord uses this for the embed's side stripe
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap"
        />
      </head>
      <body>
        <header className="top">
          <Link href="/" className="logo">
            <span className="logo__mark" aria-hidden="true">[ ]</span>snip
          </Link>
          <Link href="/" className="top__new">New clip</Link>
        </header>
        <main className="main">{children}</main>
      </body>
    </html>
  );
}
