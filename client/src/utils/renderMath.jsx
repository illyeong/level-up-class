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
 * 텍스트에서 수식 패턴을 감지해 렌더링합니다.
 * - 대분수: "1과 2/3" → 1 + 세로분수
 * - 진분수: "3/4" → 세로분수
 */
export function renderMath(text) {
  if (!text || typeof text !== 'string') return text;

  // 대분수 패턴 먼저 처리: "N과 A/B" 또는 "N과A/B"
  const MIXED = /(\d+)\s*과\s*(\d+)\/(\d+)/g;
  // 일반 분수 패턴
  const FRAC  = /(\d+)\/(\d+)/g;

  // 대분수와 분수가 하나도 없으면 바로 반환
  if (!MIXED.test(text) && !FRAC.test(text)) return text;
  MIXED.lastIndex = 0; FRAC.lastIndex = 0;

  // 대분수 → 세로분수 치환 후 분수 처리
  const tokens = [];
  let last = 0;
  let idx = 0;

  // 1단계: 대분수 추출
  const allMatches = [];
  let m;
  MIXED.lastIndex = 0;
  while ((m = MIXED.exec(text)) !== null) {
    allMatches.push({ start: m.index, end: m.index + m[0].length, type: 'mixed', whole: m[1], num: m[2], den: m[3] });
  }
  FRAC.lastIndex = 0;
  while ((m = FRAC.exec(text)) !== null) {
    // 대분수에 포함된 분수는 건너뜀
    const inside = allMatches.some(mx => m.index >= mx.start && m.index < mx.end);
    if (!inside) allMatches.push({ start: m.index, end: m.index + m[0].length, type: 'frac', num: m[1], den: m[2] });
  }
  allMatches.sort((a, b) => a.start - b.start);

  if (allMatches.length === 0) return text;

  const result = [];
  let pos = 0;
  allMatches.forEach((match, i) => {
    if (match.start > pos) result.push(text.slice(pos, match.start));
    if (match.type === 'mixed') {
      result.push(
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle' }}>
          <span style={{ marginRight: '2px' }}>{match.whole}</span>
          <VertFrac num={match.num} den={match.den} keyProp={`f${i}`} />
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
