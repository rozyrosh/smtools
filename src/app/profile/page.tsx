import { AppShell } from "@/components/AppShell";
import { changeNameAction, changePasswordAction } from "@/server/auth";
import { requireUser } from "@/server/accounts";

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; name_error?: string; name_saved?: string }>;
}) {
  const user = await requireUser();
  const { error, saved, name_error, name_saved } = await searchParams;
  const initial = (user.name.trim()[0] || "?").toUpperCase();

  return (
    <AppShell name={user.name} active="profile" admin={user.admin}>
      <main className="desk desk-solo desk-modern profile-modern">
        <div className="desk-glow" aria-hidden="true" />
        <header className="desk-head">
          <div className="desk-head-copy">
            <h1>Profile</h1>
            <p>Your name, email, and sign-in password for this desk.</p>
          </div>
        </header>

        <section className="profile-grid">
          <article className="panel compose-card profile-card">
            <div className="profile-card-head">
              <span className="profile-avatar" aria-hidden="true">{initial}</span>
              <div>
                <p className="eyebrow">Account</p>
                <h2>Your details</h2>
              </div>
            </div>
            <p className="quiet">Update the name shown on this desk. Email stays the same for sign-in.</p>
            {name_error ? <p className="error">{name_error}</p> : null}
            {name_saved ? <p className="status-line">Name saved.</p> : null}
            <form className="profile-form" action={changeNameAction}>
              <label>
                Name
                <input
                  name="name"
                  type="text"
                  required
                  minLength={2}
                  maxLength={60}
                  defaultValue={user.name}
                  autoComplete="name"
                />
              </label>
              <label>
                Email
                <input type="email" value={user.email} readOnly tabIndex={-1} aria-readonly="true" />
              </label>
              <button className="btn solid compose-primary" type="submit">Save name</button>
            </form>
          </article>

          <article className="panel compose-card profile-card">
            <div className="profile-card-head">
              <span className="profile-lock" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <rect x="5" y="10" width="14" height="10" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
                  <path d="M8 10V8a4 4 0 0 1 8 0v2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </span>
              <div>
                <p className="eyebrow">Security</p>
                <h2>Change password</h2>
              </div>
            </div>
            <p className="quiet">Use the password you sign in with now, then choose a new one.</p>
            {error ? <p className="error">{error}</p> : null}
            {saved ? <p className="status-line">The password is saved. Use it the next time you sign in.</p> : null}
            <form className="profile-form" action={changePasswordAction}>
              <label>
                Current password
                <input name="current" type="password" autoComplete="current-password" required />
              </label>
              <label>
                New password
                <input name="next" type="password" autoComplete="new-password" minLength={8} required />
              </label>
              <label>
                Confirm new password
                <input name="confirm" type="password" autoComplete="new-password" minLength={8} required />
              </label>
              <button className="btn solid compose-primary" type="submit">Save password</button>
            </form>
          </article>
        </section>
      </main>
    </AppShell>
  );
}
