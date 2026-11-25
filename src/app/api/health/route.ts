import { existsSync, writeFileSync, unlinkSync } from "fs";
import path from "path";
import { dataDir } from "@/server/paths";

export const dynamic = "force-dynamic";

export async function GET() {
  let dir = "";
  let writable = false;
  let error = "";
  try {
    dir = dataDir();
    const probe = path.join(dir, `.health-${process.pid}`);
    writeFileSync(probe, "ok");
    writable = existsSync(probe);
    unlinkSync(probe);
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not open the data folder.";
  }
  return Response.json(
    {
      ok: writable,
      data_dir: dir || null,
      writable,
      error: error || null,
      needs_database: false,
      hint: writable
        ? "File storage is working. No MySQL database is required."
        : "Set DATA_DIR in Hostinger environment variables to a writable path such as /home/USER/smtools-data, then redeploy.",
    },
    { status: writable ? 200 : 500, headers: { "Cache-Control": "no-store" } }
  );
}
