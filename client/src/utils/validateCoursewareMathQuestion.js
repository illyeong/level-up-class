import { getArithmeticAnswerIndex, getEquivalentFractionAnswerIndex } from './coursewareArithmetic.js';

const NUMBER_TOKEN = /-?\d[\d,]*(?:\.\d+)?/g;

const parseNumbers = (value) => {
  const matches = String(value ?? '').match(NUMBER_TOKEN) || [];
  return matches
    .map(token => Number(token.replace(/,/g, '')))
    .filter(Number.isFinite);
};

const singleOptionNumber = (option) => {
  const values = parseNumbers(option);
  return values.length === 1 ? values[0] : null;
};

const uniqueMatchingIndex = (matches) => {
  const indexes = matches
    .map((matched, index) => matched ? index : -1)
    .filter(index => index >= 0);
  return indexes.length === 1 ? indexes[0] : -1;
};

const RANGE_CONDITION_RE = /(-?\d[\d,]*(?:\.\d+)?)\s*(?:\uc6d0|\uac1c|\uba85|\ub9c8\ub9ac|cm|mm|km|m|kg|g|L|mL|\uc810|\uc0b4|\ub3c4|%)?\s*(\uc774\uc0c1|\uc774\ud558|\ucd08\uacfc|\ubbf8\ub9cc)/gi;

const getRangeAnswerIndex = (question, options) => {
  const text = String(question || '');
  const conditions = [...text.matchAll(RANGE_CONDITION_RE)].map(match => ({
    value: Number(match[1].replace(/,/g, '')),
    operator: match[2],
  }));
  if (!conditions.length) return null;

  const values = options.map(singleOptionNumber);
  if (values.some(value => value == null)) return null;

  const asksForCount = /\uac1c\uc218|\uba87\s*(?:\uac1c|\uba85|\uc77c|\ub0a0|\uac00\uc9c0)/.test(text);
  if (asksForCount) {
    if (conditions.length !== 2 || !/\ud574\ub2f9\ud558\ub294\s*\uc218|\ubc94\uc704\uc5d0\s*\uc788\ub294\s*\uc218/.test(text)) return null;
    let lower = -Infinity;
    let upper = Infinity;
    conditions.forEach(condition => {
      if (condition.operator === '\uc774\uc0c1') lower = Math.max(lower, Math.ceil(condition.value));
      if (condition.operator === '\ucd08\uacfc') lower = Math.max(lower, Math.floor(condition.value) + 1);
      if (condition.operator === '\uc774\ud558') upper = Math.min(upper, Math.floor(condition.value));
      if (condition.operator === '\ubbf8\ub9cc') upper = Math.min(upper, Math.ceil(condition.value) - 1);
    });
    if (!Number.isFinite(lower) || !Number.isFinite(upper)) return null;
    const expectedCount = Math.max(0, upper - lower + 1);
    return uniqueMatchingIndex(values.map(value => value === expectedCount));
  }

  if (/\uae30\ud638|\uc2dd\uc73c\ub85c|\ub098\ud0c0\ub0b8|\ubb3c\uc5c8\uc744\s*\ub54c|\ub77c\uace0\s*\ubb3c|\uc544\ub2c8\uc624|['\u201c\u201d"]\uc608['\u201c\u201d"]|\uc5d0\s*['\u201c\u201d"]?\uc608/.test(text)) return null;

  const isInside = value => conditions.every(condition => {
    if (condition.operator === '\uc774\uc0c1') return value >= condition.value;
    if (condition.operator === '\uc774\ud558') return value <= condition.value;
    if (condition.operator === '\ucd08\uacfc') return value > condition.value;
    return value < condition.value;
  });
  const asksOutside = /\uc544\ub2cc|\uc54a\ub294|\ubc97\uc5b4\ub09c|\ud3ec\ud568\ub418\uc9c0\s*\uc54a|\ud574\ub2f9\ud558\uc9c0\s*\uc54a|\uc18d\ud558\uc9c0\s*\uc54a/.test(text);
  return uniqueMatchingIndex(values.map(value => asksOutside ? !isInside(value) : isInside(value)));
};

