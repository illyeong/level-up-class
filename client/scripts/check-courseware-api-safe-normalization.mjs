import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { inspectCoursewareQuestion } from '../api/generate-courseware.js';

// Pure local regression: never calls generation, Firebase, or other services.
const client = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv.indexOf('--audit-dir');
const auditDir = arg >= 0 ? path.resolve(process.argv[arg + 1])
  : path.join(client, 'courseware-audit.local', '2026-09-02');
const failures = [];
const fixtures = [];
const check = (name, run) => {
  try { run(); fixtures.push({ name, status: 'pass' }); }
  catch (error) { fixtures.push({ name, status: 'fail', message: error.message }); failures.push(name); }
};
const question = (text, options, answerIndex, extra = {}) => ({
  question: text, options, answerIndex, explanation: '검산했습니다.', ...extra,
});
const inspect = q => inspectCoursewareQuestion(q).normalized;
const keep = q => assert.equal(inspect(q)?.answerIndex, q.answerIndex);

check('parentheses and operator precedence', () => {
  const q = question('120 - (45 + 38)을 계산하세요.', ['113', '37', '47', '83'], 0);
  assert.equal(inspect(q)?.answerIndex, 1);
});
check('unknown operand in multiple equations is not a numeric fragment', () => keep(question(
  '36 ÷ 9 = 4, 32 ÷ 8 = 4, 24 ÷ □ = 4. 빈칸에 들어갈 수는 무엇일까요?', ['6', '8', '4', '5'], 0,
)));
check('word equations retain their quantity meaning', () => keep(question(
  '연필 5자루의 가격과 지우개 15개의 가격이 같습니다. 크기가 같은 관계를 올바르게 나타낸 것은?',
  ['연필 10자루의 가격 = 지우개 30개의 가격', '연필 10자루의 가격 = 지우개 20개의 가격', '연필 5자루의 가격 = 지우개 10개의 가격', '연필 15자루의 가격 = 지우개 15개의 가격'], 0,
)));
check('round then estimate is not exact multiplication', () => keep(question(
  '23을 반올림하여 십의 자리까지 나타낸 뒤 23 × 4를 어림하면 얼마입니까?', ['100', '120', '92', '80'], 3,
)));
check('intermediate steps do not overwrite the requested final answer', () => keep(question(
  '0.3×6을 계산할 때 먼저 3×6을 계산하면 18이 됩니다. 그러면 0.3×6의 답은 몇입니까?', ['18', '0.18', '180', '1.8'], 3,
)));
check('fraction division equations use the shared parser', () => {
  const q = question('다음 중 계산이 맞는 것은 어느 것입니까?',
    ['7/9 ÷ 2/9 = 5/18', '5/7 ÷ 1/7 = 5/7', '6/8 ÷ 3/8 = 2', '9/11 ÷ 3/11 = 12/11'], 0);
  assert.equal(inspect(q)?.answerIndex, 2);
});
check('incorrect-equation questions invert truth', () => {
  const q = question('다음 중 계산이 틀린 것은 어느 것입니까?',
    ['2.4 + 3.15 = 5.55', '6.8 - 2.3 = 4.5', '1.25 + 2.45 = 3.70', '5.6 - 1.42 = 3.18'], 0);
  assert.equal(inspect(q)?.answerIndex, 3);
});
check('threshold is not an extremum', () => {
  const q = question('다음 중 계산 결과가 1보다 큰 것은 어느 것입니까?',
    ['1/2÷3/4', '4/7÷5/6', '3/5÷4/5', '2/3÷1/2'], 0);
  assert.equal(inspect(q)?.answerIndex, 3);
  assert.equal(inspect(question('다음 중 1보다 큰 것은 어느 것입니까?', ['1/2', '2', '3', '1/4'], 1)), null);
});
check('threshold equality tolerates decimal floating-point roundoff', () => {
  keep(question('다음 중 1보다 작은 것은 어느 것입니까?', ['0.7 + 0.2 + 0.1', '1/2', '2', '3'], 1));
  keep(question('다음 중 1보다 큰 것은 어느 것입니까?', ['0.1 + 0.2 + 0.3 + 0.1 + 0.2 + 0.1', '1/2', '2', '1/4'], 2));
});
check('fraction-operation extrema respect division', () => {
  const q = question('다음 식을 계산했을 때 결과가 가장 작은 것은 어느 것입니까?',
    ['7/8÷2', '4/5÷2', '3/4÷2', '5/6÷3'], 0);
  assert.equal(inspect(q)?.answerIndex, 3);
});
check('extrema within a multi-step word problem are not option extrema', () => keep(question(
  '세 분수 2/6, 4/6, 1/6이 있습니다. 가장 큰 수에서 가장 작은 수를 뺀 값을 고르세요.', ['4/6', '1/6', '2/6', '3/6'], 3,
)));
check('equivalent result does not override requested multiplication form', () => keep(question(
  '다음 중 7/9÷4를 분수의 곱셈으로 올바르게 나타낸 것은 어느 것입니까?', ['7/9×1/4', '7/9×4', '4/9×1/7', '7/36'], 0,
)));
check('structural and exact ambiguity checks still reject invalid items', () => {
  assert.equal(inspect(question('2 + 2를 계산하세요.', ['4', '4.0', '3', '5'], 0)), null);
  assert.equal(inspect(question('2 + 2를 계산하세요.', ['4', '3', '5'], 0)), null);
});
check('numeric explanation is checked only when wholly interpretable', () => {
  const q = question('알맞은 답을 고르세요.', ['1', '2', '3', '4'], 3);
  assert.equal(inspect({ ...q, explanation: '2 + 2 = 5' }), null);
  keep({ ...q, explanation: '2 + 2 = 5는 잘못된 계산입니다. 답은 4입니다.' });
  assert.equal(inspect({ ...q, question: '2 + 2를 계산하세요.', explanation: '2 + 2 = 5' }), null);
  keep({ ...q, question: '2 + 2를 계산하세요.', explanation: '2 + 2 = 4' });
});
check('complete equality chains are evaluated without truncation', () => {
  const q = question('다음 중 계산이 맞는 것은 어느 것입니까?',
    ['8 + 4 × 2 = 8 + 8 = 16', '8 + 4 × 2 = 12 × 2 = 24', '6 ÷ 3 = 3', '3 × 2 = 5'], 2);
  assert.equal(inspect(q)?.answerIndex, 0);
  keep(question('다음 중 계산이 맞는 것은 어느 것입니까?',
    ['연필 5자루 = 지우개 15개', '10 = 5', '10 = 20', '10 = 30'], 0));
});
check('semantic digit fragments and representation constraints remain unsupported', () => {
  keep(question('2/3 ÷ 4/9 = 2/3 × □ 입니다. □에 들어갈 분수는?', ['2/3', '9/4', '4/9', '3/2'], 1));
  keep(question('5.2÷1.3을 나누는 수가 자연수인 나눗셈으로 바르게 바꾼 것은 무엇입니까?',
    ['52÷13으로 변환', '52÷1.3으로 변환', '5.2÷1.30으로 변환', '5.2÷13으로 변환'], 0));
});
check('array rows and object rows retain table data', () => {
  for (const rows of [[['사과', 3]], [{ cells: ['사과', 3] }]]) {
    const table = { headers: ['종류', '개수'], rows };
    const q = question('표에서 사과의 개수를 고르세요.', ['1', '2', '3', '4'], 2, { table });
    assert.deepEqual(inspect(q)?.table, table);
    assert.equal(inspect({ ...q, table: { headers: ['개수'], rows } }), null);
  }
});
check('symmetry point geometry is retained', () => {
  const dimensions = { gridSize: 10, axis: 'vertical', axisPosition: 5,
    points: [{ x: 2, y: 3, label: 'A' }, { x: 8, y: 3, label: 'B' }], connect: true };
  const q = question('점 A의 이름을 고르세요.', ['A', 'B', 'C', 'D'], 0,
    { shape: { type: 'symmetry', dimensions } });
  assert.deepEqual(inspect(q)?.shape.dimensions, dimensions);
});
check('horizontal fractional symmetry points, legacy cells, and invalid points', () => {
  const dimensions = { gridSize: 8, axis: 'horizontal', axisPosition: '7/2',
    points: [{ x: '1/2', y: 2, label: 'A' }, { x: '1/2', y: 5, label: 'B' }], connect: false };
  const q = question('점 A의 이름을 고르세요.', ['A', 'B', 'C', 'D'], 0,
    { shape: { type: 'symmetry', dimensions } });
  const original = JSON.stringify(q);
  assert.deepEqual(inspect(q)?.shape.dimensions, dimensions);
  assert.equal(JSON.stringify(q), original);
  const cells = { axis: 'vertical', cells: [{ x: 1, y: 2 }, { x: 2, y: 2 }] };
  assert.deepEqual(inspect({ ...q, shape: { type: 'symmetry', dimensions: cells } })?.shape.dimensions, cells);
  assert.equal(inspect({ ...q, shape: { type: 'symmetry', dimensions: { ...dimensions, points: [null] } } }), null);
});
check('polygon vertices and diagonals above ten sides are retained', () => {
  const dimensions = { sides: 12, vertices: Array.from({ length: 12 }, (_, i) => `V${i}`), diagonals: [{ from: 'V0', to: 'V6' }] };
  const q = question('점 V0의 이름을 고르세요.', ['V0', 'V1', 'V2', 'V3'], 0,
    { shape: { type: 'polygon', dimensions } });
  const result = inspect(q)?.shape.dimensions;
  assert.equal(result?.sides, dimensions.sides);
  assert.deepEqual(result?.vertices, dimensions.vertices);
  assert.deepEqual(result?.diagonals, dimensions.diagonals);
});
check('grade-five planar vertices are allowed only in named planar lessons', () => {
  const q = question('삼각형 A의 꼭짓점은 (1,1), (1,2), (2,1)입니다. 세로 대칭축 x=3으로 대칭이동한 꼭짓점은?',
    ['(5,1),(5,2),(4,1)', '(1,5),(1,4),(2,5)', '(2,1),(2,2),(3,1)', '(1,1),(1,2),(2,1)'], 0,
    { shape: { type: 'symmetry', dimensions: { axis: 'vertical', axisPosition: 3, gridSize: 8,
      points: [{ x: 1, y: 1, label: 'A1' }, { x: 1, y: 2, label: 'A2' }, { x: 2, y: 1, label: 'A3' }], connect: true } } });
  for (const unitName of ['합동과 대칭', '평면도형', '다각형']) {
    assert.equal(inspectCoursewareQuestion(q, { grade: 5, unitName }).normalized?.answerIndex, 0);
  }
  assert.equal(inspectCoursewareQuestion(q, { grade: 5, unitName: '규칙과 대응' }).normalized, null);
  assert.equal(inspectCoursewareQuestion(q, { grade: 5, unitName: '규칙과 대응', keywords: ['대칭'] }).normalized, null);
  for (const text of ['정육면체의 꼭짓점은 몇 개입니까?', '모서리는 몇 개입니까?']) {
    assert.equal(inspectCoursewareQuestion(question(text, ['4', '6', '8', '12'], 2),
      { grade: 5, unitName: '합동과 대칭' }).normalized, null);
  }
});
check('circle measurements retain tables and permit only related decimal multiplication', () => {
  const table = { headers: ['반지름(cm)', '넓이(cm²)'], rows: [['5', '?']] };
  const q = question('표에서 반지름 5cm인 원의 넓이는 몇 cm²입니까? 원주율은 3.14입니다.',
    ['50.24', '78.5', '100.48', '153.86'], 1,
    { table, explanation: '반지름이 5cm인 원의 넓이는 5 × 5 × 3.14 = 78.5cm²입니다.' });
  const circleLesson = { grade: 6, unitName: '원의 넓이', lessonTitle: '원의 넓이를 활용해 볼까요' };
  const result = inspectCoursewareQuestion(q, circleLesson).normalized;
  assert.equal(result?.answerIndex, 1);
  assert.deepEqual(result?.table, table);
  const circumference = question('지름이 4cm인 원의 원주는 얼마입니까? 원주율은 3.14입니다.',
    ['6.28', '12.56', '18.84', '25.12'], 1, { explanation: '지름에 원주율을 곱하면 4 × 3.14 = 12.56cm입니다.' });
  assert.equal(inspectCoursewareQuestion(circumference, { grade: 6, unitName: '원주와 원주율' }).normalized?.answerIndex, 1);
  assert.equal(inspectCoursewareQuestion(q, { grade: 6, unitName: '다각형의 넓이' }).normalized, null);
  assert.equal(inspectCoursewareQuestion(q, { grade: 6, unitName: '다각형의 넓이', keywords: ['원주율'] }).normalized, null);
  const unrelated = question('0.2 × 0.3을 계산하세요.', ['0.06', '0.6', '6', '0.006'], 0);
  assert.equal(inspectCoursewareQuestion(unrelated, circleLesson).normalized, null);
  assert.equal(inspectCoursewareQuestion(unrelated, { grade: 6, unitName: '소수의 나눗셈' }).normalized, null);
});

