import Link from "next/link";

export default function NotFound() {
  return (
    <section className="empty">
      <h1>That clip isn&apos;t here.</h1>
      <p>The link may be mistyped, or the clip was removed.</p>
      <Link href="/" className="btn btn--primary">Upload a clip</Link>
    </section>
  );
}
