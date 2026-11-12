"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

export function ActionMenu({
  label,
  disabled,
  actions,
}: {
  label: string;
  disabled?: boolean;
  actions: { label: string; disabled?: boolean; onSelect: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return (
    <div
      className="photo-menu"
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setOpen(false);
          ref.current?.querySelector("button")?.focus();
        }
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <button
        className="appbar-btn"
        aria-label={label}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        <Icon name="more" />
      </button>
      {open && (
        <div className="photo-menu-options">
          {actions.map((action) => (
            <button
              key={action.label}
              disabled={disabled || action.disabled}
              onClick={() => {
                setOpen(false);
                ref.current?.querySelector("button")?.focus();
                action.onSelect();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
