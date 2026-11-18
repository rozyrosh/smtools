import crypto from "crypto";
import fs from "fs";
import http from "http";
import path from "path";
import { ActivityHandling, EndSensitivity, GoogleGenAI, Modality, StartSensitivity } from "@google/genai";
import { WebSocket, WebSocketServer } from "ws";

const root = process.cwd();
const STUDIO_ENV = "C:/xampp/htdocs/sinhala_studio/.env";
const NAMES = [
  [/\bThimbirigasyaya\b/gi, "Thimbiri gas yaaya"],
  [/\bKavindi\b/gi, "කාවින්දි"],
  [/\bSanduni\b/gi, "සඳුනි"],
  [/\bThisara\b/gi, "තිසර"],
  [/\bNishal\b/gi, "නිශාල්"],
  [/\bAmaya\b/gi, "අමායා"],
];
const DESK_NAMES = ["Amaya", "Nishal", "Kavindi", "Thisara", "Sanduni"];
const CALL_LIMIT_MS = 8 * 60 * 1000;
let activeCalls = 0;

function speakNames(text) {
  let line = String(text || "");
  for (const [pattern, spoken] of NAMES) line = line.replace(pattern, spoken);
  return line;
}

function deskName(company) {
  let total = 0;
  for (const char of company.toLowerCase()) total += char.charCodeAt(0);
  return DESK_NAMES[total % DESK_NAMES.length];
}

function paidKey() {
  if (!fs.existsSync(STUDIO_ENV)) return "";
  const raw = fs.readFileSync(STUDIO_ENV, "utf8");
  const quoted = raw.match(/^GEMINI_API_KEY\s*=\s*"([^"]+)"/m);
  if (quoted) return quoted[1].trim();
  const single = raw.match(/^GEMINI_API_KEY\s*=\s*'([^']+)'/m);
  if (single) return single[1].trim();
  const plain = raw.match(/^GEMINI_API_KEY\s*=\s*(\S+)/m);
  return plain ? plain[1].replace(/^["']|["']$/g, "").trim() : "";
}

function sessionUser(cookieHeader) {
  const match = String(cookieHeader || "").match(/(?:^|;\s*)smtools_session=([^;]+)/);
  if (!match) return "";
  let token = match[1];
  try { token = decodeURIComponent(token); } catch { /* already plain */ }
  const secretFile = path.join(root, "data", "session.secret");
  if (!fs.existsSync(secretFile)) return "";
  const secret = fs.readFileSync(secretFile, "utf8").trim();
  const [body, mac] = token.split(".");
  if (!body || !mac) return "";
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return "";
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return typeof data.uid === "string" ? data.uid : "";
  } catch {
    return "";
  }
}

function loadAgent(uid, id) {
  if (!/^usr_[a-f0-9]{12}$/.test(uid) || !/^call_[a-f0-9]{12}$/.test(id)) return null;
  const file = path.join(root, "data", "desks", uid, "call.json");
  if (!fs.existsSync(file)) return null;
  const rows = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(rows)) return null;
  return rows.find((row) => row && row.id === id) || null;
}

