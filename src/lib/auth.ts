import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { ipLoginLimiter, usernameLoginLimiter, checkLocalRateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

function sanitizeLogInput(input: unknown): string {
  if (typeof input !== "string") return String(input);
  return input.replace(/[\r\n\t]/g, "_");
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username or Phone", type: "text" },
        password: { label: "Password", type: "password" },
        isOtpVerified: { label: "isOtpVerified", type: "text" },
        isGoogleVerified: { label: "isGoogleVerified", type: "text" },
        googleEmail: { label: "googleEmail", type: "text" },
      },
      async authorize(credentials) {
        const isOtp = credentials?.isOtpVerified === "true";
        const isGoogle = credentials?.isGoogleVerified === "true";
        console.log("[NextAuth] authorize called with username:", sanitizeLogInput(credentials?.username), "isOtp:", isOtp, "isGoogle:", isGoogle);

        // --- Google Sign-in fast path ---
        if (isGoogle) {
          const googleEmail = credentials?.googleEmail?.trim()?.toLowerCase();
          if (!googleEmail) {
            console.log("[NextAuth] Google login missing email");
            return null;
          }

          const user = await db.user.findFirst({
            where: { email: googleEmail },
            include: {
              memberships: {
                where: { isActive: true },
                include: {
                  business: { select: { id: true, name: true, isActive: true } },
                },
                take: 1,
              },
            },
          });

          if (!user || !user.isActive) {
            console.log("[NextAuth] Google user not found or inactive:", sanitizeLogInput(googleEmail));
            throw new Error("এই Google অ্যাকাউন্ট দিয়ে কোনো POS অ্যাকাউন্ট পাওয়া যায়নি। প্রথমে নিবন্ধন করুন। (No account found with this Google email)");
          }

          const primaryMembership = user.memberships[0];
          console.log("[NextAuth] Google login successful:", sanitizeLogInput(user.username));
          return {
            id: user.id,
            name: user.name,
            username: user.username,
            email: user.email || undefined,
            role: primaryMembership?.role as "OWNER" | "ADMIN" | "MANAGER" | "CASHIER" | "VIEWER" | undefined,
            businessId: primaryMembership?.business?.id,
            businessName: primaryMembership?.business?.name,
            requiresPasswordChange: user.requiresPasswordChange,
          };
        }
        // --- End Google fast path ---

        if (!credentials?.username) {
          console.log("[NextAuth] missing username / phone");
          return null;
        }

        if (!isOtp && !credentials?.password) {
          console.log("[NextAuth] missing password for password login");
          return null;
        }

        const reqHeaders = await headers();
        const rawRealIp = reqHeaders.get("x-real-ip")?.trim();
        const rawForwardedFor = reqHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
        const ip = rawRealIp || rawForwardedFor || "127.0.0.1";

        // Rate limit by IP
        if (ipLoginLimiter) {
          const { success } = await ipLoginLimiter.limit(ip);
          if (!success) {
            console.log("[NextAuth] rate limit exceeded for IP:", sanitizeLogInput(ip));
            throw new Error("Too many login attempts from this IP. Please try again in a minute.");
          }
        } else {
          const { success } = await checkLocalRateLimit(`login:ip:${ip}`, 10, 60000);
          if (!success) {
            console.log("[NextAuth] rate limit exceeded (local) for IP:", sanitizeLogInput(ip));
            throw new Error("Too many login attempts. Please try again in a minute.");
          }
        }

        // Rate limit by username/phone
        if (usernameLoginLimiter) {
          const { success } = await usernameLoginLimiter.limit(credentials.username);
          if (!success) {
            console.log("[NextAuth] rate limit exceeded for username:", sanitizeLogInput(credentials.username));
            throw new Error("Too many login attempts for this account. Please try again in a minute.");
          }
        } else {
          const { success } = await checkLocalRateLimit(`login:username:${credentials.username}`, 5, 60000);
          if (!success) {
            console.log("[NextAuth] rate limit exceeded (local) for username:", sanitizeLogInput(credentials.username));
            throw new Error("Too many login attempts for this account. Please try again in a minute.");
          }
        }

        // Normalize phone number search
        const cleanInput = credentials.username.trim();
        const digitsOnly = cleanInput.replace(/\D/g, "");
        const last10Digits = digitsOnly.slice(-10);

        // Find user by username OR phone (multi-tenant: one global identity)
        const user = await db.user.findFirst({
          where: {
            OR: [
              { email: cleanInput.toLowerCase() },
              { username: cleanInput },
              { username: cleanInput.toLowerCase() },
              { phone: cleanInput },
              ...(last10Digits.length >= 10 ? [
                { phone: { contains: last10Digits } }
              ] : []),
            ],
          },
          include: {
            memberships: {
              where: { isActive: true },
              include: {
                business: {
                  select: { id: true, name: true, isActive: true },
                },
              },
              take: 1,
            },
          },
        });

        if (!user) {
          console.log("[NextAuth] user not found in DB");
          if (isOtp) {
            throw new Error("এই ফোন নম্বর দিয়ে কোনো অ্যাকাউন্ট পাওয়া যায়নি। অনুগ্রহ করে আগে নতুন অ্যাকাউন্ট খুলুন। (No account found with this phone number)");
          }
          return null;
        }

        if (!user.isActive) {
          console.log("[NextAuth] user is not active");
          return null;
        }

        if (user.lockedUntil && user.lockedUntil > new Date()) {
          console.log("[NextAuth] account is locked");
          throw new Error("Account locked due to too many failed login attempts. Please try again later.");
        }

        // If not OTP, verify password against passwordHash
        if (!isOtp) {
          const isPasswordValid = await bcrypt.compare(
            credentials.password!,
            user.passwordHash
          );

          if (!isPasswordValid) {
            console.log("[NextAuth] invalid password");
            const newFailedAttempts = user.failedLoginAttempts + 1;
            const updates: { failedLoginAttempts: number; lockedUntil?: Date } = { failedLoginAttempts: newFailedAttempts };
            if (newFailedAttempts >= 5) {
              updates.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
            }
            await db.user.update({
              where: { id: user.id },
              data: updates
            });
            return null;
          }
        }

        console.log("[NextAuth] login successful for user:", sanitizeLogInput(user.username));
        if (user.failedLoginAttempts > 0 || user.lockedUntil) {
          await db.user.update({
            where: { id: user.id },
            data: { failedLoginAttempts: 0, lockedUntil: null }
          });
        }

        // Resolve primary business from membership
        const primaryMembership = user.memberships[0];
        const businessId = primaryMembership?.business?.id;
        const businessName = primaryMembership?.business?.name;
        const role = primaryMembership?.role;

        // Audit: log successful login (fire-and-forget, non-blocking)
        logAudit({
          businessId: businessId,
          userId: user.id,
          action: 'LOGIN',
          entityType: 'User',
          entityId: user.id,
          details: {
            username: user.username,
            loginMethod: isOtp ? 'otp' : 'password',
            ip,
          },
        }).catch(() => { /* non-blocking */ });

        return {
          id: user.id,
          name: user.name,
          username: user.username,
          email: user.email || undefined,
          role: role as "OWNER" | "ADMIN" | "MANAGER" | "CASHIER" | "VIEWER" | undefined,
          businessId: businessId,
          businessName: businessName,
          requiresPasswordChange: user.requiresPasswordChange,
        };
      }
    })
  ],
  session: {
    strategy: "jwt",
    maxAge: 10 * 365 * 24 * 60 * 60, // 10 years for persistent login
  },
  callbacks: {
    async jwt({ token, user, trigger, session: updateSession }) {
      // Initial sign-in: populate token from user object
      if (user) {
        const u = user as {
          id?: string;
          name?: string | null;
          username?: string;
          role?: "OWNER" | "ADMIN" | "MANAGER" | "CASHIER" | "VIEWER";
          email?: string | null;
          businessId?: string;
          businessName?: string;
          requiresPasswordChange?: boolean;
        };
        token.id = u.id;
        token.name = u.name;
        token.username = u.username;
        token.role = u.role;
        token.email = u.email ?? undefined;
        token.businessId = u.businessId;
        token.businessName = u.businessName;
        token.requiresPasswordChange = u.requiresPasswordChange;
      }

      // Business switch: client can only REQUEST a businessId change.
      // role and businessName MUST be resolved server-side from DB —
      // never trust client-supplied values to prevent privilege escalation.
      if (trigger === "update" && updateSession?.businessId) {
        try {
          const membership = await db.membership.findFirst({
            where: {
              userId: token.id as string,
              businessId: updateSession.businessId,
              isActive: true,
              business: { isActive: true },
            },
            include: {
              business: { select: { id: true, name: true } },
            },
          });
          if (membership) {
            // Only update token if the user truly has an active membership in that business
            token.businessId = membership.business.id;
            token.businessName = membership.business.name;
            token.role = membership.role; // DB-resolved, never client-provided
          }
          // If membership not found or business inactive: silently ignore — token stays unchanged.
          // This prevents cross-business session injection attacks.
        } catch (err) {
          console.error("[NextAuth] Business switch DB lookup failed:", err);
          // Keep existing token values; do not crash the session
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.name = (token.name as string) || session.user.name;
        session.user.username = token.username as string;
        session.user.role = token.role as "OWNER" | "ADMIN" | "MANAGER" | "CASHIER" | "VIEWER";
        session.user.email = (token.email as string) || session.user.email;
        session.user.businessId = token.businessId as string;
        session.user.businessName = token.businessName as string;
        session.user.requiresPasswordChange = token.requiresPasswordChange as boolean;
      }
      return session;
    }
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
};

if (!authOptions.secret && process.env.NEXT_PHASE !== 'phase-production-build' && process.env.NODE_ENV !== 'test') {
  throw new Error("NEXTAUTH_SECRET is not defined. Please set it in your environment variables.");
}
