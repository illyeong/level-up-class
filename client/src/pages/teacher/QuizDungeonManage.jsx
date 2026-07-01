import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, writeBatch, serverTimestamp, query, where } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { MONSTERS_DB, TIER_LABEL, TIER_COST } from '../../data/monsterData';
import SpriteMonster from '../../components/SpriteMonster';
import AILessonQuizSetBuilder from '../../components/AILessonQuizSetBuilder';

const DIFF_OPTIONS = [
  { value: 'easy',   label: '🟢 쉬움',   desc: '기본 개념 확인' },
  { value: 'normal', label: '🟡 보통',   desc: '이해 및 적용' },
  { value: 'hard',   label: '🔴 어려움', desc: '심화 사고' },
];
const DIFF_LABEL = { easy: '쉬움', normal: '보통', hard: '어려움' };
const DIFF_REWARDS = {
  easy:   { gold: 100, exp: 50,  diamond: 50  },
  normal: { gold: 150, exp: 75,  diamond: 75  },
  hard:   { gold: 200, exp: 100, diamond: 100 },
};

const fmtDate = (ts) => {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
};

const makeWrongAnswerDocId = (studentId, dungeonId, questionKey) =>
  `${studentId}_${dungeonId}_${questionKey}`.replace(/[^a-zA-Z0-9_-]/g, '_');

// ── 정적 썸네일 ────────────────────────────────────────────────────
const MonsterThumb = React.memo(function MonsterThumb({ data }) {
  const s   = Math.min(0.35, 60 / Math.max(data.frameWidth, data.frameHeight));
  const dw  = Math.round(data.frameWidth  * s);
  const dh  = Math.round(data.frameHeight * s);
  const row = data.animations?.idle?.row || 0;
  return (
    <div style={{
      width: dw, height: dh,
      backgroundImage:    `url('${data.src}')`,
      backgroundPosition: `0px ${-(row * dh)}px`,
      backgroundRepeat:   'no-repeat',
      backgroundSize:     `${data.sheetCols * dw}px ${data.sheetRows * dh}px`,
      imageRendering:     'pixelated',
      transform:          data.flip ? 'scaleX(-1)' : undefined,
    }} />
  );
});

// ── 몬스터 선택 피커 ───────────────────────────────────────────────
const TIER_FILTERS = [
  { key: 'all',    label: '전체' },
  { key: 'tiny',   label: '극소' },
  { key: 'small',  label: '소형' },
  { key: 'medium', label: '중형' },
  { key: 'large',  label: '대형' },
];
const ALL_MONSTERS = Object.values(MONSTERS_DB)
  .filter(m => m.tier !== 'boss')
  .sort((a, b) => a.sizeOrder - b.sizeOrder || a.name.localeCompare(b.name));

