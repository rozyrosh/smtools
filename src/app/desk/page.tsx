import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import DeskApp from "@/components/DeskApp";
import { requireUser } from "@/server/accounts";
import { readSession } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function DeskPage() {
  const user = await requireUser();
  const session = await readSession();
  return (
    <AppShell name={user.name} active="posting">
      <header className="tool-head">
        <div>
          <h1>Auto Posting</h1>
          <p>Let smtools generate and publish engaging posts for you automatically.</p>
        </div>
      </header>
      <DeskApp csrf={session.csrf} />
      <section className="tool-layout slim">
        <Link className="dash-card link-card" href="/video">
          <h2>Video Duplicate</h2>
          <p>Upload a video and create similar videos using AI.</p>
        </Link>
        <Link className="dash-card link-card" href="/call">
          <h2>AI Call Agent</h2>
          <p>Create an AI calling agent to handle calls automatically.</p>
        </Link>
      </section>
    </AppShell>
  );
}
