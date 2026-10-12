import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    // MP-38: bound inputs on this public, unauthenticated route.
    const lens = (v: unknown) => (typeof v === "string" ? v.length : 0);
    const { fullName, identifier, businessName, role, deletionType, reason, confirmed } = body || {};
    if (
      lens(fullName) > 200 || lens(identifier) > 200 || lens(businessName) > 200 ||
      lens(role) > 50 || lens(deletionType) > 50 || lens(reason) > 2000
    ) {
      return NextResponse.json(
        { success: false, error: 'Input too long.' },
        { status: 400 }
      );
    }

    if (!identifier || !confirmed) {
      return NextResponse.json(
        { success: false, error: 'Identifier (phone or email) and confirmation are required.' },
        { status: 400 }
      );
    }

    const referenceId = `DEL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // MP-38: the audit write IS the record. If it fails, do NOT claim success.
    try {
      await db.auditLog.create({
        data: {
          action: 'ACCOUNT_DELETION_REQUESTED',
          entityType: 'UserAccount',
          details: {
            referenceId,
            fullName: fullName || 'Anonymous',
            identifier,
            businessName: businessName || 'Not specified',
            role: role || 'Cashier',
            deletionType: deletionType || 'USER_ONLY',
            reason: reason || 'None provided',
            requestedAt: new Date().toISOString(),
          },
          ipAddress: request.headers.get('cf-connecting-ip')?.trim() || request.headers.get('x-real-ip')?.trim() || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
        },
      });
    } catch (dbErr) {
      console.error('[Account Deletion Request] Audit log write failed:', dbErr);
      return NextResponse.json(
        { success: false, error: 'Could not record the request right now. Please try again later.' },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: true,
      referenceId,
      message:
        'Your deletion request has been registered. Our security team will verify and process the request within 7 business days. A confirmation will be sent to the provided contact details.',
    });
  } catch (error: any) {
    console.error('[Account Deletion Error]:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to submit deletion request. Please email privacy@onuron.org directly.' },
      { status: 500 }
    );
  }
}
