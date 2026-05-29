/**
 * Vercel Serverless Function — AI 코스웨어 학습 세트 생성
 * Claude API 사용
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
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API 키가 설정되지 않았습니다.' });

  const {
    grade, semester, publisher, unitName,
    lessonNo, lessonTitle, learningGoal, keywords,
    difficulty = 'normal', questionCount = 4,
  } = req.body || {};

  if (!grade || !unitName || !lessonTitle)
    return res.status(400).json({ error: '학년, 단원명, 차시명을 입력해주세요.' });

  const keywordStr = Array.isArray(keywords) ? keywords.join(', ') : (keywords || '');
  const context = [
    `초등학교 ${grade}학년`, semester ? `${semester}학기` : '',
    '수학', publisher && publisher !== '국정' ? `(${publisher})` : '',
    unitName, lessonNo ? `${lessonNo}차시` : '', lessonTitle,
  ].filter(Boolean).join(' ');

  const prompt = `너는 초등학교 수학 교사용 AI 코스웨어 콘텐츠 생성자입니다.

학년: ${grade}학년
학기: ${semester ? semester + '학기' : ''}
출판사: ${publisher || '국정'}
단원명: ${unitName}
차시: ${lessonNo ? lessonNo + '차시' : ''} ${lessonTitle}
학습 목표: ${learningGoal || lessonTitle + ' 이해하기'}
핵심 키워드: ${keywordStr}
난이도: ${DIFFICULTY_MAP[difficulty] || DIFFICULTY_MAP.normal}
문항 수: ${questionCount}개

다음 JSON 형식만 반환하세요 (설명 없이 JSON만):

{
  "title": "차시 학습 제목 (15자 이내)",
  "conceptCards": [
    {
      "title": "개념 카드 제목",
      "body": "개념 설명 (초등학생 눈높이, 3~4문장)",
      "example": "구체적인 예시 또는 풀이 과정"
    }
  ],
  "commonMistakes": [
    "학생들이 자주 틀리는 포인트 1",
    "학생들이 자주 틀리는 포인트 2"
  ],
  "questions": [
    {
      "question": "문제 내용",
      "options": ["①보기1", "②보기2", "③보기3", "④보기4"],
      "answerIndex": 0,
      "explanation": "정답 해설 (왜 맞는지 개념 중심으로)",
      "difficulty": "easy"
    }
  ]
}

조건:
- conceptCards: 2~3개, 핵심 개념을 단계적으로 설명
- commonMistakes: 1~2개
- questions: ${questionCount}개, 4지선다 객관식
- answerIndex: 0~3 (0=①, 1=②, 2=③, 3=④)
- 교과서 문장 그대로 베끼지 말 것
- 초등학생이 이해할 수 있는 쉬운 표현
- 정답은 반드시 1개
- 차시 학습 목표에서 벗어나지 말 것`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: `Claude API 오류: ${err.error?.message || response.statusText}` });
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text || '';

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: '생성 형식이 올바르지 않습니다.', raw: rawText });

    const result = JSON.parse(jsonMatch[0]);

    // 유효성 검사
    if (!result.conceptCards?.length || !result.questions?.length)
      return res.status(500).json({ error: '콘텐츠 생성에 실패했습니다. 다시 시도해주세요.' });

    return res.status(200).json({ ...result, context, generatedBy: 'ai' });
  } catch (err) {
    console.error('generate-courseware 에러:', err);
    return res.status(500).json({ error: err.message || '서버 오류가 발생했습니다.' });
  }
}
