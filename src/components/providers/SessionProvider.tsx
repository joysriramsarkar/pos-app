"use client";

import { useEffect } from "react";
import { SessionProvider as NextAuthSessionProvider, useSession } from "next-auth/react";
import { writeStoredSessionUser } from "@/lib/session-utils";
import { getActiveScope, setActiveScope } from "@/lib/tenant-scope";
import { useCartStore, useQuantityUsageStore, useProductUsageStore } from "@/stores/pos-store";
import { useSettingsStore } from "@/stores/settings-store";

function SessionStateSync() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "loading") return;

    if (!session?.user) {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        writeStoredSessionUser(null);
      }
      return;
    }

    writeStoredSessionUser({
      id: (session.user as any).id,
      name: session.user.name || undefined,
      username: (session.user as any).username || undefined,
      email: session.user.email || undefined,
      role: (session.user as any).role,
      businessId: (session.user as any).businessId || undefined,
      businessName: (session.user as any).businessName || undefined,
      requiresPasswordChange: false,
    });
  }, [session, status]);

  // Keep tenant-scoped browser stores aligned with the authenticated business.
  // Switching business (which reloads the app) re-hydrates each store from its
  // own namespaced key so one tenant's cart/settings never leak into another.
  useEffect(() => {
    if (status === "loading") return;

    const user = session?.user as { id?: string; businessId?: string } | undefined;
    const previousScope = getActiveScope();
    const nextScope = setActiveScope(user?.businessId, user?.id);

    if (previousScope !== nextScope) {
      useCartStore.persist.rehydrate();
      useSettingsStore.persist.rehydrate();
      useQuantityUsageStore.persist.rehydrate();
      useProductUsageStore.persist.rehydrate();
    }
  }, [session, status]);

  return null;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextAuthSessionProvider>
      <SessionStateSync />
      {children}
    </NextAuthSessionProvider>
  );
}
