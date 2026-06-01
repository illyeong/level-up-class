export const config = { maxDuration: 60 };

const SHAPE_TYPES = new Set([
  'clock', 'ruler', 'angle', 'fraction_bar', 'bar_chart', 'line_chart',
  'pie_chart', 'number_line', 'polygon', 'multi', 'rectangle', 'square',
  'circle', 'equilateral_triangle', 'isosceles_triangle', 'right_triangle',
  'parallelogram', 'rhombus', 'trapezoid', 'semicircle', 'symmetry',
]);

const stripOptionPrefix = (value) =>
  String(value ?? '')
    .trim()
    .replace(/^\s*(?:[\u2460-\u2463\u2776-\u2779]|[1-4][.)]\s*|[1-4]\s+)/u, '')
    .replace(/^\s*(?:[①②③④❶❷❸❹]|[1-4][.)]\s*|[1-4]\s+)/u, '')
    .trim() ||
  String(value ?? '').trim().replace(/^[①②③④1-4][.)\s]*/, '').trim();

const normalizeKey = (value) =>
  String(value ?? '').replace(/\s+/g, '').replace(/[①②③④0-9().,!?~]/g, '').slice(0, 80);

const gcd = (a, b) => {
  a = Math.abs(a); b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
};

const parseFractions = (text) => {
  const list = [];
  const re = /(\d+)\s*\/\s*(\d+)/g;
  let m;
  while ((m = re.exec(String(text || ''))) !== null) {
    const n = Number(m[1]);
    const d = Number(m[2]);
    if (d > 0) list.push({ n, d });
  }
  return list;
};

const evalFractionExpression = (text) => {
  const parts = String(text || '').split('+');
  const fractions = parts.map(part => parseFractions(part)[0]);
  if (!fractions.length || fractions.some(v => !v)) return null;
  let num = 0;
  let den = 1;
  fractions.forEach(f => {
    num = num * f.d + f.n * den;
    den *= f.d;
    const g = gcd(num, den);
    num /= g;
    den /= g;
  });
  return { num, den, value: num / den };
};

const evalFractionEquation = (text) => {
  const parts = String(text || '').split('=');
  if (parts.length !== 2) return null;
  const left = evalFractionExpression(parts[0]);
  const right = evalFractionExpression(parts[1]);
  if (!left || !right) return null;
  return Math.abs(left.value - right.value) < 1e-9;
};

const hasSameDenominatorFractionFocus = (payload, ragSection) => {
  const text = [
    payload?.unitName,
    payload?.lessonTitle,
    payload?.learningGoal,
    Array.isArray(payload?.keywords) ? payload.keywords.join(' ') : payload?.keywords,
    ragSection,
  ].filter(Boolean).join(' ');
  if (/분모가\s*같|같은\s*분모|동분모|분모는\s*그대로|분자끼리|진분수의\s*덧셈|분수의\s*덧셈/.test(text)) return true;
  return /분모가\s*같|같은\s*분모|동분모|분모는\s*그대로|분자끼리/.test(text);
};

const violatesSameDenominatorAddition = (text) => {
  const pieces = String(text || '').split(/[,\n]/);
  return pieces.some(piece => {
    if (!piece.includes('+')) return false;
    const left = piece.split('=')[0];
    const fractions = parseFractions(left);
    return fractions.length >= 2 && new Set(fractions.map(f => f.d)).size > 1;
  });
};

const hasMalformedFractionText = (text) =>
  /(^|[^\d])\/\s*\d+/.test(String(text || '')) || /\d+\s*\/(?!\s*\d)/.test(String(text || ''));

const getComparableFractionValue = (text) => {
  const expr = evalFractionExpression(text);
  if (expr) return expr.value;
  const frac = parseFractions(text)[0];
  return frac ? frac.n / frac.d : null;
};

const finite = (value, fallback = null) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const clamp = (value, min, max, fallback = min) =>
  Math.min(max, Math.max(min, finite(value, fallback)));

const asList = (value, max = 8) =>
  Array.isArray(value) ? value.slice(0, max) : [];

const cleanChart = (d, maxItems, positiveOnly = false) => {
  const labels = asList(d.labels, maxItems).map(v => String(v ?? '').trim()).filter(Boolean);
  const rawValues = asList(d.values, maxItems).map(v => finite(v)).filter(v => v != null && (!positiveOnly || v > 0));
  const n = Math.min(labels.length, rawValues.length, maxItems);
  if (n < 2) return null;
  return {
    ...d,
    labels: labels.slice(0, n),
    values: rawValues.slice(0, n),
    unit: String(d.unit || '').slice(0, 6),
    title: String(d.title || '').slice(0, 30),
  };
};

