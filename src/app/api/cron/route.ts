import { readFileSync } from "fs";
import { NextResponse } from "next/server";
import { idForCronKey } from "@/server/accounts";
import { publicState, runDue, runNext } from "@/server/desk";
import { DeskError, publicError } from "@/server/paths";
import { bind } from "@/server/store";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key") || "";
  const owner = idForCronKey(key);
  if (!owner) return NextResponse.json({ ok: false, error: "That key is not valid." }, { status: 403 });
  bind(owner);
  try {
    let result = await runDue();
    if (!result.ran) result = await runNext();
    return NextResponse.json({ ...(await publicState(request)), ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = publicError(error instanceof Error ? error.message : "The scheduled post did not go out.");
    const state = await publicState(request).catch(() => ({ ok: false }));
    return NextResponse.json(
      { ...state, ok: false, error: message },
      { status: error instanceof DeskError && error.status >= 400 ? error.status : 502 }
    );
  }
}
