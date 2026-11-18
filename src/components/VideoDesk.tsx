"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

export function VideoDesk({ csrf }: { csrf: string }) {
  const [fileName, setFileName] = useState("");
  const [changes, setChanges] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!busy) return;
    doneRef.current = false;
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (doneRef.current) return;
      const seconds = (Date.now() - started) / 1000;
      const next = Math.min(92, Math.round(8 + 84 * (1 - Math.exp(-seconds / 32))));
      setProgress(next);
    }, 400);
    return () => window.clearInterval(timer);
  }, [busy]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const picked = fileRef.current?.files?.[0];
    if (!picked) {
      setNote("Choose a video first.");
      return;
    }
    if (changes.trim().length < 2) {
      setNote("Say what should change in the new video.");
      return;
    }
    const body = new FormData();
    body.set("file", picked);
    body.set("changes", changes.trim());
    setBusy(true);
    setProgress(8);
    setResult("");
    setNote("");
    try {
      const response = await fetch("/api/video", { method: "POST", headers: { "X-CSRF": csrf }, body });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; url?: string; error?: string } | null;
      if (!response.ok || !payload?.ok || !payload.url) {
        doneRef.current = true;
        setProgress(0);
        setNote(payload?.error || "The new video could not be created.");
        return;
      }
      doneRef.current = true;
      setProgress(100);
      setResult(payload.url);
      setNote("The new video is ready.");
    } catch {
      doneRef.current = true;
      setProgress(0);
      setNote("The new video could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="tool-layout">
      <form className="dash-card drop" onSubmit={onSubmit}>
        <h2>Video Duplicate</h2>
        <p>Upload a video and create a new short clip from it.</p>
        <label className="dropzone">
          Drag & drop your video here
          <small>or click to browse · MP4, MOV, up to 80MB</small>
          <input
            ref={fileRef}
            type="file"
            accept="video/mp4,video/quicktime,.mp4,.mov"
            disabled={busy}
            onChange={(event) => {
              const picked = event.target.files?.[0];
              setFileName(picked ? picked.name : "");
              setNote("");
              setResult("");
              setProgress(0);
            }}
          />
        </label>
        {fileName ? <p className="quiet">{fileName}</p> : null}
        <label>
          What should change in the new video
          <textarea
            name="video_changes"
            rows={4}
            maxLength={2000}
            value={changes}
            disabled={busy}
            placeholder="Same story, new voice, brighter colours, and a shorter ending."
            onChange={(event) => {
              setChanges(event.target.value);
              setNote("");
            }}
          />
        </label>
        <button className="btn solid" type="submit" disabled={busy}>
          {busy ? "Creating video" : "Create video"}
        </button>
        {progress > 0 ? (
          <div className="video-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <span style={{ width: `${progress}%` }} />
          </div>
        ) : null}
        {progress > 0 ? <p className="video-progress-label">{progress < 100 ? "Creating the new video" : "Ready"}</p> : null}
        {note ? <p className="status-line" role="status">{note}</p> : null}
        {result ? (
          <>
            <video className="video-result" src={result} controls playsInline />
            <a className="btn" href={result} download="similar-video.mp4">Download</a>
          </>
        ) : null}
      </form>
      <article className="dash-card">
        <h2>Features</h2>
        <ul className="ticks">
          <li>AI similar video generation</li>
          <li>Uses your video and the change note</li>
          <li>A new clip about 6 seconds long</li>
        </ul>
        <p className="quiet">The new video stays on this computer. Play it here or download it.</p>
      </article>
    </section>
  );
}
