export const config = { maxDuration: 60 };

import { hasMissingRequiredVisual, inferFractionBarShape } from '../src/utils/inferFractionBarShape.js';
import { validateDeterministicMathQuestion } from '../src/utils/validateCoursewareMathQuestion.js';

const SHAPE_TYPES = new Set([
  'clock', 'ruler', 'angle', 'fraction_bar', 'picture_graph', 'bar_chart', 'line_chart',
  'pie_chart', 'band_chart', 'number_line', 'polygon', 'multi', 'rectangle', 'square',
  'circle', 'equilateral_triangle', 'isosceles_triangle', 'right_triangle',
  'parallelogram', 'rhombus', 'trapezoid', 'semicircle', 'symmetry',
  'cuboid', 'cube', 'triangular_prism', 'square_pyramid', 'cylinder', 'cone', 'sphere', 'factor_list',
]);

const COURSEWARE_GENERATOR_VERSION = 'quality-v20-range-rounding-qa';

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

const normalizeMathText = (value) =>
  normalizeText(value)
    .replace(/[−–—]/g, '-')
    .replace(/[×xX]/g, '*')
    .replace(/[÷]/g, '/')
    .replace(/(\d+)\s*(?:과|와)\s*(\d+)\s*\/\s*(\d+)/g, '$1 $2/$3');

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

const parseSingleFractionValue = (text) => {
  const src = normalizeMathText(text).trim();
  const mixed = src.match(/(-?\d+)\s+(\d+)\s*\/\s*(\d+)/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const numerator = Number(mixed[2]);
    const denominator = Number(mixed[3]);
    if (denominator <= 0 || numerator >= denominator) return null;
    const sign = whole < 0 ? -1 : 1;
    return simplifyFraction({ num: whole * denominator + sign * numerator, den: denominator });
  }
  const fraction = src.match(/(-?\d+)\s*\/\s*(\d+)/);
  if (fraction) return simplifyFraction({ num: Number(fraction[1]), den: Number(fraction[2]) });
  const integer = src.match(/^-?\d+$/);
  return integer ? simplifyFraction({ num: Number(integer[0]), den: 1 }) : null;
};

