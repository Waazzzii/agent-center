"use client";

import { useEffect } from "react";
import type { ProductUser } from "@/types/api.types";
import { useAuthStore } from "@/stores/auth.store";

/**
 * Hydrates the client-side auth store with the server-resolved session.
 * Mounted once in the root layout so every consumer of useAuthStore sees
 * the user without a network round-trip.
 */
export function SessionProvider({
  session,
  children,
}: {
  session: ProductUser | null;
  children: React.ReactNode;
}) {
  // Seed the store immediately so the first client render has the user.
  // setState is a plain function and safe to call during module init / render.
  useAuthStore.setState({ admin: session, hydrated: true });

  useEffect(() => {
    useAuthStore.setState({ admin: session, hydrated: true });
  }, [session]);

  return <>{children}</>;
}
