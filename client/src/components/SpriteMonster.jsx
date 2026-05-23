import React, { useState, useEffect, useRef } from 'react';

/**
 * 스프라이트 시트 기반 몬스터 애니메이션 컴포넌트
 * @param {object} data      - MONSTERS_DB의 몬스터 데이터
 * @param {string} anim      - 재생할 애니메이션 키 (idle|run|attack|death)
 * @param {number} scale     - 오버라이드 스케일 (없으면 data.scale 사용)
 * @param {boolean} flash    - 피격 플래시 효과
 * @param {function} onAnimEnd - 비루프 애니메이션 완료 콜백
 * @param {string} className - 추가 CSS 클래스
 */
export default function SpriteMonster({
  data,
  anim      = 'idle',
  scale,
  flash     = false,
  onAnimEnd,
  className = '',
}) {
  const animCfg  = (data?.animations?.[anim] || data?.animations?.idle);
  const [frame, setFrame] = useState(0);
  const frameRef = useRef(0);
  const timerRef = useRef(null);
  const onEndRef = useRef(onAnimEnd);
  onEndRef.current = onAnimEnd;

  useEffect(() => {
    if (!animCfg) return;
    frameRef.current = 0;
    setFrame(0);
    clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      frameRef.current += 1;
      if (frameRef.current >= animCfg.frames) {
        if (animCfg.loop) {
          frameRef.current = 0;
        } else {
          clearInterval(timerRef.current);
          frameRef.current = animCfg.frames - 1;
          onEndRef.current?.();
          return;
        }
      }
      setFrame(frameRef.current);
    }, 1000 / animCfg.fps);

    return () => clearInterval(timerRef.current);
  }, [anim]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data || !animCfg) return null;

  const s   = scale ?? data.scale;
  const dw  = Math.round(data.frameWidth  * s);
  const dh  = Math.round(data.frameHeight * s);
  const bgW = data.sheetCols * dw;
  const bgH = data.sheetRows * dh;
  const bgX = -(frame * dw);
  const bgY = -(animCfg.row * dh);

  return (
    <div
      className={className}
      style={{
        width:              dw,
        height:             dh,
        backgroundImage:    `url('${data.src}')`,
        backgroundPosition: `${bgX}px ${bgY}px`,
        backgroundRepeat:   'no-repeat',
        backgroundSize:     `${bgW}px ${bgH}px`,
        imageRendering:     'pixelated',
        transform:          data.flip ? 'scaleX(-1)' : undefined,
        filter:             flash ? 'brightness(4) saturate(0)' : undefined,
        transition:         'filter 0.15s',
        flexShrink:         0,
      }}
    />
  );
}
