import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';

const CATEGORIES = [
  {
    id: 'level',
    label: '⭐ 레벨 왕',
    gradient: 'from-amber-500 to-yellow-400',
    bg: 'bg-amber-50',
    sort: (a, b) => (b.level || 1) - (a.level || 1) || (b.exp || 0) - (a.exp || 0),
    value: s => `Lv.${s.level || 1}`,
  },
  {
    id: 'gold',
    label: '💰 골드 부자',
    gradient: 'from-yellow-500 to-amber-400',
    bg: 'bg-yellow-50',
    sort: (a, b) => (b.gold || 0) - (a.gold || 0),
    value: s => `${(s.gold || 0).toLocaleString()}G`,
  },
  {
    id: 'diamond',
    label: '💎 다이아 부자',
    gradient: 'from-cyan-500 to-blue-400',
    bg: 'bg-cyan-50',
    sort: (a, b) => (b.diamonds || 0) - (a.diamonds || 0),
    value: s => `${(s.diamonds || 0).toLocaleString()}💎`,
  },
  {
    id: 'enhance',
    label: '🔮 강화 달인',
    gradient: 'from-purple-500 to-indigo-400',
    bg: 'bg-purple-50',
    sort: (a, b) => {
      const sum = s => (s.equipInventory || []).reduce((t, e) => t + (e.stars || 0), 0);
      return sum(b) - sum(a);
    },
    value: s => `★${(s.equipInventory || []).reduce((t, e) => t + (e.stars || 0), 0)}`,
  },
];

function RankBadge({ rank }) {
  if (rank === 1) return (
    <div className="w-10 h-10 shrink-0 flex items-center justify-center">
      <span className="text-3xl drop-shadow">🥇</span>
    </div>
  );
  if (rank === 2) return (
    <div className="w-10 h-10 shrink-0 flex items-center justify-center">
      <span className="text-3xl drop-shadow">🥈</span>
    </div>
  );
  if (rank === 3) return (
    <div className="w-10 h-10 shrink-0 flex items-center justify-center">
      <span className="text-3xl drop-shadow">🥉</span>
    </div>
  );
  return (
    <div className="w-10 h-10 shrink-0 flex items-center justify-center">
      <span
        className="text-lg font-black text-slate-400"
        style={{ fontFamily: "'Pretendard', 'Noto Sans KR', sans-serif", letterSpacing: '-0.04em' }}
      >
        {rank}
      </span>
    </div>
  );
}

export default function HallOfFame({ studentCode, teacherUid: propTeacherUid }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState('level');
  const [resolvedUid, setResolvedUid] = useState(propTeacherUid || null);

  useEffect(() => {
    if (propTeacherUid) { setResolvedUid(propTeacherUid); return; }
    if (!studentCode) return;
    (async () => {
      const mySnap = await getDocs(query(collection(db, 'students'), where('studentCode', '==', studentCode)));
      if (!mySnap.empty) setResolvedUid(mySnap.docs[0].data().teacherUid || null);
      else setLoading(false);
    })();
  }, [studentCode, propTeacherUid]);

  useEffect(() => {
    if (!resolvedUid) return;
    (async () => {
      const allSnap = await getDocs(query(collection(db, 'students'), where('teacherUid', '==', resolvedUid)));
      setStudents(allSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    })();
  }, [resolvedUid]);

  if (loading) return (
    <div className="flex items-center justify-center h-full text-slate-400">불러오는 중...</div>
  );

  const cat    = CATEGORIES.find(c => c.id === activeTab);
  const ranked = [...students].sort(cat.sort).slice(0, 10);

  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-2xl font-extrabold text-slate-800 mb-6">🏆 명예의 전당</h1>

      {/* 카테고리 탭 */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {CATEGORIES.map(c => (
          <button
            key={c.id}
            onClick={() => setActiveTab(c.id)}
            className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors
              ${activeTab === c.id ? 'bg-indigo-600 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300'}`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* 랭킹 카드 */}
      <div className={`bg-gradient-to-br ${cat.gradient} p-0.5 rounded-3xl shadow-lg`}>
        <div className="bg-white rounded-[22px] overflow-hidden">
          {ranked.length === 0 ? (
            <div className="text-center py-12 text-slate-400">학생 데이터가 없습니다</div>
          ) : ranked.map((s, i) => {
            const rank = i + 1;
            const isMe = s.studentCode === studentCode;
            const isTop3 = rank <= 3;
            return (
              <div
                key={s.id}
                className={`flex items-center gap-3 px-5 py-3 transition-colors
                  ${isTop3 ? (cat.bg + ' border-b border-white/60') : 'border-b border-slate-50'}
                  ${isMe ? 'ring-2 ring-inset ring-indigo-300 bg-indigo-50' : ''}
                  ${i === ranked.length - 1 ? 'border-b-0' : ''}
                `}
              >
                <RankBadge rank={rank} />
                {s.characterImage ? (
                  <img
                    src={s.characterImage}
                    alt=""
                    className="w-9 h-9 rounded-xl object-cover shrink-0 border border-slate-100"
                    style={{ imageRendering: 'pixelated' }}
                  />
                ) : (
                  <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 text-lg">🧑‍🎓</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className={`font-extrabold truncate text-sm ${isMe ? 'text-indigo-700' : isTop3 ? 'text-slate-800' : 'text-slate-600'}`}>
                    {s.name || s.studentCode}
                    {isMe && (
                      <span className="ml-2 text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full align-middle">나</span>
                    )}
                  </div>
                </div>
                <div className={`font-extrabold text-sm shrink-0 ${isMe ? 'text-indigo-600' : isTop3 ? 'text-slate-700' : 'text-slate-400'}`}>
                  {cat.value(s)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 내 순위 */}
      {studentCode && (() => {
        const myRank = [...students].sort(cat.sort).findIndex(s => s.studentCode === studentCode);
        if (myRank < 0) return null;
        return (
          <div className="mt-4 text-center text-sm text-slate-500 bg-white rounded-2xl py-3 border border-slate-100 shadow-sm">
            내 순위:{' '}
            <span
              className="font-black text-indigo-600 text-base"
              style={{ fontFamily: "'Pretendard', 'Noto Sans KR', sans-serif" }}
            >
              {myRank + 1}위
            </span>{' '}
            / {students.length}명
          </div>
        );
      })()}
    </div>
  );
}
