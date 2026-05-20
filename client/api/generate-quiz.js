/**
 * Vercel Serverless Function
 * Claude API를 사용해 수업 자료로 퀴즈를 자동 생성합니다.
 *
 * 환경변수 설정 필요:
 * Vercel Dashboard → Settings → Environment Variables
 *   ANTHROPIC_API_KEY = your_claude_api_key
 */

const DIFFICULTY_MAP = {
  easy:   '쉬운 난이도 (기본 개념 확인, 직접적인 질문)',
  normal: '보통 난이도 (이해 및 적용, 약간의 추론 필요)',
  hard:   '어려운 난이도 (심화 사고, 응용 및 비교)',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: '허용되지 않는 메서드' });

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: 'API 키가 설정되지 않았습니다.',
      hint: 'Vercel Dashboard → Settings → Environment Variables에 ANTHROPIC_API_KEY를 추가하세요.',
    });
  }

  const { sourceText, grade, semester, subject, publisher, unit, count = 5, difficulty = 'normal' } = req.body || {};

  if (!sourceText?.trim()) return res.status(400).json({ error: '수업 자료를 입력해주세요.' });
  if (!grade || !subject)  return res.status(400).json({ error: '학년과 과목을 선택해주세요.' });

  const contextParts = [
    `초등학교 ${grade}학년`,
    semester ? `${semester}학기` : '',
    subject,
    publisher && publisher !== '국정' ? `(${publisher})` : '',
    unit ? `${unit}` : '',
  ].filter(Boolean).join(' ');

  const prompt = `당신은 초등학교 교사의 퀴즈 생성 도우미입니다.

다음 수업 자료를 바탕으로 ${contextParts} 수준의 객관식 퀴즈 ${count}개를 만들어주세요.

【난이도】: ${DIFFICULTY_MAP[difficulty] || DIFFICULTY_MAP.normal}

【규칙】
- 4지 선다형 객관식 (보기 4개)
- ${grade}학년 학생이 이해할 수 있는 쉬운 언어 사용
- 각 문제마다 정답은 반드시 하나만 존재
- 보기는 모두 비슷한 길이와 형식으로 작성
- 정답과 해설은 수업 자료 내용에 근거

【반드시 JSON 배열 형식으로만 응답】 (설명, 머릿말 없이 JSON만)
[
  {
    "question": "문제 내용",
    "options": ["①보기1", "②보기2", "③보기3", "④보기4"],
    "answer": 0,
    "explanation": "정답 해설 (왜 정답인지 간단히)"
  }
]

answer 값은 0~3 사이의 정수 (0=①, 1=②, 2=③, 3=④)

【수업 자료】
${sourceText.trim()}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':       'application/json',
        'x-api-key':          ANTHROPIC_API_KEY,
        'anthropic-version':  '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 3000,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: `Claude API 오류: ${errData.error?.message || response.statusText}` });
    }

    const data     = await response.json();
    const rawText  = data.content?.[0]?.text || '';

    // JSON 배열 추출
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return res.status(500).json({ error: '퀴즈 형식이 올바르지 않습니다. 다시 시도해주세요.', raw: rawText });
    }

    const questions = JSON.parse(jsonMatch[0]);

    // 기본 유효성 검사
    const valid = questions.every(q =>
      q.question && Array.isArray(q.options) && q.options.length === 4
      && typeof q.answer === 'number' && q.answer >= 0 && q.answer <= 3
    );
    if (!valid) return res.status(500).json({ error: '생성된 퀴즈 형식이 올바르지 않습니다.' });

    return res.status(200).json({ questions, context: contextParts });

  } catch (err) {
    console.error('generate-quiz 에러:', err);
    return res.status(500).json({ error: err.message || '서버 오류가 발생했습니다.' });
  }
}
