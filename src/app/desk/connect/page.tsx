import { AppShell } from "@/components/AppShell";
import PageConnect from "@/components/PageConnect";
import { requireUser } from "@/server/accounts";
import { readSession } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function ConnectPage() {
  const user = await requireUser();
  const session = await readSession();
  return (
    <AppShell name={user.name} active="connect" admin={user.admin}>
      <PageConnect csrf={session.csrf} />
    </AppShell>
  );
}
