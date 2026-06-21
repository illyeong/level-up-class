export function inferFractionBarShape(question, existingShape = null) {
  if (existingShape || !String(question || '').includes('색칠')) return existingShape;

  const text = String(question);
  const pairs = [];
  const patterns = [
    /(\d+)\s*(?:개|칸|조각)(?:의)?(?:로|으로)?\s*(?:똑같이\s*)?(?:나누(?:어|고|었고|었습니다)|등분(?:하여|하고)?)\s*(\d+)\s*(?:개|칸|조각)(?:를|을)?\s*색칠/g,
    /(\d+)\s*(?:개|칸|조각)(?:의)?\s*(?:똑같은\s*)?부분(?:으로)?\s*나누(?:어|고|었습니다)\s*(\d+)\s*(?:개|칸|조각)(?:를|을)?\s*색칠/g,
    /전체\s*(\d+)\s*(?:개|칸|조각)\s*중\s*(\d+)\s*(?:개|칸|조각)(?:를|을)?\s*색칠/g,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const total = Number(match[1]);
      const filled = Number(match[2]);
      if (Number.isInteger(total) && total >= 2 && total <= 20 && Number.isInteger(filled) && filled >= 0 && filled <= total) {
        pairs.push({ total, filled, index: match.index ?? 0 });
      }
    }
  }

  const uniquePairs = [...new Map(
    pairs.sort((a, b) => a.index - b.index).map(({ total, filled, index }) => [`${index}:${total}:${filled}`, { total, filled }]),
  ).values()];
  if (!uniquePairs.length) return null;

  return {
    type: 'fraction_bar',
    dimensions: {
      ...uniquePairs[0],
      compare: uniquePairs[1],
      showLabel: false,
    },
  };
}

export function hasMissingRequiredVisual(question, shape = null) {
  if (shape) return false;
  const text = String(question || '').trim();
  return /^(?:위|아래)\s*(?:그림|그림그래프|그래프)/.test(text)
    || /(?:나타내는|가리키는)\s*시계를\s*고르/.test(text);
}

export function getRenderableQuestionShape(question, unit = null) {
  const shape = inferFractionBarShape(question?.question, question?.shape);
  if (!shape) return null;

  const lessonContext = [
    unit?.unitName,
    unit?.subject,
    ...(Array.isArray(unit?.lessons) ? unit.lessons.flatMap(lesson => [lesson.title, ...(lesson.keywords || [])]) : []),
  ].filter(Boolean).join(' ');
  if (shape.type === 'fraction_bar' && !/분수|분모|분자|진분수|가분수|대분수|약분|통분|비율/.test(lessonContext)) return null;
  if (shape.type === 'factor_list' && !/약수|배수|약분|통분|공약수|공배수/.test(lessonContext)) return null;
  return shape;
}
