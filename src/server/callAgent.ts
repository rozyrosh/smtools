import { answerFromInstructions, pickupLine, sameUtterance, speakNaturally, transcribeCall } from "./gemini";
import { DeskError, limitText, randomId } from "./paths";
import { findPublicCallAgent, geminiKey, readCallAgents, saveCallAgents, transaction, type CallAgent } from "./store";

function limitBlock(value: string, max: number) {
  const cleaned = value.replace(/\r\n/g, "\n").trim();
  return cleaned.length > max ? cleaned.slice(0, max) : cleaned;
}

export function cleanAgent(input: { name?: unknown; company?: unknown; instructions?: unknown }) {
  const name = limitText(String(input.name || ""), 80);
  const company = limitText(String(input.company || ""), 80);
  const instructions = limitBlock(String(input.instructions || ""), 4000);
  if (name.length < 2) throw new DeskError("Add an agent name.");
  if (company.length < 2) throw new DeskError("Add the company name.");
  if (instructions.length < 8) throw new DeskError("Add the instructions this agent should follow.");
  return { name, company, instructions };
}

export function saveAgent(input: { name?: unknown; company?: unknown; instructions?: unknown }) {
  return transaction(() => {
    const clean = cleanAgent(input);
    const agents = readCallAgents();
    const agent: CallAgent = {
      ...clean,
      id: randomId("call"),
      active: true,
      created_at: new Date().toISOString(),
      widget_name: clean.name,
      widget_label: false,
      widget_chat: false,
      widget_color: "#2563eb",
      widget_greeting: `Hello. Ask me about ${clean.company}.`,
      widget_pages: "*",
      widget_on: false,
    };
    agents.unshift(agent);
    saveCallAgents(agents);
    return { agent, agents };
  });
}

function findAgent(id: string) {
  const agents = readCallAgents();
  const agent = agents.find((item) => item.id === id);
  if (!agent) throw new DeskError("That call agent is not in the list.");
  return { agents, agent };
}

export function updateAgent(input: { id?: unknown; name?: unknown; company?: unknown; instructions?: unknown }) {
  return transaction(() => {
    const { agents, agent } = findAgent(String(input.id || ""));
    const next = { ...agent, ...cleanAgent(input) };
    const list = agents.map((item) => (item.id === next.id ? next : item));
    saveCallAgents(list);
    return { agent: next, agents: list };
  });
}

export function setAgentActive(idValue: unknown, active: boolean) {
  return transaction(() => {
    const { agents, agent } = findAgent(String(idValue || ""));
    const next = { ...agent, active };
    const list = agents.map((item) => (item.id === next.id ? next : item));
    saveCallAgents(list);
    return { agent: next, agents: list };
  });
}

export function deleteAgent(idValue: unknown) {
  return transaction(() => {
    const id = String(idValue || "");
    const agents = readCallAgents();
    const list = agents.filter((item) => item.id !== id);
    if (list.length === agents.length) throw new DeskError("That call agent is not in the list.");
    saveCallAgents(list);
    return { agents: list };
  });
}

function cleanPages(value: unknown) {
  const lines = String(value || "")
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 40);
  const paths = lines.map((line) => {
    if (/^https?:\/\//i.test(line)) {
      try {
        return new URL(line).pathname || "/";
      } catch {
        return "";
      }
    }
    const path = (line.startsWith("/") ? line : `/${line}`).split("?")[0].slice(0, 200);
    return path.startsWith("/") ? path : "";
  }).filter(Boolean);
  if (!paths.length) throw new DeskError("Add at least one page, such as / or /contact.");
  return [...new Set(paths)].join("\n");
}

export function pageAllowed(agent: CallAgent, page: string) {
  if (!agent.widget_on || !agent.active) return false;
  const path = (page.startsWith("/") ? page : "/").split("?")[0].slice(0, 200) || "/";
  if (agent.widget_pages.trim() === "*") return true;
  return agent.widget_pages.split("\n").some((rule) => {
    const cleaned = rule.trim();
    if (!cleaned) return false;
    if (cleaned === "/") return path === "/";
    return path === cleaned || path.startsWith(cleaned.endsWith("/") ? cleaned : `${cleaned}/`);
  });
}

export function publicWidget(agent: CallAgent, page: string) {
  const show = pageAllowed(agent, page);
  if (!show) return { show: false };
  return {
    show: true,
    name: agent.widget_name || agent.name,
    label: agent.widget_label,
    chat: agent.widget_chat,
    color: agent.widget_color,
    greeting: agent.widget_greeting,
  };
}

export function saveInstall(input: { id?: unknown; pages?: unknown; all?: unknown }) {
  return transaction(() => {
    const { agents, agent } = findAgent(String(input.id || ""));
    const widget_pages = input.all === true ? "*" : cleanPages(input.pages);
    const next = { ...agent, widget_pages, widget_on: true };
    const list = agents.map((item) => (item.id === next.id ? next : item));
    saveCallAgents(list);
    return { agent: next, agents: list };
  });
}

