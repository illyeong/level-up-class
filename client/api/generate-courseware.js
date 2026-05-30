export const config = { maxDuration: 60 };

// JSON 추출 시도 — 잘린 경우 null 반환
function tryParseJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch {}
  // 잘린 경우: 마지막 완전한 question 뒤에서 닫기 시도
  try {
    const truncated = m[0];
    const lastBrace = truncated.lastIndexOf('"}');
    if (lastBrace < 0) return null;
    const repaired = truncated.slice(0, lastBrace + 2) + ']}]}';
    return JSON.parse(repaired);
  } catch { return null; }
}

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

  const isUnitTest = lessonTitle === '단원평가';

  const prompt = `초등학교 ${grade}학년 수학 학습 콘텐츠를 JSON으로 생성하세요.

[수업 정보]
단원: ${unitName} | 차시: ${isUnitTest ? '단원평가 (종합)' : (lessonNo ? lessonNo + '차시 ' : '') + lessonTitle}
키워드: ${keywordStr} | 난이도: ${diffLabel}

[품질 요건]
${isUnitTest
  ? `- 이 단원 전체 학습 내용을 종합 평가하는 문제 ${questionCount}개
- 단원의 핵심 개념과 계산, 실생활 문장제를 고르게 출제 (최소 3개 문장제)
- 난이도를 균형 있게: 기초 40% / 응용 40% / 심화 20%`
  : `- 문제는 개념 적용이 필요한 것 (단순 암기 금지), 최소 1개 이상 실생활 문장제`}
- 오답: 학생들이 실제로 하는 실수 반영

[JSON 형식만 반환 - 반드시 완전한 JSON, 모든 텍스트는 간결하게]
${isUnitTest
  ? `{"title":"단원평가","conceptCards":[],"commonMistakes":[],"questions":[{"question":"문제","shape":null,"options":["보기1","보기2","보기3","보기4"],"answerIndex":0,"explanation":"1문장 해설"}]}`
  : `{"title":"15자 이내","conceptCards":[{"title":"개념명","body":"핵심만 2문장","example":"짧은 예시"}],"commonMistakes":["실수1","실수2"],"questions":[{"question":"문제","shape":null,"options":["보기1","보기2","보기3","보기4"],"answerIndex":0,"explanation":"1문장 해설"}]}`
}

shape 규칙: 도형·각도·분수·그래프·수직선 문제에는 반드시 생성, 순수 암산만 null
▶ 시계·시간: {"type":"clock","dimensions":{"hour":3,"minute":30}} — 시각 읽기·걸린시간·덧셈뺄셈 문제
▶ 길이·자: {"type":"ruler","dimensions":{"total":10,"highlight":{"from":2,"to":7}},"unit":"cm"} — 길이 재기·비교 문제
▶ 도형: 직각삼각형/사각형/원/다각형 등 — 해당 shape 타입 사용
▶ 각도: {"type":"angle","dimensions":{"degrees":120,"label":"둔각"},"unit":"°"}
  right_triangle에 각도 포함: {"dimensions":{"base":3,"height":4,"angles":{"a":53,"b":37}},"unit":"cm"}
▶ 분수: {"type":"fraction_bar","dimensions":{"total":5,"filled":3},"unit":""}
  분수 비교: {"dimensions":{"total":4,"filled":1,"compare":{"total":3,"filled":2}}}
▶ 막대그래프: {"type":"bar_chart","dimensions":{"title":"제목","labels":["A","B"],"values":[5,8],"unit":"명"}}
▶ 꺾은선그래프: {"type":"line_chart","dimensions":{"title":"제목","labels":["1월","2월"],"values":[10,15],"unit":"°C"}}
▶ 원그래프: {"type":"pie_chart","dimensions":{"title":"제목","labels":["A","B","C"],"values":[40,35,25],"unit":"%"}}
▶ 수직선: {"type":"number_line","dimensions":{"min":0,"max":10,"marks":[3,7],"highlight":{"from":3,"to":7},"label":"3 이상 7 이하"}}
▶ 다각형: {"type":"polygon","dimensions":{"sides":5,"side":4},"unit":"cm"}
▶ 대칭: 패턴A(shape 1개) 또는 패턴B(multi) — "다음 중"만 쓰고 shape 없는 질문 금지
▶ multi:{items:["circle","rhombus",...]} 2~4개 도형 비교용
- rectangle:{width,height} / square:{side} / circle:{radius} / equilateral_triangle:{side}
- isosceles_triangle:{base,side} / right_triangle:{base,height} / parallelogram:{base,height}
- rhombus:{diagonal1,diagonal2} / trapezoid:{bottomBase,topBase,height} | unit:"cm"
options: 기호 없이 내용만 | answerIndex: 0~3 | conceptCards 2개 | questions ${questionCount}개`;

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
        max_tokens: isUnitTest ? 3500 : 2500,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: `Claude API 오류: ${err.error?.message || response.statusText}` });
    }

    const data    = await response.json();
    const rawText = data.content?.[0]?.text || '';

    // JSON 파싱 시도 (잘린 경우 fallback 프롬프트로 재시도)
    let result = tryParseJson(rawText);

    if (!result) {
      // Fallback: shape 없이 더 짧은 포맷으로 재시도
      const fallbackPrompt = `초등학교 ${grade}학년 수학 퀴즈를 JSON으로 생성하세요.
단원: ${unitName} | 차시: ${lessonTitle}
반드시 완전한 JSON만 반환:
{"title":"제목","conceptCards":[{"title":"개념1","body":"설명","example":"예시"},{"title":"개념2","body":"설명","example":"예시"}],"commonMistakes":["실수1","실수2"],"questions":[{"question":"문제","shape":null,"options":["보기1","보기2","보기3","보기4"],"answerIndex":0,"explanation":"해설"}]}
questions ${questionCount}개, options 기호 없이, 모든 텍스트 간결하게`;

      const fb = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 2500, messages: [{ role: 'user', content: fallbackPrompt }] }),
      });
      if (fb.ok) {
        const fbData = await fb.json();
        result = tryParseJson(fbData.content?.[0]?.text || '');
      }
    }

    if (!result?.conceptCards?.length || !result?.questions?.length)
      return res.status(500).json({ error: '콘텐츠 생성에 실패했습니다. 다시 시도해주세요.' });

    return res.status(200).json({ ...result, context, generatedBy: 'ai' });
  } catch (err) {
    console.error('generate-courseware 에러:', err);
    return res.status(500).json({ error: err.message || '서버 오류가 발생했습니다.' });
  }
}
