"use client";

import { useEffect, useState } from "react";

export default function CopyLink({ path }: { path: string }) {
  const [url, setUrl] = useState(path);
  const [copied, setCopied] = useState(false);

  useEffect(() => setUrl(window.location.origin + path), [path]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      const el = document.getElementById("share-url") as HTMLInputElement | null;
      el?.select();
    }
  }

  return (
    <div className="share">
      <input id="share-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
      <button type="button" className="btn btn--primary" onClick={copy}>
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
