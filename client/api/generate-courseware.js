export const config = { maxDuration: 60 };

const SHAPE_TYPES = new Set([
  'clock', 'ruler', 'angle', 'fraction_bar', 'bar_chart', 'line_chart',
  'pie_chart', 'number_line', 'polygon', 'multi', 'rectangle', 'square',
  'circle', 'equilateral_triangle', 'isosceles_triangle', 'right_triangle',
  'parallelogram', 'rhombus', 'trapezoid', 'semicircle', 'symmetry',
  'cuboid', 'cube', 'cylinder', 'cone', 'sphere', 'factor_list',
]);

const COURSEWARE_GENERATOR_VERSION = 'quality-v11-topic-visual-fraction-guard';

const stripOptionPrefix = (value) =>
  String(value ?? '')
    .trim()
    .replace(/^\s*(?:[\u2460-\u2463\u2776-\u2779])\s*/u, '')
    .replace(/^\s*(?:[1-4][.)])\s+/u, '')
    .replace(/^\s*(?:[①②③④❶❷❸❹])\s*/u, '')
    .trim() ||
  String(value ?? '').trim().replace(/^[①②③④]\s*/, '').trim();

const normalizeKey = (value) =>
  String(value ?? '').replace(/\s+/g, '').replace(/[①②③④0-9().,!?~]/g, '').slice(0, 80);

const normalizeText = (value) => String(value ?? '').normalize('NFKC').toLowerCase();

const includesAny = (text, words) => {
  const src = normalizeText(text);
  return words.some(word => src.includes(normalizeText(word)));
};

const lessonTopicText = (payload, ragSection = '') => [
  payload?.unitName,
  payload?.lessonTitle,
  payload?.learningGoal,
  Array.isArray(payload?.keywords) ? payload.keywords.join(' ') : payload?.keywords,
  ragSection,
].filter(Boolean).join(' ');

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
  const compact = String(text || '').replace(/\s+/g, '');
  const parts = compact.match(/[+-]?[^+-]+/g) || [];
  const fractions = parts.map(part => {
    const sign = part.startsWith('-') ? -1 : 1;
    const raw = part.replace(/^[+-]/, '');
    const fraction = parseFractions(raw)[0];
    return fraction ? { n: fraction.n * sign, d: fraction.d } : null;
  });
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

const simplifyFraction = ({ num, den }) => {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return null;
  const g = gcd(num, den);
  return { num: num / g, den: den / g, value: num / den };
};

const sameFraction = (a, b) => {
  const left = simplifyFraction(a);
  const right = simplifyFraction(b);
  return !!left && !!right && left.num === right.num && left.den === right.den;
};

const getSameDenominatorSum = (text) => {
  const src = String(text || '');
  const asksSum = src.includes('+') || includesAny(src, ['합', '더', '모두', '얼마', '구하']);
  if (!asksSum) return null;
  const leftSide = src.split('=')[0];
  const fractions = parseFractions(leftSide);
  if (fractions.length < 2) return null;
  const dens = new Set(fractions.map(f => f.d));
  if (dens.size !== 1) return null;
  return { num: fractions.reduce((sum, f) => sum + f.n, 0), den: fractions[0].d };
};

const getFractionOperationExpected = (text) => {
  const src = String(text || '');
  if (!/[+-]/.test(src) && !includesAny(src, ['합', '더', '덧셈', '차', '빼', '뺐', '남은'])) return null;
  const fractions = parseFractions(src.split('=')[0]);
  if (fractions.length < 2) return null;
  const isSubtraction = /-/.test(src) || (includesAny(src, ['차', '빼', '뺐', '남은']) && !includesAny(src, ['합', '더', '덧셈', '모두']));
  let num = fractions[0].n;
  let den = fractions[0].d;
  fractions.slice(1).forEach(f => {
    num = isSubtraction ? num * f.d - f.n * den : num * f.d + f.n * den;
    den *= f.d;
    const g = gcd(num, den);
    num /= g;
    den /= g;
  });
  return simplifyFraction({ num, den });
};

