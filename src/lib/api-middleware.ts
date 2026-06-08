import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

/**
 * Middleware to check if request is authorized (has valid session)
 */
export async function requireAuth(request: NextRequest) {
  // CSRF Protection Check
  if (["POST", "PUT", "DELETE", "PATCH"].includes(request.method)) {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host") || request.headers.get("x-forwarded-host");

    // In production or when origin is present, ensure they match to prevent CSRF
    if (origin && host) {
      try {
        const originUrl = new URL(origin);
        if (originUrl.host !== host) {
          return {
            authorized: false,
            response: NextResponse.json({ error: "Forbidden: CSRF check failed" }, { status: 403 }),
          };
        }
      } catch (e) {
        // Invalid origin URL
        return {
          authorized: false,
          response: NextResponse.json({ error: "Forbidden: Invalid origin" }, { status: 403 }),
        };
      }
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

/**
 * Middleware to check if user has specific permission
 */
export async function requirePermission(
  request: NextRequest,
  permissionCode: string
) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) {
    return authResult.response;
  }

  const session = authResult.session;
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  const { hasPermission } = await import("@/lib/permissions");
  const hasAccess = await hasPermission(userId, permissionCode);
  if (!hasAccess) {
    const actionMap: Record<string, string> = {
      'sales.create': 'বিক্রি তৈরি',
      'sales.view': 'বিক্রির তথ্য দেখা',
      'sales.edit': 'বিক্রি সম্পাদনা',
      'stock.create': 'স্টক যোগ',
      'stock.edit': 'স্টক সম্পাদনা',
      'products.create': 'পণ্য তৈরি',
      'products.edit': 'পণ্য সম্পাদনা',
      'products.delete': 'পণ্য মুছে ফেলা',
    };
    const actionLabel = actionMap[permissionCode] || permissionCode;
    return NextResponse.json(
      { error: `আপনার "${actionLabel}" করার অনুমতি নেই।` },
      { status: 403 }
    );
  }

  return null; // null means authorized
}

/**
 * Middleware to check if user has specific role
 */
export async function requireRole(
  request: NextRequest,
  allowedRoles: string[]
) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) {
    return authResult.response;
  }

  const session = authResult.session;
  const userRole = session?.user?.role;

  if (!userRole || !allowedRoles.includes(userRole)) {
    return NextResponse.json(
      { error: "আপনার এই কাজ করার অনুমতি নেই।" },
      { status: 403 }
    );
  }

  return null; // null means authorized
}

/**
 * Helper to get authenticated user from request
 */
export async function getAuthenticatedUser(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return null;
  }
  return session.user;
}

type RouteHandler = (request: NextRequest, ctx: any) => Promise<NextResponse>;

export function withAuthMiddleware(
  handler: RouteHandler,
  options?: { permissionCode?: string; allowedRoles?: string[] }
): RouteHandler {
  return async (request: NextRequest, ctx: any) => {
    const authResult = await requireAuth(request);
    if (!authResult.authorized) return authResult.response!;

    if (options?.allowedRoles) {
      const roleError = await requireRole(request, options.allowedRoles);
      if (roleError) return roleError;
    }

    if (options?.permissionCode) {
      const permissionError = await requirePermission(request, options.permissionCode);
      if (permissionError) return permissionError;
    }

    return handler(request, ctx);
  };
}
