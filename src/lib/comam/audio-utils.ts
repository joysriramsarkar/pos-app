/**
 * Browser audio helpers for Comam voice input (VOICE-MASTER-PLAN MP-40):
 * the recording is converted to 24 kHz mono WAV in the browser, so the
 * server needs no ffmpeg and Safari's audio/mp4 cannot break uploads.
 */

export const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/webm',
  'audio/ogg;codecs=opus',
  '',
];

export function pickMimeType(isSupported: (t: string) => boolean): string {
  return MIME_CANDIDATES.find((t) => t === '' || isSupported(t)) ?? '';
}

export function assessClip(durationMs: number, peak: number): 'ok' | 'too_short' | 'too_quiet' {
  if (durationMs < 500) return 'too_short';
  if (peak < 0.01) return 'too_quiet';
  return 'ok';
}

/** Decode any recorded blob and re-encode as 24 kHz mono 16-bit WAV. */
export async function toWav24k(blob: Blob): Promise<Blob> {
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const rate = 24000;
    const len = Math.max(1, Math.ceil(decoded.duration * rate));
    const off = new OfflineAudioContext(1, len, rate);
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start();
    const pcm = (await off.startRendering()).getChannelData(0);
    const buf = new ArrayBuffer(44 + pcm.length * 2);
    const v = new DataView(buf);
    const writeStr = (o: number, s: string) =>
      [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    writeStr(0, 'RIFF');
    v.setUint32(4, 36 + pcm.length * 2, true);
    writeStr(8, 'WAVEfmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, rate, true);
    v.setUint32(28, rate * 2, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    writeStr(36, 'data');
    v.setUint32(40, pcm.length * 2, true);
    pcm.forEach((s, i) =>
      v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true)
    );
    return new Blob([buf], { type: 'audio/wav' });
  } finally {
    ctx.close().catch(() => {});
  }
}
