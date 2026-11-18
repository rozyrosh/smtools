import { readFileSync } from "fs";
import { NextResponse } from "next/server";
import { requireApi } from "@/server/accounts";
import { topicImage } from "@/server/desk";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireApi();
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  const { id } = await context.params;
  const image = topicImage(id);
  if (!image) return new NextResponse(null, { status: 404 });
  const bytes = readFileSync(image.file);
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": image.mime,
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
