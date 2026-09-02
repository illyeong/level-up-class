// Default: build a local dry-run plan. Production writes require BOTH --apply
// and a reviewed approvals.json whose hashes match the exact proposed edits.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, doc, collection, query, where, documentId, getDocs, runTransaction, serverTimestamp } from 'firebase/firestore';
import { normalizeCoursewareChoices } from '../src/utils/coursewareOptions.js';
import { validateDeterministicMathQuestion } from '../src/utils/validateCoursewareMathQuestion.js';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const output = resolve('courseware-audit.local/2026-09-02');
const json = async name => JSON.parse(await readFile(resolve(output, name), 'utf8'));
const backup = await json('aiLessonContent.backup.json');
const audit = await json('audit.json');
if (!backup.complete) throw new Error('Incomplete backup');
const source = new Map(audit.records.map(record => [record.id, record]));
const gradeArg = process.argv.find(arg => arg.startsWith('--grade='));
const grades = gradeArg ? [Number(gradeArg.split('=')[1])] : [4, 5, 6];
if (grades.some(grade => ![4, 5, 6].includes(grade))) throw new Error('Only grades 4–6 are in scope');
const apply = process.argv.includes('--apply');
const proposals = (await Promise.all(grades.map(grade => json(`grade${grade}-corrections.json`)))).flat();
const approvals = apply ? new Map((await json('approvals.json')).map(item => [item.id, item])) : new Map();
const allowedFields = new Set(['question', 'options', 'answerIndex', 'explanation', 'shape', 'table']);
const seen = new Set();
const plan = proposals.map(proposal => {
  const record = source.get(proposal.id);
  if (!record || !grades.includes(record.grade)) throw new Error(`Out-of-scope question ${proposal.id}`);
  if (seen.has(proposal.id)) throw new Error(`Duplicate proposal ${proposal.id}`);
  seen.add(proposal.id);
  if (proposal.beforeHash !== record.beforeHash || hash(record.question) !== record.beforeHash) throw new Error(`Backup hash mismatch ${proposal.id}`);
  if (!proposal.reason || !proposal.verification) throw new Error(`Missing review evidence ${proposal.id}`);
  if (!proposal.patch || Object.keys(proposal.patch).some(key => !allowedFields.has(key))) throw new Error(`Unsupported field ${proposal.id}`);
  const after = { ...record.question, ...proposal.patch };
  if (hash(after) === record.beforeHash) throw new Error(`Empty change ${proposal.id}`);
  if (!normalizeCoursewareChoices(after)) throw new Error(`Invalid choices in corrected question ${proposal.id}`);
  if (typeof after.question !== 'string' || !after.question.trim() || typeof after.explanation !== 'string' || !after.explanation.trim()) throw new Error(`Missing question/explanation ${proposal.id}`);
  const deterministic = validateDeterministicMathQuestion(normalizeCoursewareChoices(after));
  const validatorConflict = deterministic.applicable && (!deterministic.valid || deterministic.answerIndex !== after.answerIndex);
  const changeHash = hash({ id: proposal.id, beforeHash: proposal.beforeHash, patch: proposal.patch });
  if (apply) {
    const approved = approvals.get(proposal.id);
    if (approved?.changeHash !== changeHash) throw new Error(`Edit not approved or changed after approval: ${proposal.id}`);
    if (validatorConflict && !approved.validatorOverride) throw new Error(`Validator conflict needs explicit reviewer rationale: ${proposal.id}`);
  }
  return { ...proposal, grade: record.grade, lessonId: record.lessonId, questionIndex: record.questionIndex,
    before: record.question, after, afterHash: hash(after), changeHash, validatorConflict, deterministic };
});
await writeFile(resolve(output, `plan-${grades.join('-')}.json`), JSON.stringify(plan, null, 2));
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', corrections: plan.length, lessons: new Set(plan.map(item => item.lessonId)).size, validatorConflicts: plan.filter(item => item.validatorConflict).map(item => item.id) }));
if (!apply) process.exit(0);

const runId = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = resolve(output, `apply-${runId}`);
await mkdir(runDir, { recursive: true });
const app = initializeApp({ projectId: 'level-up-class', apiKey: 'AIzaSyCpOf86UP1nA2-MzvMxjglomdMG8y6xS9I', appId: '1:1095450799104:web:650aea6a8afd352d257ce5' });
const db = getFirestore(app);
const groups = Map.groupBy(plan, item => item.lessonId);
const outcomes = [];
try {
  for (const [lessonId, changes] of groups) {
    try {
      const result = await runTransaction(db, async transaction => {
        const ref = doc(db, 'aiLessonContent', lessonId);
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) throw new Error(`Lesson disappeared: ${lessonId}`);
        const current = snapshot.data();
        if (!grades.includes(Number(current.grade))) throw new Error(`Live grade no longer in scope: ${lessonId}`);
        const questions = [...current.questions];
        let applied = 0;
        for (const change of changes) {
          const liveHash = hash(questions[change.questionIndex]);
          if (liveHash === change.afterHash) continue; // Idempotent resume.
          if (liveHash !== change.beforeHash) throw new Error(`Concurrent question edit; do not overwrite ${change.id}`);
          questions[change.questionIndex] = change.after;
          applied += 1;
        }
        if (!applied) return { applied: 0, alreadyApplied: true };
        await writeFile(resolve(runDir, `${hash(lessonId)}.before.json`), JSON.stringify({ lessonId, data: current }, null, 2), { flag: 'wx' });
        transaction.update(ref, { questions, updatedAt: serverTimestamp() });
        return { applied };
      }, { maxAttempts: 1 });
      const verifiedSnapshot = await getDocs(query(collection(db, 'aiLessonContent'), where(documentId(), '==', lessonId)));
      const currentQuestions = verifiedSnapshot.docs[0]?.data().questions;
      if (!currentQuestions || changes.some(change => hash(currentQuestions[change.questionIndex]) !== change.afterHash)) throw new Error(`Post-write verification failed: ${lessonId}`);
      outcomes.push({ lessonId, status: 'verified', ...result, ids: changes.map(change => change.id) });
      console.log(JSON.stringify(outcomes.at(-1)));
    } catch (error) {
      outcomes.push({ lessonId, status: 'failed', code: error.code, error: error.message });
      console.error(JSON.stringify(outcomes.at(-1)));
      process.exitCode = 1;
      break; // Never hammer an exhausted server or continue past a conflict.
    } finally {
      await writeFile(resolve(runDir, 'outcomes.json'), JSON.stringify(outcomes, null, 2));
    }
  }
} finally {
  await deleteApp(app);
}
