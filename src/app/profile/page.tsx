import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/server/accounts";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser();
  return (
    <AppShell name={user.name} active="profile">
      <header className="tool-head">
        <div>
          <h1>Profile</h1>
          <p>The name and email on this desk.</p>
        </div>
      </header>
      <article className="dash-card narrow">
        <p><strong>{user.name}</strong></p>
        <p className="quiet">{user.email}</p>
      </article>
    </AppShell>
  );
}
