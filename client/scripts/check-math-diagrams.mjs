import assert from 'node:assert/strict';
import { getFactorListLayout, getNumberLineLayout, getRectangleLayout } from '../src/utils/mathDiagramLayout.js';

const values = Array.from({ length: 12 }, (_, index) => (index + 1) * 8);
const factors = getFactorListLayout({ groups: [{ label: '8의 배수', values }, { label: '12의 배수', values: [12,24,36,48,60,72,84,96] }] });
assert.deepEqual(factors.groups[0].cells.map(cell => cell.value), values);
for (const group of factors.groups) for (const cell of group.cells) {
  assert.ok(cell.x >= 0 && cell.x + cell.width <= 220);
  assert.ok(cell.y + 22 < factors.height - 16);
}
const decimalLine = getNumberLineLayout({ min: 0, max: 1, marks: [0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8], highlight: { from: 0, to: 0.6 } });
assert.equal(decimalLine.ticks.length, 11);
assert.equal(decimalLine.ticks.find(tick => tick.value === 0.6).marked, true);
const quarters = getNumberLineLayout({ min: 0, max: 1, marks: [0.25,0.5,0.75], pointer: '3/4' });
assert.deepEqual(quarters.ticks.map(tick => tick.value), [0,0.25,0.5,0.75,1]);
assert.equal(quarters.pointer, 0.75);
const irregular = getNumberLineLayout({ min: 8000, max: 9000, marks: [8000,8247,8500,9000], labels: ['8000','㉠','8500','9000'] });
assert.equal(irregular.ticks.find(tick => tick.value === 8247).label, '㉠');
const openInterval = getNumberLineLayout({ min: 20, max: 50, marks: [30,40], highlight: { from: 30, to: 40 }, closed: { left: false, right: true } });
assert.equal(openInterval.openLeft, true);
assert.equal(openInterval.openRight, false);
const sixths = getNumberLineLayout({ min: 0, max: 1, step: 1/6, marks: Array.from({ length: 7 }, (_, i) => i/6), labels: ['0','?','2/6','3/6','4/6','5/6','1'], pointer: 1/6 });
assert.equal(sixths.ticks.length, 7);
assert.equal(sixths.ticks.find(tick => tick.value === sixths.pointer).label, '?');
const grid = getRectangleLayout({ width: 4, height: 3, gridLines: true, diagonal: true });
assert.equal(grid.cells.length, 12);
assert.equal(grid.diagonal, true);
assert.equal(grid.cells[0].width, grid.cells[0].height);
const partialGrid = getRectangleLayout({ width: 2, height: 2, gridlines: true, filledCells: [{ x: 0, y: 0 }] });
assert.equal(partialGrid.cells.filter(cell => cell.filled).length, 1);
assert.equal(getRectangleLayout({ width: 3, height: 2, gridSize: 1 }).cells.length, 6);
const unknownSide = getRectangleLayout({ width: 5, height: '?' });
assert.ok([unknownSide.x, unknownSide.y, unknownSide.width, unknownSide.height].every(Number.isFinite));
console.log('약수·배수 목록, 분수/소수/불규칙 눈금, 열린 구간, 직사각형 격자/대각선/미지수 그림 회귀검사 통과');
