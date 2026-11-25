import { AppShell } from "@/components/AppShell";
import DeskApp from "@/components/DeskApp";
import { requireUser } from "@/server/accounts";
import { readSession } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function DeskPage() {
  const user = await requireUser();
  const session = await readSession();
  return (
    <AppShell name={user.name} active="posting" admin={user.admin}>
      <DeskApp csrf={session.csrf} />
    </AppShell>
  );
}