const uniqueIndex = (items, predicate) => {
  const matches = items.map(predicate);
  return matches.filter(Boolean).length === 1 ? matches.findIndex(Boolean) : -1;
};

const hasKoreanPhrase = (text, phrases) => {
  const src = normalizeText(text);
  return phrases.some(phrase => src.includes(normalizeText(phrase)));
};

const fixFractionAnswer = (q) => {
  const options = q.options || [];
  const combined = [q.question, ...options, q.explanation].join('\n');
  if (hasMalformedFractionText(combined)) return null;

  const equationChecks = options.map(evalFractionEquation);
  if (equationChecks.some(v => v !== null)) {
    if (equationChecks.some(v => v === null)) return null;
    const idx = uniqueIndex(equationChecks, Boolean);
    return idx >= 0 ? { ...q, answerIndex: idx } : null;
  }

  const expected = getFractionOperationExpected(q.question) || getSameDenominatorSum(q.question);
  if (expected) {
    const idx = uniqueIndex(options, opt => {
      const fractions = parseFractions(opt);
      return fractions.length === 1 && sameFraction(fractions[0], expected);
    });
    return idx >= 0 ? { ...q, answerIndex: idx } : null;
  }

  const asksLargest = hasKoreanPhrase(q.question, ['가장 큰', '제일 큰', '큰 것은', '가장 클']);
  const asksSmallest = hasKoreanPhrase(q.question, ['가장 작은', '제일 작은', '작은 것은', '1보다 작은']);
  if ((asksLargest || asksSmallest) && options.some(opt => String(opt).includes('/'))) {
    const values = options.map(getComparableFractionValue);
    if (values.some(v => v == null)) return null;
    const target = asksSmallest ? Math.min(...values) : Math.max(...values);
    const idx = uniqueIndex(values, v => Math.abs(v - target) < 1e-9);
    return idx >= 0 ? { ...q, answerIndex: idx } : null;
  }

  return q;
};

