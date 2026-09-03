// A single read-only transaction: tests the access needed for guarded updates.
// Never updates a Firestore document and never retries an exhausted service.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, doc, runTransaction } from 'firebase/firestore';

const base = resolve('courseware-audit.local/2026-09-02');
const { records } = JSON.parse(await readFile(resolve(base, 'audit.json'), 'utf8'));
const record = records.find(item => [4,5,6].includes(item.grade));
if (!record) throw new Error('No backed-up question in scope');
const app = initializeApp({ projectId: 'level-up-class', apiKey: 'AIzaSyCpOf86UP1nA2-MzvMxjglomdMG8y6xS9I', appId: '1:1095450799104:web:650aea6a8afd352d257ce5' });
const result = { checkedAt: new Date().toISOString(), readOnly: true, writes: 0, maxAttempts: 1, lessonId: record.lessonId };
try {
  const db = getFirestore(app);
  const data = await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(doc(db, 'aiLessonContent', record.lessonId));
    return { exists: snapshot.exists(), grade: snapshot.data()?.grade };
  }, { maxAttempts: 1 });
  Object.assign(result, { status: data.exists ? 'readable' : 'missing', ...data });
} catch (error) {
  Object.assign(result, { status: 'blocked', code: error.code, error: error.message });
  process.exitCode = 1;
} finally {
  await deleteApp(app);
  await writeFile(resolve(base, 'db-access-check.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