const PLACE_VALUES = {
  '\uc77c': 1,
  '\uc2ed': 10,
  '\ubc31': 100,
  '\ucc9c': 1000,
  '\ub9cc': 10000,
  '\uc2ed\ub9cc': 100000,
  '\ubc31\ub9cc': 1000000,
  '\ucc9c\ub9cc': 10000000,
  '\uc5b5': 100000000,
};
const PLACE_NAME_PATTERN = '\ucc9c\ub9cc|\ubc31\ub9cc|\uc2ed\ub9cc|\uc5b5|\ub9cc|\ucc9c|\ubc31|\uc2ed|\uc77c';
const DECIMAL_PLACE_ORDERS = { '\uccab\uc9f8': 1, '\ub458\uc9f8': 2, '\uc14b\uc9f8': 3, '\ub137\uc9f8': 4 };

const getRoundingInstruction = (question) => {
  const text = String(question || '');
  const mode = text.includes('\ubc18\uc62c\ub9bc') ? 'round'
    : text.includes('\uc62c\ub9bc') ? 'ceil'
      : text.includes('\ubc84\ub9bc') ? 'floor'
        : null;
  if (!mode) return null;

  let match = text.match(new RegExp(`(${PLACE_NAME_PATTERN})\uc758\\s*\uc790\ub9ac\uae4c\uc9c0[^.?!]*(?:\ubc18\uc62c\ub9bc|\uc62c\ub9bc|\ubc84\ub9bc)`));
  if (!match) match = text.match(new RegExp(`(?:\ubc18\uc62c\ub9bc|\uc62c\ub9bc|\ubc84\ub9bc)[^.?!]*?(${PLACE_NAME_PATTERN})\uc758\\s*\uc790\ub9ac\uae4c\uc9c0`));
  if (match) return { mode, unit: PLACE_VALUES[match[1]] };

  match = text.match(/\uc18c\uc218\s*(\uccab\uc9f8|\ub458\uc9f8|\uc14b\uc9f8|\ub137\uc9f8)\s*\uc790\ub9ac\uae4c\uc9c0[^.?!]*(?:\ubc18\uc62c\ub9bc|\uc62c\ub9bc|\ubc84\ub9bc)/);
  if (!match) match = text.match(/(?:\ubc18\uc62c\ub9bc|\uc62c\ub9bc|\ubc84\ub9bc)[^.?!]*?\uc18c\uc218\s*(\uccab\uc9f8|\ub458\uc9f8|\uc14b\uc9f8|\ub137\uc9f8)\s*\uc790\ub9ac\uae4c\uc9c0/);
  if (match) return { mode, unit: 10 ** -DECIMAL_PLACE_ORDERS[match[1]] };

  match = text.match(new RegExp(`(${PLACE_NAME_PATTERN})\uc758\\s*\uc790\ub9ac\\s*(?:\ubbf8\ub9cc|\uc544\ub798)(?:\uc758\\s*\uc218)?(?:\uc744|\ub97c)?\\s*(?:\ubc18\uc62c\ub9bc|\uc62c\ub9bc|\ubc84\ub9bc)`));
  if (match) return { mode, unit: PLACE_VALUES[match[1]] };

  match = text.match(new RegExp(`(${PLACE_NAME_PATTERN})\uc758\\s*\uc790\ub9ac\uc5d0\uc11c\\s*(?:\ubc18\uc62c\ub9bc|\uc62c\ub9bc|\ubc84\ub9bc)`));
  if (match) return { mode, unit: PLACE_VALUES[match[1]] * 10 };

  match = text.match(/\uc18c\uc218\s*(\uccab\uc9f8|\ub458\uc9f8|\uc14b\uc9f8|\ub137\uc9f8)\s*\uc790\ub9ac\uc5d0\uc11c\s*(?:\ubc18\uc62c\ub9bc|\uc62c\ub9bc|\ubc84\ub9bc)/);
  if (match) return { mode, unit: 10 ** -(DECIMAL_PLACE_ORDERS[match[1]] - 1) };

  return null;
};

const applyRounding = (value, { mode, unit }) => {
  const scaled = value / unit;
  const rounded = mode === 'ceil' ? Math.ceil(scaled)
    : mode === 'floor' ? Math.floor(scaled)
      : Math.floor(scaled + 0.5);
  return Number((rounded * unit).toPrecision(12));
};

