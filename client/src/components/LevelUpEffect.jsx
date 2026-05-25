import React, { useRef } from 'react';

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

export default function LevelUpEffect({ prevLevel, newLevel, characterImage, onClose }) {
  const closedRef  = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const prevStats = getStats(prevLevel);
  const newStats  = getStats(newLevel);

  const close = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    onCloseRef.current?.();
  };

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

      {/* 중앙 콘텐츠 */}
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
                style={{ animationDelay: `${1.15 + idx * 0.07}s` }}
              >
                <div className="text-base mb-0.5">{icon}</div>
                <div className="text-[10px] text-slate-400 font-bold">{label}</div>
                <div className="text-emerald-400 text-xs font-extrabold">+{diff}</div>
              </div>
            );
          })}
        </div>

        {/* 닫기 힌트 */}
        <p className="text-slate-500 text-xs mt-3 z-10 animate-pulse">
          탭하여 닫기
        </p>

        {/* 타이머 바 */}
        <div className="w-48 h-0.5 bg-white/10 rounded-full overflow-hidden z-10">
          <div className="h-full bg-amber-400/60 rounded-full animate-lvlup-dismiss" />
        </div>
      </div>
    </div>
  );
}
