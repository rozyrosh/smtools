"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ChipSelect } from "@/components/ChipSelect";
import { ACTION_COSTS, creditLabel } from "@/shared/creditCosts";

const VOICES = [
  { value: "Kore", label: "Kore" },
  { value: "Puck", label: "Puck" },
  { value: "Charon", label: "Charon" },
  { value: "Aoede", label: "Aoede" },
  { value: "Fenrir", label: "Fenrir" },
  { value: "Leda", label: "Leda" },
  { value: "Orus", label: "Orus" },
  { value: "Zephyr", label: "Zephyr" },
];

type HistoryItem = {
  id: string;
  url: string;
  mime: string;
  voice: string;
  style: string;
  text: string;
  preview: string;
  created_at: string;
};

function whenLabel(iso: string) {
  const stamp = Date.parse(iso);
  if (!Number.isFinite(stamp)) return "";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(stamp));
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function AudioStage({
  src,
  voice,
  autoPlay,
  onDownload,
}: {
  src: string;
  voice: string;
  autoPlay: boolean;
  onDownload: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const node = audioRef.current;
    if (!node) return;
    node.pause();
    node.load();
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    if (!autoPlay) return;
    const play = node.play();
    if (play && typeof play.then === "function") {
      play.then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  }, [src, autoPlay]);

  useEffect(() => {
    const node = audioRef.current;
    if (!node) return;
    const onTime = () => setCurrent(node.currentTime || 0);
    const onMeta = () => setDuration(Number.isFinite(node.duration) ? node.duration : 0);
    const onEnded = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    node.addEventListener("timeupdate", onTime);
    node.addEventListener("loadedmetadata", onMeta);
    node.addEventListener("durationchange", onMeta);
    node.addEventListener("ended", onEnded);
    node.addEventListener("play", onPlay);
    node.addEventListener("pause", onPause);
    return () => {
      node.removeEventListener("timeupdate", onTime);
      node.removeEventListener("loadedmetadata", onMeta);
      node.removeEventListener("durationchange", onMeta);
      node.removeEventListener("ended", onEnded);
      node.removeEventListener("play", onPlay);
      node.removeEventListener("pause", onPause);
    };
  }, [src]);

  function togglePlay() {
    const node = audioRef.current;
    if (!node) return;
    if (node.paused) {
      node.play().catch(() => undefined);
    } else {
      node.pause();
    }
  }

  const progress = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;

  return (
    <div className={`audio-stage${playing ? " is-playing" : ""}`}>
      <audio ref={audioRef} src={src} preload="metadata" />
      <div className="audio-stage-top">
        <button type="button" className="audio-play" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
          {playing ? (
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M8 6h3.2v12H8zM12.8 6H16v12h-3.2z" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M8.5 6.5v11l9-5.5z" fill="currentColor" />
            </svg>
          )}
        </button>
        <div className="audio-stage-copy">
          <strong>Voice clip ready</strong>
          <span>
            {voice || "Voice"}
            {duration > 0 ? ` · ${formatTime(duration)}` : ""}
          </span>
        </div>
        <div className="audio-wave" aria-hidden="true">
          {Array.from({ length: 18 }, (_, index) => (
            <i key={index} style={{ animationDelay: `${(index % 6) * 0.08}s` }} />
          ))}
        </div>
        <a className="btn ghost compose-secondary audio-stage-download" href={onDownload} download="speech.wav">
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
            <path d="M12 4v10M8.5 10.5 12 14l3.5-3.5M6 18h12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Download
        </a>
      </div>
      <div className="audio-scrub">
        <span className="audio-time">{formatTime(current)}</span>
        <input
          className="audio-seek"
          type="range"
          min={0}
          max={Math.max(duration, 0.01)}
          step={0.01}
          value={Math.min(current, duration || 0)}
          aria-label="Seek"
          onChange={(event) => {
            const next = Number(event.target.value);
            const node = audioRef.current;
            if (node) node.currentTime = next;
            setCurrent(next);
          }}
          style={{ ["--audio-progress" as string]: `${progress}%` }}
        />
        <span className="audio-time">{formatTime(duration)}</span>
      </div>
    </div>
  );
}

