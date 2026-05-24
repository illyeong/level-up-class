import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, doc, setDoc, deleteDoc,
  query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';

const getSeatNum = (code) => parseInt(code?.split('-').pop()) || 0;

const DIFF_LABEL = { easy: '쉬움', normal: '보통', medium: '보통', hard: '어려움' };
const DIFF_COLOR = {
  easy:   'bg-emerald-100 text-emerald-700',
  normal: 'bg-amber-100 text-amber-700',
  medium: 'bg-amber-100 text-amber-700',
  hard:   'bg-rose-100 text-rose-700',
};

// ─────────────────────── 퀘스트 목록 화면 ────────────────────
function QuestList({ quests, onSelect, onExit, isLoading }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* 상단 헤더 */}
      <div className="bg-indigo-700 text-white px-6 py-4 flex items-center justify-between shadow-md">
        <div>
          <h1 className="text-xl font-extrabold">🖐️ 학생 셀프체크인</h1>
          <p className="text-indigo-200 text-xs mt-0.5">완료한 퀘스트를 선택하세요</p>
          <p className="text-indigo-300 text-xs mt-0.5">1인 1기기로 퀘스트 체크가 어려운 경우 태블릿이나 노트북 1개로 셀프체크인하게 해주세요</p>
        </div>
        <button
          onClick={onExit}
          className="text-xs bg-white/20 hover:bg-white/30 text-white font-bold px-4 py-2 rounded-xl transition-colors border border-white/30">
          ✕ 교사 모드로
        </button>
      </div>

      {/* 퀘스트 목록 */}
      <div className="flex-1 p-6">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2.5 h-60">
            <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
            <span className="text-slate-400 font-bold text-lg">불러오는 중...</span>
          </div>
        ) : quests.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <div className="text-6xl mb-4">⚔️</div>
            <p className="font-bold text-xl text-slate-600">활성화된 퀘스트가 없습니다</p>
            <p className="text-sm mt-2">교사 페이지에서 퀘스트를 활성화해주세요</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {quests.map(q => (
              <button
                key={q.id}
                onClick={() => onSelect(q)}
                className={`bg-white rounded-3xl shadow-sm border-2 text-left hover:shadow-md active:scale-[0.98] transition-all overflow-hidden
                  ${q.type === 'daily' ? 'border-sky-300 hover:border-sky-400' : 'border-violet-300 hover:border-violet-400'}`}>
                {/* 상단 컬러 띠 */}
                <div className={`px-5 py-2 text-white text-xs font-extrabold
                  ${q.type === 'daily' ? 'bg-sky-500' : 'bg-violet-500'}`}>
                  {q.type === 'daily' ? '📅 일일퀘스트' : '📆 주간퀘스트'}
                </div>
                <div className="p-5">
                <div className="flex items-center justify-end mb-2">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${DIFF_COLOR[q.difficulty] || DIFF_COLOR.normal}`}>
                    {DIFF_LABEL[q.difficulty] || '보통'}
                  </span>
                </div>
                <h3 className="font-extrabold text-slate-800 text-lg leading-snug mb-2">{q.title}</h3>
                {q.description && (
                  <p className="text-slate-500 text-sm line-clamp-2">{q.description}</p>
                )}
                <div className="mt-3 flex gap-2 text-xs font-bold text-slate-500">
                  {q.rewards?.exp     > 0 && <span>⭐ {q.rewards.exp} EXP</span>}
                  {q.rewards?.gold    > 0 && <span>🪙 {q.rewards.gold} G</span>}
                  {q.rewards?.diamond > 0 && <span>💎 {q.rewards.diamond}</span>}
                </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────── 학생 그리드 화면 ────────────────────
function StudentGrid({ quest, students, completions, onToggle, onBack, isBusy }) {
  const checkedCount = students.filter(s => completions[s.id]?.checked).length;
  const [confirmStudent, setConfirmStudent] = useState(null);

  const handleTap = (student) => {
    if (isBusy) return;
    const isChecked = !!completions[student.id]?.checked;
    if (isChecked) {
      // 이미 체크된 경우 → 취소 확인
      setConfirmStudent(student);
    } else {
      // 미체크 → 바로 체크
      onToggle(student, false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* 상단 헤더 */}
      <div className="bg-indigo-700 text-white px-6 py-4 shadow-md">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={onBack}
            className="text-indigo-200 hover:text-white font-bold text-sm flex items-center gap-1 transition-colors">
            ← 목록으로
          </button>
        </div>
        <h2 className="font-extrabold text-xl">{quest.title}</h2>
        <p className="text-indigo-200 text-sm mt-0.5">
          내 이름 카드를 눌러 완료 체크하세요!
        </p>
      </div>

      {/* 진행률 바 */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-4">
        <div className="flex-1">
          <div className="flex justify-between text-xs font-bold text-slate-500 mb-1">
            <span>완료 {checkedCount}명</span>
            <span>전체 {students.length}명</span>
          </div>
          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
              style={{ width: students.length > 0 ? `${Math.round(checkedCount / students.length * 100)}%` : '0%' }}
            />
          </div>
        </div>
        <div className="text-lg font-extrabold text-indigo-600 shrink-0">
          {students.length > 0 ? Math.round(checkedCount / students.length * 100) : 0}%
        </div>
      </div>

      {/* 학생 카드 그리드 */}
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
          {students.map(student => {
            const isChecked = !!completions[student.id]?.checked;
            const isRewarded = !!completions[student.id]?.rewarded;
            const seatNum = getSeatNum(student.studentCode);

            return (
              <button
                key={student.id}
                onClick={() => handleTap(student)}
                disabled={isBusy || isRewarded}
                className={`relative rounded-2xl overflow-hidden border-2 transition-all active:scale-95 select-none
                  ${isRewarded
                    ? 'border-amber-300 bg-amber-50 opacity-80 cursor-default'
                    : isChecked
                      ? 'border-emerald-400 bg-emerald-50 shadow-md shadow-emerald-100'
                      : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-sm'}`}>

                {/* 체크 오버레이 */}
                {isChecked && (
                  <div className="absolute inset-0 bg-emerald-500/10 flex items-center justify-center z-10 pointer-events-none">
                    <div className="bg-emerald-500 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg font-black shadow-md">
                      ✓
                    </div>
                  </div>
                )}
                {isRewarded && (
                  <div className="absolute top-1 right-1 text-amber-500 text-lg z-10 pointer-events-none">🏆</div>
                )}

                {/* 캐릭터 이미지 */}
                <div className="h-24 bg-gradient-to-b from-slate-50 to-white flex items-center justify-center overflow-hidden border-b border-slate-100">
                  {student.characterImage ? (
                    <img
                      src={student.characterImage}
                      alt="캐릭터"
                      className="h-full w-full object-contain scale-[2.5] drop-shadow-sm"
                      onError={e => { e.target.style.display = 'none'; }}
                    />
                  ) : (
                    <span className="text-4xl opacity-60">
                      {student.parts ? '🦸‍♂️' : '🧍'}
                    </span>
                  )}
                </div>

                {/* 학생 정보 */}
                <div className="p-2 text-center">
                  <div className="text-[10px] text-slate-400 font-medium">{seatNum}번</div>
                  <div className={`text-xs font-extrabold truncate
                    ${isChecked ? 'text-emerald-700' : 'text-slate-800'}`}>
                    {student.name || student.studentCode}
                  </div>
                  <div className={`mt-0.5 text-[9px] font-bold
                    ${isChecked ? 'text-emerald-500' : 'text-slate-300'}`}>
                    {isRewarded ? '보상완료' : isChecked ? '완료 ✓' : '미완료'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 체크 취소 확인 다이얼로그 */}
      {confirmStudent && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-xs text-center">
            <div className="text-4xl mb-3">❓</div>
            <h3 className="font-extrabold text-slate-800 text-lg mb-1">
              {confirmStudent.name || confirmStudent.studentCode}
            </h3>
            <p className="text-slate-500 text-sm mb-5">체크를 취소하시겠습니까?</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmStudent(null)}
                className="flex-1 py-3 rounded-2xl border-2 border-slate-200 text-slate-600 font-bold hover:bg-slate-50">
                취소
              </button>
              <button onClick={() => { onToggle(confirmStudent, true); setConfirmStudent(null); }}
                className="flex-1 py-3 rounded-2xl bg-rose-500 hover:bg-rose-600 text-white font-bold">
                체크 취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────── Main ─────────────────────────────────
function QuestKiosk({ onExit, selectedClass }) {
  const [screen, setScreen]       = useState('quests'); // 'quests' | 'students'
  const [quests, setQuests]       = useState([]);
  const [students, setStudents]   = useState([]);
  const [selectedQuest, setSelectedQuest] = useState(null);
  const [completions, setCompletions] = useState({}); // { studentId: data }
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy]       = useState(false);

  const tid = selectedClass?.teacherUid || null;

  // 활성 퀘스트 + 학생 목록 로드
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const [questSnap, studentSnap] = await Promise.all([
          getDocs(collection(db, 'quests')),
          getDocs(collection(db, 'students')),
        ]);

        const allQuests = questSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const filtered = allQuests
          .filter(q => q.active !== false)
          .filter(q => !tid || q.teacherUid === tid || (!q.teacherUid && tid === 'admin_master_001'))
          .sort((a, b) => {
            if (a.type !== b.type) return a.type === 'daily' ? -1 : 1;
            return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
          });
        setQuests(filtered);

        const allStudents = studentSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const classStudents = tid
          ? allStudents.filter(s => s.teacherUid === tid)
          : allStudents;
        setStudents(
          classStudents.sort((a, b) => getSeatNum(a.studentCode) - getSeatNum(b.studentCode))
        );
      } catch (err) { console.error(err); }
      finally { setIsLoading(false); }
    };
    load();
  }, [tid]);

  // 퀘스트 선택 → 완료 현황 로드
  const selectQuest = async (quest) => {
    setSelectedQuest(quest);
    try {
      const snap = await getDocs(collection(db, 'quests', quest.id, 'completions'));
      const map = {};
      snap.docs.forEach(d => { map[d.id] = d.data(); });
      setCompletions(map);
    } catch (err) { console.error(err); }
    setScreen('students');
  };

  // 체크 토글
  const handleToggle = async (student, isUncheck) => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const ref = doc(db, 'quests', selectedQuest.id, 'completions', student.id);
      if (isUncheck) {
        await deleteDoc(ref);
        setCompletions(prev => { const n = { ...prev }; delete n[student.id]; return n; });
      } else {
        const data = { checked: true, checkedAt: serverTimestamp(), rewarded: false, rewardedBy: null };
        await setDoc(ref, data, { merge: true });
        setCompletions(prev => ({ ...prev, [student.id]: { checked: true, rewarded: false } }));
      }
    } catch (err) { console.error(err); }
    finally { setIsBusy(false); }
  };

  if (screen === 'students' && selectedQuest) {
    return (
      <StudentGrid
        quest={selectedQuest}
        students={students}
        completions={completions}
        onToggle={handleToggle}
        onBack={() => { setScreen('quests'); setSelectedQuest(null); setCompletions({}); }}
        isBusy={isBusy}
      />
    );
  }

  return (
    <QuestList
      quests={quests}
      onSelect={selectQuest}
      onExit={onExit}
      isLoading={isLoading}
    />
  );
}

export default QuestKiosk;
