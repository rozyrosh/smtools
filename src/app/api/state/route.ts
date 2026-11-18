import { NextResponse } from "next/server";
import { requireApi } from "@/server/accounts";
import { publicState } from "@/server/desk";
import { failJson } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireApi();
    return NextResponse.json(await publicState(request), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failJson(error, 401);
  }
}
