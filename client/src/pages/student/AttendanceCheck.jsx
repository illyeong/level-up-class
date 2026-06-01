import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { getMaxExpForLevel } from '../../utils/leveling';

const calcLevelUp = (level, exp, maxExp, gained) => {
  let lv = level || 1;
  let ex = (exp || 0) + gained;
  let mx = getMaxExpForLevel(lv);
  let leveled = false;
  while (ex >= mx && lv < 99) { ex -= mx; lv++; mx = getMaxExpForLevel(lv); leveled = true; }
  return { level: lv, exp: ex, maxExp: mx, leveled };
};

const getRandReward = () => ({
  diamonds: [10, 20, 30, 40, 50][Math.floor(Math.random() * 5)],
  gold:     [50, 60, 70, 80, 90, 100][Math.floor(Math.random() * 6)],
  exp:      Math.floor(Math.random() * 51) + 50,
});

const today = () => new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });

// ── 색종이 컴포넌트 ─────────────────────────────────────────────
const COLORS = ['#FF6B6B','#FFE66D','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD','#FF9F43'];

function Confetti() {
  const particles = useRef(
    Array.from({ length: 36 }, (_, i) => ({
      id: i,
      color: COLORS[i % COLORS.length],
      left:  Math.random() * 100,
      dur:   0.9 + Math.random() * 1.2,
      delay: Math.random() * 0.6,
      size:  7 + Math.random() * 7,
      round: Math.random() > 0.4,
    }))
  ).current;

  useEffect(() => {
    const s = document.createElement('style');
    s.id = 'attendance-confetti-style';
    s.textContent = `
      @keyframes confettiFall {
        0%   { transform: translateY(-30px) rotate(0deg);   opacity: 1; }
        100% { transform: translateY(105vh) rotate(720deg); opacity: 0; }
      }
      @keyframes rewardFloat {
        0%   { transform: scale(0.3) translateY(0);    opacity: 0; }
        40%  { transform: scale(1.25) translateY(-18px); opacity: 1; }
        100% { transform: scale(1)   translateY(-36px); opacity: 0; }
      }
    `;
    if (!document.getElementById('attendance-confetti-style'))
      document.head.appendChild(s);
    return () => { document.getElementById('attendance-confetti-style')?.remove(); };
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-[60] overflow-hidden">
      {particles.map(p => (
        <div key={p.id} style={{
          position: 'absolute',
          left:   `${p.left}%`,
          top:    '-20px',
          width:  p.size,
          height: p.size,
          backgroundColor: p.color,
          borderRadius: p.round ? '50%' : '2px',
          animation: `confettiFall ${p.dur}s ${p.delay}s ease-in forwards`,
        }} />
      ))}
    </div>
  );
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────
export default function AttendanceCheck({ studentCode }) {
  const [status, setStatus]       = useState('idle');   // idle | loading | done | already
  const [reward, setReward]       = useState(null);
  const [showAnim, setShowAnim]   = useState(false);
  const [leveledUp, setLeveledUp] = useState(null);
  const studentRef                = useRef(null);

  useEffect(() => {
    if (!studentCode) return;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'students'), where('studentCode', '==', studentCode)));
        if (snap.empty) return;
        const d = snap.docs[0];
        studentRef.current = { id: d.id, ...d.data() };
        if (d.data().lastAttendanceDate === today()) {
          setStatus('already');
          // 오늘 받은 보상이 저장돼있으면 불러오기
          if (d.data().lastAttendanceReward) setReward(d.data().lastAttendanceReward);
        }
      } catch (e) { console.error(e); }
    })();
  }, [studentCode]);

  const handleCheck = async () => {
    if (!studentRef.current) return;
    setStatus('loading');

    const r = getRandReward();
    const s = studentRef.current;
    const { level, exp, maxExp, leveled } = calcLevelUp(s.level, s.exp, s.maxExp, r.exp);

    try {
      await updateDoc(doc(db, 'students', s.id), {
        diamonds:               (s.diamonds || 0) + r.diamonds,
        gold:                   (s.gold     || 0) + r.gold,
        exp, level, maxExp,
        lastAttendanceDate:     today(),
        lastAttendanceReward:   r,
      });
      studentRef.current = { ...s, diamonds: (s.diamonds||0)+r.diamonds, gold: (s.gold||0)+r.gold, exp, level, maxExp };
      setReward(r);
      if (leveled) setLeveledUp(level);
      setStatus('done');
      setShowAnim(true);
      setTimeout(() => setShowAnim(false), 2200);
    } catch (e) {
      console.error('출석 체크 에러:', e);
      setStatus('idle');
    }
  };

  // ── 이미 출석함 ───────────────────────────────────────────────
  if (status === 'already' || (status === 'done' && !showAnim)) {
    return (
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 flex flex-col items-center justify-center gap-2 min-h-[140px]">
        <div className="text-3xl">✅</div>
        <p className="font-extrabold text-slate-700 text-sm">오늘 출석 완료!</p>
        <p className="text-xs text-slate-400">내일 또 출석하면 보상을 받을 수 있어요</p>
        {reward && (
          <div className="flex gap-3 text-xs font-extrabold mt-1">
            <span className="text-blue-600">💎 +{reward.diamonds}</span>
            <span className="text-amber-600">🪙 +{reward.gold}</span>
            <span className="text-indigo-600">⭐ +{reward.exp}</span>
          </div>
        )}
      </div>
    );
  }

  // ── 보상 애니메이션 오버레이 ──────────────────────────────────
  if (status === 'done' && showAnim && reward) {
    return (
      <>
        <Confetti />
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl shadow-lg p-6 flex flex-col items-center justify-center gap-3 min-h-[140px] relative overflow-hidden">
          <div className="absolute inset-0 opacity-20 text-4xl select-none flex flex-wrap gap-2 p-2 overflow-hidden">
            {['⭐','💫','✨','🎊','🎉'].map((e,i) => <span key={i}>{e}</span>)}
          </div>
          <p className="text-white font-extrabold text-lg relative z-10">🎉 출석 보상!</p>
          {leveledUp && (
            <div className="bg-amber-400 text-amber-900 font-extrabold text-sm px-4 py-1 rounded-full animate-bounce relative z-10">
              🆙 레벨업! Lv.{leveledUp}
            </div>
          )}
          <div className="flex gap-4 relative z-10">
            {[
              { icon: '💎', val: `+${reward.diamonds}`, color: 'text-cyan-200' },
              { icon: '🪙', val: `+${reward.gold}G`,    color: 'text-yellow-200' },
              { icon: '⭐', val: `+${reward.exp} EXP`,  color: 'text-indigo-200' },
            ].map(({ icon, val, color }) => (
              <div key={val} className="flex flex-col items-center" style={{ animation: 'rewardFloat 2s ease-out forwards' }}>
                <span className="text-2xl">{icon}</span>
                <span className={`font-extrabold text-sm ${color}`}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  // ── 출석 버튼 ─────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 flex flex-col items-center justify-center gap-3 min-h-[140px]">
      <div className="text-3xl">📅</div>
      <p className="font-extrabold text-slate-700 text-sm">오늘 출석 체크</p>
      <p className="text-xs text-slate-400">💎 다이아 · 🪙 골드 · ⭐ 경험치 랜덤 지급!</p>
      <button
        onClick={handleCheck}
        disabled={status === 'loading'}
        className="px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-extrabold rounded-2xl text-sm shadow-md transition-all active:scale-95 disabled:opacity-50">
        {status === 'loading' ? '처리 중...' : '✋ 출석하기!'}
      </button>
    </div>
  );
}
