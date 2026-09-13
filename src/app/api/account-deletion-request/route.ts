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

    const { fullName, identifier, businessName, role, deletionType, reason, confirmed } = body || {};

    if (!identifier || !confirmed) {
      return NextResponse.json(
        { success: false, error: 'Identifier (phone or email) and confirmation are required.' },
        { status: 400 }
      );
    }

    const referenceId = `DEL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // Try logging this deletion request in audit_logs if available
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
          ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
        },
      });
    } catch (dbErr) {
      console.warn('[Account Deletion Request] Audit log write skipped or db unavailable:', dbErr);
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
