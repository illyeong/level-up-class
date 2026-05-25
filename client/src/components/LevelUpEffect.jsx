import React, { useRef, useState, useEffect, useMemo } from 'react';

const getStats = (level = 1) => ({
  hp:          100 + Math.floor(level * 10),
  attack:      10  + Math.floor(level * 2),
  defense:     5   + Math.floor(level * 1.5),
  crit:        5   + Math.floor(level * 0.5),
  attackSpeed: 10  + Math.floor(level * 1),
});

const STAT_META = [
  { key: 'hp',          label: 'HP',   icon: '❤️' },
  { key: 'attack',      label: 'ATK',  icon: '⚔️' },
  { key: 'defense',     label: 'DEF',  icon: '🛡️' },
  { key: 'crit',        label: 'CRIT', icon: '💥' },
  { key: 'attackSpeed', label: 'SPD',  icon: '💨' },
];

const CONFETTI_COLORS = [
  '#fbbf24','#f59e0b','#a78bfa','#60a5fa',
  '#34d399','#f472b6','#fb923c','#4ade80','#38bdf8',
];

export default function LevelUpEffect({
  prevLevel, newLevel, characterImage, onClose,
  expGained, maxExp,
}) {
  const hasXP   = expGained != null && maxExp != null;
  const [stage,   setStage]   = useState(hasXP ? 'xp' : 'boom');
  const [barFull, setBarFull] = useState(false);
  const stageRef   = useRef(stage);
  const closedRef  = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  stageRef.current   = stage;

  const confetti = useMemo(() =>
    Array.from({ length: 60 }, (_, i) => ({
      id:       i,
      left:     Math.random() * 100,
      delay:    Math.random() * 1.3,
      duration: 1.8 + Math.random() * 1.6,
      color:    CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size:     5 + Math.random() * 11,
      rotation: Math.random() * 360,
      drift:    (Math.random() - 0.5) * 300,
      isCircle: Math.random() > 0.45,
    }))
  , []);

  const close = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    onCloseRef.current?.();
  };

  // Stage xp → boom
  useEffect(() => {
    if (!hasXP) return;
    const t1 = setTimeout(() => setBarFull(true), 400);
    const t2 = setTimeout(() => {
      if (stageRef.current === 'xp') setStage('boom');
    }, 2300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Stage boom → reveal
  useEffect(() => {
    if (stage !== 'boom') return;
    const t = setTimeout(() => setStage('reveal'), 1700);
    return () => clearTimeout(t);
  }, [stage]);

  // Stage reveal → close
  useEffect(() => {
    if (stage !== 'reveal') return;
    const t = setTimeout(close, 4500);
    return () => clearTimeout(t);
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  const prevStats = getStats(prevLevel);
  const newStats  = getStats(newLevel);

  /* ── 1단계: XP 획득 + 경험치 바 ──────────────────────────── */
  if (stage === 'xp') {
    return (
      <div
        className="fixed inset-0 z-[9999] flex flex-col items-center justify-center cursor-pointer"
        style={{ background: 'radial-gradient(ellipse at center, #1e0a3c 0%, #0a0a1a 100%)' }}
        onClick={() => {
          setBarFull(true);
          setTimeout(() => {
            if (stageRef.current === 'xp') setStage('boom');
          }, 250);
        }}
      >
        <div className="flex flex-col items-center gap-6 pointer-events-none select-none">
          {/* 캐릭터 (어두운) */}
          <div
            className="w-32 h-32 rounded-3xl overflow-hidden border-2 border-amber-400/40"
            style={{ background: 'rgba(255,255,255,0.04)', opacity: 0.65 }}
          >
            {characterImage
              ? <img src={characterImage} alt="" className="w-full h-full object-contain"
                  style={{ imageRendering: 'pixelated', transform: 'scale(2.2)', transformOrigin: 'center' }} />
              : <div className="w-full h-full flex items-center justify-center text-6xl">🧑‍🎓</div>
            }
          </div>

          {/* +XP 슉 올라감 */}
          <div className="relative h-16 flex items-center justify-center w-64">
            <div
              className="animate-xp-rise absolute text-4xl font-black text-yellow-300"
              style={{ textShadow: '0 0 24px rgba(253,224,71,0.9), 0 0 48px rgba(251,191,36,0.5)' }}
            >
              +{expGained} XP ✨
            </div>
          </div>

          {/* 경험치 바 */}
          <div className="w-72">
            <div className="flex justify-between text-xs font-bold mb-2">
              <span className="text-amber-400">Lv.{prevLevel}</span>
              <span className="text-slate-400">{expGained} / {maxExp} XP</span>
            </div>
            <div className="h-5 bg-white/10 rounded-full overflow-hidden border border-white/20 relative">
              <div
                className="h-full rounded-full"
                style={{
                  width: barFull ? '100%' : '2%',
                  transition: 'width 1.45s cubic-bezier(0.25, 1, 0.5, 1)',
                  background: 'linear-gradient(90deg, #b45309, #fbbf24, #fde68a)',
                  boxShadow: '0 0 18px rgba(251,191,36,0.7)',
                }}
              />
              {barFull && (
                <div
                  className="absolute inset-0 animate-bar-flash rounded-full"
                  style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)' }}
                />
              )}
            </div>
            <div className="h-5 mt-1 text-center">
              {barFull && (
                <span className="text-amber-300 text-xs font-extrabold animate-bounce inline-block">
                  MAX! 🔥
                </span>
              )}
            </div>
          </div>

          <p className="text-slate-600 text-xs animate-pulse">탭하여 건너뛰기</p>
        </div>
      </div>
    );
  }

  /* ── 2단계: LEVEL UP! 폭발 + 컨페티 ─────────────────────── */
  if (stage === 'boom') {
    return (
      <div
        className="fixed inset-0 z-[9999] flex flex-col items-center justify-center cursor-pointer overflow-hidden"
        style={{ background: 'radial-gradient(ellipse at center, #3d1500 0%, #0a0a1a 100%)' }}
        onClick={() => setStage('reveal')}
      >
        {/* 순간 플래시 */}
        <div
          className="absolute inset-0 pointer-events-none animate-screen-flash"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(251,191,36,0.95) 0%, rgba(251,191,36,0.15) 60%, transparent 100%)',
          }}
        />

        {/* 빛줄기 */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none animate-lvlup-ray">
          <div style={{
            width: '200vmax', height: '200vmax', borderRadius: '50%',
            background: 'conic-gradient(from 0deg, transparent 0deg, rgba(251,191,36,0.14) 7deg, transparent 14deg, transparent 42deg, rgba(251,191,36,0.08) 49deg, transparent 56deg)',
          }} />
        </div>

        {/* 컨페티 */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          {confetti.map(p => (
            <div
              key={p.id}
              style={{
                position: 'absolute',
                left: `${p.left}%`,
                top: '-16px',
                width:  `${p.size}px`,
                height: `${p.size * (p.isCircle ? 1 : 1.7)}px`,
                background: p.color,
                borderRadius: p.isCircle ? '50%' : '3px',
                animation: `confetti-fall ${p.duration}s ease-in ${p.delay}s both`,
                '--drift': `${p.drift}px`,
              }}
            />
          ))}
        </div>

        {/* LEVEL UP! 텍스트 */}
        <div className="pointer-events-none select-none flex flex-col items-center gap-2 relative z-10">
          <div className="animate-lvlup-boom text-center">
            <div className="text-6xl mb-1">🎉</div>
            <div
              className="font-black text-6xl tracking-widest text-amber-300 animate-lvlup-glow"
              style={{ letterSpacing: '0.12em' }}
            >
              LEVEL UP!
            </div>
            <div className="text-6xl mt-1">🎉</div>
          </div>

          <div className="flex items-center gap-4 mt-4 animate-lvlup-level">
            <span className="text-slate-500 line-through text-2xl font-bold">Lv.{prevLevel}</span>
            <span className="text-amber-400 text-4xl font-black">→</span>
            <span
              className="text-amber-200 text-4xl font-black animate-lvlup-num-change"
              style={{ textShadow: '0 0 20px rgba(251,191,36,0.8)' }}
            >
              Lv.{newLevel}
            </span>
          </div>
        </div>

        <p className="text-slate-600 text-xs animate-pulse absolute bottom-10">탭하여 계속</p>
      </div>
    );
  }

  /* ── 3단계: 스탯 공개 ───────────────────────────────────── */
  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center cursor-pointer animate-lvlup-overlay"
      style={{ background: 'radial-gradient(ellipse at center, #1e0a3c 0%, #0a0a1a 100%)' }}
      onClick={close}
      onAnimationEnd={(e) => { if (e.animationName === 'lvlup-overlay') close(); }}
    >
      {/* 빛줄기 회전 */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden animate-lvlup-ray">
        <div style={{
          width: '200vmax', height: '200vmax', borderRadius: '50%',
          background: 'conic-gradient(from 0deg, transparent 0deg, rgba(251,191,36,0.07) 10deg, transparent 20deg, transparent 50deg, rgba(167,139,250,0.05) 60deg, transparent 70deg)',
        }} />
      </div>

      <div className="relative flex flex-col items-center gap-4 pointer-events-none select-none">
        {/* 캐릭터 이미지 */}
        <div className="animate-lvlup-char relative z-10">
          <div className="absolute inset-0 rounded-3xl border-4 border-amber-400 animate-pulse" />
          <div
            className="w-40 h-40 rounded-3xl overflow-hidden border-4 border-amber-400 shadow-[0_0_40px_rgba(251,191,36,0.65)]"
            style={{ background: 'rgba(255,255,255,0.05)' }}
          >
            {characterImage
              ? <img src={characterImage} alt="" className="w-full h-full object-contain"
                  style={{ imageRendering: 'pixelated', transform: 'scale(2.2)', transformOrigin: 'center' }} />
              : <div className="w-full h-full flex items-center justify-center text-7xl">🧑‍🎓</div>
            }
          </div>
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-400 to-orange-400 text-amber-900 font-extrabold text-xs px-3 py-1 rounded-full shadow-lg whitespace-nowrap animate-bounce">
            Lv.{newLevel}
          </div>
        </div>

        {/* LEVEL UP! */}
        <div className="animate-lvlup-text mt-4 text-center z-10">
          <div className="font-extrabold text-5xl tracking-widest text-amber-300 animate-lvlup-glow">
            LEVEL UP!
          </div>
          <div className="animate-lvlup-level text-slate-300 text-xl font-bold mt-2">
            <span className="text-slate-500 line-through mr-2">Lv.{prevLevel}</span>
            <span className="text-amber-400 text-2xl font-extrabold">→ Lv.{newLevel}</span>
          </div>
        </div>

        {/* 스탯 카드 */}
        <div className="flex gap-2 mt-2 z-10">
          {STAT_META.map(({ key, label, icon }, idx) => {
            const diff = newStats[key] - prevStats[key];
            return (
              <div
                key={key}
                className="animate-lvlup-stat bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-3 py-2 text-center"
                style={{ animationDelay: `${0.1 + idx * 0.07}s` }}
              >
                <div className="text-base mb-0.5">{icon}</div>
                <div className="text-[10px] text-slate-400 font-bold">{label}</div>
                <div className="text-emerald-400 text-xs font-extrabold">+{diff}</div>
              </div>
            );
          })}
        </div>

        <p className="text-slate-500 text-xs mt-3 z-10 animate-pulse">탭하여 닫기</p>
        <div className="w-48 h-0.5 bg-white/10 rounded-full overflow-hidden z-10">
          <div className="h-full bg-amber-400/60 rounded-full animate-lvlup-dismiss" />
        </div>
      </div>
    </div>
  );
}