const getRoundingAnswerIndex = (question, options) => {
  const instruction = getRoundingInstruction(question);
  if (!instruction) return null;
  const sourceText = String(question || '').replace(/^\s*\d+[.)]\s+/, '');
  // This checker handles one rounding operation, not arithmetic performed
  // after rounding (e.g. round 23 to 20, then estimate 23×4 as 80).
  if (/[×÷*+]|\d\s*[-−]\s*\d|(?:나타낸|어림한|반올림한)\s*(?:뒤|후)|곱하면|곱한|나누면|나눈|빼면|뺀\s*값/.test(sourceText)) return null;
  if (/\ub354\ud558\uba74|\ud569\uc740|\ud569\uacc4|\ucc28\ub294|\ucd5c\uc18c\s*\uba87|\uba87\s*(?:\uc0c1\uc790|\ubd09\uc9c0|\ubb36\uc74c|\uc870|\ub300|\ud1b5)\uac00?\s*\ud544\uc694/.test(sourceText)) return null;
  const directSource = sourceText.match(/(-?\d[\d,]*(?:\.\d+)?)\s*(?:\uc744|\ub97c)[^.?!]{0,60}?(?:\ubc18\uc62c\ub9bc|\uc62c\ub9bc|\ubc84\ub9bc)/)
    || sourceText.match(/(-?\d[\d,]*(?:\.\d+)?)\s*\uc758\s*(?:\uc18c\uc218\s*(?:\uccab\uc9f8|\ub458\uc9f8|\uc14b\uc9f8|\ub137\uc9f8)|(?:\ucc9c\ub9cc|\ubc31\ub9cc|\uc2ed\ub9cc|\uc5b5|\ub9cc|\ucc9c|\ubc31|\uc2ed|\uc77c)\uc758\s*\uc790\ub9ac)[^.?!]{0,60}?(?:\ubc18\uc62c\ub9bc|\uc62c\ub9bc|\ubc84\ub9bc)/);
  const optionValues = options.map(singleOptionNumber);
  if (optionValues.some(value => value == null)) return null;
  const tolerance = Math.max(1e-9, Math.abs(instruction.unit) * 1e-9);

  if (directSource) {
    const sourceValue = Number(directSource[1].replace(/,/g, ''));
    const expected = applyRounding(sourceValue, instruction);
    return uniqueMatchingIndex(optionValues.map(value => Math.abs(value - expected) <= tolerance));
  }

  const inverseTarget = sourceText.match(/(?:\ubc18\uc62c\ub9bc|\uc62c\ub9bc|\ubc84\ub9bc)[^.?!]{0,50}?(-?\d[\d,]*(?:\.\d+)?)/);
  if (!inverseTarget) return null;
  const target = Number(inverseTarget[1].replace(/,/g, ''));
  const asksImpossible = /\ub420\s*\uc218\s*\uc5c6|\uc544\ub2cc|\uc54a\ub294/.test(sourceText);
  const matches = optionValues.map(value => {
    const canProduceTarget = Math.abs(applyRounding(value, instruction) - target) <= tolerance;
    return asksImpossible ? !canProduceTarget : canProduceTarget;
  });
  return uniqueMatchingIndex(matches);
};

/**
 * Code-verifiable elementary math types return the recalculated answer index.
 * A matching type with zero or multiple correct choices is invalid.
 */
export const validateDeterministicMathQuestion = (question) => {
  const options = Array.isArray(question?.options) ? question.options : [];
  const answerIndex = Number(question?.answerIndex);
  if (options.length !== 4) return { applicable: false, valid: false, answerIndex: -1 };

  for (const [type, check] of [['arithmetic', getArithmeticAnswerIndex], ['equivalent-fractions', getEquivalentFractionAnswerIndex]]) {
    const index = check(question?.question, options);
    if (index != null) return { applicable: true, valid: index >= 0, answerIndex: index, type };
  }

  const rangeIndex = getRangeAnswerIndex(question?.question, options);
  if (rangeIndex != null) {
    return { applicable: true, valid: rangeIndex >= 0, answerIndex: rangeIndex, type: 'range' };
  }

  const roundingIndex = getRoundingAnswerIndex(question?.question, options);
  if (roundingIndex != null) {
    return { applicable: true, valid: roundingIndex >= 0, answerIndex: roundingIndex, type: 'rounding' };
  }

  return {
    applicable: false,
    valid: Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex < options.length,
    answerIndex,
  };
};
