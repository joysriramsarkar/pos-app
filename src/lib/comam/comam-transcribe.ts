/**
 * Server-side Bengali speech-to-text for Comam (VOICE-MASTER-PLAN MP-40).
 *
 * Calls Muse Voice Transcribe (POST /v1/asr/transcribe, multipart with
 * a JSON "request" part + a WAV "audio" part — verified against the
 * provider, see comam repo scripts/asr_spike.py / Gate G1 evidence:
 * languageBias must be a LIST; the string form is rejected with 400,
 * while list + keywords return 200).
 *
 * The API key lives only on the server. The browser uploads a 24 kHz
 * mono WAV (see audio-utils.toWav24k), so no ffmpeg is needed here.
 * Biasing (languageBias + catalog keywords) is on by default and can
 * be disabled with VOICE_BIASING=off for A/B measurement.
 */

export type TranscribeErrorKind = 'not_configured' | 'invalid_audio' | 'upstream';

export class TranscribeError extends Error {
  kind: TranscribeErrorKind;
  constructor(kind: TranscribeErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

const TRANSCRIBE_MODEL = process.env.MODEL_TRANSCRIBE_NAME || 'muse-voice-transcribe-1.0';
const BASE_URL = process.env.MODEL_BASE_URL || 'https://api.meta.ai/v1';

export function biasingEnabled(): boolean {
  return (process.env.VOICE_BIASING || 'on').toLowerCase() !== 'off';
}

export async function transcribeAudio(
  audio: Uint8Array,
  keywords: string[] = []
): Promise<{ text: string; engine: string }> {
  const apiKey = process.env.MODEL_API_KEY;
  if (!apiKey) {
    throw new TranscribeError('not_configured', 'MODEL_API_KEY not set on server');
  }
  // Only WAV is accepted here; the client converts before upload.
  const isWav =
    audio.length > 12 &&
    String.fromCharCode(...audio.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...audio.slice(8, 12)) === 'WAVE';
  if (!isWav) {
    throw new TranscribeError('invalid_audio', 'expected WAV audio');
  }

  const requestObj: Record<string, unknown> = {
    model: TRANSCRIBE_MODEL,
    audioEncoding: 'WAV',
  };
  if (biasingEnabled()) {
    requestObj.languageBias = ['Bengali', 'English'];
    if (keywords.length) requestObj.keywords = keywords.slice(0, 200);
  }

  const form = new FormData();
  form.append('request', JSON.stringify(requestObj));
  form.append(
    'audio',
    new Blob([audio as unknown as BlobPart], { type: 'audio/wav' }),
    'audio.wav'
  );

  let out: any;
  try {
    const res = await fetch(`${BASE_URL}/asr/transcribe`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!res.ok) {
      throw new TranscribeError('upstream', `ASR provider returned ${res.status}`);
    }
    out = await res.json();
  } catch (e) {
    if (e instanceof TranscribeError) throw e;
    throw new TranscribeError('upstream', 'ASR provider unreachable');
  }

  let text = typeof out?.transcript === 'string' ? out.transcript : '';
  if (!text && Array.isArray(out?.turns)) {
    text = out.turns
      .map((t: any) => (typeof t?.transcript === 'string' ? t.transcript : ''))
      .join(' ')
      .trim();
  }
  return { text: text.trim(), engine: TRANSCRIBE_MODEL };
}

/** Catalog vocabulary for keyword biasing (plan Appendix B). */
export function buildAsrKeywords(
  products: Array<{ name?: string | null; nameBn?: string | null }>,
  customers: Array<{ name?: string | null; nameEn?: string | null }>
): string[] {
  const seen = new Set<string>();
  const words: string[] = [];
  const add = (w?: string | null) => {
    const t = (w || '').trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      words.push(t);
    }
  };
  products.forEach((p) => {
    add(p.nameBn);
    add(p.name);
  });
  customers.forEach((c) => {
    add(c.name);
    add(c.nameEn);
  });
  ['কেজি', 'গ্রাম', 'লিটার', 'পিস', 'ডজন', 'টাকা', 'বাকি', 'জমা', 'নগদ', 'ইউপিআই', 'পৌনে', 'সাড়ে', 'দেড়', 'আধা'].forEach(add);
  return words.slice(0, 200);
}
