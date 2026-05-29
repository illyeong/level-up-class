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

  const prompt = `초등학교 ${grade}학년 수학 학습 콘텐츠를 JSON으로 생성하세요.

[수업 정보]
단원: ${unitName} | 차시: ${lessonNo ? lessonNo + '차시 ' : ''}${lessonTitle}
키워드: ${keywordStr} | 난이도: ${diffLabel}

[품질 요건]
- 교과서 문장 복사 금지, ${grade}학년 수준 언어 사용
- 문제는 개념 적용이 필요한 것 (단순 암기 금지), 최소 1개 이상 실생활 문장제
- 오답: 학생들이 실제로 하는 실수 반영

[JSON 형식만 반환 - 반드시 완전한 JSON, 모든 텍스트는 간결하게]
{"title":"15자 이내","conceptCards":[{"title":"개념명","body":"핵심만 2문장","example":"짧은 예시"}],"commonMistakes":["실수1","실수2"],"questions":[{"question":"문제","shape":null,"options":["보기1","보기2","보기3","보기4"],"answerIndex":0,"explanation":"1문장 해설"}]}

shape 규칙: 도형이 등장하는 문제(넓이/둘레/각도/대칭)에는 반드시 생성, 순수 개념·암산 문제만 null
- 대칭 단원 문제 작성 규칙 (반드시 준수):
  패턴A: 도형 하나를 shape로 보여주고 → "이 이등변삼각형의 선대칭축은 몇 개?"
  패턴B: 도형 목록을 문제 텍스트에 직접 명시 → "원, 정삼각형, 사다리꼴, 마름모 중 선대칭도형은 몇 개?" (shape:null)
  ❌ 금지: "다음 중" 이라고만 쓰고 도형 목록 없는 질문 (학생이 뭘 보고 답해야 할지 모름)
- 치수: 계산 문제는 dimensions에 수치 포함, 대칭 문제는 dimensions 생략 가능({}도 가능)
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
        max_tokens: 2500,
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
