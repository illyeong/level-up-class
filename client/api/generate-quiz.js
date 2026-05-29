/**
 * Vercel Serverless Function — 퀴즈 자동 생성
 * Claude API (Anthropic) 사용
 *
 * 환경변수:
 *   ANTHROPIC_API_KEY = sk-ant-...
 *   → console.anthropic.com 가입 시 $5 무료 크레딧 제공 (카드 불필요)
 *   → Vercel Dashboard → Settings → Environment Variables에 추가
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
      hint: 'console.anthropic.com 가입 후 API 키 발급 → Vercel 환경변수에 ANTHROPIC_API_KEY 추가',
    });
  }

  const {
    sourceText, pdfBase64, grade, semester,
    subject, publisher, unit,
    lessonNo, lessonTitle, lessonKeywords,   // 차시 정보 (선택)
    count = 5, difficulty = 'normal',
    saCount: bodySaCount,
  } = req.body || {};

  const hasLesson   = !!(lessonTitle?.trim() || (Array.isArray(lessonKeywords) && lessonKeywords.length));
  const hasSource   = !!(sourceText?.trim() || pdfBase64);

  // 차시 정보 또는 수업 자료 중 하나 이상 필요
  if (!hasSource && !hasLesson)
    return res.status(400).json({ error: '차시를 선택하거나 수업 자료를 입력해주세요.' });
  if (!grade || !subject)
    return res.status(400).json({ error: '학년과 과목을 선택해주세요.' });

  const saCount = Math.max(0, parseInt(bodySaCount) || 0);
  const mcCount = Math.max(0, count - saCount);
  const hasSA   = saCount > 0;

  const contextParts = [
    `초등학교 ${grade}학년`,
    semester ? `${semester}학기` : '',
    subject,
    publisher && publisher !== '국정' ? `(${publisher})` : '',
    unit || '',
  ].filter(Boolean).join(' ');

  const typeRules = hasSA
    ? `- 객관식 ${mcCount}개: 4지 선다형, 보기 4개, 보기는 비슷한 길이
- 주관식 ${saCount}개: 단답형, 정답은 짧은 단어/구문 (최대 10자)`
    : `- 4지 선다형 객관식 (보기 4개), 보기는 모두 비슷한 길이와 형식`;

  const jsonExample = hasSA
    ? `객관식 예시: {"type":"mc","question":"문제","table":null,"shape":null,"options":["①보기1","②보기2","③보기3","④보기4"],"answer":0,"explanation":"해설"}
주관식 예시: {"type":"sa","question":"문제","table":null,"shape":null,"answer":"정답단어","explanation":"해설"}

answer(객관식): 0~3 사이 정수 (0=①, 1=②, 2=③, 3=④)
answer(주관식): 정답 문자열 (짧은 단어/구문)
배열 순서: 객관식 ${mcCount}개 먼저, 주관식 ${saCount}개 나중에`
    : `[{"question":"문제","table":null,"shape":null,"options":["①보기1","②보기2","③보기3","④보기4"],"answer":0,"explanation":"해설"}]
answer 값은 0~3 사이 정수 (0=①, 1=②, 2=③, 3=④)

table 규칙: 표가 필요한 문제면 {"headers":["열1","열2",...],"rows":[["행1값1","행1값2",...],...]}, 없으면 null
shape 규칙: 도형 문제면 {"type":"rectangle","dimensions":{"width":5,"height":3},"unit":"cm"}, 없으면 null`;

  // ── 차시 정보 기반 프롬프트 구성 ──────────────────────────────
  const lessonContext = hasLesson
    ? `\n【차시 정보】
${lessonNo ? `차시: ${lessonNo}차시` : ''}
${lessonTitle ? `학습 주제: ${lessonTitle}` : ''}
${Array.isArray(lessonKeywords) && lessonKeywords.length ? `핵심 키워드: ${lessonKeywords.join(', ')}` : ''}
`
    : '';

  const sourceSection = hasSource
    ? `\n【수업 자료】\n${sourceText?.trim() || '(PDF 파일에서 자료 참고)'}`
    : '';

  const basisDesc = hasLesson && !hasSource
    ? '위 차시 학습 주제와 핵심 키워드를 바탕으로'
    : hasLesson
      ? '차시 학습 주제와 수업 자료를 함께 참고하여'
      : '다음 수업 자료를 바탕으로';

  const prompt = `당신은 초등학교 교사의 퀴즈 생성 도우미입니다.

${basisDesc} ${contextParts} 수준의 퀴즈 ${count}개를 만들어주세요.${hasSA ? ` (객관식 ${mcCount}개 + 주관식 ${saCount}개)` : ''}
${lessonContext}
【난이도】: ${DIFFICULTY_MAP[difficulty] || DIFFICULTY_MAP.normal}

【규칙】
${typeRules}
- ${grade}학년 학생이 이해할 수 있는 쉬운 언어 사용
- 각 문제마다 정답은 반드시 하나만 존재
- 해설은 정답이 왜 맞는지 개념 중심으로 간결하게 작성 (페이지, 출처, 자료 위치 언급 금지)

【반드시 JSON 배열 형식으로만 응답】 (설명 없이 JSON만)
${jsonExample}
${sourceSection}`;

  try {
    // PDF 포함 여부에 따라 메시지 구성
    let messageContent;
    if (pdfBase64) {
      messageContent = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
        { type: 'text', text: prompt },
      ];
    } else {
      messageContent = prompt;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 3000,
        messages:   [{ role: 'user', content: messageContent }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: `Claude API 오류: ${err.error?.message || response.statusText}`,
      });
    }

    const data    = await response.json();
    const rawText = data.content?.[0]?.text || '';

    // JSON 추출
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return res.status(500).json({
        error: '퀴즈 형식이 올바르지 않습니다. 다시 시도해주세요.',
        raw: rawText,
      });
    }

    const questions = JSON.parse(jsonMatch[0]);

    // 유효성 검사 (객관식/주관식 모두 지원)
    const valid = questions.every(q => {
      if (q.type === 'sa') {
        return q.question && typeof q.answer === 'string' && q.answer.trim();
      }
      return q.question && Array.isArray(q.options) && q.options.length === 4
        && typeof q.answer === 'number' && q.answer >= 0 && q.answer <= 3;
    });
    if (!valid) return res.status(500).json({ error: '생성된 퀴즈 형식이 올바르지 않습니다.' });

    return res.status(200).json({ questions, context: contextParts });

  } catch (err) {
    console.error('generate-quiz 에러:', err);
    return res.status(500).json({ error: err.message || '서버 오류가 발생했습니다.' });
  }
}
