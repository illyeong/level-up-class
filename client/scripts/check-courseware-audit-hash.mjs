import assert from 'node:assert/strict';
import { questionContentHash, auditChangeHash } from './lib/courseware-audit-hash.mjs';
import { prepareCoursewareLessonUpdate } from './lib/courseware-lesson-update.mjs';

const question = { question: '두 점을 고르세요.', options: ['A','B','C','D'], answerIndex: 1,
  shape: { type: 'polygon', dimensions: { sides: 3, vertices: [{x:1,y:2},{x:3,y:4},{x:5,y:6}] } } };
const reordered = { shape: { dimensions: { vertices: [{y:2,x:1},{y:4,x:3},{y:6,x:5}], sides: 3 }, type: 'polygon' },
  answerIndex: 1, options: ['A','B','C','D'], question: '두 점을 고르세요.' };
assert.equal(questionContentHash(question), questionContentHash(reordered));
assert.notEqual(questionContentHash(question), questionContentHash({...question, answerIndex:0}));
assert.notEqual(questionContentHash(question), questionContentHash({...question, options:['B','A','C','D']}));
assert.notEqual(questionContentHash(question), questionContentHash({...question, explanation:'추가 해설'}));
assert.equal(questionContentHash({...question, unused:undefined}), questionContentHash(question));
console.log('문항 반영 해시: 객체 키 순서 무관, 보기 순서/정답/본문 변경 감지 통과');
const after = { ...question, answerIndex:2 };
const untouched = { question:'다른 문제', options:['A','B','C','D'], answerIndex:0 };
const current = { grade:5, questions:[question,untouched], title:'보존할 제목' };
const change = { id:'test', grade:5, questionIndex:0, before:question, after };
const result = prepareCoursewareLessonUpdate(current, [change]);
assert.equal(result.applied, 1);
assert.deepEqual(result.questions, [after,untouched]);
assert.equal(current.questions[0].answerIndex, 1);
assert.equal(prepareCoursewareLessonUpdate({...current, questions:result.questions}, [change]).applied, 0);
assert.throws(() => prepareCoursewareLessonUpdate({...current, grade:4}, [change]), /grade changed/);
assert.throws(() => prepareCoursewareLessonUpdate({...current, questions:[{...question, explanation:'다른 교사의 수정'},untouched]}, [change]), /Concurrent/);
assert.throws(() => prepareCoursewareLessonUpdate(current, [change,change]), /position/);
assert.throws(() => prepareCoursewareLessonUpdate(current, [{...change,questionIndex:2}]), /position/);
assert.deepEqual(current.questions, [question,untouched]);
console.log('문항 반영 사전검사: 동시 수정 차단·재실행 건너뛰기·무관 문항 보존 통과');
const proposal = { id:'G5-L001-Q01', beforeHash:questionContentHash(question), patch:{answerIndex:2} };
const target = { grade:5, lessonId:'first-lesson', questionIndex:0 };
const approvedHash = auditChangeHash(proposal, target);
for (const modified of [{...target,grade:4},{...target,lessonId:'other-lesson'},{...target,questionIndex:1}]) {
  assert.notEqual(approvedHash, auditChangeHash(proposal, modified));
}
assert.notEqual(approvedHash, auditChangeHash({...proposal,patch:{answerIndex:3}}, target));
console.log('승인 해시: 동일 원문이 있어도 학년·차시·문항 위치 변경 감지 통과');
