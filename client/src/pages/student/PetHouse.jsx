import React, { useState, useEffect, useRef } from 'react';

// 스프라이트 시트 설정
const SPRITE = {
  src:         '/images/chicken-sprite.png',
  frameW:      171,   // 1368 / 8
  frameH:      195,   // 780  / 4
  cols:        8,
  rows: {
    idle:   0,
    walk:   1,
    attack: 2,
    death:  3,
  },
  fps: {
    idle:   6,
    walk:   10,
    attack: 12,
    death:  8,
  },
};

// ── 스프라이트 애니메이션 캔버스 ──────────────────────────────
function ChickenSprite({ animation = 'idle', scale = 2, onDeathEnd }) {
  const canvasRef = useRef(null);
  const stateRef  = useRef({ frame: 0, tick: 0, done: false });
  const imgRef    = useRef(null);
  const rafRef    = useRef(null);

  useEffect(() => {
    stateRef.current = { frame: 0, tick: 0, done: false };
  }, [animation]);

  useEffect(() => {
    const img = new Image();
    img.src = SPRITE.src;
    img.onload = () => { imgRef.current = img; };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const row = SPRITE.rows[animation] ?? 0;
    const fps = SPRITE.fps[animation] ?? 8;
    const interval = 60 / fps; // frames per tick at 60fps

    const draw = () => {
      const img = imgRef.current;
      if (!img) { rafRef.current = requestAnimationFrame(draw); return; }

      const s = stateRef.current;
      s.tick++;

      if (s.tick >= interval) {
        s.tick = 0;
        if (animation === 'death') {
          if (s.frame < SPRITE.cols - 1) s.frame++;
          else if (!s.done) { s.done = true; onDeathEnd?.(); }
        } else {
          s.frame = (s.frame + 1) % SPRITE.cols;
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(
        img,
        s.frame * SPRITE.frameW, row * SPRITE.frameH,
        SPRITE.frameW, SPRITE.frameH,
        0, 0,
        canvas.width, canvas.height,
      );

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [animation]);

  return (
    <canvas
      ref={canvasRef}
      width={SPRITE.frameW * scale}
      height={SPRITE.frameH * scale}
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

// ── 메인 ─────────────────────────────────────────────────────
const ANIMS = ['idle', 'walk', 'attack', 'death'];
const ANIM_LABEL = { idle: '🐔 대기', walk: '🚶 걷기', attack: '⚔️ 공격', death: '💀 사망' };
const ANIM_COLOR = {
  idle:   'bg-amber-100 text-amber-700 border-amber-300',
  walk:   'bg-sky-100 text-sky-700 border-sky-300',
  attack: 'bg-rose-100 text-rose-700 border-rose-300',
  death:  'bg-slate-100 text-slate-600 border-slate-300',
};

export default function PetHouse() {
  const [anim, setAnim]       = useState('idle');
  const [isDead, setIsDead]   = useState(false);

  const handleSelect = (a) => {
    setIsDead(false);
    setAnim(a);
  };

  const handleDeathEnd = () => setIsDead(true);

  return (
    <div className="min-h-full bg-gradient-to-b from-amber-50 to-orange-50 flex flex-col items-center py-12 px-6">
      <h1 className="text-3xl font-extrabold text-amber-800 mb-1">🐔 펫 하우스</h1>
      <p className="text-amber-600 text-sm mb-10">내 펫 치킨과 함께해요!</p>

      {/* 캐릭터 무대 */}
      <div className="bg-white rounded-3xl shadow-xl border-2 border-amber-200 px-12 py-10 mb-8 flex items-end justify-center"
        style={{ minWidth: 320, minHeight: 240 }}>
        <ChickenSprite
          animation={anim}
          scale={2}
          onDeathEnd={handleDeathEnd}
        />
      </div>

      {/* 상태 표시 */}
      <div className={`text-sm font-extrabold px-4 py-1.5 rounded-full border mb-6
        ${ANIM_COLOR[anim]}`}>
        {ANIM_LABEL[anim]}{isDead ? ' (사망함)' : ''}
      </div>

      {/* 애니메이션 버튼 */}
      <div className="flex gap-3 flex-wrap justify-center">
        {ANIMS.map(a => (
          <button
            key={a}
            onClick={() => handleSelect(a)}
            className={`px-5 py-2.5 rounded-2xl font-extrabold text-sm border-2 transition-all active:scale-95
              ${anim === a
                ? ANIM_COLOR[a] + ' shadow-md scale-105'
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}>
            {ANIM_LABEL[a]}
          </button>
        ))}
      </div>
    </div>
  );
}
