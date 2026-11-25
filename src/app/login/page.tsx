import { Nav } from "@/components/Nav";
import { SiteFooter } from "@/components/SiteFooter";
import { loginAction } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <>
      <Nav />
      <main className="auth">
        <form className="auth-card" action={loginAction}>
          <h1>Login</h1>
          <p className="quiet">Open the desk for your account.</p>
          {error ? <p className="error">{error}</p> : null}
          <label>Email <input name="email" type="email" autoComplete="username" required /></label>
          <label>Password <input name="password" type="password" autoComplete="current-password" required /></label>
          <button className="btn solid" type="submit">Login</button>
          <a className="text-btn" href="/register">Get Started</a>
        </form>
      </main>
      <SiteFooter />
    </>
  );
}
