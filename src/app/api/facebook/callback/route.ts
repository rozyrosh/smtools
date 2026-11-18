import { NextResponse } from "next/server";
import { requireApi } from "@/server/accounts";
import { finishFacebook } from "@/server/desk";
import { facebookRedirect, publicError } from "@/server/paths";
import { csrfMatches, readSession, setFlash, writeSession } from "@/server/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const back = new URL("/desk", request.url);
  try {
    await requireApi();
    const url = new URL(request.url);
    const session = await readSession();
    const expected = session.oauth || "";
    const got = url.searchParams.get("state") || "";
    await writeSession({ ...session, oauth: undefined });
    if (!expected || expected.length !== got.length || !csrfMatches({ csrf: expected }, got)) {
      await setFlash("Facebook sent the desk back without a matching login. Try connecting again.");
      return NextResponse.redirect(back);
    }
    const error = url.searchParams.get("error_description") || url.searchParams.get("error");
    if (error) {
      await setFlash(publicError(error));
      return NextResponse.redirect(back);
    }
    const message = await finishFacebook(url.searchParams.get("code") || "", facebookRedirect(request));
    await setFlash(message);
    return NextResponse.redirect(back);
  } catch (error) {
    await setFlash(publicError(error instanceof Error ? error.message : "Facebook could not connect the page."));
    return NextResponse.redirect(back);
  }
}
