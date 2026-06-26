/* global process */

export const config = { maxDuration: 60, api: { bodyParser: { sizeLimit: '1mb' } } };

const clampScore = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 70;
  return Math.max(0, Math.min(100, Math.round(n)));
};

const safeArray = (value, fallback) => {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value.map(item => String(item || '').trim()).filter(Boolean).slice(0, 4);
  return cleaned.length ? cleaned : fallback;
};

const normalizeGrade = (raw) => {
  const score = clampScore(raw?.score);
  return {
    score,
    level: String(raw?.level || (score >= 90 ? '매우 좋음' : score >= 75 ? '좋음' : score >= 60 ? '보통' : '연습 필요')).trim(),
    strengths: safeArray(raw?.strengths, ['내 생각을 잘 썼어요.']).slice(0, 2),
    improvements: safeArray(raw?.improvements, ['이유나 예시를 한 가지 더 써 보세요.']).slice(0, 2),
    studentComment: String(raw?.studentComment || '잘 썼어요. 다음에는 왜 그렇게 생각했는지 한 문장 더 써 보세요.').trim(),
    teacherViewComment: String(raw?.teacherViewComment || '교사는 주제 적합성, 구체적인 예시, 문단 구성을 중심으로 추가 피드백하면 좋습니다.').trim(),
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

  const { topic = {}, writing = {}, student = {} } = req.body || {};
  const title = String(writing.title || '').trim();
  const content = String(writing.content || '').trim();
  if (!title || !content) return res.status(400).json({ error: '제목과 본문이 필요합니다.' });

  const prompt = `당신은 초등학생 글쓰기를 평가하는 따뜻하고 엄격한 교사입니다.
아래 글을 0~100점으로 채점하고 JSON 객체만 답하세요.

평가 기준:
1. 주제에 맞게 썼는가
2. 이유나 예시가 구체적인가
3. 문장이 자연스럽고 이해하기 쉬운가
4. 처음-가운데-끝 흐름이 있는가
5. 맞춤법과 표현이 적절한가

주의:
- 학생에게 보이는 코멘트는 초등학생이 바로 이해할 수 있는 쉬운 말로 씁니다.
- strengths와 improvements는 각각 1~2개만 쓰고, 한 항목은 25자 안팎의 짧은 문장으로 씁니다.
- studentComment는 2문장 이내로 씁니다. 어려운 평가 용어 대신 "왜", "예시", "처음-가운데-끝"처럼 바로 행동할 말을 씁니다.
- 교사용 코멘트에는 지도 포인트를 구체적으로 씁니다.
- 비난하거나 민감한 추정을 하지 않습니다.
- JSON 이외의 설명을 쓰지 않습니다.

응답 형식:
{"score":82,"level":"좋음","strengths":["잘한 점 1","잘한 점 2"],"improvements":["고칠 점 1","고칠 점 2"],"studentComment":"학생용 코멘트","teacherViewComment":"교사용 지도 코멘트"}

주제 제목: ${topic.title || ''}
주제 설명: ${topic.description || ''}
최소 글자 수: ${topic.minLength || ''}
학생: ${student.name || ''}

글 제목: ${title}
본문:
${content}`;

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
        max_tokens: 1200,
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
    return res.status(200).json({ aiGrade: normalizeGrade(parsed) });
  } catch (err) {
    console.error('grade-writing error:', err);
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      return res.status(504).json({ error: 'AI 응답 시간이 초과되었습니다.' });
    }
    return res.status(500).json({ error: err.message || 'AI 채점 중 오류가 발생했습니다.' });
  }
}
