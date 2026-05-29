import React from 'react';

/** 보기 앞의 ①②③④ 제거 (AI가 붙여서 생성하므로 렌더 시 중복 방지) */
export const stripOptionPrefix = (text) => {
  if (!text || typeof text !== 'string') return text;
  return text.replace(/^[①②③④⑤⑥]\s*/, '').trimStart();
};

/**
 * 표 렌더러
 * table: { headers: string[], rows: string[][] }
 */
export function TableRenderer({ table, dark = false }) {
  if (!table?.headers?.length) return null;
  return (
    <div className="my-3 overflow-x-auto">
      <table className="mx-auto border-collapse text-sm min-w-fit">
        <thead>
          <tr>
            {table.headers.map((h, i) => (
              <th key={i}
                className="border-2 border-blue-400 bg-blue-500 text-white px-3 py-2 text-center font-bold whitespace-nowrap">
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
                    ${ci === 0
                      ? 'bg-blue-50 font-bold text-blue-800'
                      : dark ? 'bg-slate-700 text-slate-100' : 'bg-white text-slate-700'}`}>
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

// 세로 분수 컴포넌트 (재사용)
function VertFrac({ num, den, keyProp }) {
  return (
    <span key={keyProp} style={{
      display: 'inline-flex', flexDirection: 'column',
      alignItems: 'center', verticalAlign: 'middle',
      margin: '0 2px', lineHeight: 1.1,
    }}>
      <span style={{ borderBottom: '1.5px solid currentColor', padding: '0 4px', fontSize: '0.88em', minWidth: '12px', textAlign: 'center' }}>{num}</span>
      <span style={{ padding: '0 4px', fontSize: '0.88em', minWidth: '12px', textAlign: 'center' }}>{den}</span>
    </span>
  );
}

/**
 * 수식 렌더러
 * - 대분수: "2 3/5" (공백) 또는 "2과 3/5" (과/와) → 자연수 + 세로분수
 * - 진분수: "3/5" → 세로분수
 */
export function renderMath(text) {
  if (!text || typeof text !== 'string') return text;
  if (!text.includes('/')) return text;

  const allMatches = [];
  let m;

  // 대분수 패턴 1: "2과 3/5" 또는 "2와 3/5"
  const rKorean = /(\d+)\s*[과와]\s*(\d+)\/(\d+)/g;
  while ((m = rKorean.exec(text)) !== null) {
    allMatches.push({ start: m.index, end: m.index + m[0].length, type: 'mixed', whole: m[1], num: m[2], den: m[3] });
  }

  // 대분수 패턴 2: "2 3/5" (공백 1칸 이상 구분) — 과/와 없는 경우
  const rSpace = /(\d+) +(\d+)\/(\d+)/g;
  while ((m = rSpace.exec(text)) !== null) {
    const inKorean = allMatches.some(mx => m.index >= mx.start && m.index < mx.end);
    if (!inKorean) {
      allMatches.push({ start: m.index, end: m.index + m[0].length, type: 'mixed', whole: m[1], num: m[2], den: m[3] });
    }
  }

  // 진분수: "3/5" (대분수에 포함된 것 제외)
  const rFrac = /(\d+)\/(\d+)/g;
  while ((m = rFrac.exec(text)) !== null) {
    const inMixed = allMatches.some(mx => m.index >= mx.start && m.index < mx.end);
    if (!inMixed) allMatches.push({ start: m.index, end: m.index + m[0].length, type: 'frac', num: m[1], den: m[2] });
  }

  if (allMatches.length === 0) return text;
  allMatches.sort((a, b) => a.start - b.start);

  const result = [];
  let pos = 0;
  allMatches.forEach((match, i) => {
    if (match.start > pos) result.push(text.slice(pos, match.start));
    if (match.type === 'mixed') {
      result.push(
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle', margin: '0 1px' }}>
          <span>{match.whole}</span>
          <VertFrac num={match.num} den={match.den} keyProp={`m${i}`} />
        </span>
      );
    } else {
      result.push(<VertFrac key={i} num={match.num} den={match.den} keyProp={`f${i}`} />);
    }
    pos = match.end;
  });
  if (pos < text.length) result.push(text.slice(pos));
  return <>{result}</>;
}
