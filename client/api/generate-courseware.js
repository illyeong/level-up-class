/**
 * Vercel Serverless Function — AI 코스웨어 학습 세트 생성
 * claude-sonnet-4-6 사용 (고품질)
 */
export const config = { maxDuration: 30 };

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

  const prompt = `초등학교 ${grade}학년 수학 학습 콘텐츠를 JSON으로 생성하세요.

[수업 정보]
단원: ${unitName} | 차시: ${lessonNo ? lessonNo + '차시 ' : ''}${lessonTitle}
키워드: ${keywordStr} | 난이도: ${diffLabel}

[품질 요건]
- 교과서 문장 복사 금지, ${grade}학년 수준 언어 사용
- 문제는 실제 계산/적용이 필요한 것 (암기 금지)
- ${questionCount}개 중 2개 이상 실생활 문장제
- 오답: 학생들이 실제로 하는 실수 반영 (뻔한 오답 금지)

[JSON 형식만 반환 - 반드시 완전한 JSON]
{"title":"20자 이내 제목","conceptCards":[{"title":"개념명","body":"쉬운 설명 3문장","example":"구체적 예시"}],"commonMistakes":["자주 하는 실수1","자주 하는 실수2"],"questions":[{"question":"문제 텍스트","shape":null,"options":["보기1","보기2","보기3","보기4"],"answerIndex":0,"explanation":"해설"}]}

shape 규칙: 도형(둘레/넓이/각도) 문제면 반드시 생성, 아니면 null
- 문제에 나온 치수를 dimensions에 포함 (예: "한 변이 6cm" → {"type":"equilateral_triangle","dimensions":{"side":6},"unit":"cm"})
- rectangle: {width,height} / square: {side} / circle: {radius} or {diameter}
- equilateral_triangle: {side} / isosceles_triangle: {base,side} / right_triangle: {base,height}
- parallelogram,trapezoid: {base,height} / rhombus: {diagonal1,diagonal2}
options: 기호 없이 내용만 | answerIndex: 0~3 | conceptCards 2~3개 | questions ${questionCount}개`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
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
