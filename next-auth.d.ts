import type { DefaultSession, DefaultUser } from "next-auth";
import type { BusinessRole } from "@prisma/client";

declare module "next-auth" {
  interface User extends DefaultUser {
    id: string;
    username?: string;
    role?: BusinessRole;
    businessId?: string;
    businessName?: string;
    requiresPasswordChange?: boolean;
  }

  interface Session {
    user: {
      id: string;
      username?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role?: BusinessRole;
      businessId?: string;
      businessName?: string;
      requiresPasswordChange?: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    username?: string;
    role?: BusinessRole;
    businessId?: string;
    businessName?: string;
    requiresPasswordChange?: boolean;
  }
}
