import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import path from "path";
import { dataDir } from "@/server/paths";

export const dynamic = "force-dynamic";

/** Temporary recovery route — remove after use. */
const PURGE_KEY = "smtools-temp-purge-r7k2m9";

type AccountRow = {
  id?: string;
  email?: string;
  [key: string]: unknown;
};

function readAccounts(file: string): AccountRow[] {
  if (!existsSync(file)) return [];
  try {
    const data = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(data) ? data.filter((row) => row && typeof row === "object") : [];
  } catch {
    return [];
  }
}

function writeAccounts(file: string, accounts: AccountRow[]) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(accounts, null, 2));
  renameSync(tmp, file);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: string; key?: string } | null;
  const email = String(body?.email || "").trim().toLowerCase();
  const key = String(body?.key || "").trim();
  if (key !== PURGE_KEY) {
    return Response.json({ ok: false, error: "Forbidden." }, { status: 403 });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ ok: false, error: "Add a valid email." }, { status: 400 });
  }

  const dir = dataDir();
  const file = path.join(dir, "accounts.json");
  const accounts = readAccounts(file);
  const match = accounts.find((row) => String(row.email || "").trim().toLowerCase() === email);
  if (!match) {
    return Response.json({ ok: true, removed: false, email, remaining: accounts.length });
  }

  const next = accounts.filter((row) => String(row.email || "").trim().toLowerCase() !== email);
  writeAccounts(file, next);

  const id = String(match.id || "").trim();
  if (/^usr_[a-f0-9]{12}$/.test(id)) {
    const desk = path.join(dir, "desks", id);
    if (existsSync(desk)) rmSync(desk, { recursive: true, force: true });
  }

  return Response.json({
    ok: true,
    removed: true,
    email,
    user_id: id || null,
    remaining: next.length,
  });
}