export function AudioDesk({
  csrf,
  starter = "",
  history: initialHistory = [],
}: {
  csrf: string;
  starter?: string;
  history?: HistoryItem[];
}) {
  const [text, setText] = useState(starter);
  const [voice, setVoice] = useState("Kore");
  const [style, setStyle] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState("");
  const [resultVoice, setResultVoice] = useState("");
  const [autoPlay, setAutoPlay] = useState(false);
  const [textLen, setTextLen] = useState(starter.length);
  const [history, setHistory] = useState<HistoryItem[]>(initialHistory);
  const [playingId, setPlayingId] = useState("");
  const [sideTab, setSideTab] = useState<"history" | "features">(initialHistory.length ? "history" : "features");
  const doneRef = useRef(false);

  useEffect(() => {
    if (!busy) return;
    doneRef.current = false;
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (doneRef.current) return;
      const seconds = (Date.now() - started) / 1000;
      const next = Math.min(92, Math.round(10 + 82 * (1 - Math.exp(-seconds / 18))));
      setProgress(next);
    }, 350);
    return () => window.clearInterval(timer);
  }, [busy]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (text.trim().length < 2) {
      setNote("Add text to speak.");
      return;
    }
    setBusy(true);
    setProgress(10);
    setResult("");
    setResultVoice("");
    setAutoPlay(false);
    setNote("");
    try {
      const response = await fetch("/api/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF": csrf },
        body: JSON.stringify({ text: text.trim(), voice, style: style.trim() }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (HistoryItem & { ok?: boolean; error?: string })
        | null;
      if (!response.ok || !payload?.ok || !payload.url || !payload.id) {
        doneRef.current = true;
        setProgress(0);
        setNote(payload?.error || "The audio could not be created.");
        return;
      }
      const item: HistoryItem = {
        id: payload.id,
        url: payload.url,
        mime: payload.mime || "audio/wav",
        voice: payload.voice || voice,
        style: payload.style || style.trim(),
        text: payload.text || text.trim(),
        preview: payload.preview || text.trim().slice(0, 120),
        created_at: payload.created_at || new Date().toISOString(),
      };
      doneRef.current = true;
      setProgress(100);
      setResult(item.url);
      setResultVoice(item.voice);
      setPlayingId(item.id);
      setAutoPlay(true);
      setHistory((current) => [item, ...current.filter((row) => row.id !== item.id)]);
      setSideTab("history");
      setNote("The audio is ready.");
    } catch {
      doneRef.current = true;
      setProgress(0);
      setNote("The audio could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(id: string) {
    if (busy) return;
    setBusy(true);
    setNote("");
    try {
      const response = await fetch(`/api/audio/${id}`, {
        method: "DELETE",
        headers: { "X-CSRF": csrf },
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) {
        setNote(payload?.error || "That clip could not be removed.");
        return;
      }
      setHistory((current) => current.filter((row) => row.id !== id));
      if (playingId === id) {
        setPlayingId("");
        setResult("");
        setResultVoice("");
        setProgress(0);
        setAutoPlay(false);
      }
      setNote("Removed from history.");
    } catch {
      setNote("That clip could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  function reuseItem(item: HistoryItem) {
    setText(item.text);
    setTextLen(item.text.length);
    setVoice(item.voice || "Kore");
    setStyle(item.style || "");
    setResult(item.url);
    setResultVoice(item.voice || "Kore");
    setPlayingId(item.id);
    setProgress(100);
    setAutoPlay(true);
    setNote("Loaded from history.");
  }

  return (
    <main className="desk desk-solo desk-modern video-modern audio-modern">
      <div className="desk-glow" aria-hidden="true" />
      <header className="desk-head">
        <div className="desk-head-copy">
          <h1>Text to Speech</h1>
          <p>Turn a caption or any text into a clear voice clip.</p>
        </div>
      </header>

      <section className="tool-layout video-layout audio-layout">
        <article className="panel compose-card video-compose">
          <form className="compose-form" onSubmit={onSubmit}>
            <div className="field-block">
              <div className="field-top">
                <span>Text to speak</span>
                <span className="field-count">{textLen}/4000</span>
              </div>
              <textarea
                rows={7}
                maxLength={4000}
                value={text}
                disabled={busy}
                placeholder="Paste a caption or type what the voice should say…"
                onChange={(event) => {
                  setText(event.target.value);
                  setTextLen(event.target.value.length);
                  setNote("");
                }}
              />
            </div>

            <div className="compose-grid audio-controls-grid">
              <ChipSelect
                name="voice"
                label="Voice"
                value={voice}
                disabled={busy}
                onChange={setVoice}
                options={VOICES}
                icon={
                  <svg viewBox="0 0 24 24" width="16" height="16">
                    <path d="M12 3v10M8 8a4 4 0 0 0 8 0M6 14a6 6 0 0 0 12 0M10 20h4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                }
              />
              <div className="field-block audio-style-field">
                <div className="field-top">
                  <span>Speaking style</span>
                  <span className="field-count optional">Optional</span>
                </div>
                <input
                  value={style}
                  disabled={busy}
                  maxLength={240}
                  placeholder="Calm, friendly, clear Sinhala news tone…"
                  onChange={(event) => setStyle(event.target.value)}
                />
              </div>
            </div>

            <div className="compose-foot audio-foot">
              <div className="compose-actions">
                <button className="btn solid compose-primary" type="submit" disabled={busy}>
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                    <path d="M11 5 6 9H3v6h3l5 4V5zM15.5 8.5a4 4 0 0 1 0 7M18 6a7 7 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {busy ? "Creating audio" : "Create audio"}
                  <span className="credit-cost">{creditLabel(ACTION_COSTS.audio)}</span>
                </button>
              </div>
              <aside className="compose-tip">
                <span className="compose-tip-ico" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="16" height="16">
                    <path d="M9.5 18h5M10 21h4M8.4 15.2A5.8 5.8 0 1 1 15.6 15.2c-.7.9-1.3 1.7-1.3 2.8h-4c0-1.1-.6-1.9-1.3-2.8z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span>
                  <strong>Tip:</strong> Past clips stay in History. Click one to replay or reuse it.
                </span>
              </aside>
            </div>

            {busy && progress > 0 && progress < 100 ? (
              <>
                <div className="video-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                  <span style={{ width: `${progress}%` }} />
                </div>
                <p className="video-progress-label">Creating the voice clip</p>
              </>
            ) : null}
            {note && !result ? <p className="status-line" role="status">{note}</p> : null}

            {result ? (
              <AudioStage src={result} voice={resultVoice || voice} autoPlay={autoPlay} onDownload={result} />
            ) : !busy ? (
              <div className="audio-stage audio-stage-empty" aria-hidden="true">
                <div className="audio-stage-empty-ico">
                  <svg viewBox="0 0 24 24" width="28" height="28">
                    <path d="M11 5 6 9H3v6h3l5 4V5zM15.5 8.5a4 4 0 0 1 0 7M18 6a7 7 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <p>Your voice clip will appear here</p>
              </div>
            ) : null}
          </form>
        </article>

        <aside className="panel compose-card video-side audio-side">
          <div className="panel-head audio-side-head">
            <div className="audio-side-tabs" role="tablist" aria-label="Audio side panel">
              <button
                type="button"
                role="tab"
                aria-selected={sideTab === "history"}
                className={sideTab === "history" ? "audio-side-tab on" : "audio-side-tab"}
                onClick={() => setSideTab("history")}
              >
                <span className="audio-side-tab-label">
                  History
                  {history.length ? <span className="audio-side-count">{history.length}</span> : null}
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sideTab === "features"}
                className={sideTab === "features" ? "audio-side-tab on" : "audio-side-tab"}
                onClick={() => setSideTab("features")}
              >
                Features
              </button>
            </div>
          </div>

          {sideTab === "history" ? (
            history.length ? (
              <ul className="audio-history">
                {history.map((item) => (
                  <li key={item.id} className={playingId === item.id ? "audio-history-item on" : "audio-history-item"}>
                    <button type="button" className="audio-history-main" disabled={busy} onClick={() => reuseItem(item)}>
                      <span className="audio-history-play" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="14" height="14">
                          <path d="M9 7.5v9l7.5-4.5z" fill="currentColor" />
                        </svg>
                      </span>
                      <span className="audio-history-body">
                        <span className="audio-history-preview">{item.preview || item.text}</span>
                        <span className="audio-history-meta">
                          {item.voice}
                          {item.created_at ? ` · ${whenLabel(item.created_at)}` : ""}
                        </span>
                      </span>
                    </button>
                    <div className="audio-history-actions">
                      <a className="btn ghost compose-secondary" href={item.url} download={`${item.id}.wav`} title="Download">
                        Save
                      </a>
                      <button
                        type="button"
                        className="btn ghost queue-peek-remove"
                        disabled={busy}
                        title="Remove"
                        onClick={() => removeItem(item.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="audio-history-empty">
                <span className="audio-history-empty-ico" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="22" height="22">
                    <path d="M4 6h16M4 12h10M4 18h14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                </span>
                <p>No clips yet. Create audio and it will show up here.</p>
              </div>
            )
          ) : (
            <>
              <ul className="video-feature-list">
                <li>
                  <span className="video-feature-ico" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="15" height="15"><path d="M5 12.5l4 4L19 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                  <span>Natural AI voices</span>
                </li>
                <li>
                  <span className="video-feature-ico" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="15" height="15"><path d="M5 12.5l4 4L19 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                  <span>Works with Sinhala and English captions</span>
                </li>
                <li>
                  <span className="video-feature-ico" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="15" height="15"><path d="M5 12.5l4 4L19 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                  <span>Optional speaking style</span>
                </li>
                <li>
                  <span className="video-feature-ico" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="15" height="15"><path d="M5 12.5l4 4L19 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                  <span>History keeps your clips on this desk</span>
                </li>
              </ul>
              <p className="quiet video-side-note">Audio stays on this desk. Use it for reels, ads, or voiceovers.</p>
            </>
          )}
        </aside>
      </section>
    </main>
  );
}
