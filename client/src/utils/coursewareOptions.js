import { normalizeCoursewareNumericTypography } from './coursewareArithmetic.js';

// Normalize exactly what students see, before comparing choices or grading.
export const normalizeCoursewareOption = (value) => {
  if (typeof value !== 'string') return '';
  return normalizeCoursewareNumericTypography(value.replace(/^\s*[①②③④❶❷❸❹]\s*/u, ''))
    .replace(/^\s*[1-4][.)]\s+/u, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
};

export const normalizeCoursewareChoices = (question) => {
  // Never drop/reorder empty choices or truncate extra choices: that would
  // silently change which option answerIndex points to.
  if (!Array.isArray(question?.options) || question.options.length !== 4) return null;
  const options = question.options.map(normalizeCoursewareOption);
  if (options.some(option => !option)) return null;
  // A space between digits can delimit a mixed number: 1 1/2 ≠ 11/2.
  const keys = options.map(option => option.replace(/([A-Za-z])([²³])/g, (_, unit, power) => unit + power.normalize('NFKC'))
    .replace(/(\d)\s+(?=\d)/g, '$1\u001f').replace(/\s+/g, '').toLowerCase());
  if (new Set(keys).size !== 4) return null;
  const rawIndex = question.answerIndex;
  if (typeof rawIndex !== 'number' && !(typeof rawIndex === 'string' && /^[0-3]$/.test(rawIndex))) return null;
  const answerIndex = Number(rawIndex);
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) return null;
  return { ...question, options, answerIndex };
};
