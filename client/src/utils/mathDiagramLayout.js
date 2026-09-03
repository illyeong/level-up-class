export const getFactorListLayout = (dimensions, width = 220) => {
  let y = 8;
  const groups = (Array.isArray(dimensions.groups) ? dimensions.groups : []).map(group => {
    const values = Array.isArray(group.values) ? group.values : [];
    const cellWidth = Math.max(28, ...values.map(value => String(value).length * 7 + 14));
    const columns = Math.max(1, Math.floor((width - 24) / cellWidth));
    const layout = { label: group.label, labelY: y + 12, cells: values.map((value, index) => ({
      value, x: 12 + (index % columns) * cellWidth,
      y: y + 20 + Math.floor(index / columns) * 27, width: cellWidth - 4,
    })) };
    y += 24 + Math.max(1, Math.ceil(values.length / columns)) * 27;
    return layout;
  });
  return { groups, height: Math.max(170, y + 24) };
};

const numberValue = value => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const fraction = value.match(/^\s*(-?\d+)\s*\/\s*(\d+)\s*$/);
  const result = fraction ? Number(fraction[1]) / Number(fraction[2]) : Number(value);
  return Number.isFinite(result) ? result : null;
};
const tidy = value => Number(value.toFixed(8));
const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };

export const getNumberLineLayout = (dimensions) => {
  const min = tidy(numberValue(dimensions.min) ?? 0);
  const rawMax = tidy(numberValue(dimensions.max) ?? 10);
  const max = rawMax > min ? rawMax : min + 1;
  const range = max - min;
  const inRange = value => value != null && value >= min && value <= max;
  const marks = (Array.isArray(dimensions.marks) ? dimensions.marks : []).map(numberValue).filter(inRange).map(tidy);
  const scaled = [min, ...marks, max].sort((a, b) => a - b).map(value => Math.round(value * 1e6));
  const inferred = scaled.slice(1).reduce((unit, value, index) => gcd(unit, value - scaled[index]), 0) / 1e6;
  const explicit = numberValue(dimensions.step);
  let step = explicit > 0 ? explicit : marks.length && inferred > 0 ? inferred : range <= 10 ? 1 : range / 10;
  if (range / step > 40) step = range / 10;
  const fromValue = numberValue(dimensions.highlight?.from);
  const toValue = numberValue(dimensions.highlight?.to);
  const from = fromValue == null ? null : tidy(fromValue);
  const to = toValue == null ? null : tidy(toValue);
  const highlight = inRange(from) && inRange(to) && from < to ? { from, to } : null;
  const pointerValue = numberValue(dimensions.pointer);
  const pointer = pointerValue == null ? null : tidy(pointerValue);
  const values = new Set([min, max, ...marks]);
  for (let index = 0; index <= Math.floor(range / step); index += 1) values.add(tidy(min + index * step));
  if (highlight) { values.add(from); values.add(to); }
  if (inRange(pointer)) values.add(pointer);
  const labels = Array.isArray(dimensions.labels) && dimensions.labels.length === marks.length
    ? new Map(marks.map((value, index) => [value, dimensions.labels[index]])) : new Map();
  const ticks = [...values].sort((a, b) => a - b).map(value => ({
    value, marked: marks.includes(value),
    label: labels.get(value) ?? (values.size <= 12 || marks.includes(value) || value === min || value === max ? String(tidy(value)) : ''),
  }));
  const longestLabel = Math.max(...ticks.map(tick => String(tick.label).length), 1);
  const width = Math.max(220, Math.min(760, ticks.filter(tick => tick.label !== '').length * Math.max(23, longestLabel * 6) + 36));
  const open = side => dimensions.open?.includes?.(side) || dimensions.closed?.[side] === false;
  return { min, max, ticks, highlight, pointer: inRange(pointer) ? pointer : null, width, openLeft: !!open('left'), openRight: !!open('right') };
};

