import { requireApi } from "@/server/accounts";
import { createSpeech, listSpeechHistory } from "@/server/audioJob";
import { failJson } from "@/server/http";
import { DeskError } from "@/server/paths";
import { csrfMatches, readSession } from "@/server/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  try {
    const user = await requireApi();
    const items = listSpeechHistory(user.id);
    return Response.json({ ok: true, items }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failJson(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApi();
    const session = await readSession();
    if (!csrfMatches(session, String(request.headers.get("x-csrf") || ""))) {
      throw new DeskError("The page expired. Reload and try again.", 403);
    }
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) throw new DeskError("The desk could not read that.");
    const saved = await createSpeech(user.id, String(body.text || ""), String(body.voice || ""), String(body.style || ""));
    return Response.json({ ok: true, ...saved }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failJson(error);
  }
}
