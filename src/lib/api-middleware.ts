import { NextRequest, NextResponse } from "next/server";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/auth";

export type AuthUser = NonNullable<Session["user"]>;

export type AuthContext = {
  session: Session;
  user: AuthUser;
};

export type RouteContext = {
  params: Promise<Record<string, string>>;
  auth?: AuthContext;
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
    const host = request.headers.get("host") || request.headers.get("x-forwarded-host");
    const secFetchSite = request.headers.get("sec-fetch-site");

    // Explicit cross-site browser requests are always rejected
    if (secFetchSite === "cross-site") {
      return {
        authorized: false,
        response: NextResponse.json({ error: "Forbidden: CSRF check failed" }, { status: 403 }),
      };
    }

    if (origin && host) {
      try {
        const originUrl = new URL(origin);
        if (originUrl.host !== host) {
          // Capacitor / custom schemes (capacitor://, ionic://, http://localhost on device) may differ
          const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
            .split(",")
            .map((o) => o.trim())
            .filter(Boolean);
          const originAllowed =
            allowedOrigins.includes(origin) ||
            origin.startsWith("capacitor://") ||
            origin.startsWith("ionic://");
          if (!originAllowed) {
            return {
              authorized: false,
              response: NextResponse.json({ error: "Forbidden: CSRF check failed" }, { status: 403 }),
            };
          }
        }
      } catch {
        return {
          authorized: false,
          response: NextResponse.json({ error: "Forbidden: Invalid origin" }, { status: 403 }),
        };
      }
    } else if (process.env.NODE_ENV === "production" && !origin && secFetchSite === "cross-site") {
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

  if (session.user?.requiresPasswordChange) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Password change required", requiresPasswordChange: true },
        { status: 403 }
      ),
    };
  }

  return { authorized: true, response: null, session };
}

const PERMISSION_ACTION_LABELS: Record<string, string> = {
  "sales.create": "বিক্রি তৈরি",
  "sales.view": "বিক্রির তথ্য দেখা",
  "sales.edit": "বিক্রি সম্পাদনা",
  "stock.create": "স্টক যোগ",
  "stock.edit": "স্টক সম্পাদনা",
  "products.create": "পণ্য তৈরি",
  "products.edit": "পণ্য সম্পাদনা",
  "products.delete": "পণ্য মুছে ফেলা",
};

async function denyUnlessPermission(
  userId: string,
  permissionCode: string
): Promise<NextResponse | null> {
  const { hasPermission } = await import("@/lib/permissions");
  const hasAccess = await hasPermission(userId, permissionCode);
  if (!hasAccess) {
    const actionLabel = PERMISSION_ACTION_LABELS[permissionCode] || permissionCode;
    return NextResponse.json(
      { error: `আপনার "${actionLabel}" করার অনুমতি নেই।` },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Middleware to check if user has specific permission.
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

  return denyUnlessPermission(userId, permissionCode);
}

/**
 * Middleware to check if user has specific role.
 * Pass an existing session to avoid a second getServerSession call.
 */
export async function requireRole(
  request: NextRequest,
  allowedRoles: string[],
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

  const userRole = session?.user?.role;
  if (!userRole || !allowedRoles.includes(userRole)) {
    return NextResponse.json(
      { error: "আপনার এই কাজ করার অনুমতি নেই।" },
      { status: 403 }
    );
  }

  return null;
}

/**
 * Helper to get authenticated user from request.
 * Prefer `ctx.auth.user` from withAuthMiddleware when available.
 */
export async function getAuthenticatedUser(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return null;
  }
  return session.user;
}

/**
 * Wrap a route handler with a single session fetch + optional RBAC checks.
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
