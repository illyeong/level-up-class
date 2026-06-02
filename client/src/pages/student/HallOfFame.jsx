import React, { useState, useEffect, useRef } from 'react';
import { collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  getCosmeticById,
  getHallOfFameDateKey,
  HALL_OF_FAME_FRAME_ID,
} from '../../data/avatarCosmetics';

const sumEnhanceStars = s => (s.equipInventory || []).reduce((t, e) => t + (e.stars || 0), 0);

const CATEGORIES = [
  {
    id: 'level',
    label: '⭐ 레벨 왕',
    gradient: 'from-amber-500 to-yellow-400',
    bg: 'bg-amber-50',
    sort: (a, b) => (b.level || 1) - (a.level || 1) || (b.exp || 0) - (a.exp || 0),
    value: s => `Lv.${s.level || 1}`,
    qualifies: s => (s.level || 1) > 1 || (s.exp || 0) > 0,
  },
  {
    id: 'gold',
    label: '💰 골드 부자',
    gradient: 'from-yellow-500 to-amber-400',
    bg: 'bg-yellow-50',
    sort: (a, b) => (b.gold || 0) - (a.gold || 0),
    value: s => `${(s.gold || 0).toLocaleString()}G`,
    qualifies: s => (s.gold || 0) > 0,
  },
  {
    id: 'diamond',
    label: '💎 다이아 부자',
    gradient: 'from-cyan-500 to-blue-400',
    bg: 'bg-cyan-50',
    sort: (a, b) => (b.diamonds || 0) - (a.diamonds || 0),
    value: s => `${(s.diamonds || 0).toLocaleString()}💎`,
    qualifies: s => (s.diamonds || 0) > 0,
  },
  {
    id: 'arena',
    label: '⚔️ 투기장 왕',
    gradient: 'from-rose-500 to-orange-400',
    bg: 'bg-rose-50',
    sort: (a, b) => (b.arenaWins || 0) - (a.arenaWins || 0),
    value: s => `${s.arenaWins || 0}승`,
    qualifies: s => (s.arenaWins || 0) > 0,
  },
  {
    id: 'enhance',
    label: '🔮 강화 달인',
    gradient: 'from-purple-500 to-indigo-400',
    bg: 'bg-purple-50',
    sort: (a, b) => sumEnhanceStars(b) - sumEnhanceStars(a),
    value: s => `★${sumEnhanceStars(s)}`,
    qualifies: s => sumEnhanceStars(s) > 0,
  },
];

const sameStringArray = (a = [], b = []) => {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
};

const getTopStudents = (category, list) => {
  if (!list.length) return [];
  const sorted = [...list].sort(category.sort);
  const top = sorted[0];
  if (!category.qualifies(top)) return [];
  const winners = sorted.filter(s => category.sort(s, top) === 0 && category.sort(top, s) === 0);
  if (winners.length === list.length) return [];
  return winners;
};

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

