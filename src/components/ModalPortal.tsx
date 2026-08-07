"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Rend les modals dans document.body (évite les ancêtres transform/filter). */
export function ModalPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return createPortal(children, document.body);
}
