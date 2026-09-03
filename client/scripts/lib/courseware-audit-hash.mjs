import { createHash } from 'node:crypto';

// Firestore may return map keys in a different order after a write. Compare
// question contents, not incidental JSON object insertion order. Array order
// remains significant (especially options and diagram vertices).
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
};

export const questionContentHash = value => createHash('sha256')
  .update(JSON.stringify(canonical(value))).digest('hex');

// Approval covers both the exact edit and its exact Firestore destination.
// Repeated questions in different lessons must not share approval authority.
export const auditChangeHash = (proposal, target) => createHash('sha256').update(JSON.stringify({
  id: proposal.id, grade: target.grade, lessonId: target.lessonId, questionIndex: target.questionIndex,
  beforeHash: proposal.beforeHash, patch: proposal.patch,
})).digest('hex');
