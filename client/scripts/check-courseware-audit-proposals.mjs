// Read-only post-patch diagnostics, including untouched items. Candidates need
// human review; this script never changes a question or writes to Firestore.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { normalizeCoursewareChoices } from '../src/utils/coursewareOptions.js';
import { validateDeterministicMathQuestion } from '../src/utils/validateCoursewareMathQuestion.js';
import { inferFractionBarShape, hasMissingRequiredVisual } from '../src/utils/inferFractionBarShape.js';
import { evaluateCoursewareExpression } from '../src/utils/coursewareArithmetic.js';

const base = resolve('courseware-audit.local/2026-09-02');
const json = async name => JSON.parse(await readFile(resolve(base, name), 'utf8'));
const { records } = await json('audit.json');
const groups = await Promise.all(['grade4-corrections.json','grade4-root-corrections.json','grade5-corrections.json','grade6-corrections.json'].map(json));
const proposed = new Map();
for (const item of groups.flat()) {
  if (proposed.has(item.id)) throw new Error(`Overlapping author proposals: ${item.id}`);
  proposed.set(item.id, item);
}
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const diagnostics = [];
for (const record of records) {
  const proposal = proposed.get(record.id);
  if (proposal && proposal.beforeHash !== hash(record.question)) throw new Error(`Hash mismatch ${record.id}`);
  const question = { ...record.question, ...proposal?.patch };
  const issues = [];
  if (proposal && hash(question) === proposal.beforeHash) issues.push('empty-patch');
  const normalized = normalizeCoursewareChoices(question);
  if (!normalized) issues.push('choice-structure');
  const deterministic = normalized && validateDeterministicMathQuestion(normalized);
  if (deterministic?.applicable && (!deterministic.valid || deterministic.answerIndex !== question.answerIndex)) issues.push('deterministic-conflict');
  if (hasMissingRequiredVisual(question.question, inferFractionBarShape(question.question, question.shape))) issues.push('runtime-missing-visual');
  const values = question.options?.map(evaluateCoursewareExpression) || [];
  const equivalentPairs = values.flatMap((v, i) => v == null ? [] : values.flatMap((w, j) => j > i && w != null && Math.abs(v - w) < 1e-10 ? [[i,j]] : []));
  if (equivalentPairs.length) issues.push('equivalent-value-candidate');
  if (/아니,|잠깐|문제[를가] 수정|모두 맞으므로|정답 재확인|다시 검토하면/.test(question.explanation || '')) issues.push('unfinished-explanation');
  if (issues.length) diagnostics.push({ id: record.id, grade: record.grade, corrected: !!proposal, issues, deterministic, equivalentPairs, question });
}
for (const grade of [4,5,6]) await writeFile(resolve(base, `grade${grade}-postcheck.json`), JSON.stringify(diagnostics.filter(x => x.grade === grade), null, 2));
console.log(JSON.stringify({ checked: records.length, proposed: proposed.size, byGrade: [4,5,6].map(grade => ({ grade, candidates: diagnostics.filter(d => d.grade === grade).length, blockingCandidates: diagnostics.filter(d => d.grade === grade && d.issues.some(i => i !== 'equivalent-value-candidate')).map(({ id, issues }) => ({ id, issues })) })) }, null, 2));
