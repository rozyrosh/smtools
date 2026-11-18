import { requireApi } from "@/server/accounts";
import { askAgent, deleteAgent, greetCaller, replyToCaller, saveAgent, saveInstall, saveLook, setAgentActive, speakLine, updateAgent, warmGreeting } from "@/server/callAgent";
import { failJson } from "@/server/http";
import { DeskError } from "@/server/paths";
import { csrfMatches, readSession } from "@/server/session";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(request: Request) {
  try {
    await requireApi();
    const session = await readSession();
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) throw new DeskError("The desk could not read that.");
    if (!csrfMatches(session, String(request.headers.get("x-csrf") || ""))) {
      throw new DeskError("The page expired. Reload and try again.", 403);
    }
    const action = String(body.action || "");
    if (action === "save") {
      const saved = await saveAgent(body);
      return Response.json({ ok: true, ...saved }, { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "update") {
      const saved = await updateAgent(body);
      return Response.json({ ok: true, ...saved }, { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "active") {
      const saved = await setAgentActive(body.id, body.active !== false);
      return Response.json({ ok: true, ...saved }, { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "delete") {
      const saved = await deleteAgent(body.id);
      return Response.json({ ok: true, ...saved }, { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "install") {
      const saved = await saveInstall(body);
      return Response.json({ ok: true, ...saved }, { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "look") {
      const saved = await saveLook(body);
      return Response.json({ ok: true, ...saved }, { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "ask") {
      const result = await askAgent(body);
      return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "reply") {
      const result = await replyToCaller(body);
      return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "greet") {
      const greeting = await greetCaller(body.id);
      return Response.json({ ok: true, ...greeting }, { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "warm") {
      await warmGreeting(body.id);
      return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "voice") {
      const audio = await speakLine(body.text);
      return Response.json({ ok: true, audio: audio.data, mime: audio.mime }, { headers: { "Cache-Control": "no-store" } });
    }
    throw new DeskError("Unknown action.", 404);
  } catch (error) {
    return failJson(error);
  }
}