const sanitizeShape = (shape) => {
  if (!shape || typeof shape !== 'object' || !SHAPE_TYPES.has(shape.type)) return null;
  const type = shape.type;
  const d = shape.dimensions && typeof shape.dimensions === 'object' ? { ...shape.dimensions } : {};
  const unit = String(shape.unit || d.unit || '').slice(0, 6);

  if (type === 'bar_chart') {
    const cleaned = cleanChart(d, 6);
    return cleaned ? { type, dimensions: cleaned } : null;
  }
  if (type === 'line_chart') {
    const cleaned = cleanChart(d, 7);
    return cleaned ? { type, dimensions: cleaned } : null;
  }
  if (type === 'pie_chart') {
    const cleaned = cleanChart(d, 6, true);
    return cleaned ? { type, dimensions: cleaned } : null;
  }
  if (type === 'multi') {
    const allowed = new Set(['rectangle', 'square', 'circle', 'equilateral_triangle', 'isosceles_triangle', 'right_triangle', 'parallelogram', 'rhombus', 'trapezoid', 'semicircle']);
    const items = asList(d.items, 4)
      .map(v => String(v || '').trim())
      .map(v => v === 'triangle' ? 'equilateral_triangle' : v)
      .filter(v => allowed.has(v));
    return items.length >= 2 ? { type, dimensions: { ...d, items } } : null;
  }
  if (type === 'polygon') {
    return { type, dimensions: { ...d, sides: Math.round(clamp(d.sides, 3, 10, 5)), side: finite(d.side) || undefined }, unit };
  }
  if (type === 'angle') {
    return { type, dimensions: { ...d, degrees: Math.round(clamp(d.degrees, 1, 179, 90)) } };
  }
  if (type === 'clock') {
    return { type, dimensions: { ...d, hour: Math.round(clamp(d.hour, 1, 12, 3)), minute: Math.round(clamp(d.minute, 0, 59, 0)) } };
  }
  if (type === 'ruler') {
    const total = Math.round(clamp(d.total, 1, 30, 10));
    const from = clamp(d.highlight?.from, 0, total, 0);
    const to = clamp(d.highlight?.to, from, total, Math.min(total, from + 1));
    return { type, dimensions: { ...d, total, highlight: to > from ? { from, to } : undefined }, unit: unit || 'cm' };
  }
  if (type === 'number_line') {
    const min = finite(d.min, 0);
    const max = Math.max(min + 1, finite(d.max, 10));
    const marks = asList(d.marks, 8).map(v => finite(v)).filter(v => v != null && v >= min && v <= max);
    const from = finite(d.highlight?.from);
    const to = finite(d.highlight?.to);
    const highlight = from != null && to != null && to > from && from >= min && to <= max ? { from, to } : undefined;
    return { type, dimensions: { ...d, min, max, marks, highlight }, unit };
  }
  if (type === 'fraction_bar') {
    const total = Math.round(clamp(d.total, 2, 20, 4));
    const filled = Math.round(clamp(d.filled, 0, total, 1));
    const cmpTotal = d.compare ? Math.round(clamp(d.compare.total, 2, 20, total)) : null;
    const cmpFilled = d.compare ? Math.round(clamp(d.compare.filled, 0, cmpTotal, 1)) : null;
    return {
      type,
      dimensions: {
        ...d,
        total,
        filled,
        compare: cmpTotal ? { total: cmpTotal, filled: cmpFilled } : undefined,
        showLabel: false,
      },
    };
  }
  if (type === 'symmetry') {
    const axis = d.axis === 'horizontal' ? 'horizontal' : 'vertical';
    const cells = asList(d.cells, 8)
      .map(cell => Array.isArray(cell) ? { x: finite(cell[0]), y: finite(cell[1]) } : { x: finite(cell.x), y: finite(cell.y) })
      .filter(cell => Number.isFinite(cell.x) && Number.isFinite(cell.y))
      .map(cell => ({ x: Math.round(clamp(cell.x, 0, 7, 1)), y: Math.round(clamp(cell.y, 0, 7, 1)) }));
    return cells.length ? { type, dimensions: { axis, cells } } : null;
  }

  return { type, dimensions: d, unit };
};

const verifySameDenomQuestionAnswer = (q) => {
  const question = String(q.question || '');
  if (!/[+]|합|더|덧셈|모두/.test(question)) return true;
  const fractions = parseFractions(question);
  if (fractions.length < 2) return true;
  const dens = new Set(fractions.map(f => f.d));
  if (dens.size !== 1) return false;
  const den = fractions[0].d;
  const numeratorSum = fractions.reduce((sum, f) => sum + f.n, 0);
  const correctFractions = parseFractions(q.options?.[q.answerIndex] || '');
  if (correctFractions.length !== 1) return false;
  const correct = correctFractions[0];
  return correct.n === numeratorSum && correct.d === den;
};

