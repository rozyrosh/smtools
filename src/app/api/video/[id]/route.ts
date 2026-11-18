import { readFileSync } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { requireApi } from "@/server/accounts";
import { videoDir } from "@/server/paths";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireApi();
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  const { id } = await context.params;
  if (!/^vid_[a-f0-9]{12}$/.test(id)) return new NextResponse(null, { status: 404 });
  try {
    const bytes = readFileSync(path.join(videoDir(), `${id}.mp4`));
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "video/mp4",
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
