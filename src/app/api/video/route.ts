import { requireApi } from "@/server/accounts";
import { failJson } from "@/server/http";
import { DeskError } from "@/server/paths";
import { csrfMatches, readSession } from "@/server/session";
import { createSimilarVideo } from "@/server/videoJob";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    await requireApi();
    const session = await readSession();
    if (!csrfMatches(session, String(request.headers.get("x-csrf") || ""))) {
      throw new DeskError("The page expired. Reload and try again.", 403);
    }
    const form = await request.formData();
    const saved = await createSimilarVideo(form.get("file"), String(form.get("changes") || ""), String(form.get("resolution") || ""), String(form.get("ratio") || ""));
    return Response.json({ ok: true, ...saved }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failJson(error);
  }
}
