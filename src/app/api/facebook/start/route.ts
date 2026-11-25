import { NextResponse } from "next/server";
import { requireApi } from "@/server/accounts";
import { startFacebook } from "@/server/desk";
import { appOrigin, publicError } from "@/server/paths";
import { readSession, setFlash, writeSession } from "@/server/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireApi();
    const started = await startFacebook(request);
    const session = await readSession();
    await writeSession({ ...session, oauth: started.state });
    return NextResponse.redirect(started.url);
  } catch (error) {
    await setFlash(publicError(error instanceof Error ? error.message : "Facebook could not be opened."));
    return NextResponse.redirect(new URL("/desk/connect", appOrigin(request)));
  }
}
