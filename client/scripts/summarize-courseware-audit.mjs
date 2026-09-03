import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const base = resolve('courseware-audit.local/2026-09-02');
const json = async file => JSON.parse(await readFile(resolve(base, file), 'utf8'));
const audit = await json('audit.json');
const plan = await json('plan-4-5-6.json');
const reports = await Promise.all([4,5,6].map(g => json(`grade${g}-review-report.json`)));
const root = await json('grade4-root-review-report.json');
const corrections = new Map(plan.map(item => [item.id, item]));
if (corrections.size !== plan.length) throw new Error('Duplicate correction IDs');
const proposals = (await Promise.all(['grade4-corrections.json','grade4-root-corrections.json','grade5-corrections.json','grade6-corrections.json'].map(json))).flat();
if (proposals.length !== plan.length || proposals.some(proposal => {
  const expected = createHash('sha256').update(JSON.stringify({id:proposal.id,beforeHash:proposal.beforeHash,patch:proposal.patch})).digest('hex');
  return corrections.get(proposal.id)?.changeHash !== expected;
})) throw new Error('Stale plan: run apply-courseware-audit.mjs dry-run successfully before summarizing');
const states = new Map();
for (const report of reports) for (const entry of (report.reviewed || report.coverage || report.reviews || [])) {
  states.set(entry.id, ['pass','corrected'].includes(entry.status) && entry.reviewComplete !== false ? 'reviewed' : entry.status);
}
const questions = audit.records.map(record => {
  const rootReviewed = record.grade === 4 && root.reviewedLessons.includes(Number(record.id.match(/L(\d+)/)[1]));
  return { id: record.id, lessonId: record.lessonId, questionIndex: record.questionIndex, grade: record.grade,
    reviewed: rootReviewed || states.get(record.id) === 'reviewed', corrected: corrections.has(record.id),
    question: corrections.get(record.id)?.after || record.question };
});
const summary = [4,5,6].map(grade => {
  const subset = questions.filter(q => q.grade === grade);
  return { grade, lessons: new Set(subset.map(q => q.lessonId)).size, total: subset.length,
    reviewed: subset.filter(q => q.reviewed).length, corrections: subset.filter(q => q.corrected).length,
    remainingIds: subset.filter(q => !q.reviewed).map(q => q.id) };
});
const result = { generatedAt: new Date().toISOString(), sourceExportedAt: audit.exportedAt,
  contentReviewComplete: questions.every(q => q.reviewed), productionApplied: false,
  productionBlocker: 'Firestore RESOURCE_EXHAUSTED confirmed by read-only transaction on 2026-09-03; no writes performed.',
  totalQuestions: questions.length, reviewedQuestions: questions.filter(q => q.reviewed).length,
  totalLessons: new Set(questions.map(q => q.lessonId)).size,
  planHash: createHash('sha256').update(JSON.stringify(plan)).digest('hex'),
  scopeWarnings: reports.flatMap(report => report.scopeWarnings || []),
  summary, correctionCount: plan.length, validatorConflicts: plan.filter(p => p.validatorConflict).map(p => p.id) };
await writeFile(resolve(base, 'summary.json'), JSON.stringify(result, null, 2));
await writeFile(resolve(base, 'corrected-questions.local.json'), JSON.stringify({ ...result, questions }, null, 2));
const report = [
  '# AI 학습관 4~6학년 검수 결과', '',
  `생성 시각: ${result.generatedAt}`, '',
  `전체 ${result.totalLessons}차시 ${result.totalQuestions.toLocaleString('ko-KR')}문항 중 ${result.reviewedQuestions.toLocaleString('ko-KR')}문항 검수. 로컬 수정안 ${plan.length.toLocaleString('ko-KR')}개.`, '',
  '| 학년 | 차시 | 전체 문항 | 검수 문항 | 수정 문항 |',
  '| --- | ---: | ---: | ---: | ---: |',
  ...summary.map(s => `| ${s.grade}학년 | ${s.lessons} | ${s.total} | ${s.reviewed} | ${s.corrections} |`), '',
  '문항의 정답·선택지·조건·해설·그림/표를 검토했고, 수정안에는 원본 SHA256과 교정 이유/검증 근거를 저장했습니다. 반복 문항도 범위에서 누락하지 않았으며, 완전히 같은 내용은 대표 문항에 대응하여 검토했습니다.', '',
  `공통 계산 검증 충돌: ${result.validatorConflicts.length}개. 문항별 후검사와 동치값 후보 판정은 grade*-postcheck.json 및 학년별 verification/equivalence-review 파일을 참고하세요.`, '',
  '## 서비스 반영 상태', '',
  '**운영 DB 쓰기 0건, 코드 배포 없음.** 2026-09-03 읽기 전용 Firestore 트랜잭션에서도 RESOURCE_EXHAUSTED / Quota exceeded가 확인됐습니다. 로컬 수정 완료와 실제 학생 서비스 반영은 별개입니다.', '',
  '원본 백업, 수정안, plan-4-5-6.json 및 corrected-questions.local.json은 이 폴더에 보존됩니다. *.local 규칙으로 Git에서 제외되므로 폴더를 삭제하지 마세요.', '',
  '## 별도 품질 주의사항', '',
  '수학적으로 맞지만 차시와 주제가 다른 기존 대체 문항과 반복 출제 문제는 경고로 기록했으며, 일괄 삭제하거나 AI로 재생성하지 않았습니다. 동치인 오답이나 특정 표현 형태를 요구하는 보기는 수치가 같다는 이유만으로 제거하지 않았습니다.', '',
  `학년별 보고서에 기록된 차시 불일치 경고: ${result.scopeWarnings.length}개.`, '',
  `현재 통합 계획 SHA256: ${result.planHash}`, '',
];
await writeFile(resolve(base, 'AUDIT_RESULT.md'), report.join('\n'));
const { scopeWarnings, ...compact } = result;
console.log(JSON.stringify({ ...compact, scopeWarningCount: scopeWarnings.length, summary: summary.map(({remainingIds, ...counts}) => ({...counts, remaining:remainingIds.length})) }, null, 2));
