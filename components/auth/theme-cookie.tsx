"use client";

import { useEffect } from "react";

/**
 * Remembers this center's current light/dark in a cookie its server can read,
 * so /auth/login can ask the shared sign-in site to match it. Reads the class
 * on <html> (how every theme setup here marks dark) and follows changes.
 */
export function ThemeCookie({ fallback }: { fallback?: "light" | "dark" }) {
  useEffect(() => {
    const root = document.documentElement;
    const write = () => {
      const theme = root.classList.contains("dark")
        ? "dark"
        : root.classList.contains("light")
          ? "light"
          : (fallback ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
      document.cookie = `center_theme=${theme}; path=/; max-age=31536000; SameSite=Lax`;
    };
    write();
    const observer = new MutationObserver(write);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [fallback]);
  return null;
}
