import { existsSync, readFileSync } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { requireApi } from "@/server/accounts";
import { deleteSpeech, ownsSpeech } from "@/server/audioJob";
import { failJson } from "@/server/http";
import { audioDir, DeskError } from "@/server/paths";
import { csrfMatches, readSession } from "@/server/session";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  let userId = "";
  try {
    const user = await requireApi();
    userId = user.id;
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  const { id } = await context.params;
  if (!/^aud_[a-f0-9]{12}$/.test(id)) return new NextResponse(null, { status: 404 });
  if (!ownsSpeech(userId, id)) return new NextResponse(null, { status: 404 });
  const root = audioDir();
  const typeFile = path.join(root, `${id}.type`);
  const mime = existsSync(typeFile) ? readFileSync(typeFile, "utf8").trim() || "audio/wav" : "audio/wav";
  const ext = mime.includes("mpeg") ? "mp3" : mime.includes("ogg") ? "ogg" : "wav";
  try {
    const bytes = readFileSync(path.join(root, `${id}.${ext}`));
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": mime,
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `inline; filename="${id}.${ext}"`,
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApi();
    const session = await readSession();
    if (!csrfMatches(session, String(request.headers.get("x-csrf") || ""))) {
      throw new DeskError("The page expired. Reload and try again.", 403);
    }
    const { id } = await context.params;
    deleteSpeech(user.id, id);
    return Response.json({ ok: true, id }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failJson(error);
  }
}
