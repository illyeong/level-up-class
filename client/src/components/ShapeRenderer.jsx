import React from 'react';

const W = 220, H = 170;

function Label({ x, y, text, anchor = 'middle', small = false }) {
  if (!text) return null;
  return (
    <text
      x={x} y={y}
      textAnchor={anchor}
      fill="#1e40af"
      fontSize={small ? 11 : 13}
      fontWeight="600"
      fontFamily="sans-serif"
    >
      {text}
    </text>
  );
}

function RightAngleMark({ x, y, size = 10 }) {
  return (
    <path
      d={`M ${x} ${y - size} L ${x + size} ${y - size} L ${x + size} ${y}`}
      fill="none" stroke="#3b82f6" strokeWidth="1.5"
    />
  );
}

const FILL  = '#dbeafe';
const STROKE = '#3b82f6';
const SW    = 2;

const renderers = {

  // ── 정삼각형 ──────────────────────────────────────────────────
  equilateral_triangle({ d, u }) {
    const s = 120, h = s * Math.sqrt(3) / 2;
    const cx = W / 2, cy = H / 2 + 8;
    const x1 = cx - s / 2, y1 = cy + h * 0.4;
    const x2 = cx + s / 2, y2 = cy + h * 0.4;
    const x3 = cx,         y3 = y1 - h;
    const lbl = d.side ? `${d.side}${u}` : '';
    return (
      <>
        <polygon points={`${x1},${y1} ${x2},${y2} ${x3},${y3}`} fill={FILL} stroke={STROKE} strokeWidth={SW} />
        <Label x={(x1+x2)/2}   y={y1+18}           text={lbl} />
        <Label x={(x1+x3)/2-14} y={(y1+y3)/2+4}    text={lbl} anchor="end" />
        <Label x={(x2+x3)/2+14} y={(y2+y3)/2+4}    text={lbl} anchor="start" />
      </>
    );
  },

  // ── 이등변삼각형 ──────────────────────────────────────────────
  isosceles_triangle({ d, u }) {
    const bLen = 110, hLen = 85;
    const cx = W / 2, cy = H / 2 + 5;
    const x1 = cx - bLen/2, y1 = cy + hLen/2;
    const x2 = cx + bLen/2, y2 = cy + hLen/2;
    const x3 = cx,           y3 = cy - hLen/2;
    const bLbl = d.base  ? `${d.base}${u}` : '';
    const sLbl = d.side  ? `${d.side}${u}` : '';
    return (
      <>
        <polygon points={`${x1},${y1} ${x2},${y2} ${x3},${y3}`} fill={FILL} stroke={STROKE} strokeWidth={SW} />
        <Label x={cx} y={y1+18} text={bLbl} />
        {sLbl && <>
          <Label x={(x1+x3)/2-12} y={(y1+y3)/2+4} text={sLbl} anchor="end" />
          <Label x={(x2+x3)/2+12} y={(y2+y3)/2+4} text={sLbl} anchor="start" />
        </>}
      </>
    );
  },

  // ── 직각삼각형 ───────────────────────────────────────────────
  right_triangle({ d, u }) {
    const bLen = 115, hLen = 80;
    const x1 = W/2 - bLen/2, y1 = H/2 + hLen/2;
    const x2 = W/2 + bLen/2, y2 = H/2 + hLen/2;
    const x3 = W/2 - bLen/2, y3 = H/2 - hLen/2;
    const bLbl = d.base   ? `${d.base}${u}` : '';
    const hLbl = d.height ? `${d.height}${u}` : '';
    const hypLbl = d.hypotenuse ? `${d.hypotenuse}${u}` : '';
    return (
      <>
        <polygon points={`${x1},${y1} ${x2},${y2} ${x3},${y3}`} fill={FILL} stroke={STROKE} strokeWidth={SW} />
        <RightAngleMark x={x1} y={y1} />
        <Label x={(x1+x2)/2} y={y1+18} text={bLbl} />
        <Label x={x1-18} y={(y1+y3)/2+4} text={hLbl} anchor="end" />
        {hypLbl && <Label x={(x2+x3)/2+14} y={(y2+y3)/2+4} text={hypLbl} anchor="start" />}
      </>
    );
  },

  // ── 정사각형 ─────────────────────────────────────────────────
  square({ d, u }) {
    const s = 100;
    const x = W/2 - s/2, y = H/2 - s/2;
    const lbl = d.side ? `${d.side}${u}` : '';
    return (
      <>
        <rect x={x} y={y} width={s} height={s} fill={FILL} stroke={STROKE} strokeWidth={SW} />
        <Label x={W/2}  y={y + s + 18} text={lbl} />
        <Label x={x-18} y={H/2 + 5}    text={lbl} anchor="end" />
      </>
    );
  },

  // ── 직사각형 ─────────────────────────────────────────────────
  rectangle({ d, u }) {
    const ratio = d.width && d.height ? d.width / d.height : 1.8;
    let rw = 130, rh = 90;
    if (ratio > rw / rh) rh = rw / ratio;
    else rw = rh * ratio;
    rw = Math.min(Math.max(rw, 60), 150);
    rh = Math.min(Math.max(rh, 50), 110);
    const x = W/2 - rw/2, y = H/2 - rh/2;
    const wLbl = d.width  ? `${d.width}${u}` : '';
    const hLbl = d.height ? `${d.height}${u}` : '';
    return (
      <>
        <rect x={x} y={y} width={rw} height={rh} fill={FILL} stroke={STROKE} strokeWidth={SW} />
        <Label x={W/2}  y={y + rh + 18} text={wLbl} />
        <Label x={x-18} y={H/2 + 5}     text={hLbl} anchor="end" />
      </>
    );
  },

  // ── 원 ───────────────────────────────────────────────────────
  circle({ d, u }) {
    const r = 62;
    const cx = W/2, cy = H/2;
    const rLbl = d.radius   ? `${d.radius}${u}` : '';
    const dLbl = d.diameter ? `${d.diameter}${u}` : '';
    return (
      <>
        <circle cx={cx} cy={cy} r={r} fill={FILL} stroke={STROKE} strokeWidth={SW} />
        {d.radius && <>
          <line x1={cx} y1={cy} x2={cx+r} y2={cy} stroke={STROKE} strokeWidth="1.5" strokeDasharray="4,3" />
          <circle cx={cx} cy={cy} r="3" fill={STROKE} />
          <Label x={cx + r/2} y={cy - 8} text={rLbl} />
          <Label x={cx} y={cy + r + 18} text={`반지름 ${rLbl}`} small />
        </>}
        {d.diameter && !d.radius && <>
          <line x1={cx-r} y1={cy} x2={cx+r} y2={cy} stroke={STROKE} strokeWidth="1.5" strokeDasharray="4,3" />
          <Label x={cx} y={cy - 8} text={dLbl} />
          <Label x={cx} y={cy + r + 18} text={`지름 ${dLbl}`} small />
        </>}
      </>
    );
  },

  // ── 반원 ────────────────────────────────────────────────────
  semicircle({ d, u }) {
    const r = 65;
    const cx = W/2, cy = H/2 + 20;
    const rLbl = d.radius ? `${d.radius}${u}` : '';
    return (
      <>
        <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy} Z`}
          fill={FILL} stroke={STROKE} strokeWidth={SW} />
        <line x1={cx-r} y1={cy} x2={cx+r} y2={cy} stroke={STROKE} strokeWidth={SW} />
        {d.radius && <>
          <line x1={cx} y1={cy} x2={cx} y2={cy-r} stroke={STROKE} strokeWidth="1.5" strokeDasharray="4,3" />
          <circle cx={cx} cy={cy} r="3" fill={STROKE} />
          <Label x={cx+8} y={cy - r/2} text={rLbl} anchor="start" />
        </>}
      </>
    );
  },

  // ── 평행사변형 ───────────────────────────────────────────────
  parallelogram({ d, u }) {
    const bLen = 120, hLen = 70, off = 28;
    const cx = W/2, cy = H/2;
    const y1 = cy + hLen/2, y2 = cy - hLen/2;
    const x1 = cx - bLen/2, x2 = cx + bLen/2;
    const pts = `${x1+off},${y2} ${x2+off},${y2} ${x2},${y1} ${x1},${y1}`;
    const bLbl = d.base   ? `${d.base}${u}` : '';
    const hLbl = d.height ? `${d.height}${u}` : '';
    const sLbl = d.side   ? `${d.side}${u}` : '';
    // height marker
    const hx = cx + bLen/2 + off/2 + 15;
    return (
      <>
        <polygon points={pts} fill={FILL} stroke={STROKE} strokeWidth={SW} />
        <Label x={cx + off/2} y={y1+18} text={bLbl} />
        {hLbl && <>
          <line x1={hx-6} y1={y2} x2={hx-6} y2={y1} stroke="#93c5fd" strokeWidth="1.5" strokeDasharray="3,3" />
          <Label x={hx+4} y={(y1+y2)/2+5} text={hLbl} anchor="start" />
        </>}
        {sLbl && <Label x={x1+off/2-14} y={(y1+y2)/2+4} text={sLbl} anchor="end" />}
      </>
    );
  },

  // ── 마름모 ───────────────────────────────────────────────────
  rhombus({ d, u }) {
    const d1h = 60, d2h = 42;
    const cx = W/2, cy = H/2;
    const pts = `${cx},${cy-d2h} ${cx+d1h},${cy} ${cx},${cy+d2h} ${cx-d1h},${cy}`;
    const d1Lbl = d.diagonal1 ? `${d.diagonal1}${u}` : '';
    const d2Lbl = d.diagonal2 ? `${d.diagonal2}${u}` : '';
    const sLbl  = d.side      ? `${d.side}${u}` : '';
    return (
      <>
        <polygon points={pts} fill={FILL} stroke={STROKE} strokeWidth={SW} />
        {(d1Lbl || d2Lbl) && <>
          <line x1={cx-d1h} y1={cy} x2={cx+d1h} y2={cy} stroke="#93c5fd" strokeWidth="1.5" strokeDasharray="3,3" />
          <line x1={cx} y1={cy-d2h} x2={cx} y2={cy+d2h} stroke="#93c5fd" strokeWidth="1.5" strokeDasharray="3,3" />
          {d1Lbl && <Label x={cx} y={cy+d2h+18} text={`대각선 ${d1Lbl}`} small />}
          {d2Lbl && <Label x={cx+d1h+6} y={cy+8} text={`대각선 ${d2Lbl}`} anchor="start" small />}
        </>}
        {sLbl && <Label x={cx+d1h/2+12} y={cy-d2h/2-4} text={sLbl} anchor="start" />}
      </>
    );
  },

  // ── 사다리꼴 ─────────────────────────────────────────────────
  trapezoid({ d, u }) {
    const bB = 120, tB = 70, hLen = 72;
    const cx = W/2, cy = H/2;
    const y1 = cy + hLen/2, y2 = cy - hLen/2;
    const pts = `${cx-bB/2},${y1} ${cx+bB/2},${y1} ${cx+tB/2},${y2} ${cx-tB/2},${y2}`;
    const bbLbl = d.bottomBase ? `${d.bottomBase}${u}` : '';
    const tbLbl = d.topBase    ? `${d.topBase}${u}` : '';
    const hLbl  = d.height     ? `${d.height}${u}` : '';
    return (
      <>
        <polygon points={pts} fill={FILL} stroke={STROKE} strokeWidth={SW} />
        <Label x={cx} y={y1 + 18} text={bbLbl} />
        <Label x={cx} y={y2 - 7}  text={tbLbl} />
        {hLbl && <>
          <line x1={cx - bB/2 - 14} y1={y2} x2={cx - bB/2 - 14} y2={y1}
            stroke="#93c5fd" strokeWidth="1.5" strokeDasharray="3,3" />
          <Label x={cx - bB/2 - 20} y={(y1+y2)/2 + 4} text={hLbl} anchor="end" />
        </>}
      </>
    );
  },
};

/**
 * shape prop 예:
 * { type: "rectangle", dimensions: { width: 5, height: 3 }, unit: "cm" }
 */
export default function ShapeRenderer({ shape, className = '' }) {
  if (!shape?.type) return null;
  const renderer = renderers[shape.type];
  if (!renderer) return null;

  const element = renderer({ d: shape.dimensions || {}, u: shape.unit || '' });

  return (
    <div className={`flex justify-center my-3 ${className}`}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full max-w-[220px] h-auto"
      >
        {element}
      </svg>
    </div>
  );
}
