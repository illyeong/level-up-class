// A small parser, not eval: only numeric expressions with arithmetic operators
// are accepted. Unsupported word problems are left to other validators.
export const evaluateCoursewareExpression = (value) => {
  const source = String(value ?? '').normalize('NFKC')
    .replace(/⁄/g, '/')
    .replace(/(?<=\d),(?=\d{3}(?:\D|$))/g, '')
    .replace(/[−–—]/g, '-').replace(/[×xX]/g, '*').replace(/÷/g, '/')
    .replace(/(\d+)\s*(?:과|와)\s*(\d+)\s*\/\s*(\d+)/g, '($1+$2/$3)')
    .replace(/(\d+)[ \t]+(\d+)\s*\/\s*(\d+)/g, '($1+$2/$3)');
  const tokens = source.match(/\d+(?:\.\d+)?|[()+\-*/]/g) || [];
  if (!tokens.length || tokens.join('') !== source.replace(/\s+/g, '')) return null;
  let position = 0;
  const primary = () => {
    const token = tokens[position++];
    if (token === '+' || token === '-') return (token === '-' ? -1 : 1) * primary();
    if (token === '(') {
      const value = sum();
      if (tokens[position++] !== ')') throw new Error('Unclosed expression');
      return value;
    }
    if (!/^\d+(?:\.\d+)?$/.test(token || '')) throw new Error('Missing operand');
    return Number(token);
  };
  const product = () => {
    let value = primary();
    while (tokens[position] === '*' || tokens[position] === '/') {
      const operator = tokens[position++];
      const right = primary();
      value = operator === '*' ? value * right : value / right;
    }
    return value;
  };
  const sum = () => {
    let value = product();
    while (tokens[position] === '+' || tokens[position] === '-') {
      const operator = tokens[position++];
      const right = product();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  };
  try {
    const result = sum();
    return position === tokens.length && Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
};

export const getArithmeticAnswerIndex = (question, options) => {
  let text = String(question || '').normalize('NFKC').trim().replace(/^\d+[.)]\s+/, '');
  // Only an explicit calculation, never an equation with an unknown operand,
  // comparison, counting problem, or a fragment inside a story.
  text = text.replace(/^(?:다음(?:의)?\s*)?(?:식을?\s*)?계산(?:하세요|하시오|해\s*보세요)[.:]?\s*/, '')
    .replace(/^다음(?:의)?\s*(?:식|계산)(?:을|의)?\s*(?:계산하세요|결과는)?[.:]?\s*/, '')
    .replace(/(?:을|를|의)?\s*(?:계산(?:한\s*값|\s*결과)?|값|결과|답)(?:은|는)?\s*(?:얼마(?:인가요|입니까|일까요)?|무엇(?:인가요|입니까)?|구하세요|계산하세요)?[?.!]*$/, '')
    .replace(/(?:을|를)?\s*계산(?:하세요|하시오|하면)[?.!]*$/, '')
    .replace(/=\s*[?□]\s*[?.!]*$/, '').replace(/[?.!]+$/, '').trim();
  if (!/[+\-−×xX*÷/]/.test(text)) return null;
  const expected = evaluateCoursewareExpression(text);
  if (expected == null) return null;
  const values = options.map(evaluateCoursewareExpression);
  if (values.some(value => value == null)) return null;
  const matches = values.map((value, index) => Math.abs(value - expected) <= 1e-9 ? index : -1).filter(index => index >= 0);
  return matches.length === 1 ? matches[0] : -1;
};

export const getEquivalentFractionAnswerIndex = (question, options) => {
  if (!/크기가\s*같은\s*분수끼리|같은\s*크기의\s*분수|서로\s*같은\s*분수|같은\s*분수끼리/.test(question || '')) return null;
  const asksDifferent = /아닌|않은|않는/.test(question);
  const matches = options.map(option => {
    const fractions = [...String(option).matchAll(/(\d+)\s*\/\s*(\d+)/g)];
    if (fractions.length !== 2 || fractions.some(fraction => Number(fraction[2]) === 0)) return null;
    const equal = Number(fractions[0][1]) * Number(fractions[1][2]) === Number(fractions[1][1]) * Number(fractions[0][2]);
    return asksDifferent ? !equal : equal;
  });
  if (matches.some(match => match == null)) return null;
  return matches.filter(Boolean).length === 1 ? matches.indexOf(true) : -1;
};
