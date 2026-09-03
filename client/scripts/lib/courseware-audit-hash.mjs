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