export function saveLook(input: { id?: unknown; widget_name?: unknown; widget_label?: unknown; widget_chat?: unknown; widget_color?: unknown; widget_greeting?: unknown }) {
  return transaction(() => {
    const { agents, agent } = findAgent(String(input.id || ""));
    const widget_name = limitText(String(input.widget_name || agent.name), 40);
    const widget_label = input.widget_label === true;
    const widget_chat = input.widget_chat === true;
    const rawColor = String(input.widget_color || "").trim();
    const widget_color = /^#[0-9a-fA-F]{6}$/.test(rawColor) ? rawColor.toLowerCase() : agent.widget_color;
    const widget_greeting = limitBlock(String(input.widget_greeting || ""), 200) || `Hello. Ask me about ${agent.company}.`;
    if (widget_name.length < 2) throw new DeskError("Add the name that shows on the button.");
    const next = { ...agent, widget_name, widget_label, widget_chat, widget_color, widget_greeting };
    const list = agents.map((item) => (item.id === next.id ? next : item));
    saveCallAgents(list);
    return { agent: next, agents: list };
  });
}

export async function askPublic(id: string, questionValue: unknown, page: string) {
  const agent = findPublicCallAgent(id);
  if (!agent || !pageAllowed(agent, page)) throw new DeskError("This agent is not on this page.", 404);
  const question = limitBlock(String(questionValue || ""), 500);
  if (question.length < 2) throw new DeskError("Type a question.");
  const key = geminiKey();
  if (!key.key) throw new DeskError("Answers are not available right now.");
  const answer = await answerFromInstructions(key.key, agent.company, agent.instructions, question);
  return { answer };
}

export async function greetCaller(id: unknown) {
  const { agent } = findAgent(String(id || ""));
  if (!agent.active) throw new DeskError("This agent is off. Activate it to try a question.");
  const key = geminiKey();
  if (!key.key) throw new DeskError("The voice is not available right now.");
  const line = pickupLine(agent.company);
  try {
    const audio = await speakNaturally(key.key, line);
    return { line, audio: audio.data, mime: audio.mime };
  } catch {
    return { line, audio: "", mime: "" };
  }
}

export async function warmGreeting(id: unknown) {
  const { agent } = findAgent(String(id || ""));
  if (!agent.active) return;
  const key = geminiKey();
  if (!key.key) return;
  await speakNaturally(key.key, pickupLine(agent.company));
}

export async function speakLine(textValue: unknown) {
  const text = limitBlock(String(textValue || ""), 600);
  if (text.length < 2) throw new DeskError("There is nothing to say.");
  const key = geminiKey();
  if (!key.key) throw new DeskError("The voice is not available right now.");
  return speakNaturally(key.key, text);
}

export async function replyToCaller(input: { id?: unknown; question?: unknown; audio?: unknown; mime?: unknown }) {
  const key = geminiKey();
  if (!key.key) throw new DeskError("Answers are not available right now.");
  const { agent } = findAgent(String(input.id || ""));
  if (!agent.active) throw new DeskError("This agent is off. Activate it to try a question.");
  let heard = limitBlock(String(input.question || ""), 500);
  let answer = "";
  if (heard.length >= 2) {
    answer = await answerFromInstructions(key.key, agent.company, agent.instructions, heard);
  } else {
    const audio = String(input.audio || "");
    if (audio.length < 100) return { heard: "", answer: "", audio: "", mime: "" };
    if (audio.length > 1_800_000) throw new DeskError("That was too long. Try a shorter question.");
    heard = await transcribeCall(key.key, audio, String(input.mime || "audio/wav"));
  }
  if (heard.length >= 2 && (!answer || sameUtterance(heard, answer))) {
    answer = await answerFromInstructions(key.key, agent.company, agent.instructions, heard);
  }
  if (heard.length < 2 || !answer || sameUtterance(heard, answer)) return { heard: "", answer: "", audio: "", mime: "" };
  try {
    const spoken = await speakNaturally(key.key, answer);
    return { heard, answer, audio: spoken.data, mime: spoken.mime };
  } catch {
    return { heard, answer, audio: "", mime: "" };
  }
}

export async function askAgent(input: { id?: unknown; question?: unknown }) {
  const question = limitBlock(String(input.question || ""), 500);
  if (question.length < 2) throw new DeskError("Type the caller's question.");
  const { agent } = findAgent(String(input.id || ""));
  if (!agent.active) throw new DeskError("This agent is off. Activate it to try a question.");
  const key = geminiKey();
  if (!key.key) throw new DeskError("Answers are not available right now.");
  const answer = await answerFromInstructions(key.key, agent.company, agent.instructions, question);
  return { agent, answer };
}

export { readCallAgents };
