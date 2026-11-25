"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import Link from "next/link";
import { AccountMenu } from "@/components/AccountMenu";
import { logoutAction } from "@/server/auth";
import { Mark } from "@/components/Nav";

export type ShellCredits = {
  plan: string;
  name: string;
  credits: number;
  balance: number;
};

type NavItem = {
  href: string;
  id: string;
  label: string;
  adminOnly?: boolean;
  children?: { href: string; id: string; label: string }[];
};

const links: NavItem[] = [
  { href: "/admin", id: "admin", label: "Admin", adminOnly: true },
  { href: "/dashboard", id: "dashboard", label: "Dashboard" },
  {
    href: "/desk",
    id: "posting",
    label: "Auto Posting",
    children: [{ href: "/desk/connect", id: "connect", label: "Connect page" }],
  },
  { href: "/video", id: "video", label: "Video Duplicate" },
  { href: "/audio", id: "audio", label: "Text to Speech" },
  { href: "/transactions", id: "transactions", label: "Transactions" },
  { href: "/profile", id: "profile", label: "Profile" },
  { href: "/support", id: "support", label: "Support" },
];

function SideIcon({ id }: { id: string }) {
  const pen = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (id === "dashboard") {
    return <svg {...pen}><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></svg>;
  }
  if (id === "admin") {
    return <svg {...pen}><circle cx="9" cy="8" r="2.4" /><circle cx="16" cy="9" r="2" /><path d="M4.5 18.2c.8-2.4 2.4-3.6 4.5-3.6s3.7 1.2 4.5 3.6M14 14.8c1.4-.5 2.6-.4 3.8.4 1 .7 1.6 1.7 2 3" /></svg>;
  }
  if (id === "posting") {
    return <svg {...pen}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>;
  }
  if (id === "connect") {
    return <svg {...pen}><path d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10 5.93" /><path d="M14 11a5 5 0 0 0-7.07 0L5.52 12.41a5 5 0 0 0 7.07 7.07L14 18.07" /></svg>;
  }
  if (id === "video") {
    return <svg {...pen}><rect x="3" y="6" width="12" height="12" rx="2" /><path d="M15 10.5l6-3v9l-6-3z" /></svg>;
  }
  if (id === "audio") {
    return <svg {...pen}><path d="M11 5 6 9H3v6h3l5 4V5zM15.5 8.5a4 4 0 0 1 0 7M18 6a7 7 0 0 1 0 12" /></svg>;
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
  admin = false,
  credits,
  children,
}: {
  name: string;
  active: string;
  admin?: boolean;
  credits?: ShellCredits;
  children: React.ReactNode;
}) {
  const letter = (name.trim().split(" ")[0] || name).slice(0, 1).toUpperCase();
  const [collapsed, setCollapsed] = useState(true);
  const [narrow, setNarrow] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [balance, setBalance] = useState<ShellCredits | null>(credits || null);

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

  useLayoutEffect(() => {
    const parent = links.find((item) => item.children?.some((child) => child.id === active));
    if (!parent) return;
    setOpenGroups((current) => (current[parent.id] ? current : { ...current, [parent.id]: true }));
  }, [active]);

  useEffect(() => {
    if (credits) {
      setBalance(credits);
      return;
    }
    let live = true;
    fetch("/api/plan")
      .then((response) => response.json())
      .then((payload) => {
        if (!live || !payload?.ok) return;
        setBalance({
          plan: String(payload.plan || "free"),
          name: String(payload.name || "Free"),
          credits: Number(payload.credits) || 0,
          balance: Number(payload.balance) || 0,
        });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [credits]);

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

  function toggleGroup(id: string) {
    setOpenGroups((current) => ({ ...current, [id]: !current[id] }));
  }

  return (
    <div className={collapsed ? "shell collapsed" : "shell"}>
      {narrow && !collapsed ? <button className="side-backdrop" type="button" aria-label="Close menu" onClick={() => setCollapsed(true)} /> : null}
      <aside className="side">
        {balance ? (
          <Link
            className="side-credits"
            href="/pricing"
            title={`${balance.balance.toLocaleString()} credits left · ${balance.name} (${balance.credits.toLocaleString()}/mo)`}
            onClick={closeIfNarrow}
          >
            <span className="side-credits-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="14" height="14">
                <circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
                <path d="M12 8v8M9.5 10.2c.6-1 1.5-1.5 2.5-1.5 1.4 0 2.5.8 2.5 2s-1.1 2-2.5 2h-1.2c-1.4 0-2.5.8-2.5 2s1.1 2 2.5 2c1 0 1.9-.5 2.5-1.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </span>
            <span className="side-credits-copy">
              <span className="side-credits-left">{balance.balance.toLocaleString()} credits left</span>
              <strong>{balance.name}</strong>
            </span>
          </Link>
        ) : null}
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
          {links.filter((item) => !item.adminOnly || admin).map((item) => {
            if (!item.children?.length) {
              return (
                <Link key={item.id} href={item.href} aria-current={active === item.id ? "page" : undefined} title={item.label} onClick={closeIfNarrow}>
                  <SideIcon id={item.id} />
                  <span>{item.label}</span>
                </Link>
              );
            }
            const open = !!openGroups[item.id];
            return (
              <div key={item.id} className={open ? "side-group open" : "side-group"}>
                <div className="side-row">
                  <Link href={item.href} aria-current={active === item.id ? "page" : undefined} title={item.label} onClick={closeIfNarrow}>
                    <SideIcon id={item.id} />
                    <span>{item.label}</span>
                  </Link>
                  <button
                    className="side-fold"
                    type="button"
                    aria-expanded={open}
                    aria-label={open ? `Hide ${item.label} links` : `Show ${item.label} links`}
                    onClick={() => toggleGroup(item.id)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                </div>
                <div className="side-sub">
                  {item.children.map((child) => (
                    <Link key={child.id} href={child.href} aria-current={active === child.id ? "page" : undefined} title={child.label} onClick={closeIfNarrow}>
                      <SideIcon id={child.id} />
                      <span>{child.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="upgrade">
          <span className="crown" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3.5 17.5h17l-1.6-9.2-4.4 3.6L12 5.5 9.5 11.9 5.1 8.3z" />
              <path d="M4.2 17.5h15.6v1.8H4.2z" />
            </svg>
          </span>
          <strong>Upgrade to Pro</strong>
          <p>Unlock more features!</p>
          <Link className="btn solid" href="/pricing" onClick={closeIfNarrow}>Upgrade Now</Link>
        </div>
        <form action={logoutAction}>
          <button className="side-out" type="submit" title={`Log out ${name}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20H10" />
              <path d="M14 8l4 4-4 4" />
              <path d="M10 12h8" />
            </svg>
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
