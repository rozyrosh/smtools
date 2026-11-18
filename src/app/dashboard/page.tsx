import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/server/accounts";
import { readSettings, readTopics, runAs } from "@/server/store";
import Link from "next/link";

export const dynamic = "force-dynamic";

function when(iso: string) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const hours = Math.max(1, Math.round((Date.now() - then) / 3600000));
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default async function DashboardPage() {
  const user = await requireUser();
  const data = await runAs(user.id, async () => ({
    page: readSettings().fb_page_name,
    topics: readTopics(),
  }));
  const posts = data.topics.filter((item) => item.status === "posted").length;
  const first = user.name.split(" ")[0] || user.name;
  const recent = [...data.topics].sort((a, b) => (b.posted_at || b.created_at).localeCompare(a.posted_at || a.created_at)).slice(0, 4);

  return (
    <AppShell name={user.name} active="dashboard">
      <header className="welcome">
        <div>
          <h1>Welcome back, {first}!</h1>
          <p>Here&apos;s what&apos;s happening with your smtools account.</p>
        </div>
      </header>
      <section className="stats">
        <article><i className="ico posting" /><p>Total Posts</p><strong>{posts}</strong></article>
        <article><i className="ico video" /><p>Videos Created</p><strong>0</strong></article>
        <article><i className="ico call" /><p>Call Minutes</p><strong>0</strong></article>
      </section>
      <section className="dash-grid">
        <article className="dash-card">
          <h2>Your Active Plan</h2>
          <p className="quiet">No paid plan is attached to this account yet.</p>
          <p className="plan-price">LKR —<small>/month</small></p>
          <p className="quiet">{data.page ? `Connected page: ${data.page}` : "No Facebook page connected yet."}</p>
          <Link className="btn ghost" href="/pricing">Manage Plan</Link>
        </article>
        <article className="dash-card">
          <h2>Quick Actions</h2>
          <div className="quick">
            <Link href="/desk"><i className="ico posting" /><span>Create Post<small>Auto Posting</small></span></Link>
            <Link href="/video"><i className="ico video" /><span>Duplicate Video<small>AI Video</small></span></Link>
            <Link href="/call"><i className="ico call" /><span>Start Call Agent</span></Link>
          </div>
        </article>
      </section>
      <section className="dash-card activity">
        <div className="panel-head"><h2>Recent Activity</h2></div>
        {recent.length ? (
          <ul>
            {recent.map((item) => (
              <li key={item.id}>
                <strong>{item.title}</strong>
                <span>{item.status === "posted" ? "Posted as the page" : item.schedule !== "once" ? item.schedule : item.status}</span>
                <time>{when(item.posted_at || item.created_at)}</time>
              </li>
            ))}
          </ul>
        ) : <p className="quiet">No posts yet. Create one from Auto Posting.</p>}
      </section>
    </AppShell>
  );
}
