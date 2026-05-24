import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';

const MEDALS = ['🥇', '🥈', '🥉', '4위', '5위'];

const CATEGORIES = [
  {
    id: 'level',
    label: '⭐ 레벨 왕',
    gradient: 'from-amber-500 to-yellow-400',
    sort: (a, b) => (b.level || 1) - (a.level || 1) || (b.exp || 0) - (a.exp || 0),
    value: s => `Lv.${s.level || 1}`,
  },
  {
    id: 'gold',
    label: '💰 골드 부자',
    gradient: 'from-yellow-500 to-amber-400',
    sort: (a, b) => (b.gold || 0) - (a.gold || 0),
    value: s => `${(s.gold || 0).toLocaleString()}G`,
  },
  {
    id: 'diamond',
    label: '💎 다이아 부자',
    gradient: 'from-cyan-500 to-blue-400',
    sort: (a, b) => (b.diamonds || 0) - (a.diamonds || 0),
    value: s => `${(s.diamonds || 0).toLocaleString()}💎`,
  },
  {
    id: 'enhance',
    label: '🔮 강화 달인',
    gradient: 'from-purple-500 to-indigo-400',
    sort: (a, b) => {
      const sum = s => (s.equipInventory || []).reduce((t, e) => t + (e.stars || 0), 0);
      return sum(b) - sum(a);
    },
    value: s => `★${(s.equipInventory || []).reduce((t, e) => t + (e.stars || 0), 0)}`,
  },
];

export default function HallOfFame({ studentCode }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState('level');

  useEffect(() => {
    if (!studentCode) return;
    (async () => {
      const mySnap = await getDocs(query(collection(db, 'students'), where('studentCode', '==', studentCode)));
      if (mySnap.empty) { setLoading(false); return; }
      const myData = mySnap.docs[0].data();
      if (!myData.teacherUid) { setLoading(false); return; }

      const allSnap = await getDocs(query(collection(db, 'students'), where('teacherUid', '==', myData.teacherUid)));
      setStudents(allSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    })();
  }, [studentCode]);

  if (loading) return (
    <div className="flex items-center justify-center h-full text-slate-400">불러오는 중...</div>
  );

  const cat    = CATEGORIES.find(c => c.id === activeTab);
  const ranked = [...students].sort(cat.sort).slice(0, 5);

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
      <div className={`bg-gradient-to-br ${cat.gradient} p-1 rounded-3xl shadow-lg`}>
        <div className="bg-white rounded-[20px] p-5 space-y-3">
          {ranked.length === 0 ? (
            <div className="text-center py-8 text-slate-400">학생 데이터가 없습니다</div>
          ) : ranked.map((s, i) => {
            const isMe = s.studentCode === studentCode;
            return (
              <div
                key={s.id}
                className={`flex items-center gap-4 p-3 rounded-2xl transition-colors
                  ${isMe ? 'bg-indigo-50 border-2 border-indigo-300' : 'border-2 border-transparent hover:bg-slate-50'}`}
              >
                <span className="text-2xl w-9 text-center shrink-0">{MEDALS[i]}</span>
                <div className="flex-1 min-w-0">
                  <div className={`font-extrabold truncate ${isMe ? 'text-indigo-700' : 'text-slate-800'}`}>
                    {s.name || s.studentCode}
                    {isMe && (
                      <span className="ml-2 text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full align-middle">나</span>
                    )}
                  </div>
                </div>
                <div className={`font-extrabold text-sm shrink-0 ${isMe ? 'text-indigo-600' : 'text-slate-500'}`}>
                  {cat.value(s)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 내 순위 */}
      {(() => {
        const myRank = [...students].sort(cat.sort).findIndex(s => s.studentCode === studentCode);
        if (myRank < 0) return null;
        return (
          <div className="mt-4 text-center text-sm text-slate-500">
            내 순위: <span className="font-extrabold text-indigo-600">{myRank + 1}위</span> / {students.length}명
          </div>
        );
      })()}
    </div>
  );
}
