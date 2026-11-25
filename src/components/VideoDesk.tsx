"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ChipSelect } from "@/components/ChipSelect";
import { ACTION_COSTS, creditLabel } from "@/shared/creditCosts";

export function VideoDesk({ csrf }: { csrf: string }) {
  const [fileName, setFileName] = useState("");
  const [resolution, setResolution] = useState("720p");
  const [ratio, setRatio] = useState("16:9");
  const [changes, setChanges] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState("");
  const [changesLen, setChangesLen] = useState(0);
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
    body.set("resolution", resolution);
    body.set("ratio", ratio);
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
    <main className="desk desk-solo desk-modern video-modern">
      <div className="desk-glow" aria-hidden="true" />
      <header className="desk-head">
        <div className="desk-head-copy">
          <h1>Video Duplicate</h1>
          <p>Upload a video and create a new short clip from it.</p>
        </div>
      </header>

      <section className="tool-layout video-layout">
        <article className="panel compose-card video-compose">
          <form className="compose-form" onSubmit={onSubmit}>
            <label className={fileName ? "dropzone dropzone-modern has-file" : "dropzone dropzone-modern"}>
              <span className="dropzone-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="28" height="28">
                  <rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="1.7" />
                  <path d="M9 12.2l2.2 2.2L15.4 10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <strong>{fileName ? "Video selected" : "Drag & drop your video here"}</strong>
              <small>{fileName || "or click to browse · MP4, MOV, up to 80MB"}</small>
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
                  if (!picked) return;
                  const url = URL.createObjectURL(picked);
                  const probe = document.createElement("video");
                  probe.preload = "metadata";
                  probe.onloadedmetadata = () => {
                    if (probe.videoWidth > 0 && probe.videoHeight > probe.videoWidth) setRatio("9:16");
                    else setRatio("16:9");
                    URL.revokeObjectURL(url);
                  };
                  probe.onerror = () => URL.revokeObjectURL(url);
                  probe.src = url;
                }}
              />
            </label>

            <div className="compose-grid compose-grid-top video-grid">
              <ChipSelect
                name="resolution"
                label="Resolution"
                value={resolution}
                disabled={busy}
                onChange={setResolution}
                options={[
                  { value: "360p", label: "360p" },
                  { value: "720p", label: "720p" },
                  { value: "1080p", label: "1080p" },
                  { value: "4k", label: "4K" },
                ]}
                icon={
                  <svg viewBox="0 0 24 24" width="16" height="16">
                    <rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
                    <path d="M8 15h8M10 9h4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                }
              />
              <ChipSelect
                name="ratio"
                label="Ratio"
                value={ratio}
                disabled={busy}
                onChange={setRatio}
                options={[
                  { value: "16:9", label: "16:9 landscape" },
                  { value: "9:16", label: "9:16 portrait" },
                ]}
                icon={
                  <svg viewBox="0 0 24 24" width="16" height="16">
                    <path d="M7 4h4v4H7zM13 4h4v4h-4zM7 10h4v4H7zM13 10h4v4h-4zM7 16h10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                }
              />
            </div>

            <div className="field-block">
              <div className="field-top">
                <span>What should change</span>
                <span className="field-count">{changesLen}/2000</span>
              </div>
              <textarea
                name="video_changes"
                rows={4}
                maxLength={2000}
                value={changes}
                disabled={busy}
                placeholder="Same story, new voice, brighter colours, and a shorter ending."
                onChange={(event) => {
                  setChanges(event.target.value);
                  setChangesLen(event.target.value.length);
                  setNote("");
                }}
              />
            </div>

            <div className="compose-foot">
              <div className="compose-actions">
                <button className="btn solid compose-primary" type="submit" disabled={busy}>
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                    <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {busy ? "Creating video" : "Create video"}
                  <span className="credit-cost">{creditLabel(ACTION_COSTS.video)}</span>
                </button>
                {result ? (
                  <a className="btn ghost compose-secondary" href={result} download="similar-video.mp4">
                    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                      <path d="M12 4v10M8.5 10.5 12 14l3.5-3.5M6 18h12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Download
                  </a>
                ) : null}
              </div>
              <aside className="compose-tip">
                <span className="compose-tip-ico" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="16" height="16">
                    <path d="M9.5 18h5M10 21h4M8.4 15.2A5.8 5.8 0 1 1 15.6 15.2c-.7.9-1.3 1.7-1.3 2.8h-4c0-1.1-.6-1.9-1.3-2.8z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span>
                  <strong>Tip:</strong> Portrait clips work best when the source is already tall.
                </span>
              </aside>
            </div>

            {progress > 0 ? (
              <div className="video-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                <span style={{ width: `${progress}%` }} />
              </div>
            ) : null}
            {progress > 0 ? <p className="video-progress-label">{progress < 100 ? "Creating the new video" : "Ready"}</p> : null}
            {note ? <p className="status-line" role="status">{note}</p> : null}
            {result ? <video className="video-result" src={result} controls playsInline /> : null}
          </form>
        </article>

        <aside className="panel compose-card video-side">
          <div className="panel-head">
            <h2>Features</h2>
          </div>
          <ul className="video-feature-list">
            <li>
              <span className="video-feature-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="15" height="15"><path d="M5 12.5l4 4L19 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
              <span>AI similar video generation</span>
            </li>
            <li>
              <span className="video-feature-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="15" height="15"><path d="M5 12.5l4 4L19 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
              <span>Uses your video and the change note</span>
            </li>
            <li>
              <span className="video-feature-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="15" height="15"><path d="M5 12.5l4 4L19 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
              <span>A new clip about 6 seconds long</span>
            </li>
            <li>
              <span className="video-feature-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="15" height="15"><path d="M5 12.5l4 4L19 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
              <span>360p, 720p, 1080p, or 4K</span>
            </li>
            <li>
              <span className="video-feature-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="15" height="15"><path d="M5 12.5l4 4L19 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
              <span>Landscape 16:9 or portrait 9:16</span>
            </li>
          </ul>
          <p className="quiet video-side-note">The new video stays on this computer. Play it here or download it.</p>
        </aside>
      </section>
    </main>
  );
}
