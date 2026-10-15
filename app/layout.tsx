import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import "./globals.css";

// Same faces as danielchristopherrowe.com: Archivo (with its width axis) for display,
// IBM Plex Sans for body.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  display: "swap",
  axes: ["wdth"],
});

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
});

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
  themeColor: "#712329", // the accent as hex; Discord uses this for the embed's side stripe
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${ibmPlexSans.variable}`}>
      <body>
        <header className="top">
          <div className="top__inner">
            <Link href="/" className="logo">
              <span className="logo__mark" aria-hidden="true">[ ]</span>snip
            </Link>
            <nav className="top__nav">
              <Link href="/" className="top__new">New clip</Link>
              <a href="https://danielchristopherrowe.com" className="btn btn--primary btn--sm">Home</a>
            </nav>
          </div>
        </header>
        <main className="main">{children}</main>
      </body>
    </html>
  );
}
