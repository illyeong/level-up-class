export const config = { maxDuration: 60 };

// ── 자동 유효성 검증 ──────────────────────────────────────────
function validateContent(result) {
  const issues = [];
  if (!result.questions?.length) { issues.push('문제가 없습니다'); return issues; }
  result.questions.forEach((q, i) => {
    const n = i + 1;
    if (!q.question || q.question.length < 5) issues.push(`Q${n}: 문제 텍스트가 너무 짧습니다`);
    if (typeof q.answerIndex !== 'number' || q.answerIndex < 0 || q.answerIndex > 3)
      issues.push(`Q${n}: 정답 인덱스 오류 (${q.answerIndex})`);
    if (!Array.isArray(q.options) || q.options.length !== 4)
      issues.push(`Q${n}: 보기가 4개가 아닙니다 (${q.options?.length}개)`);
    else {
      const trimmed = q.options.map(o => String(o).trim());
      const uniqueSet = new Set(trimmed);
      if (uniqueSet.size < 4) issues.push(`Q${n}: 중복 보기 존재`);
      // 정답 보기가 비어있지 않은지
      if (!trimmed[q.answerIndex]) issues.push(`Q${n}: 정답 보기가 비어있습니다`);
    }
    if (!q.explanation) issues.push(`Q${n}: 해설이 없습니다`);
  });
  return issues;
}

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
  // 풀 크기: 일반 차시는 2배(10개), 단원평가는 1.5배(15개) 생성 → 매 세션 랜덤 선택
  const poolSize = isUnitTest ? Math.min(questionCount + 5, 15) : questionCount * 2;

  const prompt = `초등학교 ${grade}학년 수학 학습 콘텐츠를 JSON으로 생성하세요.

[수업 정보]
단원: ${unitName} | 차시: ${isUnitTest ? '단원평가 (종합)' : (lessonNo ? lessonNo + '차시 ' : '') + lessonTitle}
키워드: ${keywordStr} | 난이도: ${diffLabel}

[품질 요건 — 고품질 필수]
${isUnitTest
  ? `- 이 단원 전체 학습 내용을 종합 평가하는 문제 ${poolSize}개
- 핵심 개념·계산·실생활 문장제 균형 (문장제 최소 4개)
- 난이도: 기초 30% / 응용 50% / 심화 20%`
  : `- 실제 계산·추론이 필요한 문제 (단순 암기 금지), 문장제 최소 2개
- 같은 개념도 다른 맥락·수치·상황으로 ${poolSize}개 생성`}
- 오답: 학생이 실제로 하는 계산 실수 (자릿값 혼동, 받아올림 누락 등) 반영
- 보기 4개의 수치 범위를 비슷하게 (터무니없는 오답 금지)

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
options: 기호 없이 내용만 | answerIndex: 0~3 | conceptCards 2개 | questions ${poolSize}개 (풀)
※ 매 학습 세션에서 이 풀에서 ${questionCount}개를 무작위 선택해 출제합니다`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',   // 고품질 + 풀 사이즈 대응
        max_tokens: isUnitTest ? 5000 : 4000,
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

    // 자동 유효성 검증
    const validationIssues = validateContent(result);
    return res.status(200).json({
      ...result, context, generatedBy: 'ai',
      validationIssues: validationIssues.length > 0 ? validationIssues : null,
      validatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('generate-courseware 에러:', err);
    return res.status(500).json({ error: err.message || '서버 오류가 발생했습니다.' });
  }
}
