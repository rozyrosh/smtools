"use client";

import { ReactNode, useEffect, useId, useRef, useState } from "react";

export type ChipOption = { value: string; label: string };

type ChipSelectProps = {
  name: string;
  label: string;
  icon?: ReactNode;
  options: ChipOption[];
  value?: string;
  defaultValue?: string;
  disabled?: boolean;
  className?: string;
  onChange?: (value: string) => void;
};

export function ChipSelect({
  name,
  label,
  icon,
  options,
  value,
  defaultValue,
  disabled,
  className,
  onChange,
}: ChipSelectProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const first = options[0]?.value || "";
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [current, setCurrent] = useState(value ?? defaultValue ?? first);

  useEffect(() => {
    if (value !== undefined) setCurrent(value);
  }, [value]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    if (!proto?.get || !proto?.set) return;
    Object.defineProperty(input, "value", {
      configurable: true,
      enumerable: true,
      get() {
        return proto.get!.call(this);
      },
      set(next: string) {
        proto.set!.call(this, next);
        setCurrent(String(next));
      },
    });
    proto.set.call(input, current);
    return () => {
      Object.defineProperty(input, "value", {
        configurable: true,
        enumerable: true,
        writable: true,
        value: current,
      });
    };
  }, []);

  useEffect(() => {
    if (inputRef.current && inputRef.current.value !== current) {
      const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
      proto?.set?.call(inputRef.current, current);
    }
  }, [current]);

  useEffect(() => {
    if (!open) return;
    function placeMenu() {
      const root = rootRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      const roomBelow = window.innerHeight - rect.bottom;
      const roomAbove = rect.top;
      const need = Math.min(260, options.length * 46 + 24);
      setDropUp(roomBelow < need && roomAbove > roomBelow);
    }
    placeMenu();
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", placeMenu, true);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", placeMenu, true);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, options.length]);

  const selected = options.find((item) => item.value === current) || options[0];

  function pick(next: string) {
    setCurrent(next);
    setOpen(false);
    onChange?.(next);
  }

  return (
    <div
      ref={rootRef}
      className={["select-chip chip-select", open ? "open" : "", className || ""].filter(Boolean).join(" ")}
    >
      <input ref={inputRef} type="hidden" name={name} defaultValue={current} />
      {icon ? <span className="select-chip-ico" aria-hidden="true">{icon}</span> : null}
      <button
        className="chip-select-trigger"
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="select-chip-meta">
          <small>{label}</small>
          <strong>{selected?.label || current}</strong>
        </span>
        <span className="chip-select-caret" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="14" height="14">
            <path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {open ? (
        <ul className={dropUp ? "chip-menu drop-up" : "chip-menu"} id={listId} role="listbox" aria-label={label}>
          {options.map((item) => {
            const active = item.value === current;
            return (
              <li key={item.value} role="option" aria-selected={active}>
                <button
                  className={active ? "chip-option on" : "chip-option"}
                  type="button"
                  onClick={() => pick(item.value)}
                >
                  <span>{item.label}</span>
                  {active ? (
                    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                      <path d="M5 12.5l4 4L19 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
