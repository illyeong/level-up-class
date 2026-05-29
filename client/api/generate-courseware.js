/**
 * Vercel Serverless Function — AI 코스웨어 학습 세트 생성
 * claude-sonnet-4-6 사용 (고품질)
 */
export const config = { maxDuration: 60 }; // Vercel Pro: 최대 60초 허용

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
    difficulty = 'normal', questionCount = 5,
  } = req.body || {};

  if (!grade || !unitName || !lessonTitle)
    return res.status(400).json({ error: '학년, 단원명, 차시명을 입력해주세요.' });

  const keywordStr = Array.isArray(keywords) ? keywords.join(', ') : (keywords || '');
  const context = [
    `초등학교 ${grade}학년`, semester ? `${semester}학기` : '',
    '수학', publisher && publisher !== '국정' ? `(${publisher})` : '',
    unitName, lessonNo ? `${lessonNo}차시` : '', lessonTitle,
  ].filter(Boolean).join(' ');

  const diffLabel = difficulty === 'easy' ? '기초' : difficulty === 'hard' ? '심화' : '기본';

  const prompt = `당신은 15년 경력의 초등학교 수학 교사이자 교육과정 전문가입니다.
다음 차시에 맞는 고품질 학습 콘텐츠를 생성해주세요.

═══ 수업 정보 ═══
학년: ${grade}학년 ${semester ? semester + '학기' : ''} 수학
단원: ${unitName}
차시: ${lessonNo ? lessonNo + '차시 ' : ''}${lessonTitle}
학습 목표: ${learningGoal || lessonTitle + ' 이해하고 적용하기'}
핵심 키워드: ${keywordStr}
난이도: ${diffLabel}
문항 수: ${questionCount}개

═══ 콘텐츠 설계 원칙 ═══

【개념 카드 작성 원칙】
- 학생이 "아하!" 하는 순간을 만드는 설명
- 교과서 문장 복사 금지 — 쉬운 말로 풀어 쓰기
- 구체적 실생활 예시 또는 시각적으로 떠올릴 수 있는 예시
- ${grade}학년 학생의 어휘 수준 사용

【문제 품질 기준】
1. 계산/적용 문제: 실제로 계산하거나 개념을 적용해야 풀 수 있는 문제 (단순 암기 금지)
2. 문장제 포함: ${questionCount}개 중 최소 2개는 실생활 맥락(이름, 상황, 물건 등)을 넣은 문장제
3. 핵심 개념 직결: 이 차시 학습 목표에서 벗어난 문제 금지
4. 다양한 유형: 같은 유형 반복 금지 (계산, 개념 확인, 적용, 문장제 골고루)

【오답 설계 원칙 — 가장 중요】
각 오답은 반드시 실제 학생들이 저지르는 "의미 있는 실수"를 반영해야 합니다:
- 자릿값 혼동 (십의 자리와 일의 자리 바꿈)
- 받아올림/받아내림 누락
- 연산 방향 오류 (빼기해야 할 곳에 더하기)
- 부분만 계산 (절반만 계산하고 끝낸 경우)
- 비슷하지만 다른 개념 혼동
❌ 절대 금지: 너무 뻔하게 틀린 보기 (예: 정답이 383인데 1, 2, 3 같은 보기)
✅ 좋은 보기: 정답 383에 대해 → 373(받아올림 누락), 393(십의 자리 오계산), 483(백의 자리 오류)

═══ 출력 형식 (JSON만 반환) ═══

{
  "title": "차시 핵심 내용 요약 (20자 이내, 예: '세 자리 수 받아올림 덧셈')",
  "conceptCards": [
    {
      "title": "핵심 개념명 (짧게)",
      "body": "개념 설명 — 학생 눈높이, 쉬운 문장 3~4개. '~입니다' 형식, 추상적 표현 금지",
      "example": "실제 숫자나 상황을 이용한 구체적 예시. 풀이 과정 단계별 설명"
    }
  ],
  "commonMistakes": [
    "학생들이 자주 하는 실수 1 (구체적으로: 예- '받아올림한 1을 십의 자리에 더하지 않는 경우')",
    "학생들이 자주 하는 실수 2"
  ],
  "questions": [
    {
      "question": "문제 (문장제면 자연스러운 상황 설정)",
      "shape": null,
      "table": null,
      "options": ["15", "25", "35", "45"],
      "answerIndex": 1,
      "explanation": "풀이 과정을 단계별로 설명. 왜 다른 보기들이 틀렸는지도 1줄씩 언급",
      "difficulty": "normal"
    }
  ]
}

shape 규칙: 도형 문제면 {"type":"rectangle","dimensions":{"width":5,"height":3},"unit":"cm"}, 없으면 null
table 규칙: 표가 필요하면 {"headers":["구분","값1","값2"],"rows":[["행1","a","b"]]}, 없으면 null
options 규칙: ①②③④ 기호 없이 보기 내용만 작성 (기호는 화면에서 자동 추가됨)
answerIndex: 0~3 (0=첫 번째 보기)
difficulty: "easy"/"normal"/"hard"

${questionCount}개 문제 필수, conceptCards 2~3개 필수`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 4000,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    // Sonnet 실패 시 Haiku로 자동 재시도 (타임아웃 등)
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      if (response.status === 529 || response.status === 503) {
        // 과부하 → Haiku로 폴백
        const fallback = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 3000, messages: [{ role: 'user', content: prompt }] }),
        });
        if (fallback.ok) {
          const fallbackData = await fallback.json();
          const fallbackText = fallbackData.content?.[0]?.text || '';
          const fallbackMatch = fallbackText.match(/\{[\s\S]*\}/);
          if (fallbackMatch) {
            const result = JSON.parse(fallbackMatch[0]);
            if (result.conceptCards?.length && result.questions?.length)
              return res.status(200).json({ ...result, context, generatedBy: 'ai-fallback' });
          }
        }
      }
      return res.status(response.status).json({ error: `Claude API 오류: ${err.error?.message || response.statusText}` });
    }

    const data    = await response.json();
    const rawText = data.content?.[0]?.text || '';

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: '생성 형식이 올바르지 않습니다.', raw: rawText });

    const result = JSON.parse(jsonMatch[0]);

    if (!result.conceptCards?.length || !result.questions?.length)
      return res.status(500).json({ error: '콘텐츠 생성에 실패했습니다. 다시 시도해주세요.' });

    return res.status(200).json({ ...result, context, generatedBy: 'ai' });
  } catch (err) {
    console.error('generate-courseware 에러:', err);
    return res.status(500).json({ error: err.message || '서버 오류가 발생했습니다.' });
  }
}
