"use client";

import { useEffect } from "react";
import { SessionProvider as NextAuthSessionProvider, useSession } from "next-auth/react";
import { writeStoredSessionUser } from "@/lib/session-utils";

function SessionStateSync() {
  const { data: session } = useSession();

  useEffect(() => {
    if (!session?.user) {
      writeStoredSessionUser(null);
      return;
    }

    writeStoredSessionUser({
      id: (session.user as any).id,
      name: session.user.name || undefined,
      username: (session.user as any).username || undefined,
      email: session.user.email || undefined,
      role: (session.user as any).role,
      requiresPasswordChange: session.user.requiresPasswordChange as boolean | undefined,
    });
  }, [session]);

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
