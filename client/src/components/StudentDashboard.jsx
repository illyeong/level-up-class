import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, doc, setDoc, deleteDoc,
  query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import AttendanceCheck from '../pages/student/AttendanceCheck';

// ── 오늘의 퀘스트 위젯 ────────────────────────────────────────
function TodayQuestWidget({ studentId, teacherUid }) {
  const [quests, setQuests]           = useState([]);
  const [completions, setCompletions] = useState({});
  const [busyId, setBusyId]           = useState(null);
  const [isLoading, setIsLoading]     = useState(true);

  useEffect(() => {
    if (!studentId) { setIsLoading(false); return; }
    (async () => {
      try {
        let list = [];
        const isTestAccount = teacherUid === 'admin_master_001';
        if (teacherUid) {
          const snap = await getDocs(
            query(collection(db, 'quests'), where('active', '==', true), where('teacherUid', '==', teacherUid))
          );
          list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          // fallback은 테스트 계정에만 적용
          if (list.length === 0 && isTestAccount) {
            const snap2 = await getDocs(query(collection(db, 'quests'), where('active', '==', true)));
            list = snap2.docs.map(d => ({ id: d.id, ...d.data() })).filter(q => !q.teacherUid);
          }
        } else {
          const snap = await getDocs(query(collection(db, 'quests'), where('active', '==', true)));
          list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }
        const listSorted = list
          .sort((a, b) => {
            if (a.type !== b.type) return a.type === 'daily' ? -1 : 1;
            return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
          });
        setQuests(listSorted);

        const cMap = {};
        await Promise.all(list.map(async q => {
          const cSnap = await getDocs(collection(db, 'quests', q.id, 'completions'));
          const mine  = cSnap.docs.find(d => d.id === studentId);
          if (mine) cMap[q.id] = mine.data();
        }));

        // 매일반복 퀘스트: 어제 미보상 completion 삭제 (대시보드 자정 초기화)
        const todayMidnight = new Date();
        todayMidnight.setHours(0, 0, 0, 0);
        await Promise.all(
          list
            .filter(q => q.type === 'daily' && q.repeatDaily && q.active !== false)
            .map(async q => {
              const comp = cMap[q.id];
              if (!comp || comp.rewarded) return; // 보상된 건 유지
              const ts = comp.checkedAt;
              const checkedAt = ts?.toDate?.() ?? (ts?.seconds ? new Date(ts.seconds * 1000) : null);
              if (checkedAt && checkedAt < todayMidnight) {
                await deleteDoc(doc(db, 'quests', q.id, 'completions', studentId));
                delete cMap[q.id];
              }
            })
        );

        setCompletions(cMap);
      } catch (e) { console.error(e); }
      finally { setIsLoading(false); }
    })();
  }, [studentId]);

  const toggleCheck = async (quest) => {
    if (!studentId || busyId) return;
    const cur = completions[quest.id];
    if (cur?.rewarded) return;
    setBusyId(quest.id);
    try {
      const ref = doc(db, 'quests', quest.id, 'completions', studentId);
      if (cur?.checked) {
        await deleteDoc(ref);
        setCompletions(prev => { const n = { ...prev }; delete n[quest.id]; return n; });
      } else {
        await setDoc(ref, { checked: true, checkedAt: serverTimestamp(), rewarded: false, rewardedBy: null });
        setCompletions(prev => ({ ...prev, [quest.id]: { checked: true, rewarded: false } }));
      }
    } catch (e) { console.error(e); }
    finally { setBusyId(null); }
  };

  const visible = quests.filter(q => !completions[q.id]?.rewarded || !completions[q.id]?.acknowledgedAt);

  if (isLoading) return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 flex-1 flex flex-col">
      <h3 className="text-xl font-bold mb-3 text-slate-800">📜 오늘의 퀘스트</h3>
      <div className="flex items-center gap-2.5 py-4">
        <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin shrink-0" />
        <span className="text-sm text-slate-400">불러오는 중...</span>
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 flex-1 overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-extrabold text-slate-800">📜 오늘의 퀘스트</h3>
        <span className="text-xs text-slate-400 font-medium">{visible.length}개 진행 중</span>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-slate-400">
          <span className="text-3xl mb-2">🎉</span>
          <p className="font-bold text-sm">모든 퀘스트 완료!</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {visible.map(quest => {
            const comp      = completions[quest.id];
            const isChecked = comp?.checked === true;
            const isRewarded = comp?.rewarded === true;
            const isDaily   = quest.type === 'daily';

            return (
              <div key={quest.id}
                className={`rounded-xl border px-3 py-2.5 flex items-center gap-3 transition-all
                  ${isRewarded   ? 'border-amber-200 bg-amber-50'
                  : isChecked   ? 'border-teal-200 bg-teal-50'
                  : 'border-slate-200 bg-white hover:border-indigo-200'}`}>

                {/* 타입 도트 */}
                <div className={`w-2 h-2 rounded-full shrink-0
                  ${isDaily ? 'bg-sky-400' : 'bg-violet-400'}`} />

                {/* 제목 */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold truncate
                    ${isRewarded ? 'text-amber-700' : isChecked ? 'text-teal-700' : 'text-slate-800'}`}>
                    {quest.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full
                      ${isDaily ? 'bg-sky-100 text-sky-600' : 'bg-violet-100 text-violet-600'}`}>
                      {isDaily ? '일일' : '주간'}
                    </span>
                    {quest.rewards?.exp > 0 && (
                      <span className="text-[9px] text-yellow-600 font-bold">⭐+{quest.rewards.exp}</span>
                    )}
                    {quest.rewards?.gold > 0 && (
                      <span className="text-[9px] text-amber-600 font-bold">🪙+{quest.rewards.gold}</span>
                    )}
                    {quest.rewards?.diamond > 0 && (
                      <span className="text-[9px] text-indigo-600 font-bold">💎+{quest.rewards.diamond}</span>
                    )}
                  </div>
                </div>

                {/* 체크 버튼 or 상태 */}
                {isRewarded ? (
                  <span className="text-xs text-amber-600 font-bold shrink-0">🏆 완료</span>
                ) : isChecked ? (
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    <span className="text-[10px] text-teal-600 font-bold">✅ 체크됨</span>
                    {quest.selfCheck && (
                      <button onClick={() => toggleCheck(quest)} disabled={!!busyId}
                        className="text-[9px] text-slate-400 hover:text-rose-400 transition-colors">
                        취소
                      </button>
                    )}
                  </div>
                ) : quest.selfCheck ? (
                  <button
                    onClick={() => toggleCheck(quest)}
                    disabled={!!busyId}
                    className={`shrink-0 text-xs font-extrabold px-3 py-1.5 rounded-xl transition-all active:scale-95 disabled:opacity-50
                      ${isDaily
                        ? 'bg-sky-500 hover:bg-sky-600 text-white'
                        : 'bg-violet-500 hover:bg-violet-600 text-white'}`}>
                    {busyId === quest.id ? '...' : '완료 ✓'}
                  </button>
                ) : (
                  <span className="text-[10px] text-slate-400 shrink-0">교사확인</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const StudentDashboard = ({ studentCode }) => {
  const [studentData, setStudentData] = useState(null);
  const [isLoading, setIsLoading]     = useState(false);

  useEffect(() => {
    if (!studentCode) return;
    const load = async () => {
      setIsLoading(true);
      try {
        const q    = query(collection(db, 'students'), where('studentCode', '==', studentCode));
        const snap = await getDocs(q);
        if (!snap.empty) {
          setStudentData({ id: snap.docs[0].id, ...snap.docs[0].data() });
        }
      } catch (err) {
        console.error('학생 데이터 로딩 에러:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [studentCode]);

  const name     = studentData?.name     || studentData?.studentCode || '용감한 용사';
  const getMaxExpForLevel = (lv) =>
    lv <= 10 ? 100 : lv <= 30 ? 300 : lv <= 60 ? 800 : 2000;

  const level    = studentData?.level    || 1;
  const exp      = studentData?.exp      || 0;
  const maxExp   = getMaxExpForLevel(level);
  const diamonds = studentData?.diamonds ?? 0;
  const gold     = studentData?.gold     ?? 0;
  const expPct   = Math.min(100, Math.round((exp / maxExp) * 100));

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-64 gap-3">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
        <div className="text-slate-400 font-bold text-sm">불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8 text-gray-800">🏰 학생 대시보드</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* 캐릭터 카드 */}
        <div className="bg-white p-6 rounded-3xl shadow-lg border border-gray-100 text-center">
          <div className="w-full h-52 mx-auto flex items-center justify-center mb-4 relative bg-indigo-50 rounded-2xl overflow-hidden border border-indigo-100">
            {studentData?.characterImage ? (
              <img
                src={studentData.characterImage}
                alt="내 캐릭터"
                className="w-full h-full object-contain scale-[3.5] drop-shadow-md"
                onError={e => { e.target.style.display = 'none'; }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-6xl">
                {studentData?.parts ? '🦸‍♂️' : '🧑‍🎓'}
              </div>
            )}
            {/* 레벨 뱃지 */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-400 to-orange-500 text-white px-3 py-0.5 rounded-full font-bold text-xs shadow-md border-2 border-white whitespace-nowrap">
              Lv. {level}
            </div>
          </div>

          <h2 className="text-xl font-bold mt-3 text-slate-800">{name}</h2>

          {/* EXP 바 */}
          <div className="mt-4 mb-5">
            <div className="flex justify-between text-xs text-slate-400 font-medium mb-1">
              <span>EXP</span>
              <span>{exp} / {maxExp}</span>
            </div>
            <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden">
              <div className="bg-indigo-500 h-3 rounded-full transition-all" style={{ width: `${expPct}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 p-3 rounded-2xl border border-blue-100">
              <p className="text-xs text-blue-500 font-bold mb-0.5">다이아</p>
              <p className="font-extrabold text-lg text-blue-700">💎 {diamonds.toLocaleString()}</p>
            </div>
            <div className="bg-yellow-50 p-3 rounded-2xl border border-yellow-100">
              <p className="text-xs text-yellow-600 font-bold mb-0.5">골드</p>
              <p className="font-extrabold text-lg text-amber-600">🪙 {gold.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* 우측: 출석 체크 + 퀘스트 안내 */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* 출석 체크 */}
          <AttendanceCheck studentCode={studentCode} />

          {/* 오늘의 퀘스트 */}
          <TodayQuestWidget studentId={studentData?.id} teacherUid={studentData?.teacherUid} />
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;
