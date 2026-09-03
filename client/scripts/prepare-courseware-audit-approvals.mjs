// Creates a LOCAL reviewer manifest only. It cannot connect to Firestore.
// Run after the final content review, dry-run, postcheck, and API audit.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { normalizeCoursewareChoices } from '../src/utils/coursewareOptions.js';
import { validateDeterministicMathQuestion } from '../src/utils/validateCoursewareMathQuestion.js';
import { hasMissingRequiredVisual, inferFractionBarShape } from '../src/utils/inferFractionBarShape.js';
import { auditChangeHash } from './lib/courseware-audit-hash.mjs';

const base = resolve('courseware-audit.local/2026-09-02');
const read = name => readFile(resolve(base, name), 'utf8');
const json = async name => JSON.parse(await read(name));
const sha = text => createHash('sha256').update(text).digest('hex');
const planText = await read('plan-4-5-6.json');
const plan = JSON.parse(planText);
const summary = await json('summary.json');
const api = await json('api-safe-normalization-verification.json');
const grade5 = await json('grade5-review-report.json');
const auditText = await read('audit.json');
const { records } = JSON.parse(auditText);
const sources = new Map(records.map(record => [record.id, record]));
if (!summary.contentReviewComplete || summary.reviewedQuestions !== records.length) throw new Error('Content review is incomplete');
if (summary.planHash !== sha(JSON.stringify(plan))) throw new Error('Summary is stale');
if (!grade5.finalQaComplete || grade5.finalQaProposalHash !== sha(await read('grade5-corrections.json'))) throw new Error('Grade 5 final QA is incomplete or stale');
if (api.status !== 'pass' || api.corpus?.inputHashes?.plan !== sha(planText) || api.corpus?.inputHashes?.audit !== sha(auditText)) throw new Error('API audit is incomplete or stale');
const proposals = (await Promise.all(['grade4-corrections.json','grade4-root-corrections.json','grade5-corrections.json','grade6-corrections.json'].map(json))).flat();
const planned = new Map(plan.map(item => [item.id, item]));
if (planned.size !== plan.length || proposals.length !== plan.length) throw new Error('Plan has duplicate IDs or a stale count');
for (const proposal of proposals) {
  const target = sources.get(proposal.id);
  if (!target) throw new Error(`Unknown audit target: ${proposal.id}`);
  const changeHash = auditChangeHash(proposal, target);
  if (planned.get(proposal.id)?.changeHash !== changeHash) throw new Error(`Stale proposal: ${proposal.id}`);
}
for (const record of records) {
  const question = planned.get(record.id)?.after ?? record.question;
  const normalized = normalizeCoursewareChoices(question);
  if (!normalized) throw new Error(`Invalid choices: ${record.id}`);
  const validation = validateDeterministicMathQuestion(normalized);
  if (validation.applicable && (!validation.valid || validation.answerIndex !== question.answerIndex)) throw new Error(`Answer conflict: ${record.id}`);
  if (hasMissingRequiredVisual(question.question, inferFractionBarShape(question.question, question.shape))) throw new Error(`Missing visual: ${record.id}`);
}
if (plan.some(item => item.validatorConflict)) throw new Error('Unresolved validator conflict');
const reviewedAt = new Date().toISOString();
const approvals = plan.map(({id, changeHash}) => ({id, changeHash, reviewedBy:'codex-audit', reviewedAt}));
await writeFile(resolve(base, 'approvals.json'), JSON.stringify(approvals, null, 2), {flag:'wx'});
console.log(JSON.stringify({localOnly:true, productionWrites:0, approvals:approvals.length, planHash:summary.planHash}));
