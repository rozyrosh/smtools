import { planSnapshot, requireApi } from "@/server/accounts";
import { failJson } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireApi();
    const plan = planSnapshot(user.id);
    return Response.json({ ok: true, ...plan }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failJson(error);
  }
}
