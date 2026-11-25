"use client";

import { useState } from "react";
import { pauseAccountAction, removeAccountAction, resetUsageAction, saveUserAction, schedulesAction, setPlanAction } from "@/server/adminActions";
import type { AdminUser } from "@/server/admin";

type PlanOption = {
  id: string;
  name: string;
  priceUsd: number;
  credits: number;
  features: { posts: boolean; videos: boolean; audios: boolean };
};

function when(iso: string) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const hours = Math.max(1, Math.round((Date.now() - then) / 3600000));
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function usageLine(user: AdminUser, plans: PlanOption[]) {
  const plan = plans.find((item) => item.id === user.plan) || plans[0];
  if (!plan) return "";
  const spent = Number(user.usage.spent) || 0;
  const left = Math.max(0, plan.credits - spent);
  return `${left.toLocaleString()} / ${plan.credits.toLocaleString()} credits left`;
}

function UserControl({
  user,
  mine,
  busy,
  plans,
  onSave,
}: {
  user: AdminUser;
  mine: boolean;
  busy: boolean;
  plans: PlanOption[];
  onSave: (input: { name: string; email: string; password: string; admin: boolean; disabled: boolean; plan: string }) => void;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState("");
  const [admin, setAdmin] = useState(user.admin);
  const [paused, setPaused] = useState(user.disabled);
  const [plan, setPlan] = useState(user.plan);
  return (
    <form
      className="admin-control"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ name, email, password, admin, disabled: paused && !admin, plan });
      }}
    >
      <label>Name<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
      <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <label className="span">New password<input type="password" value={password} autoComplete="new-password" placeholder="Leave blank to keep the current password" onChange={(event) => setPassword(event.target.value)} /></label>
      <label>
        Package
        <select value={plan} onChange={(event) => setPlan(event.target.value as AdminUser["plan"])}>
          {plans.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} (${item.priceUsd}/mo · {item.credits.toLocaleString()} credits)
            </option>
          ))}
        </select>
      </label>
      <label className="check"><input type="checkbox" checked={admin} disabled={mine} onChange={(event) => setAdmin(event.target.checked)} /> Admin</label>
      <label className="check"><input type="checkbox" checked={paused && !admin} disabled={mine || admin} onChange={(event) => setPaused(event.target.checked)} /> Pause sign-in</label>
      <p className="quiet span admin-usage">This month: {usageLine(user, plans)}</p>
      <button className="btn solid span" type="submit" disabled={busy}>{busy ? "Saving…" : "Save user"}</button>
    </form>
  );
}

export function AdminPanel({ users, me, plans }: { users: AdminUser[]; me: string; plans: PlanOption[] }) {
  const [open, setOpen] = useState("");
  const [control, setControl] = useState("");
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  async function run(key: string, work: () => Promise<string>) {
    setBusy(key);
    setError("");
    const message = await work();
    setBusy("");
    if (message) setError(message);
    else setConfirm("");
  }

  return (
    <section className="dash-card">
      <div className="panel-head"><h2>Accounts</h2></div>
      {error ? <p className="error">{error}</p> : null}
      {users.length ? (
        <ul className="admin-users">
          {users.map((user) => {
            const mine = user.id === me;
            const openUser = open === user.id;
            const controlUser = control === user.id;
            return (
              <li key={user.id}>
                <div className="admin-row">
                  <div>
                    <strong>{user.name}</strong>
                    <span className="quiet">{user.email}</span>
                  </div>
                  <span>{user.connected ? user.page || "Connected" : "No page"}</span>
                  <span>{user.planName} · {user.posts} posts · {user.schedules} schedules</span>
                  <time>{when(user.created_at)}</time>
                </div>
                <div className="schedule-actions">
                  <span className={user.admin ? "pill on" : user.disabled ? "pill" : "pill on"}>{user.admin ? "Admin" : user.disabled ? "Paused" : "Active"}</span>
                  <span className="pill quiet-pill">{user.planName}</span>
                  <button className="text-btn" type="button" onClick={() => setOpen(openUser ? "" : user.id)}>{openUser ? "Hide" : "Open"}</button>
                  <button className="text-btn" type="button" onClick={() => setControl(controlUser ? "" : user.id)}>{controlUser ? "Close" : "Control"}</button>
                  <label className="admin-plan-quick">
                    <span className="sr-only">Change package</span>
                    <select
                      value={user.plan}
                      disabled={!!busy}
                      onChange={(event) => run(`${user.id}:plan`, () => setPlanAction(user.id, event.target.value, false))}
                    >
                      {plans.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </label>
                  <button className="text-btn" type="button" disabled={!!busy} onClick={() => run(`${user.id}:usage`, () => resetUsageAction(user.id))}>
                    {busy === `${user.id}:usage` ? "Resetting…" : "Reset usage"}
                  </button>
                  {user.schedules ? (
                    <button className="text-btn" type="button" disabled={!!busy} onClick={() => run(`${user.id}:schedules`, () => schedulesAction(user.id, user.topics.some((topic) => topic.schedule !== "once" && !topic.active)))}>
                      {busy === `${user.id}:schedules` ? "Saving…" : user.topics.some((topic) => topic.schedule !== "once" && !topic.active) ? "Resume schedules" : "Pause schedules"}
                    </button>
                  ) : null}
                  {mine || user.admin ? null : (
                    <button className="text-btn" type="button" disabled={!!busy} onClick={() => run(`${user.id}:pause`, () => pauseAccountAction(user.id, !user.disabled))}>
                      {busy === `${user.id}:pause` ? "Saving…" : user.disabled ? "Allow sign-in" : "Pause sign-in"}
                    </button>
                  )}
                  {mine || user.admin ? null : confirm === user.id ? (
                    <button className="text-btn danger" type="button" disabled={!!busy} onClick={() => run(`${user.id}:delete`, () => removeAccountAction(user.id))}>
                      {busy === `${user.id}:delete` ? "Removing…" : "Remove this account"}
                    </button>
                  ) : (
                    <button className="text-btn" type="button" onClick={() => setConfirm(user.id)}>Remove</button>
                  )}
                </div>
                <p className="quiet admin-usage-line">{usageLine(user, plans)} this month</p>
                {controlUser ? (
                  <UserControl
                    key={`${user.id}:${user.name}:${user.email}:${user.admin}:${user.disabled}:${user.plan}:${user.usage.spent}`}
                    user={user}
                    mine={mine}
                    busy={busy === `${user.id}:save`}
                    plans={plans}
                    onSave={(input) => run(`${user.id}:save`, () => saveUserAction(user.id, input))}
                  />
                ) : null}
                {openUser ? (
                  <div className="admin-detail">
                    <h3>Posts and schedules</h3>
                    {user.topics.length ? (
                      <ul>
                        {user.topics.map((topic) => (
                          <li key={topic.id}>
                            <strong>{topic.title}</strong>
                            <span>{topic.schedule === "once" ? topic.status || "queued" : `${topic.schedule}${topic.active ? "" : " · paused"}`}</span>
                            {topic.page ? <a href={topic.page} target="_blank" rel="noreferrer">On the page</a> : null}
                          </li>
                        ))}
                      </ul>
                    ) : <p className="quiet">No posts yet.</p>}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : <p className="quiet">No accounts yet.</p>}
    </section>
  );
}