const evalFractionExpression = (text) => {
  const compact = normalizeMathText(text).replace(/\s+(?=\d+\s*\/)/g, ' ');
  const parts = compact.match(/[+-]?\s*\d+(?:\s+\d+\s*\/\s*\d+|\s*\/\s*\d+)?/g) || [];
  const fractions = parts.map(part => {
    const sign = part.startsWith('-') ? -1 : 1;
    const raw = part.replace(/^[+-]/, '').trim();
    const fraction = parseSingleFractionValue(raw);
    return fraction ? { n: fraction.num * sign, d: fraction.den } : null;
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

const getFractionMulDivExpected = (text) => {
  const operand = String.raw`(?:\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+)`;
  const match = String(text || '').match(new RegExp(`(${operand})\\s*([×xX*÷])\\s*(${operand})`));
  if (!match) return null;
  const left = parseSingleFractionValue(match[1]);
  const right = parseSingleFractionValue(match[3]);
  if (!left || !right || (match[2] === '÷' && right.num === 0)) return null;
  return match[2] === '÷'
    ? simplifyFraction({ num: left.num * right.den, den: left.den * right.num })
    : simplifyFraction({ num: left.num * right.num, den: left.den * right.den });
};

const evalFractionMulDivEquation = (text) => {
  const parts = String(text || '').split('=');
  if (parts.length !== 2) return null;
  const left = getFractionMulDivExpected(parts[0]);
  const right = parseSingleFractionValue(parts[1]);
  return left && right ? sameFraction(left, right) : null;
};

const uniqueIndex = (items, predicate) => {
  const matches = items.map(predicate);
  return matches.filter(Boolean).length === 1 ? matches.findIndex(Boolean) : -1;
};

const evaluateWholeNumberExpression = (text) => {
  const numbers = String(text || '').match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
  const operators = String(text || '').match(/[+\-×xX*÷]/g) || [];
  if (numbers.length < 2 || operators.length !== numbers.length - 1) return null;
  const reducedNumbers = [numbers[0]];
  const reducedOperators = [];
  operators.forEach((operator, index) => {
    const next = numbers[index + 1];
    if (operator === '×' || operator === 'x' || operator === 'X' || operator === '*' || operator === '÷') {
      const previous = reducedNumbers.pop();
      reducedNumbers.push(operator === '÷' ? (next === 0 ? NaN : previous / next) : previous * next);
    } else {
      reducedOperators.push(operator);
      reducedNumbers.push(next);
    }
  });
  const result = reducedOperators.reduce(
    (value, operator, index) => operator === '+' ? value + reducedNumbers[index + 1] : value - reducedNumbers[index + 1],
    reducedNumbers[0],
  );
  return Number.isFinite(result) ? result : null;
};

const getWholeNumberExpected = (text) => {
  const source = String(text || '');
  const numberPattern = String.raw`\d+(?:\.\d+)?`;
  const expressionPattern = new RegExp(`(${numberPattern}\\s*[+\\-×xX*÷]\\s*${numberPattern}(?:\\s*[+\\-×xX*÷]\\s*${numberPattern})?)`);
  const equation = source.match(new RegExp(`${expressionPattern.source}\\s*=\\s*[?□]`));
  if (equation) return evaluateWholeNumberExpression(equation[1]);
  if (!includesAny(source, ['계산하세요', '계산하면', '계산하여', '계산을 하세요', '값은 얼마'])) return null;
  const expressions = source.match(new RegExp(expressionPattern.source, 'g')) || [];
  return expressions.length === 1 ? evaluateWholeNumberExpression(expressions[0]) : null;
};

const parseWholeNumberOption = (value) => {
  const match = String(value ?? '').trim().match(/^(-?\d+(?:\.\d+)?)(?:개|명|마리|자루|점|m|cm|㎡|㎠|㎥|%|배)?$/);
  return match ? Number(match[1]) : null;
};

const getWholeNumberComparisonIndex = (question, options) => {
  const asksLargest = includesAny(question, ['계산 결과가 가장 큰']);
  const asksSmallest = includesAny(question, ['계산 결과가 가장 작은']);
  if (!asksLargest && !asksSmallest) return null;
  const values = options.map(option => {
    const expression = String(option || '').match(/^\s*\d+(?:\.\d+)?\s*[+\-×xX*÷]\s*\d+(?:\.\d+)?\s*$/);
    return expression ? evaluateWholeNumberExpression(expression[0]) : parseWholeNumberOption(option);
  });
  if (values.some(value => value == null)) return -1;
  const target = asksSmallest ? Math.min(...values) : Math.max(...values);
  return uniqueIndex(values, value => value === target);
};

const hasKoreanPhrase = (text, phrases) => {
  const src = normalizeText(text);
  return phrases.some(phrase => src.includes(normalizeText(phrase)));
};

const getEquivalentFractionPairIndex = (question, options = []) => {
  if (!includesAny(question, ['크기가 같은 분수끼리', '같은 크기의 분수', '서로 같은 분수', '같은 분수끼리'])) return null;
  const checks = options.map(option => {
    const fractions = parseFractions(option);
    return fractions.length === 2 ? sameFraction(fractions[0], fractions[1]) : null;
  });
  if (checks.some(check => check === null)) return -1;
  return uniqueIndex(checks, Boolean);
};

const fixFractionAnswer = (q) => {
  const options = q.options || [];
  const combined = [q.question, ...options, q.explanation].join('\n');
  if (hasMalformedFractionText(combined)) return null;

  const equivalentPairIndex = getEquivalentFractionPairIndex(q.question, options);
  if (equivalentPairIndex != null) {
    return equivalentPairIndex >= 0 ? { ...q, answerIndex: equivalentPairIndex } : null;
  }

  const equationChecks = options.map(evalFractionEquation);
  if (equationChecks.some(v => v !== null)) {
    if (equationChecks.some(v => v === null)) return null;
    const idx = uniqueIndex(equationChecks, Boolean);
    return idx >= 0 ? { ...q, answerIndex: idx } : null;
  }

  const expected = getFractionOperationExpected(q.question)
    || getFractionMulDivExpected(q.question)
    || getSameDenominatorSum(q.question);
  if (expected) {
    const idx = uniqueIndex(options, opt => {
      const value = parseSingleFractionValue(opt);
      return value && sameFraction(value, expected);
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
  const text = lessonTopicText(payload);
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

const fractionAddSubExpressions = (text) =>
  String(text || '').match(/\d+\s*\/\s*\d+\s*[+\-]\s*\d+\s*\/\s*\d+/g) || [];

const hasFractionAddSubExpression = (text) => fractionAddSubExpressions(text).length > 0;

const hasUnlikeDenominatorAddSub = (text) =>
  fractionAddSubExpressions(text).some(expression => {
    const fractions = parseFractions(expression);
    return fractions.length >= 2 && new Set(fractions.map(f => f.d)).size > 1;
  });

const hasFractionMultiplyDivideExpression = (text) =>
  /\d+\s*\/\s*\d+\s*[×xX*÷]\s*\d+\s*\/\s*\d+/.test(String(text || ''));

const hasFractionMultiplicationExpression = (text) =>
  /\d+\s*\/\s*\d+\s*[×xX*]\s*(?:\d+\s*\/\s*\d+|\d+)/.test(String(text || ''))
  || /\d+\s*[×xX*]\s*\d+\s*\/\s*\d+/.test(String(text || ''));

const hasFractionDivisionExpression = (text) =>
  /\d+\s*\/\s*\d+\s*÷\s*(?:\d+\s*\/\s*\d+|\d+)/.test(String(text || ''))
  || /\d+\s*÷\s*\d+\s*\/\s*\d+/.test(String(text || ''));

const hasDecimalMultiplicationExpression = (text) =>
  /(?:\d+\.\d+\s*[×xX*]\s*\d+(?:\.\d+)?|\d+\s*[×xX*]\s*\d+\.\d+)/.test(String(text || ''));

const hasDecimalDivisionExpression = (text) =>
  /(?:\d+\.\d+\s*÷\s*\d+(?:\.\d+)?|\d+\s*÷\s*\d+\.\d+)/.test(String(text || ''));

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
  includesAny(lessonTopicText(payload), ['약수', '공약수', '최대공약수', '배수', '공배수', '최소공배수']);

const isSolidShapeLesson = (payload, ragSection = '') =>
  includesAny(lessonTopicText(payload), ['입체도형', '직육면체', '정육면체', '각기둥', '각뿔', '원기둥', '원뿔', '구 모양', '구의 성질', '공간과 입체', '쌓기나무']);

const classifyPracticeType = (payload, ragSection = '') => {
  const text = lessonTopicText(payload);
  if (includesAny(text, ['그래프', '표를 보고', '표로 나타', '자료를 표', '막대그래프', '꺾은선그래프', '평균'])) return '그래프·표';
  if (includesAny(text, ['가능성', '확률', '사건'])) return '확률·가능성';
  if (includesAny(text, ['대칭', '합동', '대응점', '선대칭', '점대칭'])) return '대칭·합동';
  if (isSolidShapeLesson(payload, ragSection)) return '입체도형';
  if (includesAny(text, ['도형', '삼각형', '사각형', '원 모양', '원의 성질', '각도'])) return '도형';
  if (includesAny(text, ['단위', '길이', '넓이', '둘레', '부피', '무게', '시간', '시각', '들이'])) return '측정';
  if (includesAny(text, ['약수', '배수', '공약수', '공배수', '최대공약수', '최소공배수', '규칙', '비례식'])) return '약수·배수·규칙';
  if (includesAny(text, ['덧셈', '뺄셈', '곱셈', '나눗셈', '계산', '분수', '소수', '자연수', '대분수', '진분수'])) return '사칙연산·분수·소수';
  return '차시 핵심 기능';
};

const corePracticeSubtypes = (practiceType) => {
  const map = {
    '사칙연산·분수·소수': ['식 계산', '계산 순서 판단', '계산 오류 찾기', '빈칸 계산', '크기 비교 계산', '문장 계산'],
    '약수·배수·규칙': ['약수/배수 찾기', '공통 관계 찾기', '규칙 이어가기', '조건에 맞는 수 고르기', '관계 설명 고르기', '오류 규칙 찾기'],
    '도형': ['도형 판별', '성질 적용', '도형 구성', '다른 도형 찾기', '조건에 맞는 도형 고르기', '도형 설명 오류 찾기'],
    '입체도형': ['입체 판별', '면 분석', '모서리 분석', '꼭짓점 분석', '전개/구성 판단', '생활 물건과 입체 연결'],
    '측정': ['단위 변환', '길이 측정', '넓이/둘레 측정', '시간 계산', '어림과 비교', '단위 오류 찾기'],
    '그래프·표': ['자료 읽기', '값 비교', '차이 구하기', '합계 해석', '그래프 설명 고르기', '잘못 읽은 해석 찾기'],
    '확률·가능성': ['가능성 비교', '사건 판단', '확실/불가능 구분', '조건 변화 판단', '가능성 설명 고르기', '잘못된 가능성 설명 찾기'],
    '대칭·합동': ['대응점 찾기', '합동 판별', '대칭축 찾기', '대칭 위치 찾기', '대칭 도형 완성', '잘못된 대응 찾기'],
    '차시 핵심 기능': ['개념 적용', '조건 판단', '관계 찾기', '오류 찾기', '그림 해석', '생활 적용'],
  };
  return map[practiceType] || map['차시 핵심 기능'];
};

const buildQuestionMixGuide = (payload, poolSize, ragSection = '') => {
  const practiceType = classifyPracticeType(payload, ragSection);
  const subtypes = corePracticeSubtypes(practiceType);
  const coreLabel = {
    '사칙연산·분수·소수': '계산 연습',
    '약수·배수·규칙': '관계 찾기·규칙 적용',
    '도형': '도형 판별·성질 적용·구성',
    '입체도형': '입체 판별·면/모서리/꼭짓점 분석',
    '측정': '단위 변환·길이/넓이/시간 측정',
    '그래프·표': '자료 읽기·비교·해석',
    '확률·가능성': '가능성 비교·사건 판단',
    '대칭·합동': '대응점 찾기·합동/대칭 판별',
    '차시 핵심 기능': '차시 핵심 기능 적용',
  }[practiceType];

  if (poolSize >= 20) {
    return `
[문항 구성표 - 20문항 기준]
- 차시 유형: ${practiceType}
- 핵심 기능 연습: ${coreLabel}
- 개념 확인 2문항: 용어/개념 의미 확인, 쉬운 예·아닌 예 구분
- 핵심 기능 연습 12문항: ${subtypes.join(', ')}
- 생활 문장제 4문항: 교실·생활 상황에서 차시 개념 적용
- 응용/오류 찾기 2문항: 잘못된 풀이 찾기, 조건이 하나 더 있는 적용 문제
- skill 필드는 반드시 "개념 확인 - ...", "핵심 기능 - ${subtypes[0]}", "생활 문장제 - ...", "응용/오류 - ..."처럼 유형과 세부 기능이 드러나게 쓰세요.
- 같은 skill 세부 유형은 최대 2문항까지만 허용합니다. 같은 문장 틀에서 숫자만 바꾸는 문제는 금지합니다.
`;
  }

  return `
[문항 구성표 - ${poolSize}문항 추가 생성 기준]
- 차시 유형: ${practiceType}
- 핵심 기능 연습: ${coreLabel}
- 이번 생성에서는 개념 확인 1문항, 핵심 기능 연습 ${Math.max(2, poolSize - 2)}문항, 생활 문장제 또는 응용/오류 찾기 1문항을 섞으세요.
- 핵심 기능 연습은 다음 세부 유형 중 서로 다른 것을 우선 사용하세요: ${subtypes.join(', ')}
- skill 필드는 유형과 세부 기능이 드러나게 쓰고, 이번 생성 안에서 같은 skill을 반복하지 마세요.
`;
};

const buildLessonContext = (payload, ragSection = '') => {
  const text = lessonTopicText(payload);
  const lessonTitle = String(payload?.lessonTitle || '');
  const titleAddition = includesAny(lessonTitle, ['덧셈', '더하기', '더한', '합을', '합은', '합하면']);
  const titleSubtraction = includesAny(lessonTitle, ['뺄셈', '빼기', '뺀', '차']);
  return {
    grade: Number(payload?.grade) || 0,
    sameDenomFocus: hasSameDenominatorFractionFocus(payload, ''),
    factorMultiple: isFactorMultipleLesson(payload, ''),
    solidShape: isSolidShapeLesson(payload, ''),
    timeLesson: includesAny(text, ['시각', '시간', '시계', '몇 시', '몇 분']),
    angleLesson: includesAny(text, ['각도', '각의 크기', '몇 도', '예각', '둔각']),
    measurementLesson: includesAny(text, ['길이', '재기', 'cm', '센티미터', '미터', '자로 재기']),
    areaLesson: includesAny(text, ['넓이', '둘레']),
    fractionLesson: includesAny(text, ['분수', '진분수', '대분수', '통분', '약분']),
    fractionAddSubLesson: includesAny(text, ['분수의 덧셈', '분수의 뺄셈', '진분수의 덧셈', '진분수의 뺄셈', '대분수의 덧셈', '대분수의 뺄셈']),
    fractionMultiplyLesson: includesAny(text, ['분수의 곱셈', '분수의 곱', '분수)×', '×(분수']),
    fractionDivideLesson: includesAny(text, ['분수의 나눗셈', '분수)÷', '÷(분수']),
    reductionCommonDenomLesson: includesAny(text, ['약분', '통분']),
    decimalLesson: includesAny(text, ['소수']),
    decimalMultiplyLesson: includesAny(text, ['소수의 곱셈', '소수)×', '×(소수']),
    decimalDivideLesson: includesAny(text, ['소수의 나눗셈', '소수)÷', '÷(소수']),
    ratioLesson: includesAny(text, ['비와 비율', '비율', '백분율', '비례식', '비례배분']),
    probabilityLesson: includesAny(text, ['가능성', '확률']),
    graphLesson: includesAny(text, ['그래프', '막대그래프', '꺾은선그래프', '원그래프']),
    pictureGraphLesson: includesAny(text, ['그림그래프']),
    barGraphLesson: includesAny(text, ['막대그래프']),
    lineGraphLesson: includesAny(text, ['꺾은선그래프']),
    pieGraphLesson: includesAny(text, ['원그래프']),
    bandGraphLesson: includesAny(text, ['띠그래프']),
    symmetryLesson: includesAny(text, ['대칭', '선대칭', '점대칭', '대칭축', '대응점']),
    multiplicationLesson: includesAny(text, ['곱셈', '곱셈구구', '몇 배', '묶어 세기', '묶어 세어']),
    divisionLesson: includesAny(text, ['나눗셈', '나누기', '몫', '나머지']),
    cuboidLesson: includesAny(text, ['직육면체', '정육면체', '부피', '겉넓이']),
    prismPyramidLesson: includesAny(text, ['각기둥', '각뿔']),
    roundSolidLesson: includesAny(text, ['원기둥', '원뿔', '구 모양', '구의 성질', '원기둥, 원뿔, 구']),
    spaceBlockLesson: includesAny(text, ['공간과 입체', '쌓기나무', '쌓은 모양']),
    additionLesson: titleAddition || (!titleSubtraction && includesAny(text, ['덧셈', '더하기', '더한', '합을', '합은', '합하면'])),
    subtractionLesson: titleSubtraction || (!titleAddition && includesAny(text, ['뺄셈', '빼기', '뺀', '차'])),
  };
};

const allowedSolidShapeTypes = (context = {}) => {
  const allowed = new Set();
  if (context.cuboidLesson) ['cuboid', 'cube'].forEach(type => allowed.add(type));
  if (context.prismPyramidLesson) ['triangular_prism', 'square_pyramid'].forEach(type => allowed.add(type));
  if (context.roundSolidLesson) ['cylinder', 'cone', 'sphere'].forEach(type => allowed.add(type));
  if (context.spaceBlockLesson) allowed.add('cube');
  return allowed;
};

const sanitizeShape = (shape, context = {}) => {
  if (!shape || typeof shape !== 'object' || !SHAPE_TYPES.has(shape.type)) return null;
  const type = shape.type;
  const d = shape.dimensions && typeof shape.dimensions === 'object' ? { ...shape.dimensions } : {};
  const unit = String(shape.unit || d.unit || '').slice(0, 6);
  const solidTypes = new Set(['cuboid', 'cube', 'triangular_prism', 'square_pyramid', 'cylinder', 'cone', 'sphere']);
  const chartTypes = new Set(['picture_graph', 'bar_chart', 'line_chart', 'pie_chart', 'band_chart']);
  const allowedLessonSolids = allowedSolidShapeTypes(context);
  if ([3, 4].includes(context.grade) && solidTypes.has(type)) return null;
  if ([5, 6].includes(context.grade) && solidTypes.has(type) && !allowedLessonSolids.has(type)) return null;
  if (chartTypes.has(type) && !context.graphLesson) return null;
  if (context.grade === 3 && chartTypes.has(type) && type !== 'picture_graph') return null;
  if (context.grade === 4 && ['picture_graph', 'pie_chart', 'band_chart'].includes(type)) return null;
  if (context.grade === 6 && type === 'picture_graph') return null;
  if (context.factorMultiple && ['picture_graph', 'bar_chart', 'line_chart', 'pie_chart', 'band_chart'].includes(type)) return null;
  if (type === 'factor_list') {
    if (!context.factorMultiple && !context.reductionCommonDenomLesson) return null;
    const groups = asList(d.groups, 3)
      .map(group => ({
        label: String(group?.label || '').trim().slice(0, 20),
        values: asList(group?.values, 12).map(v => finite(v)).filter(v => v != null).map(v => Math.round(v)),
      }))
      .filter(group => group.label && group.values.length);
    const highlight = asList(d.highlight, 12).map(v => finite(v)).filter(v => v != null).map(v => Math.round(v));
    return groups.length ? { type, dimensions: { groups, highlight } } : null;
  }

  if (type === 'picture_graph') {
    const cleaned = cleanChart(d, 5, true);
    if (!cleaned) return null;
    const each = Math.max(1, Math.round(finite(d.each, 1)));
    if (cleaned.values.some(value => value % each !== 0 || value / each > 15)) return null;
    return { type, dimensions: { ...cleaned, each } };
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
  if (type === 'band_chart') {
    const cleaned = cleanChart(d, 6, true);
    return cleaned ? { type, dimensions: cleaned } : null;
  }
  if (type === 'multi') {
    const allowed = context.solidShape
      ? allowedLessonSolids
      : new Set([
        'rectangle', 'square', 'circle', 'equilateral_triangle', 'isosceles_triangle',
        'right_triangle', 'parallelogram', 'rhombus', 'trapezoid', 'semicircle',
        ...([3, 4].includes(context.grade) ? [] : solidTypes),
      ]);
    const items = asList(d.items, 4)
      .map(v => String(v || '').trim())
      .map(v => v === 'triangle' ? 'equilateral_triangle' : v)
      .filter(v => allowed.has(v));
    return items.length >= 2 ? { type, dimensions: { ...d, items } } : null;
  }
  if (context.solidShape && !solidTypes.has(type)) return null;
  if (solidTypes.has(type)) {
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
    if (!context.fractionLesson && !context.ratioLesson) return null;
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

const optionNumber = (value) => {
  const match = String(value || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
};

const optionMatchesLabelOrValue = (option, label, value) => {
  const text = normalizeText(option);
  return (label && text.includes(normalizeText(label))) || optionNumber(option) === value;
};

const verifyChartAnswer = (q, shape) => {
  const { labels = [], values = [] } = shape.dimensions || {};
  if (labels.length < 2 || labels.length !== values.length) return false;
  const question = normalizeText(q.question);
  let expectedIndexes;

  if (includesAny(question, ['가장 많', '가장 큰', '가장 높'])) {
    const target = Math.max(...values);
    expectedIndexes = values.map((v, i) => v === target ? i : -1).filter(i => i >= 0);
  } else if (includesAny(question, ['가장 적', '가장 작은', '가장 낮'])) {
    const target = Math.min(...values);
    expectedIndexes = values.map((v, i) => v === target ? i : -1).filter(i => i >= 0);
  } else if (includesAny(question, ['합계', '모두 합', '전체 수', '모두 몇'])) {
    const total = values.reduce((sum, value) => sum + value, 0);
    return optionNumber(q.options[q.answerIndex]) === total;
  } else if (includesAny(question, ['차이', '얼마나 더'])) {
    const mentioned = labels.map((label, i) => question.includes(normalizeText(label)) ? i : -1).filter(i => i >= 0);
    const indexes = mentioned.length === 2 ? mentioned : values.length === 2 ? [0, 1] : [];
    if (indexes.length !== 2) return true;
    return optionNumber(q.options[q.answerIndex]) === Math.abs(values[indexes[0]] - values[indexes[1]]);
  } else {
    return true;
  }

  if (expectedIndexes.length !== 1) return false;
  const expected = expectedIndexes[0];
  return optionMatchesLabelOrValue(q.options[q.answerIndex], labels[expected], values[expected]);
};

const verifyFactorListShape = (shape) => {
  const groups = shape.dimensions?.groups || [];
  const highlight = shape.dimensions?.highlight || [];
  if (groups.length < 2) return false;
  const common = groups
    .slice(1)
    .reduce(
      (values, group) => values.filter(value => group.values.includes(value)),
      [...groups[0].values],
    )
    .sort((a, b) => a - b);
  const shown = [...new Set(highlight)].sort((a, b) => a - b);
  return common.length === shown.length && common.every((value, index) => value === shown[index]);
};

const getNamedNumber = (text, label) => {
  const src = normalizeText(text).replace(/,/g, '');
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const after = src.match(new RegExp(`${escaped}\\s*(?:은|는|이|가|의|:)?\\s*(\\d+(?:\\.\\d+)?)`));
  if (after) return Number(after[1]);
  const before = src.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:cm|m|mm|㎝|도)?\\s*(?:인|인\\s*)?${escaped}`));
  return before ? Number(before[1]) : null;
};

const verifyNamedShapeDimensions = (q, shape) => {
  const d = shape.dimensions || {};
  const checks = [];
  const add = (label, actual) => {
    const mentioned = getNamedNumber(q.question, label);
    if (mentioned != null && finite(actual) != null) checks.push(mentioned === Number(actual));
  };

  if (['rectangle', 'cuboid'].includes(shape.type)) {
    add('가로', d.width);
    add('세로', d.height);
  }
  if (shape.type === 'cuboid') add('높이', d.depth ?? d.height);
  if (['square', 'cube', 'polygon', 'equilateral_triangle'].includes(shape.type)) add('한 변', d.side);
  if (['right_triangle', 'parallelogram', 'trapezoid'].includes(shape.type)) {
    add('밑변', d.base);
    add('높이', d.height);
  }
  if (['circle', 'semicircle', 'sphere', 'cylinder', 'cone'].includes(shape.type)) {
    add('반지름', d.radius);
    add('지름', d.diameter);
  }
  if (shape.type === 'angle') {
    add('각도', d.degrees);
    add('각의 크기', d.degrees);
  }
  return checks.every(Boolean);
};

const verifyShapeQuestionConsistency = (q) => {
  const shape = q.shape;
  if (!shape) return true;
  if (!verifyNamedShapeDimensions(q, shape)) return false;

  if (['picture_graph', 'bar_chart', 'line_chart', 'pie_chart', 'band_chart'].includes(shape.type)) {
    return verifyChartAnswer(q, shape);
  }
  if (shape.type === 'factor_list') return verifyFactorListShape(shape);
  if (shape.type === 'fraction_bar') {
    const asksShownFraction = includesAny(q.question, ['색칠', '나타낸 분수', '보이는 분수', '그림이 나타내']);
    if (!asksShownFraction) return true;
    const correct = parseSingleFractionValue(q.options[q.answerIndex]);
    return !!correct && sameFraction(correct, {
      num: shape.dimensions.filled,
      den: shape.dimensions.total,
    });
  }
  if (shape.type === 'clock' && includesAny(q.question, ['시각', '몇 시'])) {
    const answer = String(q.options[q.answerIndex] || '').replace(/\s+/g, '');
    const hour = shape.dimensions.hour;
    const minute = shape.dimensions.minute;
    return answer.includes(`${hour}시`) && (minute === 0 || answer.includes(`${minute}분`));
  }
  if (shape.type === 'symmetry') {
    const cells = shape.dimensions?.cells || [];
    return new Set(cells.map(cell => `${cell.x}:${cell.y}`)).size === cells.length;
  }
  return true;
};

const questionFingerprint = (q) => {
  const question = normalizeText(q.question)
    .replace(/\d+(?:\.\d+)?/g, '#')
    .replace(/[^\p{L}#]/gu, '');
  const skill = normalizeText(q.skill || '').replace(/\s+/g, '');
  return `${skill}|${question}`;
};

const questionTokens = (q) =>
  new Set(normalizeText(q.question).match(/[\p{L}]{2,}|#|\d+/gu) || []);

const isNearDuplicate = (left, right) => {
  if (questionFingerprint(left) === questionFingerprint(right)) return true;
  const a = questionTokens(left);
  const b = questionTokens(right);
  if (!a.size || !b.size) return false;
  const intersection = [...a].filter(token => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return intersection / union >= 0.82;
};

const verifyFractionQuestionAnswer = (q) => {
  const question = String(q.question || '');
  const expected = getFractionOperationExpected(question) || getFractionMulDivExpected(question);
  if (!expected) return true;
  const correct = parseSingleFractionValue(q.options?.[q.answerIndex] || '');
  return !!correct && sameFraction(correct, expected);
};

const verifyFractionExplanation = (q) => {
  const equations = String(q.explanation || '').match(
    /(?:\d+\s+(?:\d+\s*\/\s*\d+)|\d+\s*\/\s*\d+|\d+)(?:\s*[+-]\s*(?:\d+\s+(?:\d+\s*\/\s*\d+)|\d+\s*\/\s*\d+|\d+))+\s*=\s*(?:\d+\s+(?:\d+\s*\/\s*\d+)|\d+\s*\/\s*\d+|\d+)/g,
  ) || [];
  const mulDivEquations = String(q.explanation || '').match(
    /(?:\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+)\s*[×xX*÷]\s*(?:\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+)\s*=\s*(?:\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+)(?!\s*[\/×xX*÷=])/g,
  ) || [];
  return equations.every(equation => evalFractionEquation(equation) === true)
    && mulDivEquations.every(equation => evalFractionMulDivEquation(equation) === true);
};

const isOffTopicQuestion = (q, context = {}) => {
  const text = [q.question, ...(q.options || []), q.explanation].join(' ');
  if (context.grade === 1) {
    if (includesAny(text, ['직육면체', '정육면체', '각기둥', '각뿔', '원기둥', '원뿔', '꼭짓점', '모서리'])) return true;
    if (!context.graphLesson && includesAny(text, ['막대그래프', '꺾은선그래프', '원그래프'])) return true;
    if (!context.timeLesson && includesAny(text, ['시계', '시침', '분침', '몇 시', '몇 분'])) return true;
    if (includesAny(text, ['곱셈', '나눗셈']) || /[×÷]/.test(text) || /\d+\s*\/\s*\d+/.test(text)) return true;
    if ((text.match(/\d+/g) || []).some(value => Number(value) > 100)) return true;
    if (/\d+\s*(?:cm|kg|mL|L)\b/i.test(text)) return true;
  }
  if (context.grade === 2) {
    if (includesAny(text, ['직육면체', '정육면체', '각기둥', '각뿔', '원기둥', '원뿔', '모서리'])) return true;
    if (includesAny(text, ['분수', '분모', '분자', '나눗셈']) || /[÷]/.test(text) || /\d+\s*\/\s*\d+/.test(text)) return true;
    if (includesAny(text, ['각도', '예각', '둔각', '넓이', '둘레'])) return true;
    if (!context.graphLesson && includesAny(text, ['막대그래프', '꺾은선그래프', '원그래프'])) return true;
    if (!context.multiplicationLesson && (includesAny(text, ['곱셈', '곱셈구구']) || /[×xX]/.test(text))) return true;
    if ((text.match(/\d+/g) || []).some(value => Number(value) > 10000)) return true;
  }
  if (context.grade === 3) {
    if (includesAny(text, ['입체도형', '직육면체', '정육면체', '각기둥', '각뿔', '원기둥', '원뿔', '모서리'])) return true;
    if (!context.fractionLesson && (includesAny(text, ['분수', '분모', '분자']) || /\d+\s*\/\s*\d+/.test(text))) return true;
    if (includesAny(text, ['통분', '이분모', '약분']) || hasFractionAddSubExpression(text) || hasFractionMultiplyDivideExpression(text)) return true;
    if (includesAny(text, ['막대그래프', '꺾은선그래프', '원그래프'])) return true;
    if (!context.graphLesson && includesAny(text, ['그림그래프', '그래프'])) return true;
    if (includesAny(text, ['예각', '둔각']) || /\d+\s*도/.test(text)) return true;
    if (!context.multiplicationLesson && (includesAny(text, ['곱셈', '곱']) || /[×xX]/.test(text))) return true;
    if (!context.divisionLesson && (includesAny(text, ['나눗셈', '나누기', '몫', '나머지']) || /÷/.test(text))) return true;
  }
  if (context.grade === 4) {
    if (includesAny(text, ['입체도형', '직육면체', '정육면체', '각기둥', '각뿔', '원기둥', '원뿔', '모서리'])) return true;
    if (!context.fractionLesson && (includesAny(text, ['분수', '분모', '분자']) || /\d+\s*\/\s*\d+/.test(text))) return true;
    if (includesAny(text, ['통분', '이분모', '약분']) || hasUnlikeDenominatorAddSub(text) || hasFractionMultiplyDivideExpression(text)) return true;
    if (hasFractionAddSubExpression(text) && !context.fractionAddSubLesson) return true;
    if (hasDecimalMultiplicationExpression(text) || hasDecimalDivisionExpression(text)) return true;
    if (includesAny(text, ['원그래프', '그림그래프'])) return true;
    if (!context.graphLesson && includesAny(text, ['막대그래프', '꺾은선그래프', '그래프'])) return true;
    if (!context.multiplicationLesson && (includesAny(text, ['곱셈', '곱']) || /[×xX]/.test(text))) return true;
    if (!context.divisionLesson && (includesAny(text, ['나눗셈', '나누기', '몫', '나머지']) || /÷/.test(text))) return true;
  }
  if (context.grade === 5) {
    const fractionContext = context.fractionLesson || context.probabilityLesson;
    if (!context.solidShape && includesAny(text, ['입체도형', '직육면체', '정육면체', '각기둥', '각뿔', '원기둥', '원뿔', '모서리', '꼭짓점'])) return true;
    if (context.solidShape && includesAny(text, ['각기둥', '각뿔', '원기둥', '원뿔', '구 모양', '구의 성질'])) return true;
    if (!fractionContext && (includesAny(text, ['분수', '분모', '분자', '통분', '약분']) || /\d+\s*\/\s*\d+/.test(text))) return true;
    if (hasFractionDivisionExpression(text)) return true;
    if (hasFractionMultiplicationExpression(text) && !context.fractionMultiplyLesson) return true;
    if (hasFractionAddSubExpression(text) && !context.fractionAddSubLesson) return true;
    if (includesAny(text, ['통분', '약분']) && !(context.reductionCommonDenomLesson || context.fractionAddSubLesson)) return true;
    if (hasDecimalDivisionExpression(text)) return true;
    if (hasDecimalMultiplicationExpression(text) && !context.decimalMultiplyLesson) return true;
    if (!context.graphLesson && includesAny(text, ['막대그래프', '꺾은선그래프', '원그래프', '띠그래프', '그림그래프'])) return true;
  }
  if (context.grade === 6) {
    const fractionContext = context.fractionLesson || context.ratioLesson;
    if (!context.solidShape && includesAny(text, ['입체도형', '직육면체', '정육면체', '각기둥', '각뿔', '원기둥', '원뿔', '모서리', '꼭짓점'])) return true;
    if (context.cuboidLesson && includesAny(text, ['각기둥', '각뿔', '원기둥', '원뿔', '구 모양', '구의 성질'])) return true;
    if (context.prismPyramidLesson && includesAny(text, ['직육면체', '정육면체', '원기둥', '원뿔', '구 모양', '구의 성질'])) return true;
    if (context.roundSolidLesson && includesAny(text, ['각기둥', '각뿔', '직육면체', '정육면체'])) return true;
    if (context.spaceBlockLesson && includesAny(text, ['각기둥', '각뿔', '원기둥', '원뿔', '구 모양', '구의 성질'])) return true;
    if (!fractionContext && (includesAny(text, ['분수', '분모', '분자', '통분', '약분']) || /\d+\s*\/\s*\d+/.test(text))) return true;
    if (hasFractionAddSubExpression(text)) return true;
    if (
      (hasFractionDivisionExpression(text) || hasFractionMultiplicationExpression(text))
      && !context.fractionDivideLesson
    ) return true;
    if (hasDecimalMultiplicationExpression(text)) return true;
    if (hasDecimalDivisionExpression(text) && !context.decimalDivideLesson) return true;
    if (!context.graphLesson && includesAny(text, ['막대그래프', '꺾은선그래프', '원그래프', '띠그래프', '그림그래프'])) return true;
  }
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
  const deterministicResult = validateDeterministicMathQuestion(q);
  if (deterministicResult.applicable) {
    return deterministicResult.valid && deterministicResult.answerIndex === q.answerIndex;
  }
  const equivalentPairIndex = getEquivalentFractionPairIndex(question, options);
  if (equivalentPairIndex != null) return equivalentPairIndex >= 0 && q.answerIndex === equivalentPairIndex;
  if (/가장\s*큰|가장\s*작은/.test(question) && options.some(opt => String(opt).includes('/'))) {
    const values = options.map(getComparableFractionValue);
    if (values.some(v => v == null)) return false;
    const target = /가장\s*작은/.test(question) ? Math.min(...values) : Math.max(...values);
    const matches = values.map(v => Math.abs(v - target) < 1e-9);
    return matches.filter(Boolean).length === 1 && matches[q.answerIndex] === true;
  }
  if (!verifyFractionQuestionAnswer(q)) return false;
  if (!verifyFractionExplanation(q)) return false;
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
  if (new Set(options.map(option => normalizeText(option).replace(/\s+/g, ''))).size !== 4) return null;

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
  const wholeNumberExpected = getWholeNumberExpected(fractionFixed.question);
  if (wholeNumberExpected != null) {
    const wholeNumberOptions = options.map(parseWholeNumberOption);
    if (wholeNumberOptions.every(value => value != null)) {
      const correctedIndex = uniqueIndex(wholeNumberOptions, value => Math.abs(value - wholeNumberExpected) < 1e-9);
      if (correctedIndex < 0) return null;
      answerIndex = correctedIndex;
    }
  }
  const wholeNumberComparisonIndex = getWholeNumberComparisonIndex(fractionFixed.question, options);
  if (wholeNumberComparisonIndex != null) {
    if (wholeNumberComparisonIndex < 0) return null;
    answerIndex = wholeNumberComparisonIndex;
  }
  const deterministicResult = validateDeterministicMathQuestion({
    ...fractionFixed,
    answerIndex,
  });
  if (deterministicResult.applicable) {
    if (!deterministicResult.valid) return null;
    answerIndex = deterministicResult.answerIndex;
  }
  const correct = options[answerIndex];
  const shift = index % 4;
  const rotated = [...options.slice(shift), ...options.slice(0, shift)];
  const rotatedAnswerIndex = rotated.findIndex(o => o === correct);

  if (isOffTopicQuestion(fractionFixed, context)) return null;

  const rawShapeType = q.shape?.type;
  if (context.factorMultiple && ['picture_graph', 'bar_chart', 'line_chart', 'pie_chart', 'band_chart'].includes(rawShapeType)) return null;
  if (context.solidShape && rawShapeType && rawShapeType !== 'multi' && !allowedSolidShapeTypes(context).has(rawShapeType)) return null;

  const inferredShape = context.fractionLesson
    ? inferFractionBarShape(fractionFixed.question, q.shape)
    : q.shape;
  const shape = sanitizeShape(inferredShape, context);
  if (q.shape && !shape) return null;
  if (hasMissingRequiredVisual(fractionFixed.question, shape)) return null;

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
  if (
    context.solidShape
    && includesAny(normalized.question, ['잘못된 설명', '바르게 고친'])
    && includesAny(normalized.explanation, ['만 바르게 고친', '일부만'])
  ) return null;
  if (!hasExactlyOneVerifiableAnswer(normalized)) return null;
  if (!verifyShapeQuestionConsistency(normalized)) return null;

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
    if (questions.some(existing => isNearDuplicate(existing, q))) continue;
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

const skillBucket = (skill = '') =>
  String(skill || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/[-:：]/)[0]
    .trim();

const skillSubtype = (skill = '') =>
  String(skill || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();

const validateSkillDiversity = (questions = [], poolSize = 0) => {
  const issues = [];
  if (poolSize < 16 || questions.length < 12) return issues;

  const buckets = new Map();
  const subtypes = new Map();
  questions.forEach(q => {
    const bucket = skillBucket(q.skill || '미분류');
    const subtype = skillSubtype(q.skill || '미분류');
    buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
    subtypes.set(subtype, (subtypes.get(subtype) || 0) + 1);
  });

  if (buckets.size < 4) issues.push('문제 유형이 4종 미만입니다.');
  for (const [bucket, count] of buckets.entries()) {
    if (count > Math.ceil(questions.length * 0.7)) issues.push(`문제 유형이 "${bucket}"에 과도하게 몰렸습니다.`);
  }
  for (const [subtype, count] of subtypes.entries()) {
    if (count > 3) issues.push(`세부 유형 "${subtype}" 반복이 많습니다.`);
  }
  return issues;
};

function validateContent(result, poolSize) {
  const issues = [];
  if (!result.conceptCards?.length) issues.push('개념 카드가 없습니다.');
  if ((result.questions?.length || 0) < Math.min(8, poolSize)) {
    issues.push(`문제 풀이 부족합니다. 현재 ${result.questions?.length || 0}개`);
  }
  issues.push(...validateSkillDiversity(result.questions || [], poolSize));

  result.questions?.forEach((q, i) => {
    const n = i + 1;
    if (!q.question || q.question.length < 8) issues.push(`Q${n}: 문제 문장이 너무 짧습니다.`);
    if (!Array.isArray(q.options) || q.options.length !== 4) issues.push(`Q${n}: 보기가 4개가 아닙니다.`);
    if (new Set(q.options).size < 4) issues.push(`Q${n}: 중복 보기가 있습니다.`);
    if (!Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex > 3) issues.push(`Q${n}: 정답 인덱스 오류`);
    if (!q.explanation || q.explanation.length < 6) issues.push(`Q${n}: 해설이 부족합니다.`);
    if (q.shape && !SHAPE_TYPES.has(q.shape.type)) issues.push(`Q${n}: 지원하지 않는 shape type`);
    if (!verifyShapeQuestionConsistency(q)) issues.push(`Q${n}: 시각자료와 문제/정답 불일치`);
    if (!hasExactlyOneVerifiableAnswer(q)) issues.push(`Q${n}: 정답 자동 검산 실패`);
    if (result.questions.slice(0, i).some(previous => isNearDuplicate(previous, q))) issues.push(`Q${n}: 유사 문제 중복`);
  });

  return issues;
}

const mergeQuestionPools = (baseResult, repairResult, poolSize, context) => {
  const merged = [...baseResult.questions];
  for (const [index, raw] of (repairResult?.questions || []).entries()) {
    const question = normalizeQuestion(raw, merged.length + index, context);
    if (!question || merged.some(existing => isNearDuplicate(existing, question))) continue;
    merged.push(question);
    if (merged.length >= poolSize) break;
  }
  return { ...baseResult, questions: merged };
};

const fractionFallbackQuestions = (context) => {
  const sameDenominator = [
    ['첫 번째 계산 2/9 + 4/9의 값을 구하세요.', ['5/9', '6/9', '6/18', '2/9'], 1, '분모 9는 그대로 두고 분자 2와 4를 더하면 2/9 + 4/9 = 6/9입니다.'],
    ['두 번째 계산 3/10 + 5/10의 값을 구하세요.', ['8/10', '8/20', '2/10', '7/10'], 0, '분모 10은 그대로 두고 분자 3과 5를 더하면 3/10 + 5/10 = 8/10입니다.'],
    ['세 번째 계산 7/12 - 2/12의 값을 구하세요.', ['5/12', '5/24', '9/12', '4/12'], 0, '분모 12는 그대로 두고 분자 7에서 2를 빼면 7/12 - 2/12 = 5/12입니다.'],
    ['네 번째 계산 1/8 + 6/8의 값을 구하세요.', ['7/8', '7/16', '5/8', '6/8'], 0, '분모 8은 그대로 두고 분자 1과 6을 더하면 1/8 + 6/8 = 7/8입니다.'],
    ['다섯 번째 계산 9/11 - 4/11의 값을 구하세요.', ['13/11', '5/11', '5/22', '4/11'], 1, '분모 11은 그대로 두고 분자 9에서 4를 빼면 9/11 - 4/11 = 5/11입니다.'],
    ['여섯 번째 계산 4/7 + 2/7의 값을 구하세요.', ['2/7', '6/7', '6/14', '5/7'], 1, '분모 7은 그대로 두고 분자 4와 2를 더하면 4/7 + 2/7 = 6/7입니다.'],
    ['일곱 번째 계산 8/13 - 3/13의 값을 구하세요.', ['11/13', '5/13', '5/26', '4/13'], 1, '분모 13은 그대로 두고 분자 8에서 3을 빼면 8/13 - 3/13 = 5/13입니다.'],
    ['여덟 번째 계산 2/15 + 7/15의 값을 구하세요.', ['9/15', '9/30', '5/15', '8/15'], 0, '분모 15는 그대로 두고 분자 2와 7을 더하면 2/15 + 7/15 = 9/15입니다.'],
    ['아홉 번째 계산 3/11 + 5/11의 값을 구하세요.', ['8/11', '8/22', '2/11', '7/11'], 0, '분모 11은 그대로 두고 분자 3과 5를 더하면 3/11 + 5/11 = 8/11입니다.'],
    ['열 번째 계산 1/12 + 7/12의 값을 구하세요.', ['6/12', '8/12', '8/24', '7/12'], 1, '분모 12는 그대로 두고 분자 1과 7을 더하면 1/12 + 7/12 = 8/12입니다.'],
    ['열한 번째 계산 4/13 + 6/13의 값을 구하세요.', ['10/13', '10/26', '2/13', '9/13'], 0, '분모 13은 그대로 두고 분자 4와 6을 더하면 4/13 + 6/13 = 10/13입니다.'],
    ['열두 번째 계산 2/17 + 8/17의 값을 구하세요.', ['6/17', '10/17', '10/34', '9/17'], 1, '분모 17은 그대로 두고 분자 2와 8을 더하면 2/17 + 8/17 = 10/17입니다.'],
    ['열세 번째 계산 10/13 - 4/13의 값을 구하세요.', ['6/13', '6/26', '14/13', '5/13'], 0, '분모 13은 그대로 두고 분자 10에서 4를 빼면 10/13 - 4/13 = 6/13입니다.'],
    ['열네 번째 계산 11/15 - 3/15의 값을 구하세요.', ['14/15', '8/15', '8/30', '7/15'], 1, '분모 15는 그대로 두고 분자 11에서 3을 빼면 11/15 - 3/15 = 8/15입니다.'],
    ['열다섯 번째 계산 9/14 - 2/14의 값을 구하세요.', ['11/14', '7/14', '7/28', '6/14'], 1, '분모 14는 그대로 두고 분자 9에서 2를 빼면 9/14 - 2/14 = 7/14입니다.'],
    ['열여섯 번째 계산 12/17 - 5/17의 값을 구하세요.', ['17/17', '7/17', '7/34', '6/17'], 1, '분모 17은 그대로 두고 분자 12에서 5를 빼면 12/17 - 5/17 = 7/17입니다.'],
    ['열일곱 번째 계산 13/18 - 4/18의 값을 구하세요.', ['17/18', '9/18', '9/36', '8/18'], 1, '분모 18은 그대로 두고 분자 13에서 4를 빼면 13/18 - 4/18 = 9/18입니다.'],
  ];
  const differentDenominator = [
    ['첫 번째 통분 계산 5/6 - 1/4의 값을 구하세요.', ['7/12', '4/2', '1/2', '4/10'], 0, '통분한 뒤 계산하면 10/12 - 3/12 = 7/12입니다.'],
    ['두 번째 통분 계산 3/4 - 1/6의 값을 구하세요.', ['2/2', '7/12', '2/10', '1/2'], 1, '통분한 뒤 계산하면 9/12 - 2/12 = 7/12입니다.'],
    ['세 번째 통분 계산 2/3 + 1/4의 값을 구하세요.', ['3/7', '11/12', '3/12', '1/2'], 1, '통분한 뒤 계산하면 8/12 + 3/12 = 11/12입니다.'],
    ['네 번째 통분 계산 7/8 - 1/3의 값을 구하세요.', ['6/5', '13/24', '6/24', '5/8'], 1, '통분한 뒤 계산하면 21/24 - 8/24 = 13/24입니다.'],
    ['다섯 번째 통분 계산 1/2 + 2/5의 값을 구하세요.', ['3/7', '9/10', '3/10', '4/5'], 1, '통분한 뒤 계산하면 5/10 + 4/10 = 9/10입니다.'],
    ['여섯 번째 통분 계산 5/6 - 2/9의 값을 구하세요.', ['3/3', '11/18', '3/15', '7/18'], 1, '통분한 뒤 계산하면 15/18 - 4/18 = 11/18입니다.'],
    ['일곱 번째 통분 계산 3/5 + 1/6의 값을 구하세요.', ['4/11', '23/30', '4/30', '2/3'], 1, '통분한 뒤 계산하면 18/30 + 5/30 = 23/30입니다.'],
    ['여덟 번째 통분 계산 11/12 - 1/8의 값을 구하세요.', ['10/4', '19/24', '10/20', '5/6'], 1, '통분한 뒤 계산하면 22/24 - 3/24 = 19/24입니다.'],
    ['아홉 번째 통분 계산 1/3 + 1/5의 값을 구하세요.', ['2/8', '8/15', '2/15', '7/15'], 1, '통분한 뒤 계산하면 5/15 + 3/15 = 8/15입니다.'],
    ['열 번째 통분 계산 3/8 + 2/3의 값을 구하세요.', ['5/11', '25/24', '5/24', '23/24'], 1, '통분한 뒤 계산하면 9/24 + 16/24 = 25/24입니다.'],
    ['열한 번째 통분 계산 4/5 + 1/6의 값을 구하세요.', ['5/11', '29/30', '5/30', '28/30'], 1, '통분한 뒤 계산하면 24/30 + 5/30 = 29/30입니다.'],
    ['열두 번째 통분 계산 5/7 + 1/4의 값을 구하세요.', ['6/11', '27/28', '6/28', '26/28'], 1, '통분한 뒤 계산하면 20/28 + 7/28 = 27/28입니다.'],
    ['열세 번째 통분 계산 7/9 - 1/6의 값을 구하세요.', ['6/3', '11/18', '6/15', '10/18'], 1, '통분한 뒤 계산하면 14/18 - 3/18 = 11/18입니다.'],
    ['열네 번째 통분 계산 5/8 - 1/5의 값을 구하세요.', ['4/3', '17/40', '4/13', '16/40'], 1, '통분한 뒤 계산하면 25/40 - 8/40 = 17/40입니다.'],
    ['열다섯 번째 통분 계산 4/7 - 1/3의 값을 구하세요.', ['3/4', '5/21', '3/10', '4/21'], 1, '통분한 뒤 계산하면 12/21 - 7/21 = 5/21입니다.'],
    ['열여섯 번째 통분 계산 9/10 - 1/4의 값을 구하세요.', ['8/6', '13/20', '8/14', '12/20'], 1, '통분한 뒤 계산하면 18/20 - 5/20 = 13/20입니다.'],
    ['열일곱 번째 통분 계산 2/9 + 1/5의 값을 구하세요.', ['3/14', '19/45', '3/45', '18/45'], 1, '통분한 뒤 계산하면 10/45 + 9/45 = 19/45입니다.'],
  ];
  const candidates = context.sameDenomFocus ? sameDenominator : differentDenominator;
  const operationMatched = candidates.filter(([question]) => (
    context.subtractionLesson ? question.includes('-') : context.additionLesson ? question.includes('+') : true
  ));
  return operationMatched.map(([question, options, answerIndex, explanation], index) => ({
    question, options, answerIndex, explanation, shape: null, skill: `계산 검산 ${index + 1}`, difficultyTag: '기초',
  }));
};

const graphFallbackQuestions = (context) => {
  const charts = [
    { title: '좋아하는 과일', labels: ['사과', '배', '포도', '귤'], values: [8, 5, 11, 7], unit: '명' },
    { title: '요일별 독서량', labels: ['월', '화', '수', '목'], values: [6, 10, 8, 12], unit: '권' },
    { title: '좋아하는 운동', labels: ['축구', '농구', '수영', '달리기'], values: [9, 4, 7, 6], unit: '명' },
    { title: '좋아하는 계절', labels: ['봄', '여름', '가을', '겨울'], values: [7, 13, 10, 5], unit: '명' },
  ];
  return charts.flatMap((chart, index) => {
    const maxIndex = chart.values.indexOf(Math.max(...chart.values));
    const minIndex = chart.values.indexOf(Math.min(...chart.values));
    const total = chart.values.reduce((sum, value) => sum + value, 0);
    const graphType = context.pictureGraphLesson
      ? 'picture_graph'
      : context.bandGraphLesson
        ? 'band_chart'
        : context.pieGraphLesson
          ? 'pie_chart'
          : context.lineGraphLesson
            ? 'line_chart'
            : 'bar_chart';
    const graphName = context.pictureGraphLesson
      ? '그림그래프'
      : context.bandGraphLesson
        ? '띠그래프'
        : context.pieGraphLesson
          ? '원그래프'
          : context.lineGraphLesson
            ? '꺾은선그래프'
            : '막대그래프';
    const shape = {
      type: graphType,
      dimensions: {
        ...chart,
        ...(context.pictureGraphLesson ? { each: 1 } : {}),
      },
    };
    return [
      {
        question: `${chart.title} ${graphName}에서 값이 가장 큰 항목은 무엇인가요?`,
        options: [...chart.labels],
        answerIndex: maxIndex,
        explanation: `${chart.labels[maxIndex]}의 값이 ${chart.values[maxIndex]}${chart.unit}으로 가장 큽니다.`,
        shape,
        skill: `자료 ${index + 1} 그래프 최댓값 읽기`,
        difficultyTag: '기초',
      },
      {
        question: `${chart.title} ${graphName}의 모든 값을 합하면 얼마인가요?`,
        options: [`${total - 3}${chart.unit}`, `${total}${chart.unit}`, `${total + 2}${chart.unit}`, `${total + 5}${chart.unit}`],
        answerIndex: 1,
        explanation: `${chart.values.join('+')}=${total}이므로 합계는 ${total}${chart.unit}입니다.`,
        shape,
        skill: `자료 ${index + 1} 그래프 합계 구하기`,
        difficultyTag: '적용',
      },
      {
        question: `${chart.title} ${graphName}에서 값이 가장 작은 항목은 무엇인가요?`,
        options: [...chart.labels],
        answerIndex: minIndex,
        explanation: `${chart.labels[minIndex]}의 값이 ${chart.values[minIndex]}${chart.unit}으로 가장 작습니다.`,
        shape,
        skill: `자료 ${index + 1} 그래프 최솟값 읽기`,
        difficultyTag: '기초',
      },
    ];
  });
};

const solidShapeFallbackQuestions = (context) => {
  const cuboid = [
    ['모든 면이 정사각형인 입체도형은 무엇인가요?', ['직육면체', '정육면체', '직사각형', '정사각형'], 1, '정육면체의 모든 면은 서로 같은 정사각형입니다.'],
    ['직육면체의 면은 모두 몇 개인가요?', ['4개', '6개', '8개', '12개'], 1, '직육면체는 면이 모두 6개입니다.'],
    ['정육면체의 꼭짓점은 모두 몇 개인가요?', ['6개', '8개', '10개', '12개'], 1, '정육면체의 꼭짓점은 모두 8개입니다.'],
    ['직육면체의 모서리는 모두 몇 개인가요?', ['6개', '8개', '12개', '14개'], 2, '직육면체의 모서리는 모두 12개입니다.'],
  ];
  const round = [
    ['밑면이 원 모양으로 1개이고 꼭짓점이 1개인 입체도형은 무엇인가요?', ['원뿔', '원기둥', '구', '원'], 0, '원뿔은 원 모양의 밑면 1개와 꼭짓점 1개가 있습니다.'],
    ['평평한 면이 없고 어느 방향에서 보아도 둥근 입체도형은 무엇인가요?', ['구', '원뿔', '원기둥', '원'], 0, '구는 평평한 면이 없고 어느 방향에서 보아도 둥글게 보입니다.'],
    ['원 모양의 밑면이 2개인 입체도형은 무엇인가요?', ['원뿔', '구', '원기둥', '원'], 2, '원기둥은 서로 평행하고 크기가 같은 원 모양의 밑면이 2개입니다.'],
    ['다음 중 꼭짓점이 없는 입체도형은 무엇인가요?', ['원뿔', '삼각형', '사각형', '구'], 3, '구에는 꼭짓점이 없습니다.'],
  ];
  const candidates = [
    ...(context.cuboidLesson ? cuboid : []),
    ...(context.roundSolidLesson ? round : []),
  ];
  return candidates.map(([question, options, answerIndex, explanation]) => ({
    question, options, answerIndex, explanation, shape: null, skill: '입체도형 성질', difficultyTag: '기초',
  }));
};

const symmetryFallbackQuestions = () => [
  [
    '선대칭도형에서 대칭축의 뜻으로 알맞은 것은 무엇인가요?',
    ['도형을 두 부분으로 접었을 때 완전히 겹치게 하는 직선', '도형의 가장 긴 변', '도형을 둘러싼 선 전체', '도형을 한 바퀴 돌리는 중심점'],
    0,
    '선대칭도형에서 대칭축은 도형을 접었을 때 양쪽이 완전히 겹치게 하는 직선입니다.',
    null,
  ],
  [
    '점대칭도형에서 대칭의 중심을 기준으로 대응점은 어떻게 놓이나요?',
    ['대칭의 중심에서 같은 거리에 놓입니다.', '항상 도형의 위쪽에만 놓입니다.', '서로 다른 직선 위에 아무렇게나 놓입니다.', '한 점은 반드시 도형 밖에 놓입니다.'],
    0,
    '점대칭도형의 대응점은 대칭의 중심을 사이에 두고 같은 직선 위, 같은 거리에 놓입니다.',
    null,
  ],
  [
    '아래 격자에서 세로 대칭축을 기준으로 점 (2, 3)에 대응하는 점은 무엇인가요?',
    ['(5, 3)', '(2, 5)', '(3, 2)', '(5, 2)'],
    0,
    '세로 대칭축을 기준으로 좌우 위치만 바뀌므로 (2, 3)의 대응점은 (5, 3)입니다.',
    { type: 'symmetry', dimensions: { axis: 'vertical', cells: [{ x: 2, y: 3 }, { x: 5, y: 3 }] } },
  ],
  [
    '선대칭도형에서 대응변의 길이는 어떻게 되나요?',
    ['서로 같습니다.', '항상 2배입니다.', '항상 다릅니다.', '대칭축에 가까울수록 짧습니다.'],
    0,
    '선대칭도형에서 서로 대응하는 변의 길이는 같습니다.',
    null,
  ],
  [
    '점대칭도형을 대칭의 중심을 기준으로 몇 도 돌리면 처음 도형과 겹치나요?',
    ['90도', '120도', '180도', '360도만 가능'],
    2,
    '점대칭도형은 대칭의 중심을 기준으로 180도 돌리면 처음 도형과 겹칩니다.',
    null,
  ],
  [
    '선대칭도형에서 대응점과 대칭축 사이의 거리는 어떻게 되나요?',
    ['서로 같습니다.', '왼쪽 점이 항상 더 멉니다.', '오른쪽 점이 항상 더 멉니다.', '도형마다 반드시 다릅니다.'],
    0,
    '선대칭도형의 대응점은 대칭축에서 같은 거리에 있습니다.',
    null,
  ],
  [
    '점대칭도형에서 대칭의 중심은 두 대응점을 이은 선분의 어디에 있나요?',
    ['한쪽 끝', '정중앙', '도형 밖', '항상 위쪽'],
    1,
    '대칭의 중심은 두 대응점을 이은 선분의 정중앙에 있습니다.',
    null,
  ],
  [
    '선대칭도형과 점대칭도형을 구분하는 설명으로 알맞은 것은 무엇인가요?',
    ['선대칭은 접어서 겹치고, 점대칭은 180도 돌려서 겹칩니다.', '선대칭은 항상 원이고, 점대칭은 항상 삼각형입니다.', '두 도형은 언제나 같은 뜻입니다.', '점대칭은 대칭축이 반드시 3개입니다.'],
    0,
    '선대칭은 대칭축을 기준으로 접었을 때 겹치고, 점대칭은 대칭의 중심을 기준으로 180도 돌렸을 때 겹칩니다.',
    null,
  ],
].map(([question, options, answerIndex, explanation, shape], index) => ({
  question, options, answerIndex, explanation, shape, skill: `대칭 개념 ${index + 1}`, difficultyTag: '기초',
}));

const deterministicFallbackQuestions = (context) => {
  if (context.fractionLesson && context.fractionAddSubLesson) return fractionFallbackQuestions(context);
  if (context.graphLesson) return graphFallbackQuestions(context);
  if (context.symmetryLesson) return symmetryFallbackQuestions();
  if (context.solidShape) return solidShapeFallbackQuestions(context);
  return [];
};

const ensureConceptCards = (result, payload) => {
  if (result.conceptCards?.length) return result;
  const title = String(payload?.lessonTitle || payload?.unitName || '오늘의 개념');
  return {
    ...result,
    conceptCards: [
      {
        title: `${title} 핵심`,
        body: '이번 차시의 핵심 개념을 문제 상황에서 확인하며 익힙니다.',
        example: '문제의 조건과 보기, 그림 자료가 서로 맞는지 차례대로 확인합니다.',
      },
    ],
  };
};

const fillMinimumQuestionPool = (result, minimumCount, poolSize, context) => {
  if (result.questions.length >= minimumCount) return result;
  return mergeQuestionPools(
    result,
    { questions: deterministicFallbackQuestions(context) },
    Math.min(minimumCount, poolSize),
    context,
  );
};

const buildRepairPrompt = ({ payload, missingCount, acceptedQuestions, ragSection }) => `
아래 수업에 사용할 객관식 문제 중 자동 검증을 통과하지 못한 문항이 있어 대체 문항이 필요합니다.
설명 없이 JSON 객체 하나만 반환하세요.

[수업 정보]
- 학년: ${payload.grade}학년
- 학기: ${payload.semester || ''}
- 출판사: ${payload.publisher || ''}
- 단원: ${payload.unitName}
- 차시: ${payload.lessonTitle}
- 학습 목표: ${payload.learningGoal || ''}
- 핵심 키워드: ${Array.isArray(payload.keywords) ? payload.keywords.join(', ') : payload.keywords || ''}
${ragSection}
${buildQuestionMixGuide(payload, missingCount, ragSection)}

[이미 통과한 문제 - 같은 유형과 문장 구조를 반복하지 마세요]
${acceptedQuestions.map((question, index) => `${index + 1}. ${question.question}`).join('\n') || '없음'}

[생성 요구]
- 서로 다른 문제 ${missingCount}개를 생성하세요.
- options는 정확히 4개이며 정답은 정확히 1개여야 합니다.
- 이상/이하/초과/미만 문제는 경계값의 포함 여부를 직접 대입하여 확인하고, '아닌 것'도 정답이 정확히 1개인지 검산하세요.
- 올림·버림·반올림 문제는 기준 자리와 결과 자리를 구분해 직접 계산하고, 같은 값을 다르게 표기한 복수 정답을 만들지 마세요.
- 분수 계산은 정답과 해설의 식을 직접 검산하세요. 분자가 빠진 "/8" 같은 표기는 금지합니다.
- 도형·그래프 shape를 사용하면 shape의 숫자, 항목, 정답이 문제와 정확히 일치해야 합니다.
- 그래프가 없어도 풀 수 있는 단순 계산에는 shape:null을 사용하세요.
- 기존 문제와 숫자만 바꾼 문제를 만들지 마세요.

{"questions":[{"question":"문제","shape":null,"options":["보기1","보기2","보기3","보기4"],"answerIndex":0,"explanation":"검산된 해설","skill":"문항 유형","difficultyTag":"기초|적용|심화"}]}
`;

function buildPrompt(payload, poolSize, isUnitTest, ragSection) {
  const {
    grade, semester, publisher, unitName,
    lessonNo, lessonTitle, learningGoal, keywords,
    difficulty = 'normal', questionCount = 5,
  } = payload;

  const keywordStr = Array.isArray(keywords) ? keywords.join(', ') : (keywords || '');
  const diffLabel = difficulty === 'easy' ? '기초' : difficulty === 'hard' ? '심화' : '기본';
  const lessonLabel = isUnitTest ? '단원평가' : `${lessonNo ? `${lessonNo}차시 ` : ''}${lessonTitle}`;
  const questionMixGuide = buildQuestionMixGuide(payload, poolSize, ragSection);

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
- Use cuboid, cube, triangular_prism, square_pyramid, cylinder, cone, sphere, or multi with only the solid types allowed by the exact lesson.
- If the question asks about a real-life object, the visual must still show the matching solid type, not a flat face.
`
    : '';
  const gradeOneRules = Number(grade) === 1
    ? `
[Grade 1 scope rules]
- Use only the exact unit, lesson title, learning goal, and keywords shown below.
- Never use formal solid-geometry terms such as cuboid, cube, cylinder, cone, vertex, or edge.
- Never create fraction, multiplication, or division questions.
- Do not create graph questions unless the lesson title or unit explicitly mentions graphs.
- Do not create clock or time questions unless the lesson title or unit explicitly mentions time or clocks.
- For "여러 가지 모양", use familiar descriptions such as 상자 모양, 둥근 기둥 모양, 공 모양, 네모/세모/동그라미.
`
    : '';
  const gradeTwoRules = Number(grade) === 2
    ? `
[Grade 2 scope rules]
- Use only the exact unit, lesson title, learning goal, and keywords shown below.
- Never use formal solid-geometry terms such as cuboid, cube, cylinder, cone, edge, angle, area, or perimeter.
- Never create fraction or division questions.
- Create multiplication questions only for multiplication or multiplication-table lessons.
- Do not create graph questions unless the lesson title or unit explicitly mentions tables or graphs.
- Use numbers no greater than 10,000.
- For "여러 가지 도형", use grade-appropriate triangle, quadrilateral, circle, tangram, and block-stacking activities.
`
    : '';
  const gradeThreeRules = Number(grade) === 3
    ? `
[Grade 3 scope rules]
- Use only the exact unit, lesson title, learning goal, and keywords shown below.
- Never create formal solid-geometry questions. Cuboids, cubes, cylinders, cones, prisms, pyramids, faces, and edges are outside Grade 3 scope.
- Fractions are limited to meaning, representation, size, and comparison. Never create fraction addition, subtraction, multiplication, division, reduction, or common-denominator questions.
- Use only picture graphs for graph lessons. Never create bar, line, or pie graph questions.
- Angle content is limited to right-angle recognition. Never use degree measures, acute angles, or obtuse angles.
- Create multiplication or division questions only when the lesson title or unit explicitly covers that operation.
`
    : '';
  const gradeFourRules = Number(grade) === 4
    ? `
[Grade 4 scope rules]
- Use only the exact unit, lesson title, learning goal, and keywords shown below.
- Never create formal solid-geometry questions. Cuboids, cubes, cylinders, cones, prisms, pyramids, faces, and edges are outside Grade 4 scope.
- Fraction addition and subtraction may appear only in their matching lesson and must use the same denominator. Never create unlike-denominator, common-denominator, reduction, fraction multiplication, or fraction division questions.
- Decimal addition and subtraction may appear only in their matching lesson. Never create decimal multiplication or decimal division questions.
- Graph questions may use bar graphs or line graphs only when the lesson explicitly covers them. Never create picture graphs or pie graphs.
- Create multiplication or division questions only when the lesson title or unit explicitly covers that operation.
`
    : '';
  const gradeFiveRules = Number(grade) === 5
    ? `
[Grade 5 scope rules]
- Use only the exact unit, lesson title, learning goal, and keywords shown below.
- Solid geometry is limited to cuboids and cubes, and only in the cuboid unit. Never use prisms, pyramids, cylinders, cones, or spheres.
- Fraction addition/subtraction, fraction multiplication, reduction/common denominators, decimals multiplication, and probability must appear only in their matching units.
- Never create fraction division or decimal division questions.
- Do not create graph questions unless the lesson explicitly covers data, graphs, averages, or probability.
`
    : '';
  const gradeSixRules = Number(grade) === 6
    ? `
[Grade 6 scope rules]
- Use only the exact unit, lesson title, learning goal, and keywords shown below.
- Match solid geometry to its unit: cuboids only for volume/surface-area lessons, prisms/pyramids only for prism/pyramid lessons, cubes only for block-stacking lessons, and cylinders/cones/spheres only for their named unit.
- Fraction operations are limited to fraction division lessons. Ratios and percentages may use a fraction as a representation, but must not introduce unrelated fraction operations.
- Decimal operations are limited to decimal division. Never create decimal multiplication questions.
- Graph questions belong only to graph lessons. For the "여러 가지 그래프" unit, use band_chart or pie_chart when appropriate.
`
    : '';

  return `당신은 대한민국 초등 수학 평가 문항을 만드는 교사입니다.
아래 수업 정보에 맞춰 학생용 AI 학습 콘텐츠를 완전한 JSON 하나로만 생성하세요.

${ragSection}
${sameDenomRules}
${factorRules}
${solidShapeRules}
${gradeOneRules}
${gradeTwoRules}
${gradeThreeRules}
${gradeFourRules}
${gradeFiveRules}
${gradeSixRules}
${questionMixGuide}
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
2. 위 문항 구성표를 지키세요. 특히 핵심 기능 연습은 차시 유형에 맞는 세부 기능을 나누어 만들고, 같은 skill 세부 유형을 반복하지 마세요.
3. 오답 보기는 학생이 실제로 할 법한 실수를 반영하세요. 터무니없는 보기는 금지합니다.
4. 같은 정답 위치가 반복되지 않게 answerIndex를 0~3에 고르게 배치하세요.
5. 문항은 초등학생이 읽기 쉬운 한국어로 쓰고, 한 문항 안에 불필요한 조건을 넣지 마세요.
6. 해설은 정답만 말하지 말고 왜 그런지 1~2문장으로 설명하세요.
7. 단원평가는 단원 전체를 골고루 다루고, 일반 차시는 해당 차시 내용에 집중하세요.
8. 시각 자료가 도움이 되는 문항은 shape를 반드시 넣으세요. 단순 계산 문항만 shape:null을 쓰세요.
9. 분수 문제는 정답 보기와 해설 속 계산식을 직접 다시 계산해 검산하세요. 분자가 빠진 "/8" 같은 표기는 절대 만들지 마세요.
10. shape를 넣으면 shape의 수치·항목·색칠 영역과 문제의 조건 및 정답이 정확히 일치해야 합니다.
11. 같은 문장 구조에서 숫자만 바꾼 문제를 반복하지 마세요.
12. 이상은 경계값 포함, 이하는 경계값 포함, 초과는 경계값 제외, 미만은 경계값 제외입니다. 각 보기의 값을 범위에 직접 대입하고, '아닌 것' 문제도 정답이 정확히 1개인지 확인하세요.
13. 올림·버림·반올림은 문제에서 요구한 자리까지 직접 계산하세요. 예를 들어 '천의 자리에서 반올림'은 만의 자리까지 나타내는 것입니다. 숫자 표기만 다른 같은 값(예: 15000과 15,000)을 복수 보기로 두지 마세요.

[shape 예시]
- 시계: {"type":"clock","dimensions":{"hour":3,"minute":30}}
- 자: {"type":"ruler","dimensions":{"total":10,"highlight":{"from":2,"to":7}},"unit":"cm"}
- 분수막대: {"type":"fraction_bar","dimensions":{"total":5,"filled":3}}
- 수직선: {"type":"number_line","dimensions":{"min":0,"max":10,"marks":[3,7],"highlight":{"from":3,"to":7}}}
- 그림그래프: {"type":"picture_graph","dimensions":{"title":"좋아하는 과일","labels":["사과","배"],"values":[5,8],"unit":"명","each":1}}
- 막대그래프: {"type":"bar_chart","dimensions":{"title":"좋아하는 과일","labels":["사과","배"],"values":[5,8],"unit":"명"}}
- 꺾은선그래프: {"type":"line_chart","dimensions":{"title":"기온 변화","labels":["월","화","수"],"values":[12,15,13],"unit":"도"}}
- 원그래프: {"type":"pie_chart","dimensions":{"title":"선호 조사","labels":["사과","배","귤"],"values":[4,3,3]}}
- 띠그래프: {"type":"band_chart","dimensions":{"title":"선호 조사","labels":["사과","배","귤"],"values":[40,30,30],"unit":"%"}}
- 도형 비교: {"type":"multi","dimensions":{"items":["circle","rectangle","triangle"]}}
- 도형: rectangle, square, circle, right_triangle, parallelogram, rhombus, trapezoid 등을 사용할 수 있습니다.
- 입체도형: cuboid(직육면체), cube(정육면체), triangular_prism(삼각기둥), square_pyramid(사각뿔), cylinder(원기둥), cone(원뿔), sphere(구)를 사용할 수 있습니다.
- 입체도형 비교: {"type":"multi","dimensions":{"items":["cuboid","cube","cylinder","cone"]}}
- 대칭: {"type":"symmetry","dimensions":{"axis":"vertical","cells":[{"x":1,"y":1},{"x":2,"y":3}]}}
- 약수/공약수 목록: {"type":"factor_list","dimensions":{"groups":[{"label":"8의 약수","values":[1,2,4,8]},{"label":"12의 약수","values":[1,2,3,4,6,12]}],"highlight":[1,2,4]}}
- 그래프는 labels와 values 개수를 반드시 같게 만들고, values에는 숫자만 넣으세요. 그림그래프는 각 value가 each의 배수여야 합니다.
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

async function callClaude({ apiKey, model, prompt, maxTokens, temperature = 0.55 }) {
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
      temperature,
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

  const payload = req.body || {};
  if (payload.action === 'qa-batch') {
    const items = Array.isArray(payload.items) ? payload.items.slice(0, 20) : [];
    const results = items.map(item => {
      const rawContent = item?.content || {};
      const rawQuestionCount = Array.isArray(rawContent.questions) ? rawContent.questions.length : 0;
      const poolSize = Math.min(20, Math.max(5, Number(item?.targetCount) || rawQuestionCount || 20));
      const context = buildLessonContext(item || {}, '');
      const normalized = ensureConceptCards(normalizeContent(rawContent, poolSize, context), item || {});
      const issues = validateContent(normalized, poolSize);
      const rejectedCount = Math.max(0, rawQuestionCount - normalized.questions.length);
      if (rejectedCount > 0) issues.unshift(`자동 검산에서 제외된 문항 ${rejectedCount}개`);
      return {
        lessonKey: item?.lessonKey || '',
        validCount: normalized.questions.length,
        rejectedCount,
        issues: [...new Set(issues)].slice(0, 20),
        passed: issues.length === 0 && normalized.questions.length >= poolSize,
      };
    });
    return res.status(200).json({ results, validatorVersion: COURSEWARE_GENERATOR_VERSION });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' });

  const { grade, semester, publisher, unitName, lessonNo, lessonTitle, questionCount = 5, lessonContext } = payload;
  if (!grade || !unitName || !lessonTitle) {
    return res.status(400).json({ error: '학년, 단원명, 차시명을 입력해주세요.' });
  }

  const isUnitTest = lessonTitle === '단원평가';
  const requested = Number(questionCount) || 5;
  const fastInitial = payload.fastInitial === true && !isUnitTest;
  const allowPartial = payload.allowPartial === true;
  const poolSize = fastInitial
    ? Math.min(Math.max(requested, 5), 5)
    : isUnitTest
    ? Math.min(Math.max(requested + 5, 10), 20)
    : Math.min(Math.max(requested, 8), 20);

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
    const startedAt = Date.now();
    const qualityModel = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
    const fastModel = process.env.ANTHROPIC_FAST_MODEL || 'claude-haiku-4-5-20251001';
    const useFastModel = fastInitial;
    let model = useFastModel ? fastModel : qualityModel;
    let fallbackUsed = false;
    const prompt = buildPrompt(payload, poolSize, isUnitTest, ragSection);
    let rawText;
    try {
      rawText = await callClaude({
        apiKey,
        model,
        prompt,
        maxTokens: fastInitial ? 3000 : Math.min(7000, isUnitTest ? 4800 + poolSize * 140 : 3200 + poolSize * 180),
      });
    } catch (err) {
      if (!useFastModel) throw err;
      fallbackUsed = true;
      model = qualityModel;
      rawText = await callClaude({
        apiKey,
        model,
        prompt,
        maxTokens: 3200,
      });
    }

    let parsed = tryParseJson(rawText);
    if (!parsed) {
      return res.status(500).json({ error: 'AI 응답을 JSON으로 해석하지 못했습니다. 다시 시도해주세요.' });
    }

    const lessonContextFlags = buildLessonContext(payload, ragSection);
    let result = ensureConceptCards(normalizeContent(parsed, poolSize, lessonContextFlags), payload);
    let validationIssues = validateContent(result, poolSize);
    let rejectedQuestionCount = Math.max(0, (parsed.questions?.length || 0) - result.questions.length);
    let repairAttempted = false;
    let repairedQuestionCount = 0;
    let deterministicFallbackCount = 0;

    if (result.questions.length < poolSize) {
      const beforeFallback = result.questions.length;
      result = fillMinimumQuestionPool(result, poolSize, poolSize, lessonContextFlags);
      deterministicFallbackCount = result.questions.length - beforeFallback;
      validationIssues = validateContent(result, poolSize);
    }

    // Fast initial generation should return quickly. Only fall back to the quality
    // model when the fast model plus deterministic fillers still cannot make a
    // playable session.
    if (!allowPartial && useFastModel && !fallbackUsed && result.questions.length < requested) {
      fallbackUsed = true;
      model = qualityModel;
      rawText = await callClaude({
        apiKey,
        model,
        prompt,
        maxTokens: 3200,
      });
      parsed = tryParseJson(rawText);
      if (!parsed) {
        return res.status(500).json({ error: 'AI 응답을 JSON으로 해석하지 못했습니다. 다시 시도해주세요.' });
      }
      result = ensureConceptCards(normalizeContent(parsed, poolSize, lessonContextFlags), payload);
      validationIssues = validateContent(result, poolSize);
      rejectedQuestionCount = Math.max(0, (parsed.questions?.length || 0) - result.questions.length);
      if (result.questions.length < poolSize) {
        const beforeFallback = result.questions.length;
        result = fillMinimumQuestionPool(result, poolSize, poolSize, lessonContextFlags);
        deterministicFallbackCount += result.questions.length - beforeFallback;
        validationIssues = validateContent(result, poolSize);
      }
    }

    if (!allowPartial && result.questions.length < poolSize) {
      repairAttempted = true;
      const beforeRepair = result.questions.length;
      const missingCount = Math.min(6, poolSize - beforeRepair);
      const repairPrompt = buildRepairPrompt({
        payload,
        missingCount,
        acceptedQuestions: result.questions,
        ragSection,
      });
      try {
        const repairText = await callClaude({
          apiKey,
          model: fastModel,
          prompt: repairPrompt,
          maxTokens: Math.min(3000, 900 + missingCount * 360),
          temperature: 0.35,
        });
        const repairParsed = tryParseJson(repairText);
        if (repairParsed) {
          result = mergeQuestionPools(result, repairParsed, poolSize, lessonContextFlags);
          repairedQuestionCount = result.questions.length - beforeRepair;
          rejectedQuestionCount += Math.max(0, (repairParsed.questions?.length || 0) - repairedQuestionCount);
          validationIssues = validateContent(result, poolSize);
        }
      } catch (repairError) {
        console.warn('courseware repair generation failed:', repairError);
      }
    }

    if (!result.questions.length) {
      return res.status(500).json({ error: '사용 가능한 문제가 생성되지 않았습니다. 다시 시도해주세요.' });
    }

    const generationMs = Date.now() - startedAt;
    res.setHeader('Server-Timing', `courseware;dur=${generationMs}`);
    return res.status(200).json({
      ...result,
      context,
      generatedBy: 'ai',
      generatorVersion: COURSEWARE_GENERATOR_VERSION,
      requestedQuestionCount: requested,
      poolSize: result.questions.length,
      isPartialPool: result.questions.length < requested || fastInitial,
      generationMs,
      generationTier: useFastModel && !fallbackUsed ? 'fast-initial' : 'quality',
      fallbackUsed,
      repairAttempted,
      repairedQuestionCount,
      deterministicFallbackCount,
      rejectedQuestionCount,
      validationIssues: validationIssues.length > 0 ? validationIssues : null,
      validatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('generate-courseware error:', err);
    return res.status(500).json({ error: err.message || '서버 오류가 발생했습니다.' });
  }
}