const hasExactlyOneVerifiableAnswer = (q) => {
  const question = String(q.question || '');
  const options = q.options || [];
  const combined = [question, ...options, q.explanation].join('\n');
  if (hasMalformedFractionText(combined)) return false;
  if (/가장\s*큰|가장\s*작은/.test(question) && options.some(opt => String(opt).includes('/'))) {
    const values = options.map(getComparableFractionValue);
    if (values.some(v => v == null)) return false;
    const target = /가장\s*작은/.test(question) ? Math.min(...values) : Math.max(...values);
    const matches = values.map(v => Math.abs(v - target) < 1e-9);
    return matches.filter(Boolean).length === 1 && matches[q.answerIndex] === true;
  }
  if (!verifySameDenomQuestionAnswer(q)) return false;
  if (/올바른|맞는/.test(question) && options.some(opt => String(opt).includes('='))) {
    const checks = options.map(evalFractionEquation);
    if (checks.some(v => v === null)) return false;
    return checks.filter(Boolean).length === 1 && checks[q.answerIndex] === true;
  }
  if (/1보다\s*작은/.test(question)) {
    const checks = options.map(opt => {
      const value = evalFractionExpression(opt)?.value;
      return value == null ? null : value < 1;
    });
    if (checks.some(v => v === null)) return false;
    return checks.filter(Boolean).length === 1 && checks[q.answerIndex] === true;
  }
  return true;
};

function tryParseJson(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function normalizeQuestion(q, index, { sameDenomFocus = false } = {}) {
  if (!q || typeof q !== 'object') return null;

  const options = Array.isArray(q.options)
    ? q.options.map(stripOptionPrefix).filter(Boolean).slice(0, 4)
    : [];
  if (options.length !== 4) return null;

  let answerIndex = Number(q.answerIndex);
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) answerIndex = 0;

  const correct = options[answerIndex];
  const shift = index % 4;
  const rotated = [...options.slice(shift), ...options.slice(0, shift)];
  const rotatedAnswerIndex = rotated.findIndex(o => o === correct);

  const shape = sanitizeShape(q.shape);

  const normalized = {
    question: String(q.question || '').trim(),
    shape,
    options: rotated,
    answerIndex: rotatedAnswerIndex >= 0 ? rotatedAnswerIndex : answerIndex,
    explanation: String(q.explanation || '').trim(),
    skill: String(q.skill || q.questionType || '').trim() || undefined,
    difficultyTag: String(q.difficultyTag || '').trim() || undefined,
  };

  const combinedText = [normalized.question, ...normalized.options, normalized.explanation].join('\n');
  if (sameDenomFocus && violatesSameDenominatorAddition(combinedText)) return null;
  if (!hasExactlyOneVerifiableAnswer(normalized)) return null;

  return normalized;
}

function normalizeContent(result, poolSize, options = {}) {
  const questions = [];
  const seen = new Set();

  for (const [idx, raw] of (result.questions || []).entries()) {
    const q = normalizeQuestion(raw, idx, options);
    if (!q) continue;
    const key = normalizeKey(q.question);
    if (!q.question || q.question.length < 8 || !q.explanation || seen.has(key)) continue;
    seen.add(key);
    questions.push(q);
    if (questions.length >= poolSize) break;
  }

  return {
    title: String(result.title || 'AI 학습 콘텐츠').trim().slice(0, 40),
    conceptCards: Array.isArray(result.conceptCards)
      ? result.conceptCards.slice(0, 2).map(card => ({
          title: String(card.title || '').trim().slice(0, 40),
          body: String(card.body || '').trim().slice(0, 260),
          example: String(card.example || '').trim().slice(0, 160),
        })).filter(card => card.title && card.body)
      : [],
    commonMistakes: Array.isArray(result.commonMistakes)
      ? result.commonMistakes.map(v => String(v || '').trim()).filter(Boolean).slice(0, 4)
      : [],
    questions,
  };
}

