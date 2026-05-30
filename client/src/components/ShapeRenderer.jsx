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
    // angles: { a: 각도값, b: 각도값 } — 직각(90°)은 RightAngleMark으로 표시
    const aA = d.angles?.a; // 밑변 우측 각 (x2)
    const aB = d.angles?.b; // 빗변 꼭짓점 각 (x3)
    return (
      <>
        <polygon points={`${x1},${y1} ${x2},${y2} ${x3},${y3}`} fill={FILL} stroke={STROKE} strokeWidth={SW} />
        <RightAngleMark x={x1} y={y1} />
        <Label x={(x1+x2)/2} y={y1+18} text={bLbl} />
        <Label x={x1-18} y={(y1+y3)/2+4} text={hLbl} anchor="end" />
        {hypLbl && <Label x={(x2+x3)/2+14} y={(y2+y3)/2+4} text={hypLbl} anchor="start" />}
        {/* 각도 표시 */}
        {aA && <Label x={x2-14} y={y2-10} text={`${aA}°`} small anchor="end" />}
        {aB && <Label x={x3+6}  y={y3+18} text={`${aB}°`} small anchor="start" />}
        <Label x={x1+8} y={y1-6} text="90°" small />
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
    const d1h = 55, d2h = 40;
    const cx = W/2, cy = H/2 + 5;
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
          {/* 두 레이블 모두 마름모 아래에 나란히 배치 → 잘림 방지 */}
          {d1Lbl && <Label x={cx - (d2Lbl ? 30 : 0)} y={cy+d2h+16} text={`대각선 ${d1Lbl}`} small />}
          {d2Lbl && <Label x={cx + (d1Lbl ? 30 : 0)} y={cy+d2h+28} text={`대각선 ${d2Lbl}`} small />}
        </>}
        {sLbl && <Label x={cx+d1h/2+10} y={cy-d2h/2-4} text={sLbl} anchor="start" />}
      </>
    );
  },

  // ── 여러 도형 2×2 그리드 ─────────────────────────────────────
  multi({ d }) {
    const items = (d.items || []).slice(0, 4);
    const KO = {
      rectangle:'직사각형', square:'정사각형', circle:'원',
      equilateral_triangle:'정삼각형', isosceles_triangle:'이등변삼각형',
      right_triangle:'직각삼각형', parallelogram:'평행사변형',
      rhombus:'마름모', trapezoid:'사다리꼴', semicircle:'반원',
    };
    const positions = [
      { cx: W*0.25, cy: H*0.38 }, { cx: W*0.75, cy: H*0.38 },
      { cx: W*0.25, cy: H*0.78 }, { cx: W*0.75, cy: H*0.78 },
    ];
    const miniShape = (type, cx, cy) => {
      const s = 32;
      switch (type) {
        case 'circle':     return <circle cx={cx} cy={cy} r={s/2} fill={FILL} stroke={STROKE} strokeWidth={1.5} />;
        case 'square':     return <rect x={cx-s/2} y={cy-s/2} width={s} height={s} fill={FILL} stroke={STROKE} strokeWidth={1.5} />;
        case 'rectangle':  return <rect x={cx-s*0.75} y={cy-s*0.4} width={s*1.5} height={s*0.8} fill={FILL} stroke={STROKE} strokeWidth={1.5} />;
        case 'rhombus': {
          const dh=s*0.65, dv=s*0.45;
          return <polygon points={`${cx},${cy-dv} ${cx+dh},${cy} ${cx},${cy+dv} ${cx-dh},${cy}`} fill={FILL} stroke={STROKE} strokeWidth={1.5} />;
        }
        case 'parallelogram': {
          const off=s*0.2;
          return <polygon points={`${cx-s*0.6+off},${cy-s*0.35} ${cx+s*0.6+off},${cy-s*0.35} ${cx+s*0.6-off},${cy+s*0.35} ${cx-s*0.6-off},${cy+s*0.35}`} fill={FILL} stroke={STROKE} strokeWidth={1.5} />;
        }
        case 'trapezoid':  return <polygon points={`${cx-s*0.35},${cy-s*0.35} ${cx+s*0.35},${cy-s*0.35} ${cx+s*0.6},${cy+s*0.35} ${cx-s*0.6},${cy+s*0.35}`} fill={FILL} stroke={STROKE} strokeWidth={1.5} />;
        case 'equilateral_triangle': {
          const h=s*Math.sqrt(3)/2;
          return <polygon points={`${cx},${cy-h*0.6} ${cx-s/2},${cy+h*0.4} ${cx+s/2},${cy+h*0.4}`} fill={FILL} stroke={STROKE} strokeWidth={1.5} />;
        }
        case 'isosceles_triangle': return <polygon points={`${cx},${cy-s*0.55} ${cx-s*0.6},${cy+s*0.45} ${cx+s*0.6},${cy+s*0.45}`} fill={FILL} stroke={STROKE} strokeWidth={1.5} />;
        case 'right_triangle':     return <polygon points={`${cx-s*0.5},${cy+s*0.45} ${cx+s*0.5},${cy+s*0.45} ${cx-s*0.5},${cy-s*0.45}`} fill={FILL} stroke={STROKE} strokeWidth={1.5} />;
        case 'semicircle': return <path d={`M ${cx-s/2} ${cy+5} A ${s/2} ${s/2} 0 0 1 ${cx+s/2} ${cy+5} Z`} fill={FILL} stroke={STROKE} strokeWidth={1.5} />;
        default:           return <rect x={cx-s/2} y={cy-s/2} width={s} height={s} fill={FILL} stroke={STROKE} strokeWidth={1.5} />;
      }
    };
    return (
      <>
        {/* 구분선 */}
        <line x1={W/2} y1={8} x2={W/2} y2={H-8} stroke="#e2e8f0" strokeWidth="1" />
        <line x1={8} y1={H/2} x2={W-8} y2={H/2} stroke="#e2e8f0" strokeWidth="1" />
        {items.map((type, i) => {
          const { cx, cy } = positions[i];
          const name = KO[type] || type;
          return (
            <React.Fragment key={i}>
              {miniShape(type, cx, cy)}
              <text x={cx} y={cy + 26} textAnchor="middle" fontSize={9} fill="#475569" fontFamily="sans-serif">
                ({i+1}) {name}
              </text>
            </React.Fragment>
          );
        })}
      </>
    );
  },

  // ── 분수 막대 모델 ────────────────────────────────────────────
  fraction_bar({ d }) {
    const total  = Math.max(1, d.total  || 4);
    const filled = Math.max(0, Math.min(d.filled ?? 1, total));
    // 비교 분수 지원: compare: {total, filled}
    const cmp = d.compare;
    const rows = cmp ? 2 : 1;
    const bW = 160, bH = 30, gap = 12;
    const x0 = (W - bW) / 2;
    const y0 = H / 2 - (rows === 2 ? (bH + gap) / 2 : 0) - bH / 2;

    const renderBar = (tot, fil, y, label) => {
      const cw = bW / tot;
      return (
        <React.Fragment key={label}>
          {label && <text x={x0 - 6} y={y + bH / 2 + 4} textAnchor="end" fontSize={10} fill="#1e40af" fontWeight="bold">{label}</text>}
          {Array.from({ length: tot }, (_, i) => (
            <rect key={i} x={x0 + i * cw} y={y} width={cw} height={bH}
              fill={i < fil ? FILL : '#f8fafc'}
              stroke={STROKE} strokeWidth={1.5} />
          ))}
          <text x={W / 2} y={y - 6} textAnchor="middle" fontSize={11} fill="#1e40af" fontWeight="bold">
            {fil}/{tot}
          </text>
        </React.Fragment>
      );
    };
    return (
      <>
        {renderBar(total, filled, y0)}
        {cmp && renderBar(cmp.total, cmp.filled, y0 + bH + gap)}
      </>
    );
  },

  // ── 독립 각도 표시 ────────────────────────────────────────────
  angle({ d }) {
    const deg  = d.degrees || 90;
    const cx   = W / 2 - 20, cy = H / 2 + 28;
    const len  = 72;
    const θ    = (deg * Math.PI) / 180;
    const arcR = 26;
    const isRight = deg === 90;

    const r2x = cx + len * Math.cos(θ);
    const r2y = cy - len * Math.sin(θ);
    const aex = cx + arcR * Math.cos(θ);
    const aey = cy - arcR * Math.sin(θ);
    const largeArc = deg > 180 ? 1 : 0;
    const midθ = θ / 2;
    const lblX = cx + (arcR + 18) * Math.cos(midθ);
    const lblY = cy - (arcR + 18) * Math.sin(midθ);

    return (
      <>
        <line x1={cx} y1={cy} x2={cx + len} y2={cy} stroke={STROKE} strokeWidth={SW} />
        <line x1={cx} y1={cy} x2={r2x}       y2={r2y} stroke={STROKE} strokeWidth={SW} />
        {isRight
          ? <path d={`M ${cx+arcR} ${cy} L ${cx+arcR} ${cy-arcR} L ${cx} ${cy-arcR}`} fill="none" stroke="#3b82f6" strokeWidth="1.5" />
          : <path d={`M ${cx+arcR} ${cy} A ${arcR} ${arcR} 0 ${largeArc} 0 ${aex} ${aey}`} fill="none" stroke="#3b82f6" strokeWidth="1.5" />
        }
        <text x={lblX} y={lblY + 4} textAnchor="middle" fontSize={12} fill="#1e40af" fontWeight="bold">{deg}°</text>
        {d.label && <text x={W/2} y={H-6} textAnchor="middle" fontSize={9} fill="#64748b">{d.label}</text>}
      </>
    );
  },

  // ── 꺾은선그래프 ──────────────────────────────────────────────
  line_chart({ d }) {
    const labels = d.labels || [];
    const values = d.values || [];
    const unit   = d.unit || '';
    const n      = Math.min(labels.length, values.length, 7);
    const maxV   = Math.max(...values.slice(0, n), 1);
    const minV   = Math.min(...values.slice(0, n), 0);
    const range  = maxV - minV || 1;
    const cH = 90, cY = 28, cX = 30, cW = W - cX - 12;

    const toX = (i) => cX + (i / Math.max(n - 1, 1)) * cW;
    const toY = (v) => cY + cH - ((v - minV) / range) * cH;
    const pts  = Array.from({ length: n }, (_, i) => `${toX(i)},${toY(values[i])}`).join(' ');

    return (
      <>
        {[0, 0.5, 1].map((r, i) => {
          const yp = cY + cH - r * cH;
          const vl = Math.round(minV + range * r);
          return (
            <React.Fragment key={i}>
              <line x1={cX} y1={yp} x2={W-12} y2={yp} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3,3" />
              <text x={cX-4} y={yp+4} textAnchor="end" fontSize={8} fill="#64748b">{vl}</text>
            </React.Fragment>
          );
        })}
        <line x1={cX} y1={cY} x2={cX} y2={cY+cH} stroke="#94a3b8" strokeWidth="1.5" />
        <line x1={cX} y1={cY+cH} x2={W-12} y2={cY+cH} stroke="#94a3b8" strokeWidth="1.5" />
        <polyline points={pts} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" />
        {Array.from({ length: n }, (_, i) => (
          <React.Fragment key={i}>
            <circle cx={toX(i)} cy={toY(values[i])} r={4} fill="#3b82f6" stroke="white" strokeWidth="1.5" />
            <text x={toX(i)} y={toY(values[i])-7} textAnchor="middle" fontSize={8} fill="#1e40af" fontWeight="600">{values[i]}{unit}</text>
            <text x={toX(i)} y={cY+cH+12} textAnchor="middle" fontSize={8} fill="#475569">{labels[i]}</text>
          </React.Fragment>
        ))}
        {d.title && <text x={W/2} y={14} textAnchor="middle" fontSize={10} fill="#1e293b" fontWeight="600">{d.title}</text>}
      </>
    );
  },

  // ── 수직선 ────────────────────────────────────────────────────
  number_line({ d }) {
    const min  = d.min  ?? 0;
    const max  = d.max  ?? 10;
    const unit = d.unit || '';
    const marks     = d.marks     || [];
    const highlight = d.highlight; // {from, to}
    const lineY = H / 2 + 10;
    const lX1 = 18, lX2 = W - 18;
    const range = max - min || 1;
    const toX = (v) => lX1 + ((v - min) / range) * (lX2 - lX1);
    const steps = max - min;
    const step = steps <= 10 ? 1 : Math.ceil(steps / 10);

    return (
      <>
        {highlight && (
          <rect x={toX(highlight.from)} y={lineY-8} width={toX(highlight.to)-toX(highlight.from)} height={16} fill="#dbeafe" rx={3} />
        )}
        <line x1={lX1-4} y1={lineY} x2={lX2+4} y2={lineY} stroke={STROKE} strokeWidth={2} />
        <polygon points={`${lX2+8},${lineY} ${lX2+1},${lineY-4} ${lX2+1},${lineY+4}`} fill={STROKE} />
        {Array.from({ length: Math.floor(steps / step) + 1 }, (_, i) => {
          const val = min + i * step;
          if (val > max) return null;
          const x = toX(val);
          const isMark = marks.includes(val);
          const inRange = highlight && val >= highlight.from && val <= highlight.to;
          return (
            <React.Fragment key={i}>
              <line x1={x} y1={lineY-5} x2={x} y2={lineY+5} stroke={isMark || inRange ? '#1e40af' : STROKE} strokeWidth={isMark ? 2 : 1} />
              <text x={x} y={lineY+17} textAnchor="middle" fontSize={9} fill={isMark || inRange ? '#1e40af' : '#475569'} fontWeight={isMark ? 'bold' : 'normal'}>
                {val}{unit}
              </text>
              {isMark && <circle cx={x} cy={lineY} r={5} fill="#3b82f6" />}
            </React.Fragment>
          );
        })}
        {d.label && <text x={W/2} y={H-4} textAnchor="middle" fontSize={9} fill="#64748b">{d.label}</text>}
      </>
    );
  },

  // ── 다각형 (오각형·육각형 등) ─────────────────────────────────
  polygon({ d, u }) {
    const sides = Math.max(3, d.sides || 5);
    const r = 60;
    const cx = W/2, cy = H/2;
    const start = -Math.PI / 2;
    const pts = Array.from({ length: sides }, (_, i) => {
      const a = start + (2 * Math.PI * i) / sides;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    });
    const ptsStr = pts.map(([x, y]) => `${x},${y}`).join(' ');
    const sideLabel = d.side ? `${d.side}${u}` : '';

    return (
      <>
        <polygon points={ptsStr} fill={FILL} stroke={STROKE} strokeWidth={SW} />
        {sideLabel && (
          <Label x={(pts[0][0]+pts[1][0])/2+6} y={(pts[0][1]+pts[1][1])/2+4} text={sideLabel} small />
        )}
        <text x={W/2} y={H-4} textAnchor="middle" fontSize={9} fill="#64748b">{sides}각형</text>
      </>
    );
  },

  // ── 원그래프 ─────────────────────────────────────────────────
  pie_chart({ d }) {
    const labels = d.labels || [];
    const values = d.values || [];
    const n      = Math.min(labels.length, values.length, 6);
    const total  = values.slice(0, n).reduce((a, b) => a + b, 0) || 1;
    const cx = W/2, cy = H/2 - 10, r = 52;
    const PCOLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4'];

    let angle = -Math.PI / 2;
    return (
      <>
        {Array.from({ length: n }, (_, i) => {
          const frac = values[i] / total;
          const end  = angle + 2 * Math.PI * frac;
          const x1   = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
          const x2   = cx + r * Math.cos(end),   y2 = cy + r * Math.sin(end);
          const mid  = angle + Math.PI * frac;
          const lblX = cx + r * 0.65 * Math.cos(mid);
          const lblY = cy + r * 0.65 * Math.sin(mid);
          const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${frac > 0.5 ? 1 : 0} 1 ${x2} ${y2} Z`;
          angle = end;
          return (
            <React.Fragment key={i}>
              <path d={path} fill={PCOLORS[i % PCOLORS.length]} stroke="white" strokeWidth="1.5" />
              <text x={lblX} y={lblY+3} textAnchor="middle" fontSize={8} fill="white" fontWeight="bold">
                {Math.round(frac * 100)}%
              </text>
            </React.Fragment>
          );
        })}
        {/* 범례 */}
        {labels.slice(0, n).map((lbl, i) => (
          <React.Fragment key={i}>
            <rect x={8 + Math.floor(i/3)*88} y={H-28+(i%3)*10} width={8} height={8} fill={PCOLORS[i % PCOLORS.length]} rx={1} />
            <text x={18 + Math.floor(i/3)*88} y={H-21+(i%3)*10} fontSize={8} fill="#475569">{lbl}</text>
          </React.Fragment>
        ))}
        {d.title && <text x={W/2} y={14} textAnchor="middle" fontSize={10} fill="#1e293b" fontWeight="600">{d.title}</text>}
      </>
    );
  },

  // ── 막대그래프 ───────────────────────────────────────────────
  bar_chart({ d }) {
    const labels = d.labels || [];
    const values = d.values || [];
    const unit   = d.unit   || '';
    const maxVal = Math.max(...values, 1);
    const n = Math.min(labels.length, values.length, 6);
    const chartH = 100, chartY = 30, chartX = 28;
    const barW = Math.floor((W - chartX - 16) / Math.max(n, 1));
    return (
      <>
        {/* Y축 */}
        <line x1={chartX} y1={chartY} x2={chartX} y2={chartY + chartH} stroke="#94a3b8" strokeWidth="1.5" />
        {/* X축 */}
        <line x1={chartX} y1={chartY + chartH} x2={W - 8} y2={chartY + chartH} stroke="#94a3b8" strokeWidth="1.5" />
        {/* Y축 눈금 (0, 최댓값/2, 최댓값) */}
        {[0, 0.5, 1].map((r, i) => {
          const yPos = chartY + chartH - r * chartH;
          const val = Math.round(maxVal * r);
          return (
            <React.Fragment key={i}>
              <line x1={chartX - 3} y1={yPos} x2={chartX} y2={yPos} stroke="#94a3b8" strokeWidth="1" />
              <text x={chartX - 5} y={yPos + 4} textAnchor="end" fontSize={8} fill="#64748b">{val}{unit}</text>
            </React.Fragment>
          );
        })}
        {/* 막대 */}
        {Array.from({ length: n }, (_, i) => {
          const bH = (values[i] / maxVal) * chartH;
          const bX = chartX + i * barW + 4;
          const bY = chartY + chartH - bH;
          return (
            <React.Fragment key={i}>
              <rect x={bX} y={bY} width={barW - 6} height={bH} fill={FILL} stroke={STROKE} strokeWidth={1} rx={2} />
              <text x={bX + (barW - 6) / 2} y={bY - 3} textAnchor="middle" fontSize={9} fill="#1e40af" fontWeight="600">{values[i]}</text>
              <text x={bX + (barW - 6) / 2} y={chartY + chartH + 12} textAnchor="middle" fontSize={8} fill="#475569">{labels[i]}</text>
            </React.Fragment>
          );
        })}
        {/* 제목 */}
        {d.title && <text x={W/2} y={15} textAnchor="middle" fontSize={10} fill="#1e293b" fontWeight="600">{d.title}</text>}
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
  // bar_chart는 세로로 더 넓게
  const isWideChart = ['bar_chart', 'line_chart'].includes(shape.type);
  const vw = isWideChart ? 240 : W;
  const vh = isWideChart ? 160 : H;

  return (
    <div className={`flex justify-center my-3 ${className}`}>
      <svg
        viewBox={`0 0 ${vw} ${vh}`}
        className={`w-full h-auto ${isWideChart ? 'max-w-[300px]' : 'max-w-[220px]'}`}
      >
        {element}
      </svg>
    </div>
  );
}