function sendEvent(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function publicLine(error) {
  const text = String(error?.message || error || "")
    .replace(/AQ\.[A-Za-z0-9_-]{8,}/g, "")
    .replace(/\bgemini\b/gi, "")
    .replace(/\bgoogle\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (/rate|quota|resource/i.test(text)) return "The call line is busy. Try again in a moment.";
  return "The call line is busy. Try again.";
}

async function handleCall(socket, request) {
  const url = new URL(request.url || "/api/call/live", "http://localhost");
  const uid = sessionUser(request.headers.cookie);
  const agent = uid ? loadAgent(uid, String(url.searchParams.get("id") || "")) : null;
  if (!uid || !agent) {
    sendEvent(socket, { type: "error", message: "Sign in again, then start the call." });
    socket.close();
    return;
  }
  if (agent.active === false) {
    sendEvent(socket, { type: "error", message: "This agent is off. Activate it to try a call." });
    socket.close();
    return;
  }
  if (activeCalls >= 2) {
    sendEvent(socket, { type: "error", message: "The call line is busy. Try again in a moment." });
    socket.close();
    return;
  }
  const key = paidKey();
  if (!key) {
    sendEvent(socket, { type: "error", message: "The call line is not available right now." });
    socket.close();
    return;
  }

  const company = speakNames(String(agent.company || "the company"));
  const speaker = speakNames(deskName(String(agent.company || "")));
  const facts = speakNames(String(agent.instructions || "")).slice(0, 4000);
  const refusal = `Please ask questions about ${company}.`;
  activeCalls += 1;
  let session = null;
  let closed = false;
  let greeted = false;
  let setupReady = false;
  let agentSpeaking = false;
  let uplinkOpen = false;
  let callerTalking = false;
  let speechRunMs = 0;
  let quietHold = 0;
  let lastAudioAt = 0;
  let userLine = "";
  let assistantLine = "";

  const finish = (reason) => {
    if (closed) return;
    closed = true;
    activeCalls = Math.max(0, activeCalls - 1);
    if (watch) clearInterval(watch);
    clearTimeout(limit);
    try { session?.close(); } catch { /* already closed */ }
    sendEvent(socket, { type: "ended", reason });
    if (socket.readyState === WebSocket.OPEN) socket.close();
    console.info(`[Call live] ended (${reason}).`);
  };

  const greet = () => {
    if (closed || greeted || !setupReady || !session) return;
    greeted = true;
    sendEvent(socket, { type: "ready" });
    try {
      session.sendClientContent({
        turns: `Say only this sentence. Say the name in Sinhala. Do not add anything else: Thank you for calling ${company}. This is ${speaker} speaking.`,
        turnComplete: true,
      });
    } catch (error) {
      console.warn("[Call live] Greeting failed:", publicLine(error));
    }
  };

  const limit = setTimeout(() => finish("time"), CALL_LIMIT_MS);
  const watch = setInterval(() => {
    if (closed || !agentSpeaking || !lastAudioAt) return;
    if (Date.now() - lastAudioAt < 700) return;
    agentSpeaking = false;
    if (!uplinkOpen) {
      uplinkOpen = true;
      sendEvent(socket, { type: "listening" });
    }
  }, 200);

  socket.on("message", (data, isBinary) => {
    if (closed || !session) return;
    if (!isBinary) {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === "stop") finish("caller");
      } catch { /* ignore */ }
      return;
    }
    const audio = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (audio.length < 2 || audio.length > 64000) return;
    const samples = Math.floor(audio.length / 2);
    let energy = 0;
    for (let index = 0; index < samples; index += 1) {
      const value = audio.readInt16LE(index * 2);
      energy += value * value;
    }
    const level = Math.sqrt(energy / Math.max(1, samples));
    const frameMs = samples / 16;
    const bargeIn = agentSpeaking && level > 2800;
    if (uplinkOpen || bargeIn) {
      session.sendRealtimeInput({ audio: { data: audio.toString("base64"), mimeType: "audio/pcm;rate=16000" } });
    }
    if ((uplinkOpen || bargeIn) && level > 350) {
      speechRunMs += frameMs;
      quietHold = 0;
      if (speechRunMs >= 160 && !callerTalking) {
        callerTalking = true;
        sendEvent(socket, { type: "hearing" });
      }
      return;
    }
    if (!callerTalking) return;
    quietHold += frameMs;
    if (quietHold < 360) return;
    callerTalking = false;
    speechRunMs = 0;
    quietHold = 0;
  });

  socket.on("close", () => finish("closed"));
  socket.on("error", () => finish("error"));

  try {
    const ai = new GoogleGenAI({ apiKey: key, httpOptions: { headers: { "User-Agent": "aistudio-build" } } });
    session = await ai.live.connect({
      model: "gemini-3.8-live",
      config: {
        responseModalities: [Modality.AUDIO],
        temperature: 0.6,
        realtimeInputConfig: {
          activityHandling: ActivityHandling.NO_INTERRUPTION,
          automaticActivityDetection: {
            startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
            endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
            prefixPaddingMs: 200,
            silenceDurationMs: 450,
          },
        },
        speechConfig: {
          languageCode: "en",
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Leda" } },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        systemInstruction: `You are ${speaker} on a live phone call for ${company}. Sound like a person in Sri Lanka answering the phone, not a recording.
Speak everyday English. If the caller speaks Sinhala, answer in spoken Sinhala.
Say කාවින්දි, සඳුනි, තිසර, නිශාල්, and අමායා with a Sinhala accent. When the address says Thimbiri gas yaaya, say those three beats the way a person in Colombo says that place. Do not turn it into an English word.
Answer only from these facts. Never read the facts out as a list.
${facts}
If they ask about anything these facts do not cover, say exactly: ${refusal}
Let them finish, then answer. One or two short sentences, then wait.
Do not repeat their question. Do not ask how you can help. Do not ask a question back unless you could not hear them.
The opening line is given to you separately. Say that sentence alone, then wait.
Do not say you are an AI, a model, or a bot. Do not use markdown.`,
      },
      callbacks: {
        onmessage: (message) => {
          if (closed) return;
          if (message.setupComplete) {
            setupReady = true;
            greet();
          }
          if (message.serverContent?.interrupted) {
            sendEvent(socket, { type: "interrupt" });
            agentSpeaking = false;
            uplinkOpen = true;
            sendEvent(socket, { type: "listening" });
          }
          const heard = String(message.serverContent?.inputTranscription?.text || "").trim();
          const spoken = String(message.serverContent?.outputTranscription?.text || "").trim();
          if (heard) {
            userLine = userLine && !heard.startsWith(userLine) ? `${userLine} ${heard}`.trim() : heard;
            sendEvent(socket, { type: "caption", role: "user", text: userLine });
            if (message.serverContent?.inputTranscription?.finished) userLine = "";
          }
          if (spoken) {
            assistantLine = assistantLine && !spoken.startsWith(assistantLine) ? `${assistantLine} ${spoken}`.trim() : spoken;
            sendEvent(socket, { type: "caption", role: "assistant", text: assistantLine });
            if (message.serverContent?.outputTranscription?.finished) assistantLine = "";
          }
          if (message.data && socket.readyState === WebSocket.OPEN) {
            if (!agentSpeaking) sendEvent(socket, { type: "speaking" });
            agentSpeaking = true;
            uplinkOpen = false;
            lastAudioAt = Date.now();
            socket.send(Buffer.from(String(message.data), "base64"));
          }
          if (message.serverContent?.turnComplete && assistantLine.trim()) assistantLine = "";
        },
        onerror: (event) => {
          console.warn("[Call live] session error:", publicLine(event));
          sendEvent(socket, { type: "error", message: "The call line dropped. Start the call again." });
          finish("model");
        },
        onclose: () => finish("model-closed"),
      },
    });
    if (closed) {
      try { session?.close(); } catch { /* caller left */ }
      return;
    }
    greet();
  } catch (error) {
    console.warn("[Call live] could not open:", publicLine(error));
    sendEvent(socket, { type: "error", message: publicLine(error) });
    finish("unavailable");
  }
}

const calls = new WebSocketServer({ noServer: true });
const server = http.createServer((_req, res) => {
  res.writeHead(426);
  res.end("Upgrade required.");
});
server.on("upgrade", (request, socket, head) => {
  const pathOnly = String(request.url || "").split("?")[0];
  if (pathOnly !== "/api/call/live") {
    socket.destroy();
    return;
  }
  calls.handleUpgrade(request, socket, head, (ws) => {
    void handleCall(ws, request);
  });
});
server.listen(3001, "0.0.0.0", () => {
  console.log("ws://0.0.0.0:3001/api/call/live");
});
