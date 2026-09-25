import { NextRequest, NextResponse } from "next/server";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireBusinessContext, checkPermission, type BusinessContext } from "@/lib/tenant";
import type { BusinessRole } from "@prisma/client";

export type AuthUser = NonNullable<Session["user"]>;

export type AuthContext = {
  session: Session;
  user: AuthUser;
};

export type TenantContext = {
  session: Session;
  user: AuthUser;
  business: BusinessContext["business"];
  membership: BusinessContext["membership"];
  role: BusinessRole;
  permissions: string[];
};

export type RouteContext = {
  params: Promise<Record<string, string>>;
  auth?: AuthContext;
  tenant?: TenantContext;
  [key: string]: unknown;
};

type RouteHandler = (request: NextRequest, ctx: RouteContext) => Promise<NextResponse>;

type AuthResult =
  | { authorized: true; response: null; session: Session }
  | { authorized: false; response: NextResponse; session?: undefined };

/**
 * Middleware to check if request is authorized (has valid session)
 */
export async function requireAuth(request: NextRequest): Promise<AuthResult> {
  // CSRF Protection Check for state-changing methods
  if (["POST", "PUT", "DELETE", "PATCH"].includes(request.method)) {
    const origin = request.headers.get("origin");
    const rawHost = request.headers.get("host");
    const forwardedHost = request.headers.get("x-forwarded-host");
    const secFetchSite = request.headers.get("sec-fetch-site");

    const defaultAllowedOrigins = [
      "https://pos.onuron.org",
      "https://lakhanb.vercel.app",
      "http://localhost:3000",
      "http://localhost",
      "https://localhost",
      "capacitor://localhost",
    ];

    const envOrigins = (process.env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);

    const allAllowedOrigins = [...defaultAllowedOrigins, ...envOrigins];

    if (origin) {
      try {
        const originUrl = new URL(origin);
        const originHost = originUrl.host;

        // Same-origin check: matches host or forwarded host (Cloudflare proxy / Vercel)
        const isSameOrigin =
          originHost === rawHost ||
          originHost === forwardedHost ||
          originHost.endsWith(".onuron.org") ||
          originHost.endsWith(".vercel.app");

        // Mobile Capacitor / Ionic or explicitly configured origins
        const isAllowedOrigin =
          isSameOrigin ||
          allAllowedOrigins.includes(origin) ||
          allAllowedOrigins.some((ao) => origin.startsWith(ao)) ||
          origin.startsWith("capacitor://") ||
          origin.startsWith("ionic://") ||
          originUrl.hostname === "localhost" ||
          originUrl.hostname === "127.0.0.1";

        if (!isAllowedOrigin) {
          console.warn("[CSRF] Blocked origin:", origin, "rawHost:", rawHost, "forwardedHost:", forwardedHost);
          return {
            authorized: false,
            response: NextResponse.json({ error: "Forbidden: CSRF check failed" }, { status: 403 }),
          };
        }
      } catch {
        return {
          authorized: false,
          response: NextResponse.json({ error: "Forbidden: Invalid origin" }, { status: 403 }),
        };
      }
    } else if (process.env.NODE_ENV === "production" && secFetchSite === "cross-site") {
      return {
        authorized: false,
        response: NextResponse.json({ error: "Forbidden: CSRF check failed" }, { status: 403 }),
      };
    }
  }

  const session = await getServerSession(authOptions);
  if (!session) {
    return {
      authorized: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { authorized: true, response: null, session };
}

const PERMISSION_ACTION_LABELS: Record<string, string> = {
  "sales.create": "বিক্রি তৈরি",
  "sales.view": "বিক্রির তথ্য দেখা",
  "sales.edit": "বিক্রি সম্পাদনা",
  "sales.cancel": "বিক্রি বাতিল",
  "sales.refund": "রিফান্ড",
  "stock.create": "স্টক যোগ",
  "stock.edit": "স্টক সম্পাদনা",
  "products.create": "পণ্য তৈরি",
  "products.edit": "পণ্য সম্পাদনা",
  "products.update": "পণ্য সম্পাদনা",
  "products.delete": "পণ্য মুছে ফেলা",
  "customers.create": "কাস্টমার যোগ",
  "customers.update": "কাস্টমার সম্পাদনা",
  "customers.delete": "কাস্টমার মুছে ফেলা",
  "reports.view": "রিপোর্ট দেখা",
  "reports.export": "রিপোর্ট export",
  "settings.update": "সেটিং পরিবর্তন",
  "users.invite": "কর্মী আমন্ত্রণ",
  "users.remove": "কর্মী সরানো",
  "users.change_role": "ভূমিকা পরিবর্তন",
};

/**
 * Middleware to check if user has specific permission based on BusinessRole.
 * Pass an existing session to avoid a second getServerSession call.
 */
export async function requirePermission(
  request: NextRequest,
  permissionCode: string,
  existingSession?: Session | null
) {
  let session = existingSession ?? null;
  if (!session) {
    const authResult = await requireAuth(request);
    if (!authResult.authorized) {
      return authResult.response;
    }
    session = authResult.session;
  }

  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  // Use tenant context to check permission
  const context = await requireBusinessContext();
  if (context instanceof NextResponse) return context;

  const denied = checkPermission(context, permissionCode);
  if (denied) {
    const actionLabel = PERMISSION_ACTION_LABELS[permissionCode] || permissionCode;
    return NextResponse.json(
      { error: `আপনার "${actionLabel}" করার অনুমতি নেই।` },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Middleware to check if user has specific role.
 * Uses requireBusinessContext() to get the DB-verified role,
 * NOT session.user.role which can be stale (JWT token).
 */
export async function requireRole(
  request: NextRequest,
  allowedRoles: string[],
  existingSession?: Session | null
) {
  if (!existingSession) {
    const authResult = await requireAuth(request);
    if (!authResult.authorized) {
      return authResult.response;
    }
  }

  // Always resolve role from DB, not from JWT session which may be stale
  const businessContext = await requireBusinessContext();
  if (businessContext instanceof NextResponse) return businessContext;

  if (!allowedRoles.includes(businessContext.role)) {
    return NextResponse.json(
      { error: "আপনার এই কাজ করার অনুমতি নেই।" },
      { status: 403 }
    );
  }

  return null;
}

/**
 * Helper to get authenticated user from request.
 */
export async function getAuthenticatedUser(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return null;
  }
  return session.user;
}

/**
 * Wrap a route handler with session fetch + optional RBAC checks.
 * Auth is passed as `ctx.auth` so handlers do not call getServerSession again.
 */
export function withAuthMiddleware(
  handler: RouteHandler,
  options?: { permissionCode?: string; allowedRoles?: string[] }
): RouteHandler {
  return async (request: NextRequest, ctx: RouteContext = { params: Promise.resolve({}) }) => {
    const authResult = await requireAuth(request);
    if (!authResult.authorized) return authResult.response;

    const session = authResult.session;
    const user = session.user;
    if (!user?.id) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    if (options?.allowedRoles) {
      const roleError = await requireRole(request, options.allowedRoles, session);
      if (roleError) return roleError;
    }

    if (options?.permissionCode) {
      const permissionError = await requirePermission(
        request,
        options.permissionCode,
        session
      );
      if (permissionError) return permissionError;
    }

    return handler(request, {
      ...ctx,
      auth: { session, user },
    });
  };
}

/**
 * Wrap a route handler with full multi-tenant business context.
 * Resolves: session → user → membership → business → role → permissions
 *
 * Use this for ALL routes that need tenant-scoped data access.
 */
export function withBusinessContext(
  handler: (request: NextRequest, ctx: RouteContext & { tenant: TenantContext }) => Promise<NextResponse>,
  options?: { permissionCode?: string; roles?: BusinessRole[] }
): RouteHandler {
  return async (request: NextRequest, ctx: RouteContext = { params: Promise.resolve({}) }) => {
    // 1. Check CSRF + session
    const authResult = await requireAuth(request);
    if (!authResult.authorized) return authResult.response;

    const session = authResult.session;
    const user = session.user;
    if (!user?.id) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    // 2. Resolve business context (server-side, trusted)
    const businessContext = await requireBusinessContext();
    if (businessContext instanceof NextResponse) return businessContext;

    // 3. Optional: check required role
    if (options?.roles && !options.roles.includes(businessContext.role)) {
      return NextResponse.json(
        { error: "Insufficient role for this action", required: options.roles, current: businessContext.role },
        { status: 403 }
      );
    }

    // 4. Optional: check required permission
    if (options?.permissionCode) {
      const denied = checkPermission(businessContext, options.permissionCode);
      if (denied) return denied;
    }

    const tenantCtx: TenantContext = {
      session,
      user,
      business: businessContext.business,
      membership: businessContext.membership,
      role: businessContext.role,
      permissions: businessContext.permissions,
    };

    return handler(request, { ...ctx, tenant: tenantCtx });
  };
}
