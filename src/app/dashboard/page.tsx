import { AppShell } from "@/components/AppShell";
import { planSnapshot, requireUser } from "@/server/accounts";
import { priceLabel, PLANS } from "@/server/plans";
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

function statusLabel(item: { status: string; schedule: string }) {
  if (item.status === "posted") return "Posted as the page";
  if (item.schedule !== "once") return item.schedule;
  return item.status;
}

export default async function DashboardPage() {
  const user = await requireUser();
  const plan = planSnapshot(user.id);
  const data = await runAs(user.id, async () => ({
    page: readSettings().fb_page_name,
    topics: readTopics(),
  }));
  const posts = data.topics.filter((item) => item.status === "posted").length;
  const queued = data.topics.filter((item) => item.status === "queued" || item.status === "ready").length;
  const first = user.name.split(" ")[0] || user.name;
  const planDef = PLANS[plan.plan];
  const recent = [...data.topics]
    .sort((a, b) => (b.posted_at || b.created_at).localeCompare(a.posted_at || a.created_at))
    .slice(0, 4);

  return (
    <AppShell
      name={user.name}
      active="dashboard"
      admin={user.admin}
      credits={{
        plan: plan.plan,
        name: plan.name,
        credits: plan.credits,
        balance: plan.balance,
      }}
    >
      <main className="desk desk-solo desk-modern dash-modern">
        <div className="desk-glow" aria-hidden="true" />
        <header className="desk-head">
          <div className="desk-head-copy">
            <h1>Welcome back, {first}!</h1>
            <p>Here&apos;s what&apos;s happening with your smtools account.</p>
          </div>
          {data.page ? (
            <div className="page-strip page-strip-head dash-page-chip">
              <div className="page-strip-copy">
                <span className="page-strip-label">Page</span>
                <span className="page-chip on">{data.page}</span>
              </div>
            </div>
          ) : null}
        </header>

        <section className="stats dash-stats">
          <article className="panel compose-card dash-stat">
            <span className="dash-stat-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18"><rect x="4" y="5" width="16" height="14" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M8 10h8M8 14h5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
            </span>
            <div className="dash-stat-copy">
              <p>Total Posts</p>
              <strong>{posts}</strong>
            </div>
          </article>
          <article className="panel compose-card dash-stat">
            <span className="dash-stat-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18"><rect x="3" y="5" width="14" height="14" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M17 9.5l4-2.2v9.4l-4-2.2z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
            </span>
            <div className="dash-stat-copy">
              <p>Credits left</p>
              <strong>{plan.balance}</strong>
            </div>
          </article>
          <article className="panel compose-card dash-stat">
            <span className="dash-stat-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M12 8v4.2l2.6 1.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
            </span>
            <div className="dash-stat-copy">
              <p>In Queue</p>
              <strong>{queued}</strong>
            </div>
          </article>
        </section>

        <section className="dash-grid">
          <article className="panel compose-card dash-plan">
            <div className="panel-head">
              <h2>Your Active Plan</h2>
              <span className="pill quiet-pill">{planDef.name}</span>
            </div>
            <p className="quiet">
              {plan.balance.toLocaleString()} / {plan.credits.toLocaleString()} credits left this month · spend on posts, video, or audio
            </p>
            <p className="plan-price">{priceLabel(planDef)}<small>/month</small></p>
            <p className="quiet dash-plan-page">
              {data.page ? `Connected page: ${data.page}` : "No Facebook page connected yet."}
              {queued ? ` · ${queued} in queue` : ""}
            </p>
            <Link className="btn ghost compose-secondary" href="/pricing">
              View plans
            </Link>
          </article>

          <article className="panel compose-card dash-actions">
            <div className="panel-head">
              <h2>Quick Actions</h2>
            </div>
            <div className="quick">
              <Link href="/desk">
                <span className="dash-action-ico" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 20l4.2-1.1L19 8.1a2.1 2.1 0 0 0 0-3l-.1-.1a2.1 2.1 0 0 0-3 0L5.1 15.8 4 20z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M13.2 6.8l3.9 3.9" fill="none" stroke="currentColor" strokeWidth="1.7" /></svg>
                </span>
                <span>Create Post<small>Auto Posting</small></span>
              </Link>
              <Link href="/video">
                <span className="dash-action-ico" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="18" height="18"><rect x="3" y="5" width="14" height="14" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M17 9.5l4-2.2v9.4l-4-2.2z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
                </span>
                <span>Duplicate Video<small>AI Video</small></span>
              </Link>
              <Link href="/audio">
                <span className="dash-action-ico" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="18" height="18"><path d="M8 10v4M12 7v10M16 9v6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /><rect x="3.5" y="4.5" width="17" height="15" rx="3.5" fill="none" stroke="currentColor" strokeWidth="1.7" /></svg>
                </span>
                <span>Audio Generate<small>Text to Speech</small></span>
              </Link>
            </div>
          </article>
        </section>

        <section className="panel compose-card activity dash-activity">
          <div className="panel-head">
            <h2>Recent Activity</h2>
            <span className="pill quiet-pill">{recent.length}</span>
          </div>
          {recent.length ? (
            <ul>
              {recent.map((item) => (
                <li key={item.id}>
                  <strong>{item.title}</strong>
                  <span className={item.status === "posted" ? "dash-status on" : "dash-status"}>{statusLabel(item)}</span>
                  <time>{when(item.posted_at || item.created_at)}</time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="quiet">No posts yet. Create one from Auto Posting.</p>
          )}
        </section>
      </main>
    </AppShell>
  );
}
