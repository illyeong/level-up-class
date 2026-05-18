import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, getDoc, doc, setDoc, deleteDoc,
  serverTimestamp, query, where,
} from 'firebase/firestore';
import { db } from '../../firebase';

const SKILL_COLORS = {
  '인성':   'bg-purple-100 text-purple-700',
  '의사소통': 'bg-blue-100 text-blue-700',
  '성실성':  'bg-green-100 text-green-700',
  '창의성':  'bg-amber-100 text-amber-700',
  '협동심':  'bg-indigo-100 text-indigo-700',
  '자기관리': 'bg-slate-100 text-slate-600',
};

const DIFF = {
  easy:   { label: '쉬움',   cls: 'bg-emerald-100 text-emerald-700' },
  medium: { label: '보통',   cls: 'bg-amber-100 text-amber-700' },
  hard:   { label: '어려움', cls: 'bg-rose-100 text-rose-700' },
};

// ─────────────────────── QuestCard ───────────────────────────
function StudentQuestCard({ quest, completion, onToggleCheck, isBusy }) {
  const isChecked  = completion?.checked  === true;
  const isRewarded = completion?.rewarded === true;
  const isDaily    = quest.type === 'daily';
  const diff       = DIFF[quest.difficulty] || DIFF.easy;

  return (
    <div className={`bg-white rounded-2xl overflow-hidden shadow-sm transition-all
      ${isRewarded
        ? 'border-2 border-amber-300 shadow-md shadow-amber-100'
        : isChecked
          ? 'border-2 border-teal-300'
          : 'border-2 border-slate-200 hover:border-indigo-200 hover:shadow-md'}`}>

      {/* 상단 타입 띠 */}
      <div className={`px-4 py-2 flex items-center justify-between
        ${isRewarded
          ? 'bg-amber-50 border-b border-amber-200'
          : isDaily ? 'bg-sky-500' : 'bg-violet-500'}`}>
        <span className={`text-xs font-extrabold tracking-wide
          ${isRewarded ? 'text-amber-700' : 'text-white'}`}>
          {isRewarded ? '🏆 보상 완료' : isDaily ? '📅 일일퀘스트' : '📆 주간퀘스트'}
        </span>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full
            ${isRewarded ? 'bg-amber-100 text-amber-600' : 'bg-white/25 text-white'}`}>
            {diff.label}
          </span>
          {quest.selfCheck && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full
              ${isRewarded ? 'bg-teal-100 text-teal-600' : 'bg-white/25 text-white'}`}>
              자체체크
            </span>
          )}
        </div>
      </div>

      <div className="p-5">
        {/* 퀘스트 이름 + 설명 */}
        <h3 className={`text-lg font-extrabold mb-1 leading-snug
          ${isRewarded ? 'text-amber-800' : 'text-slate-800'}`}>
          {quest.title}
        </h3>
        {quest.description && (
          <p className="text-sm text-slate-500 mb-4 leading-relaxed">{quest.description}</p>
        )}

        {/* 보상 */}
        <div className="flex flex-wrap gap-2 mb-4">
          {quest.rewards?.exp > 0 && (
            <div className="flex items-center gap-1.5 bg-yellow-50 border border-yellow-200 px-3 py-1.5 rounded-xl">
              <span className="text-base">⭐</span>
              <span className="text-sm font-extrabold text-yellow-700">+{quest.rewards.exp} EXP</span>
            </div>
          )}
          {quest.rewards?.gold > 0 && (
            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl">
              <span className="text-base">🪙</span>
              <span className="text-sm font-extrabold text-amber-700">+{quest.rewards.gold} G</span>
            </div>
          )}
          {quest.rewards?.diamond > 0 && (
            <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-xl">
              <span className="text-base">💎</span>
              <span className="text-sm font-extrabold text-indigo-700">+{quest.rewards.diamond}</span>
            </div>
          )}
        </div>

        {/* 능력치 */}
        {quest.skills?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {quest.skills.map(skill => (
              <span key={skill}
                className={`text-xs font-semibold px-2.5 py-1 rounded-full ${SKILL_COLORS[skill] || 'bg-slate-100 text-slate-600'}`}>
                {skill} +1
              </span>
            ))}
          </div>
        )}

        {/* 액션 버튼 / 상태 표시 */}
        {isRewarded ? (
          <div className="py-3 bg-amber-50 text-amber-700 font-extrabold text-sm rounded-xl text-center border border-amber-200">
            🏆 보상을 받았어요!
          </div>
        ) : isChecked ? (
          <div>
            <div className="py-3 bg-teal-50 text-teal-700 font-bold text-sm rounded-xl text-center border border-teal-200">
              ✅ 완료! 선생님 확인을 기다리는 중...
            </div>
            {quest.selfCheck && (
              <button
                onClick={onToggleCheck}
                disabled={isBusy}
                className="mt-2 w-full py-1.5 text-xs text-slate-400 hover:text-rose-400 font-medium transition-colors disabled:opacity-50">
                취소하기
              </button>
            )}
          </div>
        ) : quest.selfCheck ? (
          <button
            onClick={onToggleCheck}
            disabled={isBusy}
            className={`w-full py-3 rounded-xl font-extrabold text-sm transition-all active:scale-95 disabled:opacity-50 shadow-md
              ${isDaily
                ? 'bg-sky-500 hover:bg-sky-600 text-white shadow-sky-200'
                : 'bg-violet-500 hover:bg-violet-600 text-white shadow-violet-200'}`}>
            {isBusy ? '처리 중...' : '완료 체크하기 ✓'}
          </button>
        ) : (
          <div className="py-3 bg-slate-50 text-slate-400 text-sm rounded-xl text-center border border-slate-200">
            🔒 선생님이 직접 확인합니다
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────── Main ─────────────────────────────────
function StudentQuestPage({ studentCode }) {
  const [quests, setQuests]           = useState([]);
  const [studentId, setStudentId]     = useState(null);
  const [studentName, setStudentName] = useState('');
  const [completions, setCompletions] = useState({});
  const [activeTab, setActiveTab]     = useState('all');
  const [isLoading, setIsLoading]     = useState(true);
  const [busyQuestId, setBusyQuestId] = useState(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        // 활성 퀘스트 로딩
        const questsSnap = await getDocs(collection(db, 'quests'));
        const activeQuests = questsSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(q => q.active !== false)
          .sort((a, b) => {
            if (a.type !== b.type) return a.type === 'daily' ? -1 : 1;
            return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
          });
        setQuests(activeQuests);

        // 학생 코드가 있으면 개인 데이터 로딩
        if (studentCode) {
          const sq = query(collection(db, 'students'), where('studentCode', '==', studentCode));
          const studentsSnap = await getDocs(sq);

          if (!studentsSnap.empty) {
            const sDoc = studentsSnap.docs[0];
            const sData = { id: sDoc.id, ...sDoc.data() };
            setStudentId(sDoc.id);
            setStudentName(sData.name || sData.studentCode);

            // 각 퀘스트의 이 학생 completion 로딩
            const compMap = {};
            await Promise.all(
              activeQuests.map(async quest => {
                const compDoc = await getDoc(doc(db, 'quests', quest.id, 'completions', sDoc.id));
                if (compDoc.exists()) compMap[quest.id] = compDoc.data();
              })
            );
            setCompletions(compMap);
          }
        }
      } catch (err) {
        console.error('퀘스트 페이지 로딩 에러:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [studentCode]);

  const toggleCheck = async (quest) => {
    if (!studentId) return;
    const current = completions[quest.id];
    if (current?.rewarded) return;

    setBusyQuestId(quest.id);
    try {
      const ref = doc(db, 'quests', quest.id, 'completions', studentId);
      if (current?.checked) {
        await deleteDoc(ref);
        setCompletions(prev => { const n = { ...prev }; delete n[quest.id]; return n; });
      } else {
        await setDoc(ref, { checked: true, checkedAt: serverTimestamp(), rewarded: false, rewardedBy: null });
        setCompletions(prev => ({ ...prev, [quest.id]: { checked: true, rewarded: false } }));
      }
    } catch (err) {
      console.error('체크 에러:', err);
    } finally {
      setBusyQuestId(null);
    }
  };

  const displayedQuests = quests.filter(q => {
    if (activeTab === 'daily')  return q.type === 'daily';
    if (activeTab === 'weekly') return q.type === 'weekly';
    return true;
  });

  const dailyCount  = quests.filter(q => q.type === 'daily').length;
  const weeklyCount = quests.filter(q => q.type === 'weekly').length;
  const doneCount   = Object.values(completions).filter(c => c.checked).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-64">
        <div className="text-slate-400 font-bold text-lg">불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 p-6">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">⚔️ 나의 퀘스트</h1>
          {studentCode && studentName && (
            <p className="text-sm text-slate-500 mt-0.5 font-medium">
              {studentName} · 완료 {doneCount} / {quests.length}개
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <div className="text-center bg-sky-50 border border-sky-200 rounded-xl px-4 py-2 min-w-[60px]">
            <div className="text-lg font-extrabold text-sky-600">{dailyCount}</div>
            <div className="text-[10px] text-sky-500 font-bold">일일</div>
          </div>
          <div className="text-center bg-violet-50 border border-violet-200 rounded-xl px-4 py-2 min-w-[60px]">
            <div className="text-lg font-extrabold text-violet-600">{weeklyCount}</div>
            <div className="text-[10px] text-violet-500 font-bold">주간</div>
          </div>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-2 mb-5">
        {[
          ['all',    '전체',         'bg-indigo-600'],
          ['daily',  '📅 일일퀘스트', 'bg-sky-500'],
          ['weekly', '📆 주간퀘스트', 'bg-violet-500'],
        ].map(([val, label, activeCls]) => (
          <button key={val} onClick={() => setActiveTab(val)}
            className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors
              ${activeTab === val
                ? `${activeCls} text-white shadow`
                : 'bg-white text-slate-600 border border-slate-200 hover:border-indigo-200'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* 로그인 안내 */}
      {!studentCode && (
        <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 font-medium">
          💡 교사 페이지에서 <strong>SINSEOK-5-01</strong>로 테스트 로그인하면 퀘스트를 직접 체크할 수 있습니다.
        </div>
      )}

      {/* 퀘스트 목록 */}
      {displayedQuests.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <div className="text-5xl mb-3">⚔️</div>
          <p className="font-bold text-lg text-slate-600">퀘스트가 없습니다</p>
          <p className="text-sm mt-1">선생님이 퀘스트를 만들면 여기에 표시돼요!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {displayedQuests.map(quest => (
            <StudentQuestCard
              key={quest.id}
              quest={quest}
              completion={completions[quest.id]}
              onToggleCheck={() => toggleCheck(quest)}
              isBusy={busyQuestId === quest.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default StudentQuestPage;
