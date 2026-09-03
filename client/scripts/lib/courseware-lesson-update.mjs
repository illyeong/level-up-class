import { questionContentHash } from './courseware-audit-hash.mjs';

// Firestore accepts arrays inside maps, but rejects a direct array-of-arrays.
// The renderer supports both legacy row arrays and the Firestore-safe { cells }
// representation, so convert only the storage shape without changing content.
export function serializeCoursewareQuestionForFirestore(question) {
  const rows = question?.table?.rows;
  if (!Array.isArray(rows) || !rows.some(Array.isArray)) return question;
  return {
    ...question,
    table: {
      ...question.table,
      rows: rows.map(row => Array.isArray(row) ? { cells: [...row] } : row),
    },
  };
}

// Pure preflight for a transaction. Never mutates the live snapshot or replaces
// unrelated questions, and refuses partial matching after a concurrent edit.
export function prepareCoursewareLessonUpdate(current, changes) {
  if (!Array.isArray(current?.questions)) throw new Error('Live questions are missing');
  if (changes.some(change => Number(current.grade) !== change.grade)) throw new Error('Live grade changed');
  const questions = [...current.questions];
  const seen = new Set();
  let applied = 0;
  for (const change of changes) {
    const index = change.questionIndex;
    if (!Number.isInteger(index) || index < 0 || index >= questions.length || seen.has(index)) throw new Error(`Invalid question position: ${change.id}`);
    seen.add(index);
    const liveHash = questionContentHash(questions[index]);
    if (liveHash === questionContentHash(change.after)) continue;
    if (liveHash !== questionContentHash(change.before)) throw new Error(`Concurrent question edit; do not overwrite ${change.id}`);
    questions[index] = change.after;
    applied++;
  }
  return { questions, applied };
}
