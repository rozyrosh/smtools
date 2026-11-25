import { AdminPanel } from "@/components/AdminPanel";
import { AppShell } from "@/components/AppShell";
import { adminOverview } from "@/server/admin";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const data = await adminOverview();
  return (
    <AppShell name={data.name} active="admin" admin>
      <header className="welcome">
        <div>
          <h1>Admin</h1>
          <p>Every account, page, post, and schedule.</p>
        </div>
      </header>
      <section className="stats wide">
        <article><i className="ico dashboard" /><p>Accounts</p><strong>{data.users.length}</strong></article>
        <article><i className="ico posting" /><p>Posts on Facebook</p><strong>{data.posts}</strong></article>
        <article><i className="ico video" /><p>Videos saved</p><strong>{data.videos}</strong></article>
        <article><i className="ico posting" /><p>Connected pages</p><strong>{data.connected}</strong></article>
      </section>
      <AdminPanel users={data.users} me={data.me} plans={data.plans} />
    </AppShell>
  );
}
