import React from 'react';

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

/**
 * 텍스트에서 분수 패턴(숫자/숫자)을 감지해 세로 분수로 렌더링합니다.
 * 예: "3/4" → 분자/분모 세로 표시
 */
export function renderMath(text) {
  if (!text || typeof text !== 'string') return text;

  // 분수 패턴: 숫자/숫자 (앞뒤에 다른 숫자가 붙지 않는 경우)
  const FRAC = /(\d+)\/(\d+)/g;
  const parts = text.split(FRAC);

  if (parts.length === 1) return text; // 분수 없으면 그냥 반환

  const result = [];
  for (let i = 0; i < parts.length; i++) {
    if (i % 3 === 0) {
      // 일반 텍스트
      if (parts[i]) result.push(parts[i]);
    } else if (i % 3 === 1) {
      // 분자 (다음 parts[i+1]이 분모)
      const num = parts[i];
      const den = parts[i + 1];
      result.push(
        <span
          key={i}
          style={{
            display: 'inline-flex',
            flexDirection: 'column',
            alignItems: 'center',
            verticalAlign: 'middle',
            margin: '0 3px',
            lineHeight: 1.1,
          }}
        >
          <span style={{
            borderBottom: '1.5px solid currentColor',
            padding: '0 4px',
            fontSize: '0.88em',
            minWidth: '12px',
            textAlign: 'center',
          }}>
            {num}
          </span>
          <span style={{
            padding: '0 4px',
            fontSize: '0.88em',
            minWidth: '12px',
            textAlign: 'center',
          }}>
            {den}
          </span>
        </span>
      );
      i++; // 분모는 이미 처리했으므로 skip
    }
  }

  return <>{result}</>;
}
