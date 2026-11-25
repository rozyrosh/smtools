"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function Mark({ light = false }: { light?: boolean }) {
  return (
    <span className={light ? "mark light" : "mark"} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
        <path d="M9.2 7.1v9.8l8.2-4.9z" />
      </svg>
    </span>
  );
}

const links = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/#tools", label: "Tools", icon: "tools" },
  { href: "/#pricing", label: "Pricing", icon: "pricing" },
  { href: "/#faq", label: "FAQ", icon: "faq" },
] as const;

function NavIcon({ id }: { id: (typeof links)[number]["icon"] }) {
  if (id === "home") {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
      </svg>
    );
  }
  if (id === "tools") {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17l3 3 5.1-5.1a4 4 0 0 0 5.6-5.6l-2.2 2.2-2.8-2.8z" />
      </svg>
    );
  }
  if (id === "pricing") {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20.6 13.4 12.9 21a2 2 0 0 1-2.8 0L3 13.9a2 2 0 0 1 0-2.8l7.7-7.7a2 2 0 0 1 1.4-.6H19a2 2 0 0 1 2 2v6.2a2 2 0 0 1-.4 1.4z" />
        <circle cx="16" cy="8" r="1.2" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.1 9.2a2.8 2.8 0 0 1 5.4.9c0 1.9-2.7 2.4-2.7 4" />
      <path d="M12 17.2h.01" />
    </svg>
  );
}

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className={scrolled || open ? "site-nav is-scrolled" : "site-nav"}>
      <Link className="brand" href="/" onClick={() => setOpen(false)}>
        <Mark />
        <span>smtools</span>
      </Link>

      <nav className="site-links" aria-label="Primary">
        {links.map((item) => (
          <Link key={item.href} href={item.href} className={item.label === "Home" ? "is-active" : undefined}>
            <NavIcon id={item.icon} />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="nav-account">
        <Link className="text-btn nav-login" href="/login">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="8" r="3.2" />
            <path d="M5.5 19.2a6.5 6.5 0 0 1 13 0" />
          </svg>
          Login
        </Link>
        <Link className="btn solid nav-cta" href="/register">
          Get Started
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </div>

      <button
        className="nav-burger"
        type="button"
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((value) => !value)}
      >
        <span />
        <span />
        <span />
      </button>

      <div id="mobile-nav" className={open ? "nav-drawer open" : "nav-drawer"} aria-hidden={!open}>
        <nav aria-label="Mobile">
          {links.map((item) => (
            <Link key={item.href} href={item.href} tabIndex={open ? undefined : -1} onClick={() => setOpen(false)}>
              <NavIcon id={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="nav-drawer-actions">
          <Link className="btn ghost" href="/login" tabIndex={open ? undefined : -1} onClick={() => setOpen(false)}>Login</Link>
          <Link className="btn solid" href="/register" tabIndex={open ? undefined : -1} onClick={() => setOpen(false)}>Get Started</Link>
        </div>
      </div>
    </header>
  );
}