function MonsterPicker({ mode, selectedMonsters, questionCount, onModeChange, onMonstersChange }) {
  const [filter, setFilter] = useState('all');
  const filtered = filter === 'all' ? ALL_MONSTERS : ALL_MONSTERS.filter(m => m.tier === filter);
  const usedQ = selectedMonsters.reduce((sum, id) => {
    const m = MONSTERS_DB[id];
    return sum + (m ? (TIER_COST[m.tier] || 1) : 1);
  }, 0);
  const remainingQ = questionCount - usedQ;

  const handleAdd = (monsterId) => {
    const cost = TIER_COST[MONSTERS_DB[monsterId]?.tier] || 1;
    if (remainingQ < cost) return;
    onMonstersChange([...selectedMonsters, monsterId]);
  };
  const handleRemove = (idx) => onMonstersChange(selectedMonsters.filter((_, i) => i !== idx));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => { onModeChange('random'); onMonstersChange([]); }}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-colors
            ${mode === 'random' ? 'bg-purple-600 text-white border-purple-600' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
          🎲 랜덤
        </button>
        <button onClick={() => onModeChange('manual')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-colors
            ${mode === 'manual' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
          ✋ 직접 선택
        </button>
        <span className="text-[10px] text-slate-400">극소·소형=1Q · 중형=3Q · 대형·보스=5Q</span>
      </div>

      {mode === 'random' ? (
        <div className="bg-slate-800 rounded-xl p-4 flex items-center gap-4">
          <div className="text-4xl">🎲</div>
          <div>
            <div className="text-sm text-white font-bold">입장 시 자동 결정</div>
            <div className="text-[10px] text-slate-400 mt-0.5">문제 수에 맞게 다양한 크기의 몬스터가 랜덤 배정됩니다</div>
          </div>
        </div>
      ) : (
        <>
          {questionCount === 0 ? (
            <div className="bg-slate-100 rounded-xl p-3 text-xs text-slate-400 text-center">
              퀴즈를 먼저 선택하면 몬스터 예산이 생성됩니다.
            </div>
          ) : (
            <div className="bg-slate-100 rounded-xl p-3 flex items-center gap-3">
              <div className="flex-1">
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-bold text-slate-600">문제 예산</span>
                  <span className={`font-bold ${usedQ > 0 && remainingQ === 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                    {usedQ} / {questionCount} 문제 배정
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (usedQ / questionCount) * 100)}%` }} />
                </div>
              </div>
              <span className={`text-sm font-extrabold shrink-0 ${usedQ > 0 && remainingQ === 0 ? 'text-emerald-600' : 'text-amber-500'}`}>
                {usedQ > 0 && remainingQ === 0 ? '✅ 완료' : `${remainingQ}Q 남음`}
              </span>
            </div>
          )}

          {selectedMonsters.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-bold text-slate-500">선택된 웨이브 순서 ({selectedMonsters.length}마리)</div>
              {selectedMonsters.map((id, idx) => {
                const m = MONSTERS_DB[id];
                const cost = m ? (TIER_COST[m.tier] || 1) : 1;
                return (
                  <div key={idx} className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
                    <span className="text-[10px] text-slate-400 font-bold w-5">#{idx + 1}</span>
                    <div className="flex items-end justify-center shrink-0" style={{ width: 36, height: 36 }}>
                      {m && <MonsterThumb data={m} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-slate-700">{m?.name || id}</div>
                      <div className="text-[10px] text-slate-400">{m ? TIER_LABEL[m.tier] : ''} · {cost}문제</div>
                    </div>
                    <button onClick={() => handleRemove(idx)} className="text-rose-400 hover:text-rose-600 text-lg font-bold">×</button>
                  </div>
                );
              })}
            </div>
          )}

          {remainingQ > 0 ? (
            <div>
              <div className="flex flex-wrap gap-1 mb-2">
                {TIER_FILTERS.map(f => (
                  <button key={f.key} onClick={() => setFilter(f.key)}
                    className={`px-2.5 py-0.5 rounded-lg text-xs font-bold border transition-colors
                      ${filter === f.key ? 'bg-slate-700 text-white border-slate-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                    {f.label}{f.key !== 'all' && ` (${TIER_COST[f.key]}Q)`}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-8 gap-1.5 max-h-64 overflow-y-auto border border-slate-200 rounded-xl p-2 bg-slate-50">
                {filtered.map(m => {
                  const cost = TIER_COST[m.tier] || 1;
                  const canAdd = remainingQ >= cost;
                  return (
                    <button key={m.id} onClick={() => handleAdd(m.id)}
                      title={`${m.name} (${TIER_LABEL[m.tier]}, ${cost}Q)`}
                      disabled={!canAdd}
                      className={`flex flex-col items-center justify-end p-1.5 rounded-lg border-2 transition-all
                        ${canAdd ? 'border-transparent hover:border-indigo-400 hover:bg-white' : 'border-transparent opacity-25 cursor-not-allowed'}`}>
                      <div className="flex items-end justify-center" style={{ height: 42 }}>
                        <MonsterThumb data={m} />
                      </div>
                      <span className="text-[8px] text-slate-500 leading-tight text-center w-full truncate">{m.name}</span>
                      <span className="text-[8px] text-indigo-500 font-bold">{cost}Q</span>
                    </button>
                  );
                })}
              </div>
              <div className="text-[10px] text-slate-400 mt-1 text-center">클릭해서 추가 · 남은 예산: {remainingQ}문제</div>
            </div>
          ) : (
            <div className="text-center py-3 text-emerald-600 font-bold text-sm bg-emerald-50 rounded-xl border border-emerald-200">
              ✅ 모든 문제가 몬스터에 배정되었습니다!
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── 퀴즈셋 선택 피커 (스크롤형 인라인) ─────────────────────────────
function QuizSetPicker({ selectedSetId, onSelect }) {
  const [sets, setSets]     = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState({ grade: '', subject: '' });

  useEffect(() => {
    const uid = auth.currentUser?.uid || 'admin_master_001';
    getDocs(query(collection(db, 'quizSets'), where('ownerId', '==', uid)))
      .then(snap => {
        setSets(
          snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
        );
      })
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = sets.filter(s =>
    (!filter.grade   || String(s.grade) === filter.grade) &&
    (!filter.subject || s.subject?.includes(filter.subject))
  );

  const DIFF_COLOR_SM = { easy: 'bg-emerald-100 text-emerald-700', normal: 'bg-sky-100 text-sky-700', hard: 'bg-rose-100 text-rose-700' };

  return (
    <div className="space-y-3">
      {/* 필터 */}
      <div className="flex flex-wrap gap-2">
        <select value={filter.grade} onChange={e => setFilter(f => ({ ...f, grade: e.target.value }))}
          className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:border-indigo-500 bg-white">
          <option value="">전체 학년</option>
          {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}학년</option>)}
        </select>
        <input value={filter.subject} onChange={e => setFilter(f => ({ ...f, subject: e.target.value }))}
          placeholder="과목명 검색"
          className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500 w-28 bg-white" />
        {(filter.grade || filter.subject) && (
          <button onClick={() => setFilter({ grade: '', subject: '' })}
            className="text-xs text-slate-400 hover:text-slate-600 font-bold px-2">초기화</button>
        )}
      </div>

      {/* 스크롤 목록 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8 gap-2">
          <div className="w-4 h-4 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
          <span className="text-xs text-slate-400">불러오는 중...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-slate-400">
          <div className="text-3xl mb-2">📋</div>
          <p className="text-xs font-bold">
            {sets.length === 0 ? '내 퀴즈가 없습니다. 퀴즈 은행에서 먼저 퀴즈를 만들어주세요.' : '조건에 맞는 퀴즈가 없습니다.'}
          </p>
        </div>
      ) : (
        <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
          {filtered.map(s => (
            <button key={s.id} onClick={() => onSelect(s.id === selectedSetId ? null : s)}
              className={`w-full text-left p-3 rounded-xl border-2 transition-all
                ${selectedSetId === s.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50 bg-white'}`}>
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-slate-800 truncate">{s.title}</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {s.grade && <span className="text-[10px] bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 rounded">{s.grade}학년</span>}
                    {s.subject && <span className="text-[10px] bg-indigo-50 text-indigo-600 font-bold px-1.5 py-0.5 rounded">{s.subject}</span>}
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${DIFF_COLOR_SM[s.difficulty] || 'bg-slate-100 text-slate-500'}`}>
                      {DIFF_LABEL[s.difficulty] || '보통'}
                    </span>
                    <span className="text-[10px] text-slate-400 px-1">{s.questionCount || 0}문항</span>
                  </div>
                </div>
                <div className={`shrink-0 ml-3 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors
                  ${selectedSetId === s.id ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300'}`}>
                  {selectedSetId === s.id && <span className="text-white text-xs font-bold">✓</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {sets.length === 0 && !isLoading && (
        <div className="text-center">
          <a href="#" className="text-xs text-indigo-500 font-bold hover:underline">
            → 퀴즈 은행에서 퀴즈 만들기
          </a>
        </div>
      )}
    </div>
  );
}

// ── 메인 ──────────────────────────────────────────────────────────
function QuizDungeonManage({ selectedClass, initialQuizSet = null, onInitialQuizSetConsumed, onViewStudent }) {
  const teacherUid = selectedClass?.teacherUid || auth.currentUser?.uid || 'admin_master_001';
  const [tab, setTab] = useState('create'); // 'create' | 'dungeons' | 'results'

  // 던전 설정 상태
  const [selectedSet, setSelectedSet]       = useState(initialQuizSet); // quizSet 객체
  const [customTitle, setCustomTitle]       = useState('');
  const [difficulty, setDifficulty]         = useState('normal');
  const [monsterMode, setMonsterMode]       = useState('random');
  const [selectedMonsters, setSelectedMonsters] = useState([]);
  const [timeLimit, setTimeLimit]           = useState(null);
  const [rewards, setRewards]               = useState({ gold: 150, exp: 75, diamond: 75 });
  const [isPublishing, setIsPublishing]     = useState(false);

  // 발행된 던전
  const [dungeons, setDungeons]   = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // 결과 탭
  const [resultsMap,      setResultsMap]      = useState({}); // dungeonId → { title, items[] }
  const [resultsLoading,  setResultsLoading]  = useState(false);
  const [expandedDungeon, setExpandedDungeon] = useState(null);
  const [selectedResult,  setSelectedResult]  = useState(null);

  const [toast, setToast]               = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };
  const showConfirm = (message, onConfirm) => setConfirmState({ message, onConfirm });

  useEffect(() => {
    if (!initialQuizSet) return;
    onInitialQuizSetConsumed?.();
  }, [initialQuizSet, onInitialQuizSetConsumed]);

  const createReviewQuizDraft = (answerDetails, title = '퀴즈던전 오답 복습') => {
    const unique = [];
    const seen = new Set();
    (answerDetails || []).filter(item => !item.isCorrect).forEach(item => {
      if (!item.question || seen.has(item.question)) return;
      seen.add(item.question);
      unique.push({
        type: item.type || 'mc',
        question: item.question,
        options: Array.isArray(item.options) ? item.options : [],
        answer: Number.isInteger(item.answerIndex) ? item.answerIndex : item.answer,
        explanation: item.explanation || '',
      });
    });
    if (!unique.length) {
      showToast('복습 퀴즈로 만들 상세 오답 기록이 없습니다.', 'error');
      return;
    }
    sessionStorage.setItem('aiReviewQuizDraft', JSON.stringify({
      title,
      grade: selectedClass?.grade || '',
      questions: unique.slice(0, 10),
    }));
    showToast('복습 퀴즈 초안을 저장했습니다. 퀴즈 은행에서 불러올 수 있습니다.');
  };

  const assignWrongAnswerReview = async (result) => {
    const wrongDetails = (result?.answerDetails || []).filter(item => !item.isCorrect && item.questionKey);
    if (!result?.studentId || !wrongDetails.length) {
      showToast('배정할 상세 오답 기록이 없습니다.', 'error');
      return;
    }
    try {
      const batch = writeBatch(db);
      wrongDetails.forEach(detail => {
        const wrongRef = doc(
          db,
          'quizDungeonWrongAnswers',
          makeWrongAnswerDocId(result.studentId, result.dungeonId, detail.questionKey),
        );
        batch.set(wrongRef, {
          studentId: result.studentId,
          studentCode: result.studentCode || '',
          studentName: result.studentName || result.studentCode || '',
          teacherUid,
          dungeonId: result.dungeonId,
          dungeonTitle: result.dungeonTitle || '',
          questionKey: detail.questionKey,
          question: detail.question || '',
          type: detail.type || 'mc',
          options: detail.options || [],
          answer: detail.answer ?? '',
          answerIndex: detail.answerIndex ?? -1,
          correctAnswer: detail.correctAnswer || '',
          selectedAnswer: detail.selectedAnswer || '',
          explanation: detail.explanation || '',
          status: 'unresolved',
          resolved: false,
          teacherAssigned: true,
          assignedAt: serverTimestamp(),
          assignedBy: teacherUid,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      });
      await batch.commit();
      showToast(`${result.studentName || result.studentCode} 학생에게 오답 복습을 배정했습니다.`);
    } catch (error) {
      console.error('퀴즈던전 오답 복습 배정 에러:', error);
      showToast('오답 복습 배정 중 오류가 발생했습니다.', 'error');
    }
  };

  useEffect(() => {
    if (tab === 'dungeons') fetchDungeons();
    if (tab === 'results')  fetchResults();
  }, [tab]);

  const fetchDungeons = async () => {
    setIsLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'quizDungeons'), where('teacherUid', '==', teacherUid)));
      setDungeons(
        snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      );
    } finally { setIsLoading(false); }
  };

  const fetchResults = async () => {
    setResultsLoading(true);
    try {
      const dungSnap = await getDocs(query(collection(db, 'quizDungeons'), where('teacherUid', '==', teacherUid)));
      const dungeonList = dungSnap.docs.map(d => ({ id: d.id, title: d.data().title, questionCount: d.data().questionCount }));
      const dungeonIds  = dungeonList.map(d => d.id);
      const dungeonMeta = Object.fromEntries(dungeonList.map(d => [d.id, d]));

      const map = {};
      dungeonIds.forEach(id => { map[id] = { title: dungeonMeta[id].title, questionCount: dungeonMeta[id].questionCount, items: [] }; });

      for (let i = 0; i < dungeonIds.length; i += 30) {
        const chunk = dungeonIds.slice(i, i + 30);
        const rSnap = await getDocs(query(collection(db, 'quizResults'), where('dungeonId', 'in', chunk)));
        rSnap.docs.forEach(d => {
          const r = d.data();
          if (map[r.dungeonId]) map[r.dungeonId].items.push(r);
        });
      }
      // sort items newest first per dungeon
      Object.values(map).forEach(v => v.items.sort((a, b) => (b.completedAt?.seconds || 0) - (a.completedAt?.seconds || 0)));
      setResultsMap(map);
    } catch (err) { console.error(err); }
    finally { setResultsLoading(false); }
  };

  const handleDiffChange = (d) => {
    setDifficulty(d);
    setRewards(DIFF_REWARDS[d]);
  };

  const handlePublish = () => {
    if (!selectedSet) { showToast('퀴즈를 먼저 선택해주세요.', 'error'); return; }
    const finalTitle = customTitle.trim() || selectedSet.title || '퀴즈 던전';
    showConfirm(`"${finalTitle}"을 발행하시겠습니까?\n학생들이 바로 접근할 수 있습니다.`, async () => {
      setIsPublishing(true);
      try {
        await addDoc(collection(db, 'quizDungeons'), {
          title:         finalTitle,
          grade:         selectedSet.grade || null,
          semester:      selectedSet.semester || null,
          subject:       selectedSet.subject || '',
          publisher:     selectedSet.publisher || null,
          part:          selectedSet.part || null,
          unit:          selectedSet.unit || null,
          difficulty,
          monsterId:     monsterMode === 'random' ? 'random' : null,
          monsterIds:    monsterMode === 'manual' ? selectedMonsters : null,
          timeLimit,
          rewards,
          questions:     selectedSet.questions || [],
          questionCount: selectedSet.questionCount || selectedSet.questions?.length || 0,
          quizSetId:     selectedSet.id,
          teacherUid,
          active:        true,
          playCount:     0,
          createdAt:     serverTimestamp(),
        });
        showToast('✅ 퀴즈 던전이 발행되었습니다!');
        setSelectedSet(null); setCustomTitle(''); setDifficulty('normal');
        setMonsterMode('random'); setSelectedMonsters([]); setTimeLimit(null);
        setRewards({ gold: 150, exp: 75, diamond: 75 });
        setTab('dungeons');
        fetchDungeons();
      } catch (err) {
        showToast('발행 중 오류가 발생했습니다.', 'error');
      } finally { setIsPublishing(false); }
    });
  };

  const toggleDungeonActive = async (dungeon) => {
    await updateDoc(doc(db, 'quizDungeons', dungeon.id), { active: !dungeon.active });
    setDungeons(prev => prev.map(d => d.id === dungeon.id ? { ...d, active: !d.active } : d));
  };

  const deleteDungeon = (id) => {
    showConfirm('이 퀴즈 던전을 삭제할까요?', async () => {
      await deleteDoc(doc(db, 'quizDungeons', id));
      setDungeons(prev => prev.filter(d => d.id !== id));
      showToast('삭제됐습니다.');
    });
  };

  const questionCount = selectedSet?.questionCount || selectedSet?.questions?.length || 0;

  return (
    <>
    <div className="quiz-dungeon-manage-page min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="mx-auto max-w-6xl">

        {/* 헤더 */}
        <div className="quiz-dungeon-manage-header mb-6 flex flex-wrap items-center justify-between gap-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 md:text-3xl">⚔️ 퀴즈 던전 관리</h1>
            <p className="mt-1 text-sm leading-6 text-slate-500">퀴즈를 선택하고 보상과 몬스터를 설정해 학생용 던전을 발행하세요.</p>
          </div>
          <div className="quiz-dungeon-manage-tabs grid w-full grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5 sm:flex sm:w-auto">
            {onViewStudent && (
              <button onClick={onViewStudent}
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-slate-700">
                👁 학생 화면 미리보기
              </button>
            )}
            {[
              ['create',   '⚔️ 던전 만들기'],
              ['dungeons', `📚 발행된 던전 (${dungeons.length})`],
              ['results',  '📊 결과 확인'],
            ].map(([t, l]) => (
              <button key={t} onClick={() => setTab(t)}
                className={`quiz-dungeon-manage-tab rounded-xl px-4 py-2.5 text-sm font-bold transition-all
                  ${tab === t ? 'quiz-dungeon-manage-tab-active bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* ── 던전 만들기 탭 ── */}
        {tab === 'create' && (
          <div className="space-y-5">

            {/* 1. 퀴즈 선택 */}
            <div className="quiz-dungeon-manage-panel rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-bold text-slate-700 text-sm">📋 퀴즈 선택</h2>
                  <p className="text-xs text-slate-400 mt-0.5">AI학습관 차시로 새로 만들거나, 기존 내 퀴즈를 선택하세요.</p>
                </div>
                {selectedSet && (
                  <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-1.5">
                    <span className="text-xs font-extrabold text-indigo-700 truncate max-w-[200px]">✓ {selectedSet.title}</span>
                    <span className="text-[10px] text-indigo-500 shrink-0">{questionCount}문항</span>
                  </div>
                )}
              </div>
              <div className="mb-4">
                <AILessonQuizSetBuilder
                  selectedClass={selectedClass}
                  accent="indigo"
                  title="AI학습관 차시로 던전 퀴즈 만들기"
                  description="등록된 수학 차시를 골라 퀴즈를 생성하면 아래 선택 퀴즈로 바로 들어갑니다."
                  defaultQuestionCount={6}
                  defaultDifficulty={difficulty}
                  onCreated={(quizSet) => {
                    setSelectedSet(quizSet);
                    setCustomTitle(quizSet.title);
                    handleDiffChange(quizSet.difficulty || 'normal');
                    setSelectedMonsters([]);
                  }}
                  showToast={showToast}
                />
              </div>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-[11px] font-bold text-slate-400">또는 기존 내 퀴즈 선택</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
              <QuizSetPicker selectedSetId={selectedSet?.id} onSelect={setSelectedSet} />
            </div>

            {/* 2. 던전 설정 */}
            <div className="quiz-dungeon-manage-panel rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
              <h2 className="font-bold text-slate-700 text-sm mb-4">⚙️ 던전 설정</h2>

              {/* 던전 제목 */}
              <div className="mb-4">
                <label className="block text-xs font-bold text-slate-500 mb-1">던전 제목</label>
                <input value={customTitle} onChange={e => setCustomTitle(e.target.value)}
                  placeholder={selectedSet?.title || '제목을 입력하거나 비워두면 퀴즈 제목 사용'}
                  className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:border-indigo-500" />
                {selectedSet && !customTitle && (
                  <div className="mt-1 text-[10px] text-slate-400">비워두면 퀴즈 제목 사용: <span className="text-indigo-500">{selectedSet.title}</span></div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 난이도 */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2">난이도</label>
                  <div className="flex gap-2">
                    {DIFF_OPTIONS.map(d => (
                      <button key={d.value} onClick={() => handleDiffChange(d.value)}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-colors
                          ${difficulty === d.value ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500'}`}>
                        {d.label}<br/><span className="font-normal opacity-70">{d.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 제한 시간 */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2">⏱️ 제한 시간</label>
                  <div className="flex flex-wrap gap-1.5 mb-1">
                    <button onClick={() => setTimeLimit(null)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold border-2 transition-colors
                        ${timeLimit === null ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                      난이도별
                    </button>
                    <button onClick={() => setTimeLimit(0)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold border-2 transition-colors
                        ${timeLimit === 0 ? 'bg-slate-700 text-white border-slate-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                      ∞ 무제한
                    </button>
                    {[5, 8, 10, 15, 20, 30].map(s => (
                      <button key={s} onClick={() => setTimeLimit(s)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold border-2 transition-colors
                          ${timeLimit === s ? 'bg-sky-600 text-white border-sky-600' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                        {s}초
                      </button>
                    ))}
                  </div>
                  {timeLimit === null && <div className="text-[10px] text-slate-400">쉬움 15초 · 보통 12초 · 어려움 8초</div>}
                </div>

                {/* 보상 */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-2">클리어 보상</label>
                  <div className="flex gap-3">
                    {[['gold', '🪙 골드'], ['exp', '⭐ EXP'], ['diamond', '💎 다이아']].map(([k, label]) => (
                      <div key={k}>
                        <div className="text-[10px] text-slate-400 mb-1">{label}</div>
                        <input type="number" min="0" value={rewards[k]}
                          onChange={e => setRewards(prev => ({ ...prev, [k]: Number(e.target.value) || 0 }))}
                          className="w-24 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm text-center font-bold focus:outline-none focus:border-indigo-500" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 3. 출현 몬스터 */}
            <div className="quiz-dungeon-manage-panel rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
              <h2 className="font-bold text-slate-700 text-sm mb-4">👾 출현 몬스터 구성</h2>
              <MonsterPicker
                mode={monsterMode}
                selectedMonsters={selectedMonsters}
                questionCount={questionCount}
                onModeChange={setMonsterMode}
                onMonstersChange={setSelectedMonsters}
              />
            </div>

            {/* 발행 버튼 */}
            <button onClick={handlePublish} disabled={isPublishing || !selectedSet}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-lg rounded-2xl shadow-md transition-all active:scale-[0.99] disabled:opacity-40">
              {isPublishing ? '발행 중...' : selectedSet
                ? `✅ "${customTitle.trim() || selectedSet.title}" 던전 발행하기`
                : '퀴즈를 먼저 선택해주세요'}
            </button>

            {!selectedSet && (
              <p className="text-center text-xs text-slate-400">
                퀴즈가 없으신가요?{' '}
                <span className="text-indigo-500 font-bold">📚 퀴즈 은행</span>에서 퀴즈를 먼저 만들어주세요.
              </p>
            )}
          </div>
        )}

        {/* ── 결과 확인 탭 ── */}
        {tab === 'results' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-slate-400">던전별 학생 결과를 확인합니다.</p>
              <button onClick={fetchResults}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                🔄 새로고침
              </button>
            </div>

            {resultsLoading ? (
              <div className="flex items-center justify-center gap-2.5 py-20">
                <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
                <span className="text-sm text-slate-400">불러오는 중...</span>
              </div>
            ) : Object.keys(resultsMap).length === 0 ? (
              <div className="text-center py-20 text-slate-400">
                <div className="text-5xl mb-3">📊</div>
                <p className="font-bold text-lg text-slate-600">발행된 던전이 없습니다</p>
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(resultsMap)
                  .sort((a, b) => (b[1].items[0]?.completedAt?.seconds || 0) - (a[1].items[0]?.completedAt?.seconds || 0))
                  .map(([dungeonId, { title, questionCount, items }]) => {
                    const clearedCount = items.filter(r => r.cleared).length;
                    const isExpanded   = expandedDungeon === dungeonId;
                    const wrongMap = new Map();
                    items.forEach(result => {
                      (result.answerDetails || []).filter(detail => !detail.isCorrect).forEach(detail => {
                        const key = detail.questionKey || detail.question;
                        const current = wrongMap.get(key) || {
                          ...detail,
                          count: 0,
                          students: new Set(),
                        };
                        current.count += 1;
                        current.students.add(result.studentId || result.studentCode);
                        wrongMap.set(key, current);
                      });
                    });
                    const wrongSummary = [...wrongMap.values()]
                      .sort((a, b) => b.count - a.count)
                      .slice(0, 5);
                    return (
                      <div key={dungeonId} className="quiz-dungeon-manage-card overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <button
                          onClick={() => setExpandedDungeon(isExpanded ? null : dungeonId)}
                          className="w-full px-5 py-4 flex items-center gap-4 hover:bg-slate-50 transition-colors text-left">
                          <div className="flex-1 min-w-0">
                            <div className="font-extrabold text-slate-800 truncate">{title}</div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              {questionCount}문제 · 총 {items.length}회 플레이 · 클리어 {clearedCount}명
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                              클리어 {clearedCount}/{items.length}
                            </span>
                            <span className="text-slate-400 text-sm">{isExpanded ? '▲' : '▼'}</span>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="quiz-dungeon-result-panel border-t border-slate-100">
                            {wrongSummary.length > 0 && (
                              <div className="quiz-dungeon-wrong-summary border-b border-slate-100 bg-rose-50/50 p-4">
                                <div className="mb-3 flex items-center justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-extrabold text-slate-800">자주 틀린 문항</p>
                                    <p className="text-[11px] font-bold text-slate-400">새 상세 결과부터 집계됩니다.</p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => createReviewQuizDraft(wrongSummary, `${title} 오답 복습`)}
                                    className="rounded-xl bg-rose-500 px-3 py-2 text-xs font-extrabold text-white hover:bg-rose-600"
                                  >
                                    복습 퀴즈 초안 만들기
                                  </button>
                                </div>
                                <div className="grid gap-2 md:grid-cols-2">
                                  {wrongSummary.map(item => (
                                    <div key={item.questionKey || item.question} className="quiz-dungeon-wrong-card rounded-xl border border-rose-100 bg-white p-3">
                                      <p className="line-clamp-2 text-xs font-extrabold text-slate-700">{item.question}</p>
                                      <p className="mt-1 text-[11px] font-bold text-rose-500">
                                        오답 {item.count}회 · 학생 {item.students.size}명
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {items.length === 0 ? (
                              <div className="text-center py-6 text-slate-400 text-sm">아직 플레이한 학생이 없습니다.</div>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                                      <th className="px-4 py-2.5 text-left">학생</th>
                                      <th className="px-3 py-2.5 text-center">정답</th>
                                      <th className="px-3 py-2.5 text-center">오답</th>
                                      <th className="px-3 py-2.5 text-center">정확도</th>
                                      <th className="px-3 py-2.5 text-center">클리어</th>
                                      <th className="px-3 py-2.5 text-center">상세</th>
                                      <th className="px-3 py-2.5 text-right">날짜</th>
                                    </tr>
                                  </thead>
                                  <tbody className="quiz-dungeon-results-body divide-y divide-slate-50">
                                    {items.map((r, idx) => {
                                      const wrongCount = r.totalQuestions - r.score;
                                      const ts = r.completedAt?.toDate ? r.completedAt.toDate()
                                        : r.completedAt?.seconds ? new Date(r.completedAt.seconds * 1000) : null;
                                      const dateStr = ts ? `${ts.getMonth()+1}/${ts.getDate()} ${ts.getHours()}:${String(ts.getMinutes()).padStart(2,'0')}` : '';
                                      return (
                                        <tr key={idx} className={`quiz-dungeon-result-row ${r.cleared ? 'quiz-dungeon-result-row-cleared bg-emerald-50/30' : ''} hover:bg-slate-50`}>
                                          <td className="px-4 py-2.5 font-bold text-slate-700">{r.studentName || r.studentCode}</td>
                                          <td className="px-3 py-2.5 text-center font-extrabold text-emerald-600">{r.score}</td>
                                          <td className="px-3 py-2.5 text-center font-extrabold text-rose-500">{wrongCount}</td>
                                          <td className="px-3 py-2.5 text-center font-bold text-slate-600">{r.accuracy}%</td>
                                          <td className="px-3 py-2.5 text-center">
                                            {r.cleared
                                              ? <span className="text-emerald-600 font-bold">✓ 클리어</span>
                                              : <span className="text-slate-400">—</span>}
                                          </td>
                                          <td className="px-3 py-2.5 text-center">
                                            <button
                                              type="button"
                                              disabled={!r.answerDetails?.length}
                                              onClick={() => setSelectedResult(r)}
                                              className="quiz-dungeon-answer-button rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 font-bold text-indigo-600 disabled:cursor-not-allowed disabled:opacity-30"
                                            >
                                              답안 보기
                                            </button>
                                          </td>
                                          <td className="px-3 py-2.5 text-right text-slate-400">{dateStr}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {/* ── 발행된 던전 탭 ── */}
        {tab === 'dungeons' && (
          <div>
            {!isLoading && dungeons.length > 0 && (
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 text-center">
                  <div className="text-2xl font-extrabold text-indigo-600">{dungeons.length}</div>
                  <div className="text-xs text-slate-400 mt-0.5">전체 던전</div>
                </div>
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 text-center">
                  <div className="text-2xl font-extrabold text-emerald-600">{dungeons.filter(d => d.active).length}</div>
                  <div className="text-xs text-slate-400 mt-0.5">활성 던전</div>
                </div>
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 text-center">
                  <div className="text-2xl font-extrabold text-amber-600">
                    {dungeons.reduce((s, d) => s + (d.playCount || 0), 0)}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">총 플레이</div>
                </div>
              </div>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center gap-2.5 py-20">
                <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
                <span className="text-sm text-slate-400 font-medium">불러오는 중...</span>
              </div>
            ) : dungeons.length === 0 ? (
              <div className="text-center py-20 text-slate-400">
                <div className="text-5xl mb-3">⚔️</div>
                <p className="font-bold text-lg text-slate-600">발행된 퀴즈 던전이 없습니다</p>
                <p className="text-sm mt-1">던전 만들기 탭에서 첫 번째 던전을 발행해보세요!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {dungeons.map(d => (
                  <div key={d.id}
                    className={`quiz-dungeon-manage-card overflow-hidden rounded-2xl border-2 bg-white shadow-sm transition-all
                      ${d.active ? 'border-slate-200 hover:shadow-md' : 'border-slate-100 opacity-60'}`}>
                    <div className={`px-4 py-2 text-white text-[10px] font-bold flex justify-between
                      ${d.difficulty === 'easy' ? 'bg-emerald-500' : d.difficulty === 'hard' ? 'bg-rose-500' : 'bg-sky-500'}`}>
                      <span>{DIFF_LABEL[d.difficulty] || '보통'}</span>
                      <span>
                        {d.questionCount}문제 ·{' '}
                        {d.timeLimit === 0 ? '∞무제한' : d.timeLimit != null ? `${d.timeLimit}초` : '난이도별'}
                      </span>
                    </div>
                    <div className="p-4">
                      <h3 className="font-extrabold text-slate-800 mb-1 leading-tight">{d.title}</h3>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                        <span>{fmtDate(d.createdAt)}</span>
                        {(d.monsterId || d.monsterIds?.length > 0) && (
                          <span className="text-indigo-500 font-bold">
                            👾 {d.monsterIds?.length > 0
                              ? `${d.monsterIds.length}마리`
                              : d.monsterId === 'random' ? '랜덤' : (MONSTERS_DB[d.monsterId]?.name || d.monsterId)}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {d.rewards?.gold    > 0 && <span className="text-xs bg-amber-50 text-amber-700 font-bold px-2 py-0.5 rounded-full border border-amber-100">🪙{d.rewards.gold}</span>}
                        {d.rewards?.exp     > 0 && <span className="text-xs bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-full border border-indigo-100">⭐{d.rewards.exp}</span>}
                        {d.rewards?.diamond > 0 && <span className="text-xs bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded-full border border-blue-100">💎{d.rewards.diamond}</span>}
                        {(d.playCount || 0) > 0 && <span className="text-xs text-indigo-500 font-bold ml-auto">▶ {d.playCount}회</span>}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => toggleDungeonActive(d)}
                          className={`flex-1 py-1.5 rounded-xl text-xs font-bold border transition-colors
                            ${d.active ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}>
                          {d.active ? '✅ 활성화 중' : '⏸️ 비활성'}
                        </button>
                        <button onClick={() => deleteDungeon(d.id)}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-50 text-rose-500 border border-rose-200 hover:bg-rose-100 transition-colors">
                          삭제
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>

    {selectedResult && (
      <div
        className="fixed inset-0 z-[250] flex items-center justify-center bg-black/60 p-4"
        onClick={event => event.target === event.currentTarget && setSelectedResult(null)}
      >
        <div className="quiz-dungeon-manage-modal max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h3 className="font-extrabold text-slate-800">{selectedResult.studentName || selectedResult.studentCode} 답안 상세</h3>
              <p className="text-xs font-bold text-slate-400">{selectedResult.dungeonTitle}</p>
            </div>
            <button
              type="button"
              onClick={() => assignWrongAnswerReview(selectedResult)}
              className="ml-auto rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-extrabold text-rose-600"
            >
              학생에게 복습 배정
            </button>
            <button
              type="button"
              onClick={() => createReviewQuizDraft(
                selectedResult.answerDetails,
                `${selectedResult.studentName || selectedResult.studentCode} 퀴즈던전 오답 복습`,
              )}
              className="rounded-xl bg-rose-500 px-3 py-2 text-xs font-extrabold text-white"
            >
              오답 복습 퀴즈 만들기
            </button>
            <button type="button" onClick={() => setSelectedResult(null)} className="text-xl text-slate-400">×</button>
          </div>
          <div className="max-h-[70vh] space-y-3 overflow-y-auto p-5">
            {(selectedResult.answerDetails || []).map((detail, index) => (
              <div
                key={`${detail.questionKey || detail.question}-${index}`}
                className={`quiz-dungeon-answer-detail-card ${detail.isCorrect ? 'quiz-dungeon-answer-detail-correct border-emerald-200 bg-emerald-50/50' : 'quiz-dungeon-answer-detail-wrong border-rose-200 bg-rose-50/60'} rounded-2xl border p-4`}
              >
                <div className="mb-2 flex items-start gap-2">
                  <span className={`text-xs font-black ${detail.isCorrect ? 'text-emerald-600' : 'text-rose-600'}`}>
                    Q{detail.questionIndex + 1}
                  </span>
                  <p className="quiz-dungeon-answer-question text-sm font-extrabold text-slate-800">{detail.question}</p>
                </div>
                <div className="quiz-dungeon-answer-meta space-y-1 text-xs font-bold">
                  <p className="text-slate-500">학생 답: {detail.selectedAnswer || '선택하지 않음'}</p>
                  <p className="text-emerald-600">정답: {detail.correctAnswer}</p>
                  {detail.explanation && <p className="font-medium text-slate-500">{detail.explanation}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )}

    {toast && (
      <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl font-bold text-sm shadow-2xl pointer-events-none
        ${toast.type === 'error' ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'}`}
        style={{ whiteSpace: 'nowrap' }}>
        {toast.message}
      </div>
    )}
    {confirmState && (
      <div className="fixed inset-0 bg-black/50 z-[300] flex items-center justify-center p-4"
        onClick={e => e.target === e.currentTarget && setConfirmState(null)}>
        <div className="quiz-dungeon-manage-modal w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
          <p className="text-slate-700 font-bold text-sm mb-5 leading-relaxed whitespace-pre-line">{confirmState.message}</p>
          <div className="flex gap-3">
            <button onClick={() => setConfirmState(null)}
              className="flex-1 py-2.5 border-2 border-slate-200 text-slate-600 font-bold rounded-xl text-sm hover:bg-slate-50">취소</button>
            <button onClick={() => { confirmState.onConfirm(); setConfirmState(null); }}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm">확인</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

export default QuizDungeonManage;
