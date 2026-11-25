import { requireApi } from "@/server/accounts";
import {
  addTopic,
  deleteTopic,
  disconnect,
  generate,
  pickPage,
  pickPages,
  publicState,
  publish,
  regenerateCaption,
  regenerateImage,
  runDue,
  runNext,
  disconnectLinkedIn,
  saveConnection,
  saveLinkedIn,
  saveTargets,
  setTopicActive,
  updateCaption,
  updateTopic,
} from "@/server/desk";
import { deskJson, failJson } from "@/server/http";
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
    if (action === "save_connection") {
      await saveConnection(body);
      return deskJson(request);
    }
    if (action === "disconnect") {
      await disconnect(body.page_id ? String(body.page_id) : undefined);
      return deskJson(request);
    }
    if (action === "save_linkedin") {
      await saveLinkedIn(body);
      return deskJson(request);
    }
    if (action === "disconnect_linkedin") {
      await disconnectLinkedIn(body.org_id ? String(body.org_id) : undefined);
      return deskJson(request);
    }
    if (action === "save_targets") {
      await saveTargets(body);
      return deskJson(request);
    }
    if (action === "fb_pick") {
      await pickPage(String(body.page_id || ""));
      return deskJson(request);
    }
    if (action === "fb_pick_many") {
      const ids = Array.isArray(body.page_ids) ? body.page_ids.map((id) => String(id || "")) : [];
      await pickPages(ids);
      return deskJson(request);
    }
    if (action === "topic_add") {
      const topic = await addTopic(body, !!body.post_now);
      return deskJson(request, { topic });
    }
    if (action === "topic_update") {
      const topic = await updateTopic(String(body.id || ""), body);
      return deskJson(request, { topic });
    }
    if (action === "topic_active") {
      if (typeof body.active !== "boolean") throw new DeskError("Say whether this schedule is active.");
      const topic = await setTopicActive(String(body.id || ""), body.active);
      return deskJson(request, { topic });
    }
    if (action === "topic_caption") {
      const topic = await updateCaption(String(body.id || ""), String(body.caption || ""));
      return deskJson(request, { topic });
    }
    if (action === "topic_delete") {
      await deleteTopic(String(body.id || ""));
      return deskJson(request);
    }
    if (action === "generate") {
      const topic = await generate(String(body.id || ""), !!body.post);
      return deskJson(request, { topic });
    }
    if (action === "regenerate_caption") {
      const topic = await regenerateCaption(String(body.id || ""), String(body.note || ""));
      return deskJson(request, { topic });
    }
    if (action === "regenerate_image") {
      const topic = await regenerateImage(String(body.id || ""), String(body.note || ""));
      return deskJson(request, { topic });
    }
    if (action === "publish") {
      const topic = await publish(String(body.id || ""));
      return deskJson(request, { topic });
    }
    if (action === "run_next") return deskJson(request, await runNext());
    if (action === "run_due") return deskJson(request, await runDue());
    throw new DeskError("Unknown action.", 404);
  } catch (error) {
    try {
      await requireApi();
      const state = await publicState(request);
      const message = error instanceof Error ? error.message : "That did not work.";
      const status = error instanceof DeskError && error.status >= 400 ? error.status : 400;
      return Response.json({ ...state, ok: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
    } catch {
      return failJson(error);
    }
  }
}
