export const config = { maxDuration: 60, api: { bodyParser: { sizeLimit: '30mb' } } };
/**
 * Vercel Serverless Function — 퀴즈 자동 생성
 * Claude API (Anthropic) 사용
 */
/**
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

  const totalCount = Math.max(1, Math.min(20, parseInt(count) || 5));
  const saCount = Math.min(totalCount, Math.max(0, parseInt(bodySaCount) || 0));
  const mcCount = Math.max(0, totalCount - saCount);
  const hasSA   = saCount > 0;

  const contextParts = [
    `초등학교 ${grade}학년`,
    semester ? `${semester}학기` : '',
    subject,
    publisher && publisher !== '국정' ? `(${publisher})` : '',
    unit || '',
  ].filter(Boolean).join(' ');

  const buildTypeRules = (batchMcCount, batchSaCount) => batchSaCount > 0
    ? `- 객관식 ${batchMcCount}개: 4지 선다형, 보기 4개, 보기는 비슷한 길이
- 주관식 ${batchSaCount}개: 단답형, 정답은 짧은 단어/구문 (최대 10자)`
    : `- 4지 선다형 객관식 (보기 4개), 보기는 모두 비슷한 길이와 형식`;

  const buildJsonExample = (batchMcCount, batchSaCount) => batchSaCount > 0
    ? `객관식 예시: {"type":"mc","question":"문제","table":null,"shape":null,"options":["①보기1","②보기2","③보기3","④보기4"],"answer":0,"explanation":"해설"}
주관식 예시: {"type":"sa","question":"문제","table":null,"shape":null,"answer":"정답단어","explanation":"해설"}

answer(객관식): 0~3 사이 정수 (0=①, 1=②, 2=③, 3=④)
answer(주관식): 정답 문자열 (짧은 단어/구문)
배열 순서: 객관식 ${batchMcCount}개 먼저, 주관식 ${batchSaCount}개 나중에`
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
    ? '아래 차시 학습 목표와 핵심 키워드를 바탕으로'
    : hasLesson
      ? '차시 정보와 수업 자료를 함께 참고하여'
      : '아래 수업 자료를 바탕으로';

  const buildPrompt = (batchCount, batchMcCount, batchSaCount, batchIndex = 0) => `당신은 15년 경력의 초등학교 수학 교사이자 교육과정 전문가입니다.
${basisDesc} ${contextParts} 수준의 고품질 퀴즈 ${batchCount}개를 만들어주세요.${batchSaCount > 0 ? ` (객관식 ${batchMcCount}개 + 주관식 ${batchSaCount}개)` : ''}
${batchIndex > 0 ? `\n※ 이번 요청은 전체 ${totalCount}문항 중 추가 묶음입니다. 앞선 묶음과 문제 상황, 숫자, 정답이 겹치지 않게 만들어주세요.` : ''}
${lessonContext}
═══ 품질 기준 ═══

【난이도】: ${DIFFICULTY_MAP[difficulty] || DIFFICULTY_MAP.normal}

【문제 유형 균형】
${buildTypeRules(batchMcCount, batchSaCount)}
- 단순 암기로 풀 수 있는 문제 금지 — 반드시 계산하거나 개념을 적용해야 풀 수 있도록
- ${batchCount >= 5 ? `${batchCount}개 중 최소 2개` : `${batchCount}개 중 최소 1개`}는 실생활 맥락의 문장제 (이름, 상황 포함)
- 같은 유형 반복 금지

【오답 설계 원칙 — 핵심】
각 오답은 학생들이 실제로 저지르는 "의미 있는 실수"를 반영:
  - 자릿값 혼동 (십의 자리 ↔ 일의 자리)
  - 받아올림/받아내림 누락
  - 연산 방향 오류
  - 단위 혼동
  - 절반만 계산하고 끝낸 경우
❌ 금지: 정답이 383인데 보기가 1, 2, 3 같이 터무니없이 다른 숫자
✅ 권장: 정답 383 → 373(받아올림 누락), 393(십의 자리 오류), 284(더하기/빼기 혼동)

【언어 수준】
- ${grade}학년 학생의 어휘 수준 사용
- 교과서 문장 복사 금지
- 해설에서 오답이 왜 틀렸는지 1줄씩 설명

【JSON 배열로만 응답】 (설명 없이 JSON만)
${buildJsonExample(batchMcCount, batchSaCount)}

options 주의: ①②③④ 기호 없이 보기 내용만 (기호는 자동 추가됨)
${sourceSection}`;

  try {
    const callClaudeBatch = async ({ batchCount, batchMcCount, batchSaCount, batchIndex }) => {
      const prompt = buildPrompt(batchCount, batchMcCount, batchSaCount, batchIndex);
      const messageContent = pdfBase64
        ? [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
            { type: 'text', text: prompt },
          ]
        : prompt;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model:      'claude-sonnet-4-6',
          max_tokens: Math.min(8000, 1800 + batchCount * 650),
          messages:   [{ role: 'user', content: messageContent }],
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`Claude API 오류: ${err.error?.message || response.statusText}`);
      }

      const data    = await response.json();
      const rawText = data.content?.[0]?.text || '';

      // 마크다운 코드블록 제거 후 JSON 추출
      const stripped = rawText.replace(/```(?:json)?\s*/g, '').replace(/```/g, '');
      const jsonMatch = stripped.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('퀴즈 형식이 올바르지 않습니다. 다시 시도해주세요.');
      }

      return JSON.parse(jsonMatch[0]);
    };

    const batches = [];
    let remainingCount = totalCount;
    let remainingSaCount = saCount;
    let batchIndex = 0;
    while (remainingCount > 0) {
      const batchCount = Math.min(10, remainingCount);
      const batchSaCount = Math.min(remainingSaCount, batchCount);
      const batchMcCount = batchCount - batchSaCount;
      batches.push({ batchCount, batchMcCount, batchSaCount, batchIndex });
      remainingCount -= batchCount;
      remainingSaCount -= batchSaCount;
      batchIndex += 1;
    }

    const questions = (await Promise.all(batches.map(callClaudeBatch))).flat().slice(0, totalCount);

    if (questions.length !== totalCount) {
      return res.status(500).json({
        error: `생성된 문항 수가 부족합니다. 요청 ${totalCount}개 / 생성 ${questions.length}개`,
      });
    }

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
