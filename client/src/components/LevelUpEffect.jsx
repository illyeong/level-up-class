import React, { useEffect, useState } from 'react';
import Lottie from 'lottie-react';
import { motion, AnimatePresence } from 'framer-motion';

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

const CSS_STARS = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * 360 + (i % 3) * 15;
  const dist  = 90 + (i % 4) * 30;
  const rad   = (angle * Math.PI) / 180;
  return {
    tx:    Math.round(Math.cos(rad) * dist),
    ty:    Math.round(Math.sin(rad) * dist),
    delay: i * 0.07,
  };
});

// ── Framer Motion variants ───────────────────────────────────
const overlayVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.4 } },
  exit:    { opacity: 0, transition: { duration: 0.5 } },
};

const charVariants = {
  hidden:  { scale: 0.3, y: 40, opacity: 0 },
  visible: {
    scale: 1, y: 0, opacity: 1,
    transition: { type: 'spring', stiffness: 260, damping: 18, delay: 0.2 },
  },
};

const textVariants = {
  hidden:  { scale: 0, rotate: -10, opacity: 0 },
  visible: {
    scale: 1, rotate: 0, opacity: 1,
    transition: { type: 'spring', stiffness: 300, damping: 15, delay: 0.6 },
  },
};

const levelVariants = {
  hidden:  { scale: 0.4, opacity: 0 },
  visible: {
    scale: 1, opacity: 1,
    transition: { type: 'spring', stiffness: 400, damping: 20, delay: 0.9 },
  },
};

const statContainerVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 1.15 } },
};

const statItemVariants = {
  hidden:  { y: 20, opacity: 0 },
  visible: {
    y: 0, opacity: 1,
    transition: { type: 'spring', stiffness: 300, damping: 20 },
  },
};

const starVariants = (tx, ty, delay) => ({
  hidden:  { x: 0, y: 0, scale: 1, opacity: 1 },
  visible: {
    x: tx, y: ty, scale: 0,
    opacity: [1, 1, 0],
    transition: { duration: 1.2, delay, ease: 'easeOut' },
  },
});

