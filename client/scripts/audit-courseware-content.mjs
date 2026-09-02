import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { normalizeCoursewareChoices } from '../src/utils/coursewareOptions.js';
import { validateDeterministicMathQuestion } from '../src/utils/validateCoursewareMathQuestion.js';
import { evaluateCoursewareExpression } from '../src/utils/coursewareArithmetic.js';
import { inspectCoursewareQuestion } from '../api/generate-courseware.js';

const output = resolve('courseware-audit.local/2026-09-02');
const backup = JSON.parse(await readFile(resolve(output, 'aiLessonContent.backup.json'), 'utf8'));
if (!backup.complete) throw new Error('Backup is incomplete. Do not audit or apply partial inventory as a full audit.');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const records = [];
const equationConflicts = text => {
  const issues = [];
  // Review candidates only: these can include intermediate work or examples
  // of a deliberately incorrect solution, so NEVER fix them automatically.
  const pieces = String(text || '').match(/[\d(][\d.,\s()+\-−×*÷/과와]*\s*=\s*-?\d+(?:\.\d+)?(?:\s*\/\s*\d+)?/g) || [];
  for (const piece of pieces) {
    const [left, right] = piece.trim().split('=');
    const actual = evaluateCoursewareExpression(left);
    const stated = evaluateCoursewareExpression(right);
    if (actual != null && stated != null && Math.abs(actual - stated) > 1e-7) issues.push({ equation: piece.trim(), actual, stated });
  }
  return issues;
};
for (const [lessonIndex, row] of backup.rows.entries()) {
  const seen = new Map();
  for (const [index, raw] of (row.data.questions || []).entries()) {
    const id = `G${row.grade}-L${String(lessonIndex + 1).padStart(3, '0')}-Q${String(index + 1).padStart(2, '0')}`;
    const flags = [];
    const normalized = normalizeCoursewareChoices(raw);
    if (!normalized) flags.push('choice-structure');
    const deterministic = normalized && validateDeterministicMathQuestion(normalized);
    if (deterministic?.applicable && !deterministic.valid) flags.push('no-unique-answer');
    if (deterministic?.applicable && deterministic.valid && deterministic.answerIndex !== normalized.answerIndex) flags.push('answer-index');
    let serverInspection;
    try {
      serverInspection = inspectCoursewareQuestion(normalized || raw, row.data);
      if (!serverInspection.normalized) flags.push('generator-rejected');
      if (!serverInspection.shapeConsistent) flags.push('shape-conflict');
      if (serverInspection.normalized && normalized && serverInspection.normalized.answerIndex !== normalized.answerIndex) flags.push('generator-answer-index');
    } catch (error) {
      flags.push('validator-exception');
      serverInspection = { error: error.message };
    }
    const fingerprint = hash([raw.question, [...(normalized?.options || raw.options || [])].sort()]);
    if (seen.has(fingerprint)) flags.push('duplicate-question');
    else seen.set(fingerprint, id);
    const equations = equationConflicts(raw.explanation);
    if (equations.length) flags.push('explanation-equation');
    records.push({
      id, lessonId: row.id, grade: row.grade, questionIndex: index,
      unitName: row.data.unitName, lessonTitle: row.data.lessonTitle,
      beforeHash: hash(raw), questionsHash: hash(row.data.questions),
      flags: [...new Set(flags)], deterministic,
      suggestedAnswerIndex: serverInspection?.normalized?.answerIndex,
      equations, question: raw,
    });
  }
}
const summary = [4, 5, 6].map(grade => {
  const rows = records.filter(row => row.grade === grade);
  return { grade, questions: rows.length, flagged: rows.filter(row => row.flags.length).length,
    deterministic: rows.filter(row => row.deterministic?.applicable).length,
    byFlag: rows.flatMap(row => row.flags).reduce((counts, flag) => ({ ...counts, [flag]: (counts[flag] || 0) + 1 }), {}) };
});
await writeFile(resolve(output, 'audit.json'), JSON.stringify({ exportedAt: backup.exportedAt, summary, records }, null, 2));
for (const grade of [4, 5, 6]) {
  const rows = records.filter(row => row.grade === grade);
  await writeFile(resolve(output, `grade-${grade}-review.jsonl`), rows.map(row => JSON.stringify({ id: row.id, context: `${row.unitName} / ${row.lessonTitle}`, flags: row.flags, ...row.question })).join('\n'));
}
console.log(JSON.stringify({ summary, total: records.length }, null, 2));
