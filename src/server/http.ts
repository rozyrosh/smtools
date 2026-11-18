import { NextResponse } from "next/server";
import { DeskError, publicError } from "@/server/paths";
import { publicState } from "@/server/desk";

export async function deskJson(request: Request, extra: Record<string, unknown> = {}, status = 200) {
  try {
    const state = await publicState(request);
    return NextResponse.json({ ...state, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = publicError(error instanceof Error ? error.message : "The desk could not answer.");
    const code = error instanceof DeskError && error.status >= 400 ? error.status : 400;
    return NextResponse.json({ ok: false, error: message, ...extra }, { status: code });
  }
}

export function failJson(error: unknown, status = 400) {
  const message = publicError(error instanceof Error ? error.message : "That did not work.");
  const code = error instanceof DeskError && error.status >= 400 && error.status < 600 ? error.status : status;
  return NextResponse.json({ ok: false, error: message }, { status: code, headers: { "Cache-Control": "no-store" } });
}
