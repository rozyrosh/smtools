"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { logoutAction } from "@/server/auth";

export function AccountMenu({ letter }: { letter: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent) {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="account-menu" ref={box}>
      <button className="avatar" type="button" aria-expanded={open} aria-haspopup="menu" aria-label="Account" onClick={() => setOpen((value) => !value)}>
        {letter}
      </button>
      {open ? (
        <div className="account-pop" role="menu">
          <Link href="/profile" role="menuitem">Profile</Link>
          <form action={logoutAction}>
            <button type="submit" role="menuitem">Log out</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
