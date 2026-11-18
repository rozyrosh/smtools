import { AppShell } from "@/components/AppShell";
import { CallDesk } from "@/components/CallDesk";
import { requireUser } from "@/server/accounts";
import { readCallAgents } from "@/server/callAgent";
import { readSession } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function CallPage() {
  const user = await requireUser();
  const session = await readSession();
  const agents = readCallAgents();
  return (
    <AppShell name={user.name} active="call">
      <header className="tool-head">
        <div>
          <h1>AI Call Agent</h1>
          <p>Create an AI calling agent to handle calls automatically.</p>
        </div>
      </header>
      <CallDesk csrf={session.csrf} agents={agents} />
    </AppShell>
  );
}
