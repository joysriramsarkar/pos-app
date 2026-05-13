import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";


export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        console.log("[NextAuth] authorize called with username:", credentials?.username);
        if (!credentials?.username || !credentials?.password) {
          console.log("[NextAuth] missing credentials");
          return null;
        }

        const user = await db.user.findUnique({
          where: {
            username: credentials.username
          }
        });

        if (!user) {
          console.log("[NextAuth] user not found in DB");
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

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.password
        );

        if (!isPasswordValid) {
          console.log("[NextAuth] invalid password");
          const newFailedAttempts = user.failedLoginAttempts + 1;
          const updates: any = { failedLoginAttempts: newFailedAttempts };
          if (newFailedAttempts >= 5) {
            updates.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
          }
          await db.user.update({
            where: { id: user.id },
            data: updates
          });
          return null;
        }

        console.log("[NextAuth] login successful for user:", user.username);
        if (user.failedLoginAttempts > 0 || user.lockedUntil) {
          await db.user.update({
            where: { id: user.id },
            data: { failedLoginAttempts: 0, lockedUntil: null }
          });
        }

        return {
          id: user.id,
          name: user.name,
          username: user.username,
          email: user.email || undefined,
          role: user.role as "ADMIN" | "MANAGER" | "CASHIER" | "VIEWER",
          requiresPasswordChange: user.requiresPasswordChange,
        };
      }
    })
  ],
  session: {
    strategy: "jwt"
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.role = user.role;
        token.email = user.email;
        token.requiresPasswordChange = user.requiresPasswordChange;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.username = token.username as string;
        session.user.role = token.role as "ADMIN" | "MANAGER" | "CASHIER" | "VIEWER";
        session.user.email = (token.email as string) || undefined;
        session.user.requiresPasswordChange = token.requiresPasswordChange as boolean;
      }
      return session;
    }
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: true,
};

if (!authOptions.secret && process.env.NEXT_PHASE !== 'phase-production-build') {
  throw new Error("NEXTAUTH_SECRET is not defined. Please set it in your environment variables.");
}

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
