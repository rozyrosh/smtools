"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { CallAgent } from "@/server/store";

type DeskAction = "save" | "update" | "ask" | "active" | "delete" | "install" | "look";
type LivePhase = "idle" | "listening" | "hearing" | "thinking" | "speaking";
type SpeechEngine = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function wavFromSamples(chunks: Float32Array[], fromRate: number) {
  let length = 0;
  for (const chunk of chunks) length += chunk.length;
  if (!length) return null;
  const mixed = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    mixed.set(chunk, offset);
    offset += chunk.length;
  }
  const toRate = 16000;
  const ratio = fromRate / toRate;
  const count = Math.max(1, Math.floor(mixed.length / ratio));
  const samples = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(mixed.length, Math.floor((index + 1) * ratio));
    let sum = 0;
    for (let sample = start; sample < end; sample += 1) sum += mixed[sample];
    samples[index] = sum / Math.max(1, end - start);
  }
  const gate = 0.012;
  const window = 160;
  let first = samples.length;
  let last = -1;
  for (let index = 0; index + window < samples.length; index += window) {
    let energy = 0;
    for (let sample = index; sample < index + window; sample += 1) energy += samples[sample] * samples[sample];
    if (Math.sqrt(energy / window) > gate) {
      if (index < first) first = index;
      last = index + window;
    }
  }
  if (last < 0) return null;
  const startAt = Math.max(0, first - window);
  const endAt = Math.min(samples.length, last + window * 2);
  const spoken = samples.subarray(startAt, endAt);
  if (spoken.length < toRate * 0.28) return null;
  const buffer = new ArrayBuffer(44 + spoken.length * 2);
  const view = new DataView(buffer);
  const write = (at: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) view.setUint8(at + index, text.charCodeAt(index));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + spoken.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, toRate, true);
  view.setUint32(28, toRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, spoken.length * 2, true);
  let cursor = 44;
  for (let index = 0; index < spoken.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, spoken[index]));
    view.setInt16(cursor, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    cursor += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function blobBase64(blob: Blob) {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const step = 0x8000;
    for (let index = 0; index < bytes.length; index += step) {
      binary += String.fromCharCode(...bytes.subarray(index, index + step));
    }
    return btoa(binary);
  });
}

function downsample(input: Float32Array, fromRate: number, toRate: number) {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const length = Math.max(1, Math.floor(input.length / ratio));
  const output = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(input.length, Math.floor((index + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let sample = start; sample < end; sample += 1) {
      sum += input[sample];
      count += 1;
    }
    output[index] = count ? sum / count : input[start] || 0;
  }
  return output;
}

function pcm16(input: Float32Array) {
  const pcm = new Int16Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index]));
    pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return pcm.buffer;
}

function frequencyBars(analyser: AnalyserNode | null, active: boolean) {
  const bars = 16;
  const idle = new Array<number>(bars).fill(0.08);
  if (!analyser || !active) return idle;
  const bins = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(bins);
  const usable = Math.max(1, Math.floor(bins.length * 0.72));
  return idle.map((_, index) => {
    const start = Math.floor((index / bars) * usable);
    const end = Math.max(start + 1, Math.floor(((index + 1) / bars) * usable));
    let sum = 0;
    for (let bin = start; bin < end; bin += 1) sum += bins[bin] || 0;
    return Math.max(0.08, Math.min(1, (sum / (end - start) / 255) * 1.55));
  });
}

function paintBars(canvas: HTMLCanvasElement | null, values: number[], active: boolean, color: string) {
  if (!canvas) return;
  const pen = canvas.getContext("2d");
  if (!pen) return;
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 160;
  const height = canvas.clientHeight || 72;
  if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
  }
  pen.setTransform(ratio, 0, 0, ratio, 0, 0);
  pen.clearRect(0, 0, width, height);
  const gap = 3;
  const barWidth = (width - gap * (values.length - 1)) / values.length;
  values.forEach((value, index) => {
    const barHeight = Math.max(4, value * (height - 8));
    const x = index * (barWidth + gap);
    const y = (height - barHeight) / 2;
    pen.fillStyle = active ? color : "#d5e0ee";
    pen.beginPath();
    pen.roundRect(x, y, Math.max(2, barWidth), barHeight, 3);
    pen.fill();
  });
}

function makeListener(): SpeechEngine | null {
  if (typeof window === "undefined") return null;
  const host = window as Window & {
    SpeechRecognition?: new () => SpeechEngine;
    webkitSpeechRecognition?: new () => SpeechEngine;
  };
  const Ctor = host.SpeechRecognition || host.webkitSpeechRecognition;
  if (!Ctor) return null;
  const engine = new Ctor();
  engine.lang = navigator.language || "en-US";
  engine.interimResults = true;
  engine.continuous = false;
  return engine;
}