export const getRectangleLayout = (dimensions) => {
  const width = numberValue(dimensions.width);
  const height = numberValue(dimensions.height);
  const ratio = width > 0 && height > 0 ? width / height : 1.8;
  let rw = 130, rh = 90;
  if (ratio > rw / rh) rh = rw / ratio;
  else rw = rh * ratio;
  rw = Math.min(Math.max(rw, 60), 150);
  rh = Math.min(Math.max(rh, 50), 110);
  const gridSize = numberValue(dimensions.gridSize) ?? 1;
  const columns = width / gridSize, rows = height / gridSize;
  const hasGrid = !!(dimensions.gridLines || dimensions.gridlines || dimensions.gridSize);
  const grid = hasGrid && gridSize > 0 && Number.isInteger(columns) && Number.isInteger(rows)
    && columns > 0 && rows > 0 && columns <= 40 && rows <= 40;
  if (grid) {
    const scale = Math.min(150 / width, 110 / height);
    rw = width * scale; rh = height * scale;
  }
  const x = 110 - rw / 2, y = 85 - rh / 2;
  const filled = dimensions.filledCells;
  const filledSet = Array.isArray(filled) ? new Set(filled.map(cell => `${cell.x},${cell.y}`)) : null;
  const cells = grid ? Array.from({ length: columns * rows }, (_, index) => {
    const col = index % columns, row = Math.floor(index / columns);
    return { x: x + col * rw / columns, y: y + row * rh / rows,
      width: rw / columns, height: rh / rows,
      filled: filledSet ? filledSet.has(`${col},${row}`) : Number.isInteger(filled) ? index < filled : true };
  }) : [];
  return { x, y, width: rw, height: rh, cells, diagonal: dimensions.diagonal === true };
};

export const getPolygonLayout = (dimensions) => {
  const sides = Math.max(3, Math.min(30, Math.trunc(Number(dimensions.sides) || 5)));
  const vertices = Array.isArray(dimensions.vertices) && dimensions.vertices.length === sides ? dimensions.vertices : [];
  const coordinates = vertices.length === sides && vertices.every(v => Number.isFinite(v?.x) && Number.isFinite(v?.y));
  let points = Array.from({ length: sides }, (_, i) => {
    const angle = -Math.PI / 2 + 2 * Math.PI * i / sides;
    return { x: 110 + 60 * Math.cos(angle), y: 85 + 60 * Math.sin(angle) };
  });
  if (coordinates) {
    const xs = vertices.map(v => v.x), ys = vertices.map(v => v.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    if (maxX > minX && maxY > minY) {
      const scale = Math.min(130 / (maxX - minX), 110 / (maxY - minY));
      points = vertices.map(v => ({ x: 110 + (v.x - (minX + maxX) / 2) * scale, y: 85 + (v.y - (minY + maxY) / 2) * scale }));
    }
  }
  points = points.map((point, i) => ({ ...point, label: typeof vertices[i] === 'string' ? vertices[i] : vertices[i]?.label ?? '' }));
  const endpoint = value => typeof value === 'number' && Number.isInteger(value) ? value : points.findIndex(p => p.label && p.label === value);
  const seen = new Set();
  const diagonals = (Array.isArray(dimensions.diagonals) ? dimensions.diagonals : []).flatMap(line => {
    const from = endpoint(line?.from), to = endpoint(line?.to);
    const key = [from, to].sort((a, b) => a - b).join(':');
    const distance = Math.abs(from - to);
    if (from < 0 || to < 0 || from >= sides || to >= sides || distance <= 1 || distance === sides - 1 || seen.has(key)) return [];
    seen.add(key);
    return [{ from: points[from], to: points[to] }];
  });
  return { sides, points, diagonals };
};

export const getTrapezoidLayout = (dimensions) => {
  const top = numberValue(dimensions.topBase), bottom = numberValue(dimensions.bottomBase);
  const max = top > 0 && bottom > 0 ? Math.max(top, bottom) : null;
  return { top: max ? 120 * top / max : 70, bottom: max ? 120 * bottom / max : 120, height: 72 };
};

export const getSymmetryPointLayout = (dimensions) => {
  const grid = Math.max(2, Math.min(20, Math.trunc(Number(dimensions.gridSize) || 8)));
  const axis = dimensions.axis === 'horizontal' ? 'horizontal' : 'vertical';
  const requestedAxis = numberValue(dimensions.axisPosition);
  const axisPosition = requestedAxis != null && requestedAxis >= 0 && requestedAxis <= grid ? requestedAxis : grid / 2;
  const x0 = 50, y0 = 18, size = 120, step = size / grid;
  const screen = (x, y) => ({ x: x0 + x * step, y: y0 + size - y * step });
  const points = (Array.isArray(dimensions.points) ? dimensions.points : []).flatMap(point => {
    const x = numberValue(point?.x), y = numberValue(point?.y);
    if (x == null || y == null || x < 0 || y < 0 || x > grid || y > grid) return [];
    return [{ ...screen(x,y), label: typeof point.label === 'string' ? point.label : '' }];
  });
  return { grid, axis, axisPosition, x0, y0, size, step, points, connect: dimensions.connect === true,
    axisStart: axis === 'vertical' ? screen(axisPosition, 0) : screen(0, axisPosition),
    axisEnd: axis === 'vertical' ? screen(axisPosition, grid) : screen(grid, axisPosition) };
};
