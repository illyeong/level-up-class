// Isolated in-memory test double. No Firebase SDK, credentials, or network calls.
export const db = {};
export const auth = { currentUser: { uid: 'teacher-demo' } };
export const rows = new Map();
export const reads = [];
export const writes = [];
const versions = new Map();
const listeners = new Set();
export const serverTimestamp = () => ({ seconds: Math.floor(Date.now() / 1000) });
const clone = value => value == null ? value : structuredClone(value);
export function seed(data = {}) {
  rows.clear(); versions.clear(); reads.length = 0; writes.length = 0;
  for (const [path, value] of Object.entries(data)) rows.set(path, clone(value));
}
export function snapshot(path) {
  const value = clone(rows.get(path));
  return { id: path.split('/').at(-1), data: () => value, exists: () => value !== undefined, metadata: { fromCache: false } };
}
export const doc = (_, ...parts) => ({ path: parts.join('/') });
export const collection = doc;
export const where = (field, op, value) => ({ field, op, value });
export const query = (ref, ...filters) => ({ ...ref, filters });
const matches = (row, filters = []) => filters.every(({ field, op, value }) => op === '==' ? row[field] === value
  : op === 'in' ? value.includes(row[field]) : op === '>=' ? row[field] >= value : true);
export async function getDoc(ref) { reads.push(ref.path); return snapshot(ref.path); }
export const getDocFromServer = getDoc;
export async function getDocs(ref) {
  reads.push(ref);
  const docs = [...rows.keys()].filter(path => path.startsWith(ref.path + '/')
    && path.split('/').length === ref.path.split('/').length + 1 && matches(rows.get(path), ref.filters)).map(snapshot);
  return { docs, size: docs.length, empty: !docs.length, forEach: fn => docs.forEach(fn) };
}
function commit(pending) {
  for (const [kind, ref, data] of pending) {
    if (kind === 'delete') rows.delete(ref.path);
    else rows.set(ref.path, clone(kind === 'update' ? { ...rows.get(ref.path), ...data } : data));
    versions.set(ref.path, (versions.get(ref.path) || 0) + 1);
    writes.push({ kind, path: ref.path, data: clone(data) });
  }
  for (const callback of listeners) queueMicrotask(callback);
}
export async function runTransaction(_, callback) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const readVersions = new Map();
    const pending = [];
    const value = await callback({
      get: async ref => { readVersions.set(ref.path, versions.get(ref.path) || 0); return getDoc(ref); },
      set: (ref, data) => pending.push(['set', ref, data]),
      update: (ref, data) => pending.push(['update', ref, data]),
      delete: ref => pending.push(['delete', ref]),
    });
    if ([...readVersions].some(([path, version]) => (versions.get(path) || 0) !== version)) continue;
    commit(pending); return value;
  }
  throw new Error('mock transaction conflict');
}
export async function setDoc(ref, data, options) { commit([[options?.merge ? 'update' : 'set', ref, data]]); }
export async function updateDoc(ref, data) { commit([['update', ref, data]]); }
export async function deleteDoc(ref) { commit([['delete', ref]]); }
export async function addDoc(ref, data) { const result = { path: `${ref.path}/fixture-${rows.size}`, id: `fixture-${rows.size}` }; await setDoc(result, data); return result; }
export function writeBatch() {
  const pending = [];
  return { update: (ref, data) => pending.push(['update', ref, data]), set: (ref, data) => pending.push(['set', ref, data]),
    delete: ref => pending.push(['delete', ref]), commit: async () => commit(pending) };
}
export function onSnapshot(ref, options, callback) {
  const cb = typeof options === 'function' ? options : callback;
  const notify = async () => cb(ref.path.split('/').length % 2 === 0 ? snapshot(ref.path) : await getDocs(ref));
  listeners.add(notify); queueMicrotask(notify);
  return () => listeners.delete(notify);
}
export const demoClass = { id: 'class-demo', teacherUid: 'teacher-demo', grade: 5 };
export const demoData = {
  'students/student-demo': { teacherUid: 'teacher-demo', classId: 'class-demo', studentCode: 'DEMO-5-01', name: '테스트 학생', grade: 5, gold: 0, diamonds: 0, level: 1, exp: 0 },
  'writingSubmissions/writing-demo': { teacherUid: 'teacher-demo', classId: 'class-demo', studentId: 'student-demo', studentName: '테스트 학생', studentCode: 'DEMO-5-01', topicId: 'topic-demo', topicTitle: '함께한 하루', title: '친구를 도운 날', content: '오늘 친구와 함께 교실을 정리했습니다. 서로 도우니 기분이 좋았습니다.', status: 'ai_graded', aiGrade: { score: 80 }, rewardsPaid: false, submittedAt: { seconds: 1788400000 }, rewards: { gold: 100, exp: 50, diamond: 50 } },
  'curriculumUnits/unit-demo5': { grade: 5, semester: 1, subject: '수학', status: 'approved', unitName: '자연수의 혼합 계산', publisher: '공통', lessons: [{ no: 1, title: '덧셈과 뺄셈' }, { no: 2, title: '곱셈과 나눗셈' }] },
  'curriculumUnits/unit-demo4': { grade: 4, semester: 1, subject: '수학', status: 'approved', unitName: '큰 수', publisher: '공통', lessons: [{ no: 1, title: '만 알아보기' }] },
};
