export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-middleware";
import { requireBusinessContext } from "@/lib/tenant";
import {
  buildAsrKeywords,
  transcribeAudio,
  TranscribeError,
} from "@/lib/comam/comam-transcribe";

/**
 * Voice upload -> Bengali transcript (VOICE-MASTER-PLAN MP-40).
 *
 * Auth + business scope mirror /api/comam exactly (session-derived
 * businessId; the client never supplies one). The client converts the
 * recording to 24 kHz mono WAV in the browser, so this route only
 * validates and forwards to the ASR provider — the API key never
 * leaves the server.
 */

const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response!;

  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;
  const businessId = ctx.business.id;

  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }
  if (!file) {
    return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "খালি অডিও পাঠানো হয়েছে" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "অডিও ফাইল খুব বড় (সর্বোচ্চ ৫ MB)" }, { status: 413 });
  }

  try {
    const [products, customers] = await Promise.all([
      db.product.findMany({
        where: { businessId, isActive: true },
        select: { name: true, nameBn: true },
      }),
      db.customer.findMany({
        where: { businessId, isActive: true },
        select: { name: true, nameEn: true },
      }),
    ]);
    const keywords = buildAsrKeywords(products, customers as any);
    const audio = new Uint8Array(await file.arrayBuffer());
    const { text, engine } = await transcribeAudio(audio, keywords);
    return NextResponse.json({
      text,
      engine,
      warnings: text ? [] : ["no_speech"],
    });
  } catch (e) {
    if (e instanceof TranscribeError) {
      const status =
        e.kind === "not_configured" ? 501 : e.kind === "invalid_audio" ? 400 : 502;
      return NextResponse.json({ error: e.message }, { status });
    }
    return NextResponse.json({ error: "Transcription failed" }, { status: 502 });
  }
}
