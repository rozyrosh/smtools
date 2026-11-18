import Link from "next/link";

export function Mark({ light = false }: { light?: boolean }) {
  return <span className={light ? "mark light" : "mark"} aria-hidden="true" />;
}

export function Nav() {
  return (
    <header className="site-nav">
      <Link className="brand" href="/">
        <Mark />
        <span>smtools</span>
      </Link>
      <nav className="site-links">
        <Link href="/">Home</Link>
        <Link href="/#tools">Tools</Link>
        <Link href="/#pricing">Pricing</Link>
        <Link href="/#faq">FAQ</Link>
      </nav>
      <div className="nav-account">
        <Link className="text-btn" href="/login">Login</Link>
        <Link className="btn solid" href="/register">Get Started</Link>
      </div>
    </header>
  );
}
