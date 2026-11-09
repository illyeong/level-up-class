import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(path, 'utf8');
const [login, studentDashboard, teacherDashboard, studentOperation, teacherOperation, aiCourseware] = await Promise.all([
  read('src/pages/LoginPage.jsx'),
  read('src/components/StudentDashboard.jsx'),
  read('src/pages/teacher/TeacherDashboard.jsx'),
  read('src/pages/student/ClassOperation.jsx'),
  read('src/pages/teacher/ClassOperationManage.jsx'),
  read('src/pages/student/AICourseware.jsx'),
]);

assert.match(login, /levelup_public_stats_v2/);
assert.match(login, /getPublicStatsRef/);
assert.match(login, /30 \* 60 \* 1000/);
assert.doesNotMatch(login, /getCountFromServer/);

assert.match(studentDashboard, /if \(!isOpen \|\| !studentId\) return/);
assert.match(studentDashboard, /worldBossRaids'[\s\S]{0,180}where\('classId'[\s\S]{0,180}limit\(100\)/);
assert.match(studentDashboard, /quizResults'[\s\S]{0,100}studentId'[\s\S]{0,100}limit\(100\)/);
assert.doesNotMatch(studentDashboard, /RewardLogModalWidget[\s\S]*worldBossRaids'\), where\('status'/);
assert.match(studentDashboard, /getDoc\(doc\(db, 'quests', q\.id, 'completions', studentId\)\)/);
assert.doesNotMatch(studentDashboard, /getDocs\(collection\(db, 'quests', q\.id, 'completions'\)\)/);

assert.match(teacherDashboard, /aiCourseProgress'[\s\S]{0,140}where\('courseSetId', 'in', ids\)[\s\S]{0,80}limit\(200\)/);
assert.doesNotMatch(teacherDashboard, /aiCourseProgress'\), where\('completedAt'/);
assert.match(teacherDashboard, /quizResults'[\s\S]{0,140}where\('studentId', 'in', ids\)[\s\S]{0,80}limit\(300\)/);
assert.doesNotMatch(teacherDashboard, /quizResults'\),[\s\S]{0,100}where\('completedAt'/);

assert.match(studentOperation, /classOperations'[\s\S]{0,120}where\('classId'[\s\S]{0,120}where\('status', '==', 'active'\)/);
assert.match(studentOperation, /dailyAttackSummary/);
assert.match(studentOperation, /orderBy\('attackedAt', 'desc'\),\s*limit\(300\)/);
assert.doesNotMatch(studentOperation, /onSnapshot\(\s*(?:showAllAttacks\s*\?|query\()?collection\(db, 'classOperations', operation\.id, 'attacks'/);
assert.doesNotMatch(studentOperation, /getDocs\(collection\(db, 'equipmentItems'\)\)/);
assert.match(studentOperation, /where\(documentId\(\), 'in', ids\)/);
assert.match(teacherOperation, /attacks'\), where\('dateKey', '==', dateKey\)/);
assert.doesNotMatch(teacherOperation, /onSnapshot\(\s*collection\(db, 'classOperations', activeOperation\.id, 'attacks'\)/);
assert.doesNotMatch(teacherOperation, /getDocs\(collection\(db, 'equipmentItems'\)\)/);
assert.match(teacherOperation, /where\(documentId\(\), 'in', ids\)/);

assert.match(aiCourseware, /aiLessonMastery'\), where\('studentCode', '==', studentCode\)/);
assert.doesNotMatch(aiCourseware, /lessons\.map\([\s\S]{0,200}getDoc\(doc\(db, 'aiLessonMastery'/);

const [studentBoard, teacherBoard] = await Promise.all([
  read('src/pages/student/LearningBoard.jsx'),
  read('src/pages/teacher/BoardManage.jsx'),
]);
for (const boardSource of [studentBoard, teacherBoard]) {
  assert.match(boardSource, /orderBy\('createdAt', 'desc'\),\s*limit\(1\)/);
  assert.match(boardSource, /const unsubscribe = onSnapshot\(latestPostQuery/);
  assert.doesNotMatch(boardSource, /}, 60000\)/);
}
assert.match(studentBoard, /where\('classId', '==', d\.classId\)/);
assert.match(studentBoard, /boardsList\.length === 0 && !d\.classId && !d\.teacherUid/);

console.log('Firestore 읽기 예산 회귀검사 통과: 첫 화면 캐시, 학생별 퀘스트 조회, AI 숙달도 일괄 재사용, 게시판 변경 시 최신글 1건 감지, 지연 로딩, 학급 범위, 대작전 요약 문서·필요 장비만 조회, 조회 상한');