export default function LevelUpEffect({ prevLevel, newLevel, characterImage, onClose }) {
  const [show, setShow]                 = useState(true);
  const [confettiData, setConfettiData] = useState(null);
  const [starsData, setStarsData]       = useState(null);
  const [progress, setProgress]         = useState(1);

  const prevStats = getStats(prevLevel);
  const newStats  = getStats(newLevel);

  // Lottie JSON 로드
  useEffect(() => {
    fetch('/lottie-confetti.json').then(r => r.json()).then(setConfettiData).catch(() => {});
    fetch('/lottie-stars.json').then(r => r.json()).then(setStarsData).catch(() => {});
  }, []);

  // 타이머 바 진행
  useEffect(() => {
    const start = performance.now();
    const total = 4800;
    let raf;
    const tick = (now) => {
      const elapsed = now - start;
      setProgress(Math.max(0, 1 - elapsed / total));
      if (elapsed < total) raf = requestAnimationFrame(tick);
      else { setShow(false); setTimeout(onClose, 500); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onClose]);

  const close = () => { setShow(false); setTimeout(onClose, 500); };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="levelup-overlay"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center cursor-pointer"
          style={{ background: 'radial-gradient(ellipse at center, #1e0a3c 0%, #0a0a1a 100%)' }}
          onClick={close}
        >
          {/* Lottie 컨페티 (전체화면) */}
          {confettiData && (
            <div className="absolute inset-0 pointer-events-none">
              <Lottie animationData={confettiData} loop={false} autoplay
                style={{ width: '100%', height: '100%' }} />
            </div>
          )}

          {/* 빛줄기 (Framer Motion 회전) */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden"
            animate={{ rotate: 360 }}
            transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
          >
            <div style={{
              width: '200vmax', height: '200vmax', borderRadius: '50%',
              background: 'conic-gradient(from 0deg, transparent 0deg, rgba(251,191,36,0.07) 10deg, transparent 20deg, transparent 50deg, rgba(167,139,250,0.05) 60deg, transparent 70deg)',
            }} />
          </motion.div>

          {/* 중앙 콘텐츠 */}
          <div className="relative flex flex-col items-center gap-4 pointer-events-none select-none">

            {/* Lottie 별 or CSS 파티클 fallback */}
            {starsData ? (
              <div className="absolute -inset-24 pointer-events-none">
                <Lottie animationData={starsData} loop autoplay
                  style={{ width: '100%', height: '100%', opacity: 0.9 }} />
              </div>
            ) : (
              CSS_STARS.map((s, i) => (
                <motion.div
                  key={i}
                  className="absolute text-lg"
                  variants={starVariants(s.tx, s.ty, s.delay)}
                  initial="hidden"
                  animate="visible"
                >
                  ⭐
                </motion.div>
              ))
            )}

            {/* 캐릭터 이미지 */}
            <motion.div
              variants={charVariants}
              initial="hidden"
              animate="visible"
              className="relative z-10"
            >
              {/* 골드 링 pulse */}
              <motion.div
                className="absolute inset-0 rounded-3xl border-4 border-amber-400"
                animate={{ scale: [1, 1.12, 1], opacity: [0.8, 0.3, 0.8] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              />
              <div className="w-40 h-40 rounded-3xl overflow-hidden border-4 border-amber-400 shadow-[0_0_40px_rgba(251,191,36,0.65)]"
                style={{ background: 'rgba(255,255,255,0.05)' }}>
                {characterImage
                  ? <img src={characterImage} alt="" className="w-full h-full object-contain"
                      style={{ imageRendering: 'pixelated', transform: 'scale(2.2)', transformOrigin: 'center' }} />
                  : <div className="w-full h-full flex items-center justify-center text-7xl">🧑‍🎓</div>
                }
              </div>
              <motion.div
                className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-400 to-orange-400 text-amber-900 font-extrabold text-xs px-3 py-1 rounded-full shadow-lg whitespace-nowrap"
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
              >
                Lv.{newLevel}
              </motion.div>
            </motion.div>

            {/* LEVEL UP! */}
            <motion.div
              variants={textVariants}
              initial="hidden"
              animate="visible"
              className="mt-4 text-center z-10"
            >
              <motion.div
                className="font-extrabold text-5xl tracking-widest text-amber-300"
                animate={{
                  textShadow: [
                    '0 0 12px #fbbf24, 0 0 24px #f59e0b',
                    '0 0 28px #fbbf24, 0 0 56px #f59e0b, 0 0 80px #fde68a',
                    '0 0 12px #fbbf24, 0 0 24px #f59e0b',
                  ],
                }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut', delay: 1.2 }}
              >
                LEVEL UP!
              </motion.div>
              <motion.div
                variants={levelVariants}
                initial="hidden"
                animate="visible"
                className="text-slate-300 text-xl font-bold mt-2"
              >
                <span className="text-slate-500 line-through mr-2">Lv.{prevLevel}</span>
                <span className="text-amber-400 text-2xl font-extrabold">→ Lv.{newLevel}</span>
              </motion.div>
            </motion.div>

            {/* 스탯 카드 */}
            <motion.div
              variants={statContainerVariants}
              initial="hidden"
              animate="visible"
              className="flex gap-2 mt-2 z-10"
            >
              {STAT_META.map(({ key, label, icon }) => {
                const diff = newStats[key] - prevStats[key];
                return (
                  <motion.div
                    key={key}
                    variants={statItemVariants}
                    whileHover={{ scale: 1.1, y: -3 }}
                    className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-3 py-2 text-center"
                  >
                    <div className="text-base mb-0.5">{icon}</div>
                    <div className="text-[10px] text-slate-400 font-bold">{label}</div>
                    <div className="text-emerald-400 text-xs font-extrabold">+{diff}</div>
                  </motion.div>
                );
              })}
            </motion.div>

            {/* 닫기 힌트 */}
            <motion.p
              className="text-slate-500 text-xs mt-3 z-10"
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              탭하여 닫기
            </motion.p>

            {/* 타이머 바 */}
            <div className="w-48 h-0.5 bg-white/10 rounded-full overflow-hidden z-10">
              <motion.div
                className="h-full bg-amber-400/60 rounded-full origin-left"
                style={{ scaleX: progress }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
