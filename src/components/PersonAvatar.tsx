"use client";

import { initialsFromName } from "@/lib/avatars";

const SIZE_CLASS = {
  xs: "size-5 text-[9px]",
  sm: "size-6 text-[10px]",
  md: "size-8 text-xs",
  lg: "size-10 text-sm",
} as const;

export function PersonAvatar({
  name,
  avatarUrl,
  size = "sm",
  className = "",
}: {
  name: string;
  avatarUrl?: string | null;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
}) {
  const dim = SIZE_CLASS[size];
  const initials = initialsFromName(name || "?");

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        title={name}
        width={size === "lg" ? 40 : size === "md" ? 32 : size === "sm" ? 24 : 20}
        height={size === "lg" ? 40 : size === "md" ? 32 : size === "sm" ? 24 : 20}
        className={`shrink-0 rounded-full object-cover ring-1 ring-[var(--line)] ${dim} ${className}`}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <span
      title={name}
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--wash)] font-medium text-[var(--ink-soft)] ring-1 ring-[var(--line)] ${dim} ${className}`}
    >
      {initials}
    </span>
  );
}

export function PersonLabel({
  name,
  avatarUrl,
  size = "sm",
  className = "",
}: {
  name: string;
  avatarUrl?: string | null;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
}) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-2 ${className}`}>
      <PersonAvatar name={name} avatarUrl={avatarUrl} size={size} />
      <span className="truncate">{name}</span>
    </span>
  );
}
