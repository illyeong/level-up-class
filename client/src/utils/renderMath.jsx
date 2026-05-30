import React from 'react';

/** 보기 앞의 ①②③④ 제거 */
export const stripOptionPrefix = (text) => {
  if (!text || typeof text !== 'string') return text;
  return text.replace(/^[①②③④⑤⑥]\s*/, '').trimStart();
};

/** 표 렌더러 */
export function TableRenderer({ table, dark = false }) {
  if (!table?.headers?.length) return null;
  return (
    <div className="my-3 overflow-x-auto">
      <table className="mx-auto border-collapse text-sm min-w-fit">
        <thead>
          <tr>
            {table.headers.map((h, i) => (
              <th key={i} className="border-2 border-blue-400 bg-blue-500 text-white px-3 py-2 text-center font-bold whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(table.rows || []).map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci}
                  className={`border-2 border-blue-300 px-3 py-2 text-center whitespace-nowrap
                    ${ci === 0 ? 'bg-blue-50 font-bold text-blue-800' : dark ? 'bg-slate-700 text-slate-100' : 'bg-white text-slate-700'}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── 세로 분수 (진분수/가분수) ──────────────────────────────────
function VertFrac({ num, den }) {
  return (
    <span style={{
      display: 'inline-flex',
      flexDirection: 'column',
      alignItems: 'center',
      verticalAlign: 'middle',
      fontSize: '0.82em',
      lineHeight: '1.25',
      margin: '0 1px',
    }}>
      <span style={{ borderBottom: '1.5px solid currentColor', padding: '0 3px', textAlign: 'center', minWidth: '10px' }}>{num}</span>
      <span style={{ padding: '0 3px', textAlign: 'center', minWidth: '10px' }}>{den}</span>
    </span>
  );
}

// ── 대분수 (자연수 + 세로분수) ────────────────────────────────
function MixedNumber({ whole, num, den }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      verticalAlign: 'middle',
      gap: '1px',
    }}>
      <span style={{ lineHeight: '1' }}>{whole}</span>
      <VertFrac num={num} den={den} />
    </span>
  );
}

/**
 * 수식 렌더러
 * 대분수: "2 3/5" / "2과 3/5" / "2와 3/5"
 * 진분수: "3/5"
 */
export function renderMath(text) {
  if (!text || typeof text !== 'string') return text;
  if (!text.includes('/')) return text;

  const matches = [];
  let m;

  // 대분수: 한국어 (과/와) — 공백 여부 무관
  const rKor = /(\d+)\s*[과와]\s*(\d+)\/(\d+)/g;
  while ((m = rKor.exec(text)) !== null) {
    matches.push({ start: m.index, end: m.index + m[0].length, type: 'mixed', whole: m[1], num: m[2], den: m[3] });
  }

  // 대분수: 공백 구분 "2 3/5" (1칸 이상)
  const rSpc = /(\d+)[ \t]+(\d+)\/(\d+)/g;
  while ((m = rSpc.exec(text)) !== null) {
    if (!matches.some(mx => m.index >= mx.start && m.index < mx.end)) {
      matches.push({ start: m.index, end: m.index + m[0].length, type: 'mixed', whole: m[1], num: m[2], den: m[3] });
    }
  }

  // 진분수: "3/5" (대분수 범위 제외)
  const rFrac = /(\d+)\/(\d+)/g;
  while ((m = rFrac.exec(text)) !== null) {
    if (!matches.some(mx => m.index >= mx.start && m.index < mx.end)) {
      matches.push({ start: m.index, end: m.index + m[0].length, type: 'frac', num: m[1], den: m[2] });
    }
  }

  if (matches.length === 0) return text;
  matches.sort((a, b) => a.start - b.start);

  const result = [];
  let pos = 0;
  matches.forEach((match, i) => {
    if (match.start > pos) result.push(text.slice(pos, match.start));
    if (match.type === 'mixed') {
      result.push(<MixedNumber key={i} whole={match.whole} num={match.num} den={match.den} />);
    } else {
      result.push(<VertFrac key={i} num={match.num} den={match.den} />);
    }
    pos = match.end;
  });
  if (pos < text.length) result.push(text.slice(pos));
  return <>{result}</>;
}