const hasSameDenominatorFractionFocus = (payload, ragSection) => {
  const text = lessonTopicText(payload, ragSection);
  if (includesAny(text, ['이분모', '통분', '분모가 다른'])) return false;
  return includesAny(text, ['분모가 같은', '같은 분모', '동분모', '분모는 그대로', '분자끼리']);
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

const isFactorMultipleLesson = (payload, ragSection = '') =>
  includesAny(lessonTopicText(payload, ragSection), ['약수', '공약수', '최대공약수', '배수', '공배수', '최소공배수']);

const isSolidShapeLesson = (payload, ragSection = '') =>
  includesAny(lessonTopicText(payload, ragSection), ['입체도형', '직육면체', '정육면체', '각기둥', '각뿔', '원기둥', '원뿔', '구']);

const buildLessonContext = (payload, ragSection = '') => {
  const text = lessonTopicText(payload, ragSection);
  return {
    sameDenomFocus: hasSameDenominatorFractionFocus(payload, ragSection),
    factorMultiple: isFactorMultipleLesson(payload, ragSection),
    solidShape: isSolidShapeLesson(payload, ragSection),
    timeLesson: includesAny(text, ['시각', '시간', '시계', '몇 시', '몇 분']),
    angleLesson: includesAny(text, ['각도', '각의 크기', '몇 도', '예각', '둔각']),
    measurementLesson: includesAny(text, ['길이', '재기', 'cm', 'm', '자']),
    areaLesson: includesAny(text, ['넓이', '둘레']),
    fractionLesson: includesAny(text, ['분수', '진분수', '대분수', '통분', '약분']),
  };
};

const sanitizeShape = (shape, context = {}) => {
  if (!shape || typeof shape !== 'object' || !SHAPE_TYPES.has(shape.type)) return null;
  const type = shape.type;
  const d = shape.dimensions && typeof shape.dimensions === 'object' ? { ...shape.dimensions } : {};
  const unit = String(shape.unit || d.unit || '').slice(0, 6);
  if (context.factorMultiple && ['bar_chart', 'line_chart', 'pie_chart'].includes(type)) return null;
  if (type === 'factor_list') {
    const groups = asList(d.groups, 3)
      .map(group => ({
        label: String(group?.label || '').trim().slice(0, 20),
        values: asList(group?.values, 12).map(v => finite(v)).filter(v => v != null).map(v => Math.round(v)),
      }))
      .filter(group => group.label && group.values.length);
    const highlight = asList(d.highlight, 12).map(v => finite(v)).filter(v => v != null).map(v => Math.round(v));
    return groups.length ? { type, dimensions: { groups, highlight } } : null;
  }

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
    const solidTypes = new Set(['cuboid', 'cube', 'cylinder', 'cone', 'sphere']);
    const allowed = context.solidShape
      ? solidTypes
      : new Set(['rectangle', 'square', 'circle', 'equilateral_triangle', 'isosceles_triangle', 'right_triangle', 'parallelogram', 'rhombus', 'trapezoid', 'semicircle', 'cuboid', 'cube', 'cylinder', 'cone', 'sphere']);
    const items = asList(d.items, 4)
      .map(v => String(v || '').trim())
      .map(v => v === 'triangle' ? 'equilateral_triangle' : v)
      .filter(v => allowed.has(v));
    return items.length >= 2 ? { type, dimensions: { ...d, items } } : null;
  }
  if (context.solidShape && !['cuboid', 'cube', 'cylinder', 'cone', 'sphere'].includes(type)) return null;
  if (['cuboid', 'cube', 'cylinder', 'cone', 'sphere'].includes(type)) {
    return { type, dimensions: d, unit };
  }
  if (type === 'polygon') {
    return { type, dimensions: { ...d, sides: Math.round(clamp(d.sides, 3, 10, 5)), side: finite(d.side) || undefined }, unit };
  }
  if (type === 'angle') {
    if (!context.angleLesson) return null;
    return { type, dimensions: { ...d, degrees: Math.round(clamp(d.degrees, 1, 179, 90)) } };
  }
  if (type === 'clock') {
    if (!context.timeLesson) return null;
    return { type, dimensions: { ...d, hour: Math.round(clamp(d.hour, 1, 12, 3)), minute: Math.round(clamp(d.minute, 0, 59, 0)) } };
  }
  if (type === 'ruler') {
    if (!context.measurementLesson) return null;
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

const verifyFractionQuestionAnswer = (q) => {
  const question = String(q.question || '');
  const expected = getFractionOperationExpected(question);
  if (!expected) return true;
  const correctFractions = parseFractions(q.options?.[q.answerIndex] || '');
  if (correctFractions.length !== 1) return false;
  return sameFraction(correctFractions[0], expected);
};

const isOffTopicQuestion = (q, context = {}) => {
  const text = [q.question, ...(q.options || []), q.explanation].join(' ');
  if (!context.timeLesson && /시계|시침|분침|몇\s*시|몇\s*분|시간\s*(뒤|전)/.test(text)) return true;
  if (!context.angleLesson && /각도|몇\s*도|예각|둔각/.test(text)) return true;
  if (!context.areaLesson && /넓이|둘레/.test(text)) return true;
  if (!context.fractionLesson && hasMalformedFractionText(text)) return true;
  return false;
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
  if (!verifyFractionQuestionAnswer(q)) return false;
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

function normalizeQuestion(q, index, context = {}) {
  if (!q || typeof q !== 'object') return null;

  const options = Array.isArray(q.options)
    ? q.options.map(stripOptionPrefix).filter(Boolean).slice(0, 4)
    : [];
  if (options.length !== 4) return null;

  let answerIndex = Number(q.answerIndex);
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) answerIndex = 0;

  const fractionFixed = fixFractionAnswer({
    question: String(q.question || '').trim(),
    options,
    answerIndex,
    explanation: String(q.explanation || '').trim(),
  });
  if (!fractionFixed) return null;

  answerIndex = fractionFixed.answerIndex;
  const correct = options[answerIndex];
  const shift = index % 4;
  const rotated = [...options.slice(shift), ...options.slice(0, shift)];
  const rotatedAnswerIndex = rotated.findIndex(o => o === correct);

  if (isOffTopicQuestion(fractionFixed, context)) return null;

  const rawShapeType = q.shape?.type;
  if (context.factorMultiple && ['bar_chart', 'line_chart', 'pie_chart'].includes(rawShapeType)) return null;
  if (context.solidShape && rawShapeType && rawShapeType !== 'multi' && !['cuboid', 'cube', 'cylinder', 'cone', 'sphere'].includes(rawShapeType)) return null;

  const shape = sanitizeShape(q.shape, context);

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
  if (context.sameDenomFocus && violatesSameDenominatorAddition(combinedText)) return null;
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
  const factorRules = isFactorMultipleLesson(payload)
    ? `
[Factor/multiple visual rules]
- This lesson is about factors, common factors, multiples, or common multiples.
- Do not use bar_chart, line_chart, or pie_chart for factor lists. A bar chart showing "number of factors" is not useful for solving common factor questions.
- For factor/common-factor questions, use factor_list shape.
- Example: {"type":"factor_list","dimensions":{"groups":[{"label":"8의 약수","values":[1,2,4,8]},{"label":"12의 약수","values":[1,2,3,4,6,12]}],"highlight":[1,2,4]}}
- For multiple/common-multiple questions, use factor_list with labels such as "4의 배수", "6의 배수" and highlight common values.
`
    : '';
  const solidShapeRules = isSolidShapeLesson(payload)
    ? `
[Solid-shape visual rules]
- This lesson is about three-dimensional solids.
- Do not use flat 2D shapes such as rectangle, square, circle, or triangle as the visual for solid-shape questions.
- Use cuboid, cube, cylinder, cone, sphere, or multi with only those solid types.
- If the question asks about a real-life object, the visual must still show the matching solid type, not a flat face.
`
    : '';

  return `당신은 대한민국 초등 수학 평가 문항을 만드는 교사입니다.
아래 수업 정보에 맞춰 학생용 AI 학습 콘텐츠를 완전한 JSON 하나로만 생성하세요.

${ragSection}
${sameDenomRules}
${factorRules}
${solidShapeRules}
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
- 입체도형: cuboid(직육면체), cube(정육면체), cylinder(원기둥), cone(원뿔), sphere(구)를 사용할 수 있습니다.
- 입체도형 비교: {"type":"multi","dimensions":{"items":["cuboid","cube","cylinder","cone"]}}
- 대칭: {"type":"symmetry","dimensions":{"axis":"vertical","cells":[{"x":1,"y":1},{"x":2,"y":3}]}}
- 약수/공약수 목록: {"type":"factor_list","dimensions":{"groups":[{"label":"8의 약수","values":[1,2,4,8]},{"label":"12의 약수","values":[1,2,3,4,6,12]}],"highlight":[1,2,4]}}
- 그래프는 labels와 values 개수를 반드시 같게 만들고, values에는 숫자만 넣으세요.
- 대칭은 좌표평면 계산이 아니라 격자에서 대칭축을 기준으로 같은 위치를 찾는 초등 수준 문제에만 쓰세요.
- 직육면체/정육면체/원기둥/원뿔/구 문제에서는 rectangle, square, circle 같은 2D 도형으로 대체하지 말고 입체도형 타입을 쓰세요.
- 약수/공약수/배수/공배수 문제에서는 그래프를 쓰지 말고 factor_list를 쓰세요.

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

    const lessonContextFlags = buildLessonContext(payload, ragSection);
    const result = normalizeContent(parsed, poolSize, lessonContextFlags);
    const validationIssues = validateContent(result, poolSize);

    if (!result.questions.length) {
      return res.status(500).json({ error: '사용 가능한 문제가 생성되지 않았습니다. 다시 시도해주세요.' });
    }

    return res.status(200).json({
      ...result,
      context,
      generatedBy: 'ai',
      generatorVersion: COURSEWARE_GENERATOR_VERSION,
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