function validateContent(result, poolSize) {
  const issues = [];
  if (!result.conceptCards?.length) issues.push('개념 카드가 없습니다.');
  if ((result.questions?.length || 0) < Math.min(8, poolSize)) {
    issues.push(`문제 풀이 부족합니다. 현재 ${result.questions?.length || 0}개`);
  }

  result.questions?.forEach((q, i) => {
    const n = i + 1;
    if (!q.question || q.question.length < 8) issues.push(`Q${n}: 문제 문장이 너무 짧습니다.`);
    if (!Array.isArray(q.options) || q.options.length !== 4) issues.push(`Q${n}: 보기가 4개가 아닙니다.`);
    if (new Set(q.options).size < 4) issues.push(`Q${n}: 중복 보기가 있습니다.`);
    if (!Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex > 3) issues.push(`Q${n}: 정답 인덱스 오류`);
    if (!q.explanation || q.explanation.length < 6) issues.push(`Q${n}: 해설이 부족합니다.`);
    if (q.shape && !SHAPE_TYPES.has(q.shape.type)) issues.push(`Q${n}: 지원하지 않는 shape type`);
  });

  return issues;
}

function buildPrompt(payload, poolSize, isUnitTest, ragSection) {
  const {
    grade, semester, publisher, unitName,
    lessonNo, lessonTitle, learningGoal, keywords,
    difficulty = 'normal', questionCount = 5,
  } = payload;

  const keywordStr = Array.isArray(keywords) ? keywords.join(', ') : (keywords || '');
  const diffLabel = difficulty === 'easy' ? '기초' : difficulty === 'hard' ? '심화' : '기본';
  const lessonLabel = isUnitTest ? '단원평가' : `${lessonNo ? `${lessonNo}차시 ` : ''}${lessonTitle}`;

  const sameDenomRules = hasSameDenominatorFractionFocus(payload, ragSection)
    ? `
[Same-denominator fraction rules]
- This lesson is about adding fractions with the same denominator.
- Every addition expression must use the same denominator on both addends.
- The correct answer keeps the denominator and adds only the numerators. Example: 2/7 + 3/7 = 5/7.
- 2/7 + 3/7 = 5/14 may appear only as a wrong distractor, never as the answer.
- If asking for the correct calculation, exactly one option must be true.
- Do not create off-target comparison questions such as "which is less than 1" for this lesson.
- For fraction_bar shapes, do not reveal the answer as a label; show only the visual bar.
`
    : '';

  return `당신은 대한민국 초등 수학 평가 문항을 만드는 교사입니다.
아래 수업 정보에 맞춰 학생용 AI 학습 콘텐츠를 완전한 JSON 하나로만 생성하세요.

${ragSection}
${sameDenomRules}
[수업 정보]
- 학년/학기: 초등학교 ${grade}학년${semester ? ` ${semester}학기` : ''}
- 과목/출판사: 수학${publisher ? ` / ${publisher}` : ''}
- 단원: ${unitName}
- 차시: ${lessonLabel}
- 학습 목표: ${learningGoal || '차시 핵심 개념을 이해하고 적용한다.'}
- 핵심 키워드: ${keywordStr || '차시 핵심 개념'}
- 난이도: ${diffLabel}
- 실제 세션 출제 수: ${questionCount}개
- 생성할 문제 풀: ${poolSize}개

[품질 기준]
1. 문제는 서로 다른 사고 과정을 요구해야 합니다. 숫자만 바꾼 반복 문제를 금지합니다.
2. 문제 유형을 골고루 섞으세요: 개념 확인, 계산, 문장제, 그림/표 해석, 실생활 적용, 오류 찾기.
3. 오답 보기는 학생이 실제로 할 법한 실수를 반영하세요. 터무니없는 보기는 금지합니다.
4. 같은 정답 위치가 반복되지 않게 answerIndex를 0~3에 고르게 배치하세요.
5. 문항은 초등학생이 읽기 쉬운 한국어로 쓰고, 한 문항 안에 불필요한 조건을 넣지 마세요.
6. 해설은 정답만 말하지 말고 왜 그런지 1~2문장으로 설명하세요.
7. 단원평가는 단원 전체를 골고루 다루고, 일반 차시는 해당 차시 내용에 집중하세요.
8. 시각 자료가 도움이 되는 문항은 shape를 반드시 넣으세요. 단순 계산 문항만 shape:null을 쓰세요.

[shape 예시]
- 시계: {"type":"clock","dimensions":{"hour":3,"minute":30}}
- 자: {"type":"ruler","dimensions":{"total":10,"highlight":{"from":2,"to":7}},"unit":"cm"}
- 분수막대: {"type":"fraction_bar","dimensions":{"total":5,"filled":3}}
- 수직선: {"type":"number_line","dimensions":{"min":0,"max":10,"marks":[3,7],"highlight":{"from":3,"to":7}}}
- 막대그래프: {"type":"bar_chart","dimensions":{"title":"좋아하는 과일","labels":["사과","배"],"values":[5,8],"unit":"명"}}
- 꺾은선그래프: {"type":"line_chart","dimensions":{"title":"기온 변화","labels":["월","화","수"],"values":[12,15,13],"unit":"도"}}
- 원그래프: {"type":"pie_chart","dimensions":{"title":"선호 조사","labels":["사과","배","귤"],"values":[4,3,3]}}
- 도형 비교: {"type":"multi","dimensions":{"items":["circle","rectangle","triangle"]}}
- 도형: rectangle, square, circle, right_triangle, parallelogram, rhombus, trapezoid 등을 사용할 수 있습니다.
- 대칭: {"type":"symmetry","dimensions":{"axis":"vertical","cells":[{"x":1,"y":1},{"x":2,"y":3}]}}
- 그래프는 labels와 values 개수를 반드시 같게 만들고, values에는 숫자만 넣으세요.
- 대칭은 좌표평면 계산이 아니라 격자에서 대칭축을 기준으로 같은 위치를 찾는 초등 수준 문제에만 쓰세요.

[반환 JSON 형식]
{
  "title": "짧은 제목",
  "conceptCards": [
    {"title": "개념 1", "body": "핵심 설명 2~3문장", "example": "간단한 예시"},
    {"title": "개념 2", "body": "핵심 설명 2~3문장", "example": "간단한 예시"}
  ],
  "commonMistakes": ["자주 하는 실수 1", "자주 하는 실수 2"],
  "questions": [
    {
      "question": "문제 문장",
      "shape": null,
      "options": ["보기1", "보기2", "보기3", "보기4"],
      "answerIndex": 0,
      "explanation": "해설",
      "skill": "문항 유형",
      "difficultyTag": "기초|적용|심화"
    }
  ]
}

JSON 외의 설명, 마크다운, 코드블록은 절대 쓰지 마세요.`;
}