export default function HallOfFame({ studentCode, teacherUid: propTeacherUid, onHallFrameChange }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState('level');
  const [resolvedUid, setResolvedUid] = useState(propTeacherUid || null);
  const [arenaWinsMap, setArenaWinsMap] = useState({});
  const [arenaWinsLoaded, setArenaWinsLoaded] = useState(false);
  const awardRunKeyRef = useRef('');

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

  useEffect(() => {
    if (students.length === 0) {
      setArenaWinsLoaded(true);
      setArenaWinsMap({});
      return;
    }
    const classIds = students.map(s => s.id);
    (async () => {
      try {
        setArenaWinsLoaded(false);
        const logMap = {};
        const chunks = [];
        for (let i = 0; i < classIds.length; i += 30) chunks.push(classIds.slice(i, i + 30));
        const snaps = await Promise.all(
          chunks.flatMap(chunk => [
            getDocs(query(collection(db, 'arenaLogs'), where('studentId',  'in', chunk))),
            getDocs(query(collection(db, 'arenaLogs'), where('opponentId', 'in', chunk))),
          ])
        );
        snaps.forEach(snap => snap.docs.forEach(d => { logMap[d.id] = d.data(); }));
        const winsMap = {};
        const idSet = new Set(classIds);
        Object.values(logMap).forEach(log => {
          const winner = log.isWin ? log.studentId : log.opponentId;
          if (idSet.has(winner)) winsMap[winner] = (winsMap[winner] || 0) + 1;
        });
        setArenaWinsMap(winsMap);
      } catch (e) {
        console.error(e);
        setArenaWinsMap({});
      } finally {
        setArenaWinsLoaded(true);
      }
    })();
  }, [students]);

  useEffect(() => {
    if (!resolvedUid || students.length === 0 || !arenaWinsLoaded) return;

    const dateKey = getHallOfFameDateKey();
    const displayList = students.map(s => ({ ...s, arenaWins: arenaWinsMap[s.id] || 0 }));
    const desiredById = new Map();

    CATEGORIES.forEach(category => {
      const winners = getTopStudents(category, displayList);
      winners.forEach(student => {
        const current = desiredById.get(student.id) || new Set();
        current.add(category.id);
        desiredById.set(student.id, current);
      });
    });

    const desiredEntries = [...desiredById.entries()]
      .map(([id, set]) => [id, [...set].sort()])
      .sort(([a], [b]) => a.localeCompare(b));
    const runKey = `${resolvedUid}_${dateKey}_${JSON.stringify(desiredEntries)}`;
    if (awardRunKeyRef.current === runKey) return;
    awardRunKeyRef.current = runKey;

    const updates = [];
    const nextStudents = students.map(student => {
      const desiredCategories = [...(desiredById.get(student.id) || new Set())].sort();
      const currentFrame = student.hallOfFameFrame || {};
      const currentCategories = currentFrame.dateKey === dateKey ? [...(currentFrame.categories || [])].sort() : [];
      if (sameStringArray(currentCategories, desiredCategories)) return student;

      const hallOfFameFrame = desiredCategories.length > 0
        ? { dateKey, frameId: HALL_OF_FAME_FRAME_ID, categories: desiredCategories, awardedAt: new Date() }
        : { dateKey, frameId: null, categories: [], awardedAt: new Date() };

      updates.push(updateDoc(doc(db, 'students', student.id), {
        hallOfFameFrame: {
          ...hallOfFameFrame,
          awardedAt: serverTimestamp(),
        },
      }));
      return { ...student, hallOfFameFrame };
    });

    if (updates.length === 0) return;
    setStudents(nextStudents);
    const currentStudent = studentCode ? nextStudents.find(s => s.studentCode === studentCode) : null;
    if (currentStudent) onHallFrameChange?.(currentStudent.hallOfFameFrame);
    Promise.all(updates).catch(err => console.error('명예의 전당 프레임 지급 오류:', err));
  }, [arenaWinsLoaded, arenaWinsMap, resolvedUid, students]);

  if (loading) return (
    <div className="flex items-center justify-center h-full text-slate-400">불러오는 중...</div>
  );

  const cat = CATEGORIES.find(c => c.id === activeTab);
  const displayStudents = activeTab === 'arena'
    ? students.map(s => ({ ...s, arenaWins: arenaWinsMap[s.id] || 0 }))
    : students;
  const ranked = [...displayStudents].sort(cat.sort).slice(0, 10);
  const hallFrameStyle = getCosmeticById('frames', HALL_OF_FAME_FRAME_ID).style;
  const currentWinnerIds = new Set(getTopStudents(cat, displayStudents).map(s => s.id));

  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-2xl font-extrabold text-slate-800 mb-6">🏆 명예의 전당</h1>

      {/* 카테고리 탭 */}
      <div className="flex mb-6 overflow-x-auto scrollbar-none gap-1.5 pb-0.5">
        {CATEGORIES.map(c => (
          <button
            key={c.id}
            onClick={() => setActiveTab(c.id)}
            className={`shrink-0 px-3 py-2 rounded-xl font-bold text-xs whitespace-nowrap transition-colors
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
            const hasHallFrame = currentWinnerIds.has(s.id);
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
                  <div
                    className="w-20 h-20 rounded-xl bg-white border-2 border-slate-100 overflow-hidden shrink-0 flex items-center justify-center shadow-sm"
                    style={hasHallFrame ? hallFrameStyle : undefined}
                  >
                    <img
                      src={s.characterImage}
                      alt=""
                      className="w-full h-full object-contain scale-[2]"
                      style={{ imageRendering: 'pixelated' }}
                    />
                  </div>
                ) : (
                  <div
                    className="w-20 h-20 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 text-3xl shadow-sm"
                    style={hasHallFrame ? hallFrameStyle : undefined}
                  >
                    🧑‍🎓
                  </div>
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
        const myRank = [...displayStudents].sort(cat.sort).findIndex(s => s.studentCode === studentCode);
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
