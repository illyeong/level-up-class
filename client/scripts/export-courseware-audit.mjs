import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, documentId, limit, startAfter } from 'firebase/firestore';

const output = resolve('courseware-audit.local/2026-09-02');
await mkdir(output, { recursive: true });
const app = initializeApp({ projectId: 'level-up-class', apiKey: 'AIzaSyCpOf86UP1nA2-MzvMxjglomdMG8y6xS9I', appId: '1:1095450799104:web:650aea6a8afd352d257ce5' });
const db = getFirestore(app);
const exportedAt = new Date().toISOString();
const lessons = [];
const units = [];
let scanned = 0;
try {
  for (const [collectionName, rows] of [['aiLessonContent', lessons], ['curriculumUnits', units]]) {
    let last = null;
    while (true) {
      const constraints = [orderBy(documentId()), limit(100)];
      if (last) constraints.push(startAfter(last));
      const page = await getDocs(query(collection(db, collectionName), ...constraints));
      for (const item of page.docs) {
        const data = item.data();
        const grade = Number(data.grade) || Number(item.id.match(/^v\d+_([1-6])_/)?.[1]);
        if ([4, 5, 6].includes(grade)) rows.push({ id: item.id, grade, data });
      }
      scanned += page.size;
      await writeFile(resolve(output, `${collectionName}.backup.json`), JSON.stringify({ exportedAt, complete: page.size < 100, rows }, null, 2), { encoding: 'utf8' });
      console.log(JSON.stringify({ collection: collectionName, scanned, targetDocuments: rows.length }));
      if (page.size < 100) break;
      last = page.docs.at(-1);
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  const summary = [4, 5, 6].map(grade => {
    const rows = lessons.filter(item => item.grade === grade);
    return { grade, lessons: rows.length, questions: rows.reduce((sum, item) => sum + (item.data.questions?.length || 0), 0) };
  });
  await writeFile(resolve(output, 'inventory.json'), JSON.stringify({ exportedAt, summary }, null, 2));
  console.log(JSON.stringify({ output, summary }));
} finally {
  await deleteApp(app);
}
