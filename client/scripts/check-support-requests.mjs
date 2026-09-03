import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import vm from 'node:vm';
import * as mock from './support-firestore-fixture.mjs';
import { allowedCoursewareGrades, filterCoursewareUnits, isCoursewareLessonAllowed, coursewareAccessKey } from '../src/utils/coursewareAccess.js';
import { currentQuestCompletion, questPeriodStart } from '../src/utils/questPeriod.js';
import { isInClassScope } from '../src/utils/classScopeFilter.js';
import { isTopicWritingRewardPending } from '../src/utils/topicWritingState.js';

const context = vm.createContext({ console, structuredClone });
const modules = new Map();
async function load(path) {
  if (modules.has(path)) return modules.get(path);
  const module = path === 'firebase/firestore' || path.endsWith('/firebase.js')
    ? new vm.SyntheticModule(Object.keys(mock), function () { for (const [key, value] of Object.entries(mock)) this.setExport(key, value); }, { context })
    : new vm.SourceTextModule(await readFile(path, 'utf8'), { context, identifier: path });
  modules.set(path, module);
  await module.link((specifier, parent) => load(specifier === 'firebase/firestore' ? specifier
    : resolve(dirname(parent.identifier), specifier.endsWith('.js') ? specifier : `${specifier}.js`).replaceAll('\\', '/')));
  return module;
}
const module = await load(resolve('src/utils/topicWritingRewards.js').replaceAll('\\', '/'));
await module.evaluate();
const { reviewTopicWritingSubmission, setTopicWritingSubmissionDeleted, payTopicWritingSubmission, approveTopicWritingSubmissions } = module.namespace;
const scope = { teacherUid: 'teacher-demo', classId: 'class-demo' };
const input = { id: 'writing-demo', ...scope };

mock.seed(mock.demoData);
await reviewTopicWritingSubmission({ ...input, teacherScore: 90, teacherComment: '잘 읽었어요.' });
assert.equal(mock.rows.get('writingSubmissions/writing-demo').rewardDecision, 'withheld');
assert.equal(mock.rows.get('students/student-demo').gold, 0);
assert.equal(isTopicWritingRewardPending(mock.rows.get('writingSubmissions/writing-demo')), false);
// Even an old, stale pending list must re-check the current decision.
await approveTopicWritingSubmissions({ ...scope, submissions: [{ id: 'writing-demo', ...mock.demoData['writingSubmissions/writing-demo'] }] });
assert.equal(mock.rows.get('students/student-demo').gold, 0);
assert.equal(mock.writes.filter(item => item.path.startsWith('writingRewardLogs/')).length, 0);
await setTopicWritingSubmissionDeleted({ ...input, deleted: true });
assert.equal(await payTopicWritingSubmission({ ...input, allowReviewed: true }), false);
await setTopicWritingSubmissionDeleted({ ...input, deleted: false });
assert.equal(mock.rows.get('writingSubmissions/writing-demo').status, 'reviewed');
assert.equal(await payTopicWritingSubmission({ ...input, allowReviewed: true }), true);
await reviewTopicWritingSubmission({ ...input, teacherScore: 80 });
assert.equal(mock.rows.get('writingSubmissions/writing-demo').status, 'rewarded');
await setTopicWritingSubmissionDeleted({ ...input, deleted: true });
assert.equal(mock.rows.get('students/student-demo').gold, 100);
assert.equal(mock.rows.has('writingRewardLogs/writing-demo'), true);

mock.seed(mock.demoData);
const results = await Promise.all([payTopicWritingSubmission(input), payTopicWritingSubmission(input)]);
assert.equal(results.filter(Boolean).length, 1);
assert.equal(mock.rows.get('students/student-demo').gold, 100);
assert.equal(mock.rows.get('students/student-demo').diamonds, 50);
assert.equal(await payTopicWritingSubmission({ ...input, teacherUid: 'other-teacher' }), false);
await assert.rejects(() => reviewTopicWritingSubmission({ ...input, classId: 'other-class' }));

assert.equal(isInClassScope({ ...scope }, scope), true);
assert.equal(isInClassScope({ ...scope, classId: 'other-class' }, scope), false);
assert.equal(isInClassScope({ teacherUid: scope.teacherUid }, scope), true);
assert.equal(isInClassScope({ ...scope }, {}), false);
const scoped = await load(resolve('src/utils/scopedFirestore.js').replaceAll('\\', '/'));
mock.seed({ ...mock.demoData, 'students/other': { teacherUid: 'other-teacher', classId: 'other-class' } });
assert.equal((await scoped.namespace.getClassScopedDocs(mock.db, 'students', scope)).size, 1);
assert.equal(mock.reads.at(-1).filters[0].field, 'teacherUid');
const readsBefore = mock.reads.length;
assert.equal((await scoped.namespace.getClassScopedDocs(mock.db, 'students', {})).size, 0);
assert.equal(mock.reads.length, readsBefore);

const units = Object.entries(mock.demoData).filter(([path]) => path.startsWith('curriculumUnits/')).map(([path, data]) => ({ id: path.split('/')[1], ...data }));
const [grade5, grade4] = units;
assert.deepEqual(allowedCoursewareGrades(null), [1,2,3,4,5,6]);
assert.equal(filterCoursewareUnits(units, { mode: 'grades', grades: [5] }).length, 1);
assert.equal(isCoursewareLessonAllowed({ mode: 'grades', grades: [5] }, grade4, grade4.lessons[0]), false);
const policy = { mode: 'lessons', lessons: [{ unitId: grade5.id, grade: 5, lessonNo: '2' }] };
assert.deepEqual(allowedCoursewareGrades(policy), [5]);
assert.equal(filterCoursewareUnits(units, policy)[0].lessons[0].no, 2);
assert.equal(isCoursewareLessonAllowed(policy, grade5, grade5.lessons[0]), false);
assert.equal(isCoursewareLessonAllowed({ mode: 'lessons', lessons: [] }, grade5, grade5.lessons[1]), false);
assert.equal(isCoursewareLessonAllowed({ mode: 'invalid' }, grade5, grade5.lessons[1]), false);
assert.equal(coursewareAccessKey(mock.demoClass), coursewareAccessKey(scope));
assert.equal(coursewareAccessKey({ teacherUid: 'teacher-demo' }), 'teacher_teacher-demo');

const daily = { type: 'daily', repeatDaily: true };
const weekly = { type: 'weekly', repeatWeekly: true };
const now = new Date('2026-09-03T00:00:00+09:00');
const old = { checked: true, rewarded: true, checkedAt: { seconds: Date.parse('2026-09-02T23:59:59+09:00') / 1000 } };
assert.equal(currentQuestCompletion(daily, old, now), null);
assert.equal(currentQuestCompletion({ type: 'daily' }, old, now), old);
assert.equal(questPeriodStart(weekly, now).toISOString(), '2026-08-30T15:00:00.000Z');
assert.equal(currentQuestCompletion(weekly, old, now), old);
assert.equal(currentQuestCompletion(daily, { ...old, checkedAt: { seconds: now.getTime() / 1000 } }, now)?.rewarded, true);
console.log('PASS: review without reward, recoverable deletion, stale bulk approval, concurrent payment, class isolation, content restrictions, KST daily/weekly reset. No production access.');
