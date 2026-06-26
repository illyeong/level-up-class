/* global process */

export const config = { maxDuration: 60, api: { bodyParser: { sizeLimit: '1mb' } } };

const cleanText = (value, fallback = '') => String(value || fallback).trim();

const normalizeCorrections = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => ({
      before: cleanText(item?.before),
      after: cleanText(item?.after),
      reason: cleanText(item?.reason),
    }))
    .filter(item => item.before || item.after || item.reason)
    .slice(0, 12);
};

const normalizeResult = (raw, originalContent) => {
  const correctedContent = cleanText(raw?.correctedContent, originalContent);
  return {
    correctedContent,
    corrections: normalizeCorrections(raw?.corrections),
    summary: cleanText(raw?.summary, correctedContent === originalContent ? '맞춤법과 띄어쓰기에서 큰 수정점이 보이지 않습니다.' : '수정안을 확인해 보세요.'),
  };
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: '허용되지 않는 메서드입니다.' });

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' });
  }

  const { title = '', content = '' } = req.body || {};
  const writingTitle = cleanText(title);
  const writingContent = cleanText(content);
  if (!writingContent) return res.status(400).json({ error: '검사할 본문이 필요합니다.' });

  const prompt = `너는 초등학생 글쓰기의 맞춤법과 띄어쓰기를 도와주는 국어 선생님입니다.
아래 글의 뜻과 학생의 표현을 최대한 유지하면서 맞춤법, 띄어쓰기, 문장부호, 어색한 조사만 자연스럽게 고쳐 주세요.
내용을 새로 쓰거나 더 훌륭한 글로 과하게 바꾸지 마세요.
corrections의 before는 학생 원문에 실제로 들어 있는 단어 또는 짧은 문장 그대로 쓰세요.
corrections의 after는 before를 클릭했을 때 바로 바꿔 넣을 수 있는 수정 표현만 쓰세요.
reason은 초등학생이 이해할 수 있게 아주 짧게 쓰세요.
반드시 JSON 객체만 응답하세요.

응답 형식:
{
  "correctedContent": "수정된 전체 본문",
  "corrections": [
    {"before":"틀린 표현","after":"수정 표현","reason":"짧은 이유"}
  ],
  "summary": "학생이 이해하기 쉬운 한 문장 요약"
}

글 제목: ${writingTitle}
본문:
${writingContent}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(50000),
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_WRITING_MODEL || process.env.ANTHROPIC_QUIZ_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 1600,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || response.statusText);
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text || '';
    const stripped = rawText.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim();
    const jsonMatch = stripped.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI 응답에서 JSON을 찾지 못했습니다.');

    const parsed = JSON.parse(jsonMatch[0]);
    return res.status(200).json(normalizeResult(parsed, writingContent));
  } catch (err) {
    console.error('spell-check-writing error:', err);
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      return res.status(504).json({ error: 'AI 응답 시간이 초과되었습니다.' });
    }
    return res.status(500).json({ error: err.message || '맞춤법 검사 중 오류가 발생했습니다.' });
  }
}
