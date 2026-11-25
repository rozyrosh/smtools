import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import path from "path";
import { dataDir } from "@/server/paths";

export const dynamic = "force-dynamic";

type AccountSummary = {
  accounts_file: boolean;
  account_count: number;
  emails: string[];
  passwords_saved: number;
  parse_error: string | null;
  bytes: number;
};

function accountSummary(dir: string): AccountSummary {
  const empty: AccountSummary = {
    accounts_file: false,
    account_count: 0,
    emails: [],
    passwords_saved: 0,
    parse_error: null,
    bytes: 0,
  };
  const file = path.join(dir, "accounts.json");
  if (!existsSync(file)) return empty;
  try {
    const raw = readFileSync(file, "utf8");
    const data = JSON.parse(raw);
    const rows = Array.isArray(data) ? data : [];
    const emails = rows
      .map((row) => (row && typeof row === "object" ? String((row as { email?: string }).email || "").trim().toLowerCase() : ""))
      .filter(Boolean);
    const withHash = rows.filter((row) => row && typeof row === "object" && String((row as { password_hash?: string }).password_hash || "").length > 10).length;
    return {
      accounts_file: true,
      account_count: rows.length,
      emails,
      passwords_saved: withHash,
      parse_error: null,
      bytes: raw.length,
    };
  } catch (err) {
    return {
      accounts_file: true,
      account_count: 0,
      emails: [],
      passwords_saved: 0,
      parse_error: err instanceof Error ? err.message : "accounts.json could not be read",
      bytes: 0,
    };
  }
}

export async function GET() {
  let dir = "";
  let writable = false;
  let error = "";
  let accounts = accountSummary("");
  try {
    dir = dataDir();
    const probe = path.join(dir, `.health-${process.pid}`);
    writeFileSync(probe, "ok");
    writable = existsSync(probe);
    unlinkSync(probe);
    accounts = accountSummary(dir);
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not open the data folder.";
  }
  return Response.json(
    {
      ok: writable,
      data_dir: dir || null,
      cwd: process.cwd(),
      writable,
      error: error || null,
      needs_database: false,
      accounts,
      hint: writable
        ? accounts.account_count
          ? `File storage is working. ${accounts.account_count} account(s) on disk.`
          : "File storage is working, but no accounts.json users were found. Register a new account on this live site."
        : "Set DATA_DIR in Hostinger environment variables to a writable path such as /home/USER/smtools-data, then redeploy.",
    },
    { status: writable ? 200 : 500, headers: { "Cache-Control": "no-store" } }
  );
}
