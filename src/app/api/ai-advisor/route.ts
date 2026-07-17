import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';
import { requireRole } from '@/lib/api-middleware';

export async function POST(request: NextRequest) {
  const roleError = await requireRole(request, ['ADMIN', 'MANAGER']);
  if (roleError) return roleError;

  try {
    const { reportData, question } = await request.json();

    const zai = await ZAI.create();

    const systemPrompt = `তুমি একটি বাংলা মুদি দোকানের AI ব্যবসায়িক উপদেষ্টা। তোমার নাম "লক্ষ্মণ AI"। 
তুমি সবসময় বাংলায় উত্তর দাও। দোকানের রিপোর্ট ডেটা বিশ্লেষণ করে ব্যবহারিক পরামর্শ দাও।
সংখ্যা ও পরিমাণ বাংলায় লিখো। টাকার প্রতীক ৳ ব্যবহার করো।
পরামর্শগুলো সংক্ষিপ্ত, স্পষ্ট এবং কার্যকর হওয়া চাই।`;

    const userPrompt = `দোকানের রিপোর্ট ডেটা:
${JSON.stringify(reportData, null, 2)}

প্রশ্ন: ${question || 'আমার দোকানের বর্তমান অবস্থা কেমন? কিছু পরামর্শ দাও।'}

অনুগ্রহ করে বাংলায় উত্তর দাও।`;

    const response = await zai.chat.completions.create({
      model: 'glm-4-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      thinking: { type: 'disabled' },
    });

    const advice = response.choices?.[0]?.message?.content || 'পরামর্শ আনা যাচ্ছে না।';

    return NextResponse.json({ success: true, advice });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'AI পরামর্শ আনা যাচ্ছে না';
    console.error('AI Advisor error:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
