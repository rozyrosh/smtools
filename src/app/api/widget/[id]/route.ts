import { askPublic, publicWidget } from "@/server/callAgent";
import { DeskError, publicError } from "@/server/paths";
import { findPublicCallAgent } from "@/server/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

function widgetJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers });
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const agent = findPublicCallAgent(id);
  if (!agent) return widgetJson({ show: false }, 404);
  const page = new URL(request.url).searchParams.get("page") || "/";
  return widgetJson(publicWidget(agent, page));
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as { question?: unknown; page?: unknown } | null;
    const page = String(body?.page || "/");
    const result = await askPublic(id, body?.question, page);
    return widgetJson({ ok: true, ...result });
  } catch (error) {
    const message = publicError(error instanceof Error ? error.message : "That did not work.");
    const status = error instanceof DeskError && error.status >= 400 ? error.status : 400;
    return widgetJson({ ok: false, error: message }, status);
  }
}