async function callClaude({ apiKey, model, prompt, maxTokens }) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0.75,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || response.statusText);
  }

  const data = await response.json();
  return data.content?.[0]?.text || '';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: '허용되지 않는 메서드입니다.' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' });

  const payload = req.body || {};
  const { grade, semester, publisher, unitName, lessonNo, lessonTitle, questionCount = 5, lessonContext } = payload;
  if (!grade || !unitName || !lessonTitle) {
    return res.status(400).json({ error: '학년, 단원명, 차시명을 입력해주세요.' });
  }

  const isUnitTest = lessonTitle === '단원평가';
  const requested = Number(questionCount) || 5;
  const poolSize = isUnitTest
    ? Math.min(Math.max(requested + 5, 10), 12)
    : Math.min(Math.max(requested + 3, 8), 10);

  const context = [
    `초등학교 ${grade}학년`,
    semester ? `${semester}학기` : '',
    '수학',
    publisher ? `(${publisher})` : '',
    unitName,
    lessonNo ? `${lessonNo}차시` : '',
    lessonTitle,
  ].filter(Boolean).join(' ');

  const ragSection = lessonContext
    ? `[교사가 등록한 교과서/수업 자료]\n${String(lessonContext).slice(0, 3000)}\n\n위 자료를 최우선 근거로 삼으세요. 자료에 없는 내용은 초등 교육과정 범위 안에서만 보완하세요.`
    : '[교사가 등록한 교과서/수업 자료 없음]\n초등 교육과정 수준에 맞춰 차시 핵심 개념 중심으로 생성하세요.';

  try {
    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
    const prompt = buildPrompt(payload, poolSize, isUnitTest, ragSection);
    const rawText = await callClaude({
      apiKey,
      model,
      prompt,
      maxTokens: isUnitTest ? 5500 : 4500,
    });

    const parsed = tryParseJson(rawText);
    if (!parsed) {
      return res.status(500).json({ error: 'AI 응답을 JSON으로 해석하지 못했습니다. 다시 시도해주세요.' });
    }

    const sameDenomFocus = hasSameDenominatorFractionFocus(payload, ragSection);
    const result = normalizeContent(parsed, poolSize, { sameDenomFocus });
    const validationIssues = validateContent(result, poolSize);

    if (!result.questions.length) {
      return res.status(500).json({ error: '사용 가능한 문제가 생성되지 않았습니다. 다시 시도해주세요.' });
    }

    return res.status(200).json({
      ...result,
      context,
      generatedBy: 'ai',
      generatorVersion: 'quality-v6-shape-fix',
      requestedQuestionCount: requested,
      poolSize: result.questions.length,
      validationIssues: validationIssues.length > 0 ? validationIssues : null,
      validatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('generate-courseware error:', err);
    return res.status(500).json({ error: err.message || '서버 오류가 발생했습니다.' });
  }
}
