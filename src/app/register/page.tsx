import { Nav } from "@/components/Nav";
import { SiteFooter } from "@/components/SiteFooter";
import { registerAction } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; name?: string; email?: string }>;
}) {
  const params = await searchParams;
  return (
    <>
      <Nav />
      <main className="auth">
        <form className="auth-card" action={registerAction}>
          <h1>Get Started</h1>
          <p className="quiet">After this you land on the dashboard. Each account has its own page and its own posts.</p>
          {params.error ? <p className="error">{params.error}</p> : null}
          <label>Name <input name="name" autoComplete="name" required maxLength={60} defaultValue={params.name || ""} /></label>
          <label>Email <input name="email" type="email" autoComplete="username" required defaultValue={params.email || ""} /></label>
          <label>Password <input name="password" type="password" autoComplete="new-password" required minLength={8} /></label>
          <button className="btn solid" type="submit">Create account</button>
          <a className="text-btn" href="/login">Login</a>
        </form>
      </main>
      <SiteFooter />
    </>
  );
}
