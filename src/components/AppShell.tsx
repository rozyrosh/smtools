"use client";

import { useLayoutEffect, useState } from "react";
import Link from "next/link";
import { AccountMenu } from "@/components/AccountMenu";
import { logoutAction } from "@/server/auth";
import { Mark } from "@/components/Nav";

const links = [
  { href: "/dashboard", id: "dashboard", label: "Dashboard" },
  { href: "/desk", id: "posting", label: "Auto Posting" },
  { href: "/video", id: "video", label: "Video Duplicate" },
  { href: "/call", id: "call", label: "AI Call Agent" },
  { href: "/transactions", id: "transactions", label: "Transactions" },
  { href: "/profile", id: "profile", label: "Profile" },
  { href: "/support", id: "support", label: "Support" },
];

function SideIcon({ id }: { id: string }) {
  const pen = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (id === "dashboard") {
    return <svg {...pen}><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></svg>;
  }
  if (id === "posting") {
    return <svg {...pen}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>;
  }
  if (id === "video") {
    return <svg {...pen}><rect x="3" y="6" width="12" height="12" rx="2" /><path d="M15 10.5l6-3v9l-6-3z" /></svg>;
  }
  if (id === "call") {
    return <svg {...pen}><path d="M8 4H6.5A2.5 2.5 0 0 0 4 6.5c0 7.2 5.8 13 13 13A2.5 2.5 0 0 0 19.5 17V15.5l-3.2-1.2-1.6 1.6a12 12 0 0 1-5.6-5.6l1.6-1.6L8 4z" /></svg>;
  }
  if (id === "transactions") {
    return <svg {...pen}><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18M7 15h4" /></svg>;
  }
  if (id === "profile") {
    return <svg {...pen}><circle cx="12" cy="8" r="3.2" /><path d="M5 19.2c1.4-3 3.8-4.5 7-4.5s5.6 1.5 7 4.5" /></svg>;
  }
  return <svg {...pen}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 4v2.2M12 17.8V20M4 12h2.2M17.8 12H20" /></svg>;
}

export function AppShell({
  name,
  active,
  children,
}: {
  name: string;
  active: string;
  children: React.ReactNode;
}) {
  const letter = (name.trim().split(" ")[0] || name).slice(0, 1).toUpperCase();
  const [collapsed, setCollapsed] = useState(true);
  const [narrow, setNarrow] = useState(false);

  useLayoutEffect(() => {
    const query = window.matchMedia("(max-width: 980px)");
    const apply = () => {
      const small = query.matches;
      setNarrow(small);
      setCollapsed(small || localStorage.getItem("smtools-side") === "0");
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  function toggle() {
    setCollapsed((value) => {
      const next = !value;
      if (!window.matchMedia("(max-width: 980px)").matches) {
        localStorage.setItem("smtools-side", next ? "0" : "1");
      }
      return next;
    });
  }

  function closeIfNarrow() {
    if (window.matchMedia("(max-width: 980px)").matches) setCollapsed(true);
  }

  return (
    <div className={collapsed ? "shell collapsed" : "shell"}>
      {narrow && !collapsed ? <button className="side-backdrop" type="button" aria-label="Close menu" onClick={() => setCollapsed(true)} /> : null}
      <aside className="side">
        <div className="side-top">
          <Link className="brand side-brand" href="/dashboard" title="smtools">
            <Mark light />
            <span>smtools</span>
          </Link>
          <button className="side-toggle" type="button" aria-expanded={!collapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={toggle}>
            {collapsed ? "›" : "‹"}
          </button>
        </div>
        <nav className="side-nav">
          {links.map((item) => (
            <Link key={item.id} href={item.href} aria-current={active === item.id ? "page" : undefined} title={item.label} onClick={closeIfNarrow}>
              <SideIcon id={item.id} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="upgrade">
          <span className="crown" aria-hidden="true" />
          <strong>Upgrade to Pro</strong>
          <p>Unlock more features!</p>
          <Link className="btn solid" href="/pricing" onClick={closeIfNarrow}>Upgrade Now</Link>
        </div>
        <form action={logoutAction}>
          <button className="side-out" type="submit" title={`Log out ${name}`}>
            <span>Log out {name}</span>
          </button>
        </form>
      </aside>
      <div className="shell-main">
        <button className="mobile-menu" type="button" aria-label="Open menu" onClick={toggle}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <div className="shell-account">
          <AccountMenu letter={letter} />
        </div>
        {children}
      </div>
    </div>
  );
}