let corpus = null;
const auditPath = path.join(auditDir, 'audit.json');
const planPath = path.join(auditDir, 'plan-4-5-6.json');
if (fs.existsSync(auditPath) && fs.existsSync(planPath)) {
  const auditText = fs.readFileSync(auditPath, 'utf8');
  const planText = fs.readFileSync(planPath, 'utf8');
  const records = JSON.parse(auditText).records;
  const plan = new Map(JSON.parse(planText).map(record => [record.id, record.after]));
  const acceptedIds = [], rejectedIds = [], changed = [], retentionIssues = [], exceptions = [];
  const retention = { tablesPresent: 0, tablesAccepted: 0, pointShapesPresent: 0, pointShapesAccepted: 0, polygonsWithVerticesPresent: 0, polygonsWithVerticesAccepted: 0 };
  for (const record of records) {
    const q = plan.get(record.id) ?? record.question;
    const hasTable = q.table != null;
    const hasPoints = q.shape?.type === 'symmetry' && !!q.shape.dimensions?.points?.length;
    const hasVertices = q.shape?.type === 'polygon' && !!q.shape.dimensions?.vertices?.length;
    if (hasTable) retention.tablesPresent++;
    if (hasPoints) retention.pointShapesPresent++;
    if (hasVertices) retention.polygonsWithVerticesPresent++;
    let result;
    try { result = inspectCoursewareQuestion(q, record).normalized; }
    catch (error) { exceptions.push({ id: record.id, error: error.message }); continue; }
    if (!result) { rejectedIds.push(record.id); continue; }
    acceptedIds.push(record.id);
    if (result.answerIndex !== q.answerIndex) changed.push({ id: record.id, question: q.question,
      options: q.options, expected: q.answerIndex, actual: result.answerIndex });
    for (const [present, key, before, after] of [
      [hasTable, 'tablesAccepted', q.table, result.table],
      [hasPoints, 'pointShapesAccepted', q.shape?.dimensions?.points, result.shape?.dimensions?.points],
      [hasVertices, 'polygonsWithVerticesAccepted', q.shape?.dimensions?.vertices, result.shape?.dimensions?.vertices],
    ]) {
      if (!present) continue;
      retention[key]++;
      try { assert.deepEqual(after, before); }
      catch { retentionIssues.push({ id: record.id, field: key, before, after }); }
    }
    if (hasVertices && JSON.stringify(q.shape.dimensions.diagonals) !== JSON.stringify(result.shape?.dimensions?.diagonals)) {
      retentionIssues.push({ id: record.id, field: 'diagonals' });
    }
    if (hasPoints) {
      for (const field of ['gridSize', 'axisPosition', 'connect']) {
        if (q.shape.dimensions[field] !== result.shape?.dimensions?.[field]) retentionIssues.push({ id: record.id, field });
      }
      const expectedAxis = q.shape.dimensions.axis === 'horizontal' ? 'horizontal' : 'vertical';
      if (result.shape?.dimensions?.axis !== expectedAxis) retentionIssues.push({ id: record.id, field: 'axis' });
    }
  }
  corpus = { total: records.length, planChanges: plan.size, accepted: acceptedIds.length,
    rejected: rejectedIds.length, answerIndexChanges: changed.length, changed, retention, retentionIssues, exceptions,
    acceptedIds, rejectedIds,
    inputHashes: { audit: crypto.createHash('sha256').update(auditText).digest('hex'), plan: crypto.createHash('sha256').update(planText).digest('hex') },
    note: 'Rejected items include intentional lesson-topic and diagram filters; rejection is not a content-error verdict.' };
  if (changed.length || retentionIssues.length || exceptions.length) failures.push('full-after-corpus');
}
const report = { generatedAt: new Date().toISOString(), fixtures, corpus,
  fixturePassed: fixtures.filter(item => item.status === 'pass').length, fixtureTotal: fixtures.length,
  status: failures.length ? 'needs-review' : 'pass', failures };
if (corpus) fs.writeFileSync(path.join(auditDir, 'api-safe-normalization-verification.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ status: report.status, fixtures: `${report.fixturePassed}/${report.fixtureTotal}`,
  corpus: corpus && { total: corpus.total, accepted: corpus.accepted, rejected: corpus.rejected,
    answerIndexChanges: corpus.answerIndexChanges, changed: corpus.changed, retention: corpus.retention,
    retentionIssues: corpus.retentionIssues, exceptions: corpus.exceptions }, failures }, null, 2));
if (failures.length) process.exitCode = 1;