export function CallDesk({ csrf, agents: initialAgents }: { csrf: string; agents: CallAgent[] }) {
  const [agents, setAgents] = useState(initialAgents);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [instructions, setInstructions] = useState("");
  const [editId, setEditId] = useState("");
  const [openId, setOpenId] = useState("");
  const [question, setQuestion] = useState("");
  const [note, setNote] = useState("");
  const [listNote, setListNote] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState("");
  const [confirmId, setConfirmId] = useState("");
  const [panel, setPanel] = useState<{ id: string; mode: "install" | "look" } | null>(null);
  const [pageMode, setPageMode] = useState<"all" | "some">("all");
  const [pageList, setPageList] = useState("");
  const [lookName, setLookName] = useState("");
  const [lookLabel, setLookLabel] = useState(false);
  const [lookChat, setLookChat] = useState(false);
  const [lookColor, setLookColor] = useState("#2563eb");
  const [lookGreeting, setLookGreeting] = useState("");
  const [snippet, setSnippet] = useState("");
  const [copied, setCopied] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [live, setLive] = useState<LivePhase>("idle");
  const [heard, setHeard] = useState("");
  const liveRef = useRef(false);
  const muteRef = useRef(false);
  const phaseRef = useRef<LivePhase>("idle");
  const micRef = useRef<MediaStream | null>(null);
  const recogRef = useRef<SpeechEngine | null>(null);
  const testRef = useRef<HTMLDivElement>(null);
  const youSpecRef = useRef<HTMLCanvasElement>(null);
  const agentSpecRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const voiceAnalyserRef = useRef<AnalyserNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const voiceSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const captureRef = useRef<{ node: ScriptProcessorNode; gain: GainNode; source: MediaStreamAudioSourceNode } | null>(null);
  const earTimer = useRef(0);
  const drawRef = useRef(0);
  const turnRef = useRef(0);
  const socketRef = useRef<WebSocket | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const playAtRef = useRef(0);
  const playSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  const open = agents.find((agent) => agent.id === openId) || null;
  const panelAgent = agents.find((agent) => agent.id === panel?.id) || null;
  const botColor = /^#[0-9a-fA-F]{6}$/.test(lookColor) ? lookColor : "#2563eb";
  const botName = lookName.trim() || "Ask";
  const companyLabel = company.trim() || "the company";
  const refusal = `Please ask questions about ${companyLabel}.`;

  function embedCode(id: string) {
    return `<script src="${window.location.origin}/embed.js" data-agent="${id}" async></script>`;
  }

  async function send(action: DeskAction, extra: { id?: string; active?: boolean; all?: boolean; pages?: string; widget_name?: string; widget_label?: boolean; widget_chat?: boolean; widget_color?: string; widget_greeting?: string; question?: string } = {}): Promise<string | null> {
    setBusy(action);
    if (action === "save" || action === "update") setNote("");
    else setListNote("");
    if (action === "ask") setAnswer("");
    const id = extra.id || (action === "update" ? editId : openId);
    try {
      const response = await fetch("/api/call", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF": csrf },
        body: JSON.stringify({ action, id, name, company, instructions, question, ...extra }),
      });
      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        answer?: string;
        agents?: CallAgent[];
        agent?: CallAgent;
      } | null;
      if (!response.ok || !data?.ok) {
        const message = data?.error || "That did not work.";
        if (action === "save" || action === "update") setNote(message);
        else setListNote(message);
        return null;
      }
      if (data.agents) setAgents(data.agents);
      if (action === "save" || action === "update") {
        const savedName = data.agent?.name || name;
        setName("");
        setCompany("");
        setInstructions("");
        setEditId("");
        setNote(action === "update" ? `${savedName} is updated.` : `${savedName} is in the list. Open it to try a question.`);
      }
      if (action === "ask") {
        const spoken = String(data.answer || "");
        setAnswer(spoken);
        return spoken;
      }
      if (action === "active") setListNote(`${data.agent?.name || "The agent"} is ${extra.active ? "active" : "off"}.`);
      if (action === "install") {
        setSnippet(embedCode(String(id)));
        setCopied(false);
        setListNote("Install is saved. Paste the code on the website. The button sits at the bottom right.");
      }
      if (action === "look") setListNote("Saved. Websites using this agent update the button the next time the page loads.");
      if (action === "delete") {
        if (openId === id) setOpenId("");
        if (panel?.id === id) setPanel(null);
        if (editId === id) {
          setEditId("");
          setName("");
          setCompany("");
          setInstructions("");
        }
        setListNote("The call agent is deleted.");
      }
    } catch {
      const message = "The page could not reach the desk.";
      if (action === "save" || action === "update") setNote(message);
      else setListNote(message);
      return null;
    } finally {
      setBusy("");
    }
    return null;
  }

  function setPhase(phase: LivePhase) {
    phaseRef.current = phase;
    setLive(phase);
  }

  function ensureAudio() {
    if (audioRef.current) return audioRef.current;
    const host = window as Window & { webkitAudioContext?: typeof AudioContext };
    const Ctor = window.AudioContext || host.webkitAudioContext;
    if (!Ctor) throw new Error("no audio");
    const ctx = new Ctor();
    const micAnalyser = ctx.createAnalyser();
    micAnalyser.fftSize = 256;
    micAnalyser.smoothingTimeConstant = 0.8;
    const voiceAnalyser = ctx.createAnalyser();
    voiceAnalyser.fftSize = 256;
    voiceAnalyser.smoothingTimeConstant = 0.72;
    voiceAnalyser.connect(ctx.destination);
    audioRef.current = ctx;
    micAnalyserRef.current = micAnalyser;
    voiceAnalyserRef.current = voiceAnalyser;
    return ctx;
  }

  function unlockSound() {
    const ctx = ensureAudio();
    void ctx.resume();
    const blip = ctx.createBufferSource();
    blip.buffer = ctx.createBuffer(1, 1, 22050);
    blip.connect(ctx.destination);
    blip.start();
  }

  function stopSound() {
    try {
      voiceSourceRef.current?.stop();
    } catch {
      /* The clip already finished. */
    }
    voiceSourceRef.current = null;
    playSourcesRef.current.forEach((source) => {
      try { source.stop(); } catch { /* The clip already finished. */ }
    });
    playSourcesRef.current = [];
    playAtRef.current = 0;
    if (drawRef.current) cancelAnimationFrame(drawRef.current);
    drawRef.current = 0;
  }

  function releaseMic() {
    micSourceRef.current?.disconnect();
    micSourceRef.current = null;
    micRef.current?.getTracks().forEach((track) => track.stop());
    micRef.current = null;
  }

  function stopRecorder() {
    window.clearInterval(earTimer.current);
    earTimer.current = 0;
    const capture = captureRef.current;
    captureRef.current = null;
    if (capture) {
      try { capture.source.disconnect(capture.node); } catch { /* The microphone lead is already closed. */ }
      try { capture.node.disconnect(); } catch { /* The microphone lead is already closed. */ }
      try { capture.gain.disconnect(); } catch { /* The microphone lead is already closed. */ }
    }
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (rec && rec.state !== "inactive") {
      rec.onstop = null;
      try {
        rec.stop();
      } catch {
        /* The recorder already stopped. */
      }
    }
  }

  function endLive() {
    liveRef.current = false;
    muteRef.current = false;
    turnRef.current += 1;
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket && socket.readyState === WebSocket.OPEN) {
      try { socket.send(JSON.stringify({ type: "stop" })); } catch { /* The line is already closed. */ }
    }
    try { socket?.close(); } catch { /* The line is already closed. */ }
    try { workletRef.current?.disconnect(); } catch { /* The microphone lead is already closed. */ }
    workletRef.current = null;
    stopRecorder();
    try {
      recogRef.current?.stop();
    } catch {
      /* The listener is already stopped. */
    }
    recogRef.current = null;
    releaseMic();
    stopSound();
    setPhase("idle");
  }

  function moveToSecureCall() {
    if (typeof window === "undefined" || window.isSecureContext) return;
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return;
    window.location.replace(`https://${host}:3443${window.location.pathname}${window.location.search}`);
  }

  async function openMic() {
    if (!window.isSecureContext) {
      moveToSecureCall();
      return false;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setListNote("This browser cannot use the microphone. Type the question instead.");
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (!liveRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }
      releaseMic();
      micRef.current = stream;
      return true;
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotFoundError" || name === "OverconstrainedError") {
        setListNote("No microphone was found. Check the device sound settings.");
      } else {
        setListNote("Allow the microphone in the browser prompt, then start the call again.");
      }
      return false;
    }
  }

  function wireMic(stream: MediaStream) {
    const ctx = ensureAudio();
    micSourceRef.current?.disconnect();
    const source = ctx.createMediaStreamSource(stream);
    source.connect(micAnalyserRef.current as AnalyserNode);
    micSourceRef.current = source;
  }

  function startDraw() {
    if (drawRef.current) cancelAnimationFrame(drawRef.current);
    const frame = () => {
      const listening = phaseRef.current === "listening" || phaseRef.current === "hearing";
      const speaking = phaseRef.current === "speaking";
      paintBars(youSpecRef.current, frequencyBars(micAnalyserRef.current, listening), listening, "#3b82f6");
      paintBars(agentSpecRef.current, frequencyBars(voiceAnalyserRef.current, speaking), speaking, "#1d4ed8");
      drawRef.current = requestAnimationFrame(frame);
    };
    drawRef.current = requestAnimationFrame(frame);
  }

  async function playBytes(audio: string) {
    const ctx = ensureAudio();
    await ctx.resume();
    const binary = atob(audio);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const buffer = await ctx.decodeAudioData(bytes.buffer.slice(0));
    try {
      voiceSourceRef.current?.stop();
    } catch {
      /* The previous clip already finished. */
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    if (voiceAnalyserRef.current) source.connect(voiceAnalyserRef.current);
    else source.connect(ctx.destination);
    voiceSourceRef.current = source;
    await new Promise<void>((resolve) => {
      source.onended = () => resolve();
      source.start();
    });
  }

  async function speak(text: string, live = false) {
    try {
      const response = await fetch("/api/call", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF": csrf },
        body: JSON.stringify({ action: "voice", text }),
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; audio?: string } | null;
      if (live && !liveRef.current) return;
      if (!response.ok || !data?.ok || !data.audio) throw new Error("no audio");
      await playBytes(data.audio);
    } catch {
      setListNote("The voice could not be spoken. Try again.");
    }
  }

  function listen(agentId: string) {
    if (!liveRef.current) return;
    const engine = makeListener();
    if (!engine) {
      liveRef.current = false;
      setPhase("idle");
      setListNote("This browser cannot use the microphone. Type the question instead.");
      return;
    }
    try {
      recogRef.current?.stop();
    } catch {
      /* Starting a fresh listener. */
    }
    recogRef.current = engine;
    let finalText = "";
    engine.onresult = (event) => {
      let text = "";
      for (let index = 0; index < event.results.length; index += 1) {
        text += event.results[index][0]?.transcript || "";
      }
      finalText = text.trim();
      setHeard(finalText);
      setQuestion(finalText);
    };
    engine.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        liveRef.current = false;
        setPhase("idle");
        setListNote("Allow the microphone in the browser prompt, then start the call again.");
      } else if (event.error === "audio-capture") {
        liveRef.current = false;
        setPhase("idle");
        setListNote("No microphone was found. Check the device sound settings.");
      }
    };
    engine.onend = () => {
      if (recogRef.current !== engine || !liveRef.current || muteRef.current) return;
      if (finalText.length >= 2) void askSpoken(agentId, finalText);
      else listen(agentId);
    };
    setPhase("listening");
    try {
      engine.start();
    } catch {
      liveRef.current = false;
      setPhase("idle");
      setListNote("The live call stopped. Click Live call to speak again.");
    }
  }

  async function askSpoken(agentId: string, text: string) {
    setPhase("thinking");
    const spoken = await send("ask", { id: agentId, question: text });
    if (!liveRef.current) return;
    if (!spoken) {
      listen(agentId);
      return;
    }
    setPhase("speaking");
    muteRef.current = true;
    try {
      recogRef.current?.stop();
    } catch {
      /* The listener pauses while the agent speaks. */
    }
    await speak(spoken, true);
    muteRef.current = false;
    if (liveRef.current) listen(agentId);
  }

  function setMicEnabled(on: boolean) {
    micRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = on;
    });
  }

  async function playSpoken(audio: string) {
    setMicEnabled(false);
    try {
      await playBytes(audio);
    } catch {
      if (liveRef.current) setListNote("Allow sound for this page, then start the call again.");
    } finally {
      await new Promise((resolve) => setTimeout(resolve, 160));
      if (liveRef.current) setMicEnabled(true);
    }
  }

  async function finishUtterance(agentId: string, blob: Blob, mime: string, turn: number) {
    if (blob.size < 800) {
      if (liveRef.current && turn === turnRef.current) beginListening(agentId);
      return;
    }
    muteRef.current = true;
    setPhase("thinking");
    try {
      const audio = await blobBase64(blob);
      if (turn !== turnRef.current || !liveRef.current) return;
      const response = await fetch("/api/call", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF": csrf },
        body: JSON.stringify({ action: "reply", id: agentId, audio, mime: mime.split(";")[0] }),
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; heard?: string; answer?: string; audio?: string } | null;
      if (turn !== turnRef.current || !liveRef.current) return;
      if (!response.ok || !data?.ok) {
        setListNote(data?.error || "The call could not hear that. Try again.");
        beginListening(agentId);
        return;
      }
      if (!data.heard || !data.answer) {
        beginListening(agentId);
        return;
      }
      setHeard(data.heard);
      setQuestion(data.heard);
      setAnswer(data.answer);
      setPhase("speaking");
      if (data.audio) await playSpoken(data.audio);
      else await speak(data.answer, true);
    } catch {
      if (liveRef.current && turn === turnRef.current) setListNote("The call could not hear that. Try again.");
    }
    muteRef.current = false;
    if (liveRef.current && turn === turnRef.current) beginListening(agentId);
  }

  function beginListening(agentId: string) {
    if (!liveRef.current) return;
    muteRef.current = false;
    stopRecorder();
    const source = micSourceRef.current;
    const ctx = audioRef.current;
    if (!source || !ctx || typeof ctx.createScriptProcessor !== "function") {
      listen(agentId);
      return;
    }
    const turn = turnRef.current;
    const chunks: Float32Array[] = [];
    const rate = ctx.sampleRate;
    let spoke = false;
    let quiet = 0;
    let voiced = 0;
    let total = 0;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const node = ctx.createScriptProcessor(2048, 1, 1);
    captureRef.current = { node, gain, source };
    node.onaudioprocess = (event) => {
      if (captureRef.current?.node !== node || turn !== turnRef.current || !liveRef.current || muteRef.current) return;
      const input = event.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(input));
      let energy = 0;
      for (let index = 0; index < input.length; index += 1) energy += input[index] * input[index];
      const level = Math.sqrt(energy / input.length);
      total += input.length;
      if (total < rate * 0.06) return;
      if (level > 0.008) {
        voiced += input.length;
        quiet = 0;
        if (!spoke && (level > 0.018 || voiced > rate * 0.05)) {
          spoke = true;
          if (phaseRef.current === "listening") setPhase("hearing");
        }
      } else if (spoke) quiet += input.length;
      if (!spoke || (quiet < rate * 0.28 && total < rate * 8)) return;
      const taken = chunks.splice(0, chunks.length);
      stopRecorder();
      const wav = wavFromSamples(taken, rate);
      if (!wav) {
        if (liveRef.current && turn === turnRef.current) beginListening(agentId);
        return;
      }
      void finishUtterance(agentId, wav, "audio/wav", turn);
    };
    source.connect(node);
    node.connect(gain);
    gain.connect(ctx.destination);
    setPhase("listening");
  }

  function requestGreeting(agent: CallAgent) {
    return fetch("/api/call", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF": csrf },
      body: JSON.stringify({ action: "greet", id: agent.id }),
    });
  }

  async function greetThenListen(agent: CallAgent, greeting: Promise<Response>) {
    setAnswer("");
    muteRef.current = true;
    try {
      recogRef.current?.stop();
    } catch {
      /* The listener pauses while the agent speaks. */
    }
    let line = `Thank you for calling ${agent.company}.`;
    try {
      const response = await greeting;
      const data = (await response.json().catch(() => null)) as { ok?: boolean; line?: string; audio?: string } | null;
      if (!liveRef.current) return;
      if (response.ok && data?.ok && data.line) line = data.line;
      setAnswer(line);
      setPhase("speaking");
      if (data?.audio) await playSpoken(data.audio);
      else if (!response.ok) await speak(line, true);
    } catch {
      if (!liveRef.current) return;
      setAnswer(line);
      setPhase("speaking");
      await speak(line, true);
    }
    muteRef.current = false;
    if (liveRef.current) beginListening(agent.id);
  }

  function playLivePcm(bytes: ArrayBuffer) {
    const ctx = ensureAudio();
    if (bytes.byteLength < 2) return;
    const pcm = new Int16Array(bytes);
    const samples = new Float32Array(pcm.length);
    for (let index = 0; index < pcm.length; index += 1) samples[index] = pcm[index] / 32768;
    const buffer = ctx.createBuffer(1, samples.length, 24000);
    buffer.getChannelData(0).set(samples);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    if (voiceAnalyserRef.current) source.connect(voiceAnalyserRef.current);
    else source.connect(ctx.destination);
    const now = ctx.currentTime;
    if (playAtRef.current < now + 0.02) playAtRef.current = now + 0.04;
    source.start(playAtRef.current);
    playAtRef.current += buffer.duration;
    playSourcesRef.current.push(source);
    source.onended = () => {
      playSourcesRef.current = playSourcesRef.current.filter((item) => item !== source);
    };
  }

  function liveSocketUrl(agentId: string) {
    const page = window.location;
    if (page.protocol === "https:" && page.port === "3443") {
      return `wss://${page.hostname}:3443/api/call/live?id=${encodeURIComponent(agentId)}`;
    }
    return `ws://${page.hostname}:3001/api/call/live?id=${encodeURIComponent(agentId)}`;
  }

  function startLive(agent: CallAgent) {
    endLive();
    liveRef.current = true;
    unlockSound();
    setHeard("");
    setQuestion("");
    setListNote("");
    setAnswer("");
    setPhase("thinking");
    startDraw();
    void (async () => {
      const ready = await openMic();
      if (!ready || !liveRef.current || !micRef.current) {
        if (liveRef.current) endLive();
        return;
      }
      const ctx = ensureAudio();
      await ctx.resume();
      wireMic(micRef.current);
      try {
        await ctx.audioWorklet.addModule("/call-worklet.js");
      } catch {
        if (liveRef.current) {
          setListNote("The live call could not open the microphone. Refresh and try again.");
          endLive();
        }
        return;
      }
      if (!liveRef.current || !micSourceRef.current) return;
      const worklet = new AudioWorkletNode(ctx, "call-processor");
      const mute = ctx.createGain();
      mute.gain.value = 0;
      micSourceRef.current.connect(worklet);
      worklet.connect(mute);
      mute.connect(ctx.destination);
      workletRef.current = worklet;
      const socket = new WebSocket(liveSocketUrl(agent.id));
      socket.binaryType = "arraybuffer";
      socketRef.current = socket;
      let pending = new Float32Array(0);
      worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (socket.readyState !== WebSocket.OPEN || !liveRef.current) return;
        const raw = event.data;
        const chunk = raw instanceof Float32Array ? raw : new Float32Array(raw as ArrayBuffer);
        const merged = new Float32Array(pending.length + chunk.length);
        merged.set(pending, 0);
        merged.set(chunk, pending.length);
        const samplesPerSend = Math.floor(ctx.sampleRate * 0.1);
        if (merged.length < samplesPerSend) {
          pending = merged;
          return;
        }
        const piece = merged.slice(0, samplesPerSend);
        pending = merged.slice(samplesPerSend);
        socket.send(pcm16(downsample(piece, ctx.sampleRate, 16000)));
      };
      socket.onmessage = (event) => {
        if (!liveRef.current || socketRef.current !== socket) return;
        if (typeof event.data !== "string") {
          playLivePcm(event.data as ArrayBuffer);
          if (phaseRef.current !== "speaking") setPhase("speaking");
          return;
        }
        const message = JSON.parse(event.data) as { type?: string; text?: string; role?: string; message?: string };
        if (message.type === "ready") setPhase("listening");
        else if (message.type === "hearing") setPhase("hearing");
        else if (message.type === "listening") setPhase("listening");
        else if (message.type === "speaking") setPhase("speaking");
        else if (message.type === "interrupt") {
          playSourcesRef.current.forEach((source) => {
            try { source.stop(); } catch { /* The clip already finished. */ }
          });
          playSourcesRef.current = [];
          playAtRef.current = 0;
          setPhase("listening");
        } else if (message.type === "caption" && message.role === "user" && message.text) {
          setHeard(message.text);
          setQuestion(message.text);
        } else if (message.type === "caption" && message.role === "assistant" && message.text) {
          setAnswer(message.text);
        } else if (message.type === "error") {
          setListNote(message.message || "The call could not connect.");
          endLive();
        } else if (message.type === "ended") endLive();
      };
      socket.onerror = () => {
        if (!liveRef.current || socketRef.current !== socket) return;
        setListNote("The call could not connect. Refresh and try again.");
        endLive();
      };
      socket.onclose = () => {
        if (socketRef.current !== socket || !liveRef.current) return;
        endLive();
      };
    })();
  }

  useEffect(() => {
    moveToSecureCall();
  }, []);

  useEffect(() => {
    return () => {
      liveRef.current = false;
      turnRef.current += 1;
      window.clearInterval(earTimer.current);
      if (drawRef.current) cancelAnimationFrame(drawRef.current);
      try {
        recogRef.current?.stop();
      } catch {
        /* The page is closing. */
      }
      try {
        voiceSourceRef.current?.stop();
      } catch {
        /* The page is closing. */
      }
      const capture = captureRef.current;
      if (capture) {
        try { capture.source.disconnect(capture.node); } catch { /* The page is closing. */ }
        try { capture.node.disconnect(); } catch { /* The page is closing. */ }
        try { capture.gain.disconnect(); } catch { /* The page is closing. */ }
      }
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") {
        rec.onstop = null;
        try {
          rec.stop();
        } catch {
          /* The page is closing. */
        }
      }
      try { socketRef.current?.close(); } catch { /* The page is closing. */ }
      micRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (openId) testRef.current?.scrollIntoView({ block: "nearest" });
  }, [openId]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(editId ? "update" : "save");
  }

  function openTest(agent: CallAgent) {
    if (agent.id !== openId) {
      endLive();
      setQuestion("");
      setAnswer("");
      setHeard("");
    }
    setPanel(null);
    setOpenId(agent.id);
    if (agent.active) {
      void fetch("/api/call", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF": csrf },
        body: JSON.stringify({ action: "warm", id: agent.id }),
      }).catch(() => undefined);
    }
  }

  function openAgent(id: string) {
    const agent = agents.find((item) => item.id === id);
    if (agent) openTest(agent);
  }

  function startEdit(agent: CallAgent) {
    setEditId(agent.id);
    setName(agent.name);
    setCompany(agent.company);
    setInstructions(agent.instructions);
    setNote("");
  }

  function cancelEdit() {
    setEditId("");
    setName("");
    setCompany("");
    setInstructions("");
    setNote("");
  }

  function openInstall(agent: CallAgent) {
    endLive();
    setPanel({ id: agent.id, mode: "install" });
    setOpenId("");
    setPageMode(agent.widget_on && agent.widget_pages !== "*" ? "some" : "all");
    setPageList(agent.widget_pages === "*" ? "" : agent.widget_pages);
    setSnippet(agent.widget_on ? embedCode(agent.id) : "");
    setCopied(false);
  }

  function openLook(agent: CallAgent) {
    endLive();
    setPanel({ id: agent.id, mode: "look" });
    setOpenId("");
    setLookName(agent.widget_name || agent.name);
    setLookLabel(agent.widget_label === true);
    setLookChat(agent.widget_chat === true);
    setLookColor(agent.widget_color || "#2563eb");
    setLookGreeting(agent.widget_greeting || `Hello. Ask me about ${agent.company}.`);
    setPreviewOpen(agent.widget_chat === true);
  }

  function removeAgent(agent: CallAgent) {
    if (confirmId !== agent.id) {
      setConfirmId(agent.id);
      return;
    }
    setConfirmId("");
    void send("delete", { id: agent.id });
  }

  return (
    <section className="tool-layout">
      <form className="dash-card" onSubmit={onSubmit}>
        <h2>{editId ? "Edit call agent" : "AI Call Agent"}</h2>
        <p>{editId ? "Update this agent, then save." : "Create an AI calling agent to handle calls automatically."}</p>
        <label>
          Agent name
          <input name="agent" required maxLength={80} value={name} placeholder="Shop line" onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Company name
          <input name="company" required maxLength={80} value={company} placeholder="North Wind Phones" onChange={(event) => setCompany(event.target.value)} />
        </label>
        <label>
          Instructions
          <textarea
            name="instructions"
            required
            rows={6}
            maxLength={4000}
            value={instructions}
            placeholder="We repair phones. The shop is open 9 to 5, Monday to Saturday. A screen repair takes one day. We do not give prices on the phone."
            onChange={(event) => setInstructions(event.target.value)}
          />
        </label>
        <p className="quiet">The agent answers only from these instructions. Any other question gets: {refusal}</p>
        <ul className="ticks">
          <li>Answer calls with AI</li>
          <li>Handle inquiries</li>
          <li>Get call reports</li>
        </ul>
        <div className="agent-save">
          <button className="btn solid" type="submit" disabled={busy !== ""}>
            {busy === "save" || busy === "update" ? "Saving…" : editId ? "Save changes" : "Create Call Agent"}
          </button>
          {editId ? (
            <button className="btn" type="button" disabled={busy !== ""} onClick={cancelEdit}>
              Cancel
            </button>
          ) : null}
        </div>
        {note ? <p className="status-line" role="status">{note}</p> : null}
      </form>
      <article className={panel?.mode === "look" ? "dash-card with-bot" : "dash-card"}>
        <h2>Call agents</h2>
        {agents.length ? (
          <ul className="agent-list">
            {agents.map((agent) => (
              <li key={agent.id} className={`${agent.id === openId ? "current" : ""} ${agent.active ? "" : "off"}`.trim()}>
                <button type="button" className="agent-open" onClick={() => openAgent(agent.id)}>
                  {agent.name}
                  <small>{agent.company}{agent.active ? "" : " · Off"}</small>
                </button>
                <div className="agent-actions">
                  <button type="button" disabled={busy !== ""} onClick={() => openTest(agent)}>Test</button>
                  <button type="button" disabled={busy !== ""} onClick={() => openInstall(agent)}>Install</button>
                  <button type="button" disabled={busy !== ""} onClick={() => openLook(agent)}>Customize</button>
                  <button type="button" disabled={busy !== ""} onClick={() => startEdit(agent)}>Edit</button>
                  <button type="button" disabled={busy !== ""} onClick={() => void send("active", { id: agent.id, active: !agent.active })}>
                    {agent.active ? "Deactivate" : "Activate"}
                  </button>
                  <button type="button" className="danger" disabled={busy !== ""} onClick={() => removeAgent(agent)}>
                    {confirmId === agent.id ? "Confirm" : "Delete"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="quiet">Created agents show here. Use Test to try one.</p>
        )}
        {listNote ? <p className="status-line" role="status">{listNote}</p> : null}
        {panel && panelAgent && panel.mode === "install" ? (
          <div className="try-block">
            <h2>Install on a website</h2>
            <p>Paste one line of code before the closing body tag. It works on any website, so a plugin is not required.</p>
            <label>
              Pages
              <select value={pageMode} onChange={(event) => setPageMode(event.target.value === "some" ? "some" : "all")}>
                <option value="all">All pages</option>
                <option value="some">Only these pages</option>
              </select>
            </label>
            {pageMode === "some" ? (
              <label>
                Page paths, one per line
                <textarea rows={4} value={pageList} placeholder={"/contact\n/pricing"} onChange={(event) => setPageList(event.target.value)} />
              </label>
            ) : null}
            <button
              className="btn solid"
              type="button"
              disabled={busy !== ""}
              onClick={() => void send("install", { id: panelAgent.id, all: pageMode === "all", pages: pageList })}
            >
              {busy === "install" ? "Saving…" : "Save install"}
            </button>
            {snippet ? (
              <label>
                Website code
                <textarea className="embed-code" readOnly rows={3} value={snippet} />
              </label>
            ) : null}
            {snippet ? (
              <button
                className="btn"
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(snippet).then(() => setCopied(true));
                }}
              >
                {copied ? "Copied" : "Copy code"}
              </button>
            ) : null}
            {snippet ? (
              <div className="paste-help">
                <h3>Where to paste this</h3>
                <ol>
                  <li>Open the website file that appears on every page. On most sites that file is the footer.</li>
                  <li>Scroll to the bottom and find the line <code>&lt;/body&gt;</code>.</li>
                  <li>Paste this code on the line directly above <code>&lt;/body&gt;</code>, then save the file.</li>
                </ol>
                <p>WordPress: Appearance, Theme File Editor, then footer.php. Paste the code just above <code>&lt;/body&gt;</code>.</p>
                <p>If the site has a box named footer code or custom code, paste it in that box instead of editing a file.</p>
              </div>
            ) : null}
          </div>
        ) : null}
        {panel && panelAgent && panel.mode === "look" ? (
          <div className="try-block">
            <h2>Customize</h2>
            <p>The call button in the corner is what visitors see. It changes as you edit. Save sends that look to your websites.</p>
            <label>
              Name on the button
              <input maxLength={40} value={lookName} onChange={(event) => setLookName(event.target.value)} />
            </label>
            <label className="show-name">
              <input type="checkbox" checked={lookLabel} onChange={(event) => setLookLabel(event.target.checked)} />
              Show the name next to the button
            </label>
            <label>
              Button color
              <input type="color" value={lookColor} onChange={(event) => setLookColor(event.target.value)} />
            </label>
            <label>
              Greeting
              <input maxLength={200} value={lookGreeting} onChange={(event) => setLookGreeting(event.target.value)} />
            </label>
            <label className="show-name">
              <input
                type="checkbox"
                checked={lookChat}
                onChange={(event) => {
                  setLookChat(event.target.checked);
                  if (event.target.checked) setPreviewOpen(true);
                }}
              />
              Show the chat window
            </label>
            <button
              className="btn solid"
              type="button"
              disabled={busy !== ""}
              onClick={() => void send("look", { id: panelAgent.id, widget_name: lookName, widget_label: lookLabel, widget_chat: lookChat, widget_color: lookColor, widget_greeting: lookGreeting })}
            >
              {busy === "look" ? "Saving…" : "Save"}
            </button>
          </div>
        ) : null}
        {open ? (
          <div className="try-block" ref={testRef}>
            <h2>Try a question</h2>
            <p>Start a live call and allow the microphone when the browser asks. The agent picks up, listens, and answers out loud. This stays in the browser. The phone line is not connected.</p>
            {open.active ? (
              <>
                <label>
                  Caller question
                  <textarea
                    name="question"
                    rows={4}
                    maxLength={500}
                    value={question}
                    placeholder="What time do you open?"
                    onChange={(event) => setQuestion(event.target.value)}
                  />
                </label>
                <div className="live-line">
                  <button
                    className="btn solid"
                    type="button"
                    disabled={busy !== "" || live !== "idle"}
                    onClick={() => {
                      try {
                        unlockSound();
                      } catch {
                        /* The answer still shows on the page. */
                      }
                      void (async () => {
                        const spoken = await send("ask");
                        if (spoken) await speak(spoken);
                      })();
                    }}
                  >
                    {busy === "ask" ? "Answering…" : "Ask"}
                  </button>
                  {live === "idle" ? (
                    <button className="btn" type="button" onClick={() => startLive(open)}>Live call</button>
                  ) : (
                    <button className="btn end" type="button" onClick={endLive}>End call</button>
                  )}
                </div>
                {live !== "idle" ? (
                  <>
                    <div className="spectrums">
                      <div>
                        <p>You</p>
                        <canvas ref={youSpecRef} aria-hidden="true" />
                      </div>
                      <div>
                        <p>Agent</p>
                        <canvas ref={agentSpecRef} aria-hidden="true" />
                      </div>
                    </div>
                    <p className="status-line" role="status">
                      {live === "hearing" ? "Live call. Hearing you." : live === "listening" ? "Live call. Listening. Speak now." : live === "thinking" ? (heard ? "Live call. The agent is answering." : "Live call. Picking up.") : "Live call. The agent is speaking."}
                    </p>
                  </>
                ) : null}
                {heard ? <p className="hear">You said: {heard}</p> : null}
                {answer ? <p className="status-line" role="status">{answer}</p> : null}
              </>
            ) : (
              <p className="quiet">This agent is off. Activate it to try a question.</p>
            )}
          </div>
        ) : null}
        <p className="quiet">The phone line is not connected. Minutes stay at 0 until a calling service is added.</p>
        {panel?.mode === "look" ? (
          <div className="live-bot">
            {lookChat && previewOpen ? (
              <div className="live-bot-panel">
                <div className="live-bot-head" style={{ background: botColor }}>
                  <strong>{botName}</strong>
                  <button type="button" aria-label="Close" onClick={() => setPreviewOpen(false)}>×</button>
                </div>
                <div className="live-bot-body">
                  <p>{lookGreeting}</p>
                  <form onSubmit={(event) => event.preventDefault()}>
                    <input placeholder="Ask a question" readOnly aria-label="Ask a question" />
                    <button type="button" style={{ background: botColor }}>Ask</button>
                  </form>
                </div>
              </div>
            ) : null}
            <div className="live-bot-row">
              {lookLabel ? (
                <button type="button" className="live-bot-chip" onClick={() => { if (lookChat) setPreviewOpen((openNow) => !openNow); }}>{botName}</button>
              ) : null}
              <button type="button" className="live-bot-dot" style={{ background: botColor }} aria-label={botName} onClick={() => { if (lookChat) setPreviewOpen((openNow) => !openNow); }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M22 16.9v2a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h2a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L7.1 9.5a16 16 0 0 0 6 6l1.1-1.1a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2z" />
                </svg>
              </button>
            </div>
          </div>
        ) : null}
      </article>
    </section>
  );
}
