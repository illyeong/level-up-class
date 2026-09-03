import { collection, getDocs, query, where } from 'firebase/firestore';
import { isInClassScope } from './classScopeFilter';

export async function getClassScopedDocs(db, name, scope = {}) {
  scope = scope || {};
  const classId = scope.classId || scope.id;
  if (!scope.teacherUid && !classId) return { docs: [], size: 0, empty: true };
  // Filter on the server first; keep teacher-owned legacy rows without classId.
  const snap = await getDocs(query(collection(db, name), scope.teacherUid
    ? where('teacherUid', '==', scope.teacherUid) : where('classId', '==', classId)));
  const docs = snap.docs.filter(item => isInClassScope(item.data(), scope));
  return { docs, size: docs.length, empty: docs.length === 0 };
}
