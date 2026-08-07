"use client";

import { useState } from "react";
import { hiResAvatarUrl, initialsFromName } from "@/lib/avatars";

const SIZE_CLASS = {
  xs: "size-5 text-[9px]",
  sm: "size-6 text-[10px]",
  md: "size-8 text-xs",
  lg: "size-10 text-sm",
  xl: "size-14 text-base",
} as const;

const SIZE_PX: Record<keyof typeof SIZE_CLASS, number> = {
  xs: 20,
  sm: 24,
  md: 32,
  lg: 40,
  xl: 56,
};

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
  const px = SIZE_PX[size];
  const initials = initialsFromName(name || "?");
  const original = avatarUrl?.trim() || "";

  if (!original) {
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

  return (
    <AvatarImage
      key={`${original}:${px}`}
      name={name}
      original={original}
      px={px}
      className={`shrink-0 rounded-full object-cover ring-1 ring-[var(--line)] ${dim} ${className}`}
    />
  );
}

function AvatarImage({
  name,
  original,
  px,
  className,
}: {
  name: string;
  original: string;
  px: number;
  className: string;
}) {
  const preferred = hiResAvatarUrl(original, px) || original;
  const [src, setSrc] = useState(preferred);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      title={name}
      width={px}
      height={px}
      className={className}
      referrerPolicy="no-referrer"
      decoding="async"
      onError={() => {
        if (src !== original) setSrc(original);
      }}
    />
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
