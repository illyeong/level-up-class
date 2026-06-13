import React, { useState, useEffect, useRef } from 'react';
import {
  collection, getDocs, addDoc, updateDoc,
  doc, query, where, serverTimestamp, getDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { getMaxExpForLevel } from '../../utils/leveling';

const SUBJECTS = ['국어', '수학', '사회', '과학', '영어', '도덕', '체육', '음악', '미술', '실과', '창체'];

const compressImage = (file) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => {
    const MAX = 800;
    let w = img.width, h = img.height;
    if (w > MAX || h > MAX) {
      if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
      else { w = Math.round(w * MAX / h); h = MAX; }
    }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    resolve(canvas.toDataURL('image/jpeg', 0.75));
    URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(file);
});

const toKSTDateString = () => {
  const d = new Date(Date.now() + 9 * 3600000);
  return d.toISOString().slice(0, 10);
};

const getMinDate = () => {
  const d = new Date(Date.now() + 9 * 3600000 - 7 * 24 * 3600000);
  return d.toISOString().slice(0, 10);
};

// 이번주 월요일 날짜 (매주 월요일 초기화 기준)
const getWeekStart = () => {
  const d = new Date(Date.now() + 9 * 3600000);
  const day = d.getDay(); // 0=일, 1=월 ...
  const daysToMon = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - daysToMon);
  return d.toISOString().slice(0, 10);
};

const STATUS_BADGE = {
  pending:  { label: '🕐 승인 대기', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  approved: { label: '✅ 승인 완료', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  rejected: { label: '❌ 반려',     cls: 'bg-rose-100 text-rose-700 border-rose-200' },
};

// ── 달력 컴포넌트 ───────────────────────────────────────────────
function CalendarView({ notes, selectedDate, onSelectDate, currentMonth, onPrevMonth, onNextMonth }) {
  const year  = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const noteDates   = new Set(notes.map(n => n.date));
  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = toKSTDateString();

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, dateStr, hasNote: noteDates.has(dateStr) });
  }

  const isCurrentMonth = year === new Date().getFullYear() && month === new Date().getMonth();
  const weekLabels = ['일', '월', '화', '수', '목', '금', '토'];

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <button onClick={onPrevMonth}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 font-bold transition-colors text-lg">‹</button>
        <span className="font-extrabold text-slate-700 text-sm">{year}년 {month + 1}월</span>
        <button onClick={onNextMonth} disabled={isCurrentMonth}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 font-bold transition-colors text-lg disabled:opacity-30 disabled:cursor-not-allowed">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1.5">
        {weekLabels.map((d, i) => (
          <div key={d} className={`text-center text-[11px] font-bold ${i === 0 ? 'text-rose-400' : i === 6 ? 'text-blue-400' : 'text-slate-400'}`}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => (
          <div key={i} className="flex items-center justify-center">
            {cell ? (
              <button
                onClick={() => onSelectDate(cell.dateStr)}
                className={`w-9 h-9 rounded-lg text-xs font-bold transition-all relative flex items-center justify-center
                  ${cell.dateStr === selectedDate
                    ? 'bg-indigo-600 text-white shadow-md'
                    : cell.dateStr === today
                      ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-300'
                      : cell.hasNote
                        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-extrabold'
                        : 'text-slate-500 hover:bg-slate-100'}`}
              >
                {cell.day}
                {cell.hasNote && cell.dateStr !== selectedDate && (
                  <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-emerald-400" />
                )}
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-2.5 pt-2.5 border-t border-slate-50 text-[11px] text-slate-400 font-bold">
        <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-emerald-100 inline-block border border-emerald-200" /> 노트 있음</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-indigo-600 inline-block" /> 선택됨</span>
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────
export default function LearningNote({ studentCode, themeMode = 'dark' }) {
  const [myInfo, setMyInfo]     = useState(null);
  const [notes, setNotes]       = useState([]);
  const [settings, setSettings] = useState({ minCoreLength: 10, minThoughtLength: 20, rewardGold: 10, rewardExp: 30, rewardDiamond: 10 });
  const [loading, setLoading]   = useState(true);
  const [view, setView]         = useState('list'); // 'list' | 'write'
  const [streak, setStreak]     = useState(0);

  // 달력
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);

  // 상세 모달
  const [detailNote, setDetailNote] = useState(null);

  // 수정 모드
  const [editingNoteId, setEditingNoteId] = useState(null);

  // 작성 폼
  const today   = toKSTDateString();
  const minDate = getMinDate();
  const [writeDate, setWriteDate]       = useState(today);
  const [subjects, setSubjects]         = useState([{ subject: '', coreContent: '', myThought: '', imageBase64: '' }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [compressingIdx, setCompressingIdx] = useState(null);
  const [noteCoach, setNoteCoach] = useState({});
  const fileRefs = useRef([]);
  const coreRefs = useRef([]);
  const thoughtRefs = useRef([]);

  // ── 데이터 로드 ──────────────────────────────────────────────
  useEffect(() => {
    if (!studentCode) return;
    (async () => {
      const snap = await getDocs(query(collection(db, 'students'), where('studentCode', '==', studentCode)));
      if (!snap.empty) {
        const d = snap.docs[0];
        setMyInfo({ id: d.id, ...d.data() });
      }
    })();
  }, [studentCode]);

  useEffect(() => {
    if (!myInfo) return;
    (async () => {
      setLoading(true);
      try {
        const [noteSnap, settSnap] = await Promise.all([
          getDocs(query(collection(db, 'learningNotes'), where('studentId', '==', myInfo.id))),
          myInfo.teacherUid ? getDoc(doc(db, 'learningSettings', myInfo.teacherUid)) : Promise.resolve(null),
        ]);
        const list = noteSnap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0) ||
                          (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setNotes(list);
        if (settSnap?.exists()) setSettings(s => ({ ...s, ...settSnap.data() }));
        setStreak(computeStreak(list));
      } finally { setLoading(false); }
    })();
  }, [myInfo]);

  const computeStreak = (noteList) => {
    const days = new Set(noteList.map(n => n.date));
    let count = 0;
    const d = new Date(today);
    // 오늘이 주말이면 가장 최근 평일(금요일)부터 시작
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
    while (true) {
      if (d.getDay() === 0 || d.getDay() === 6) { d.setDate(d.getDate() - 1); continue; }
      const s = d.toISOString().slice(0, 10);
      if (days.has(s)) { count++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return count;
  };

  // ── 선택 날짜의 이미 제출한 과목 ─────────────────────────────
  const dateSubjects = new Set(
    notes.filter(n => n.date === writeDate && n.id !== editingNoteId)
         .flatMap(n => (n.subjects || []).map(s => s.subject))
  );

  // ── 폼 헬퍼 ──────────────────────────────────────────────────
  const updateField = (idx, field, value) => {
    setSubjects(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const getCoachState = (sub) => {
    const subjectName = sub.subject || '이 과목';
    if (!sub.subject) {
      return {
        stage: '과목 선택',
        message: '먼저 과목을 선택하면 과목에 맞는 생각 질문을 추천해 드려요.',
        prompts: [],
      };
    }
    if (sub.coreContent.length < settings.minCoreLength) {
      return {
        stage: '핵심 내용 정리',
        message: `${subjectName} 시간에 배운 내용을 한 문장으로 먼저 정리해 보세요.`,
        prompts: [
          ['오늘 배운 것의 이름이나 핵심 낱말은 무엇인가요?', 'coreContent'],
          ['수업에서 본 예시를 하나 떠올려 볼까요?', 'coreContent'],
          ['친구에게 한 문장으로 설명하면 어떻게 말할까요?', 'coreContent'],
        ],
      };
    }
    if (sub.myThought.length < settings.minThoughtLength) {
      return {
        stage: '나의 생각 확장',
        message: '핵심 내용은 충분해요. 이제 내가 이해한 방법이나 궁금한 점을 덧붙여 보세요.',
        prompts: [
          ['처음에는 어려웠지만 이해하게 된 부분은 무엇인가요?', 'myThought'],
          ['오늘 배운 내용을 어디에 활용할 수 있을까요?', 'myThought'],
          ['아직 더 알아보고 싶은 질문은 무엇인가요?', 'myThought'],
        ],
      };
    }
    return {
      stage: '마무리 점검',
      message: '내용과 생각이 모두 작성됐어요. 구체적인 예시가 들어갔는지 마지막으로 확인해 보세요.',
      prompts: [
        ['내 글에 실제 예시나 이유가 한 가지 들어갔나요?', 'coreContent'],
        ['내가 성장한 점이 드러나나요?', 'myThought'],
        ['다음 시간의 목표를 한 문장으로 적어 볼까요?', 'myThought'],
      ],
    };
  };

  const selectCoachPrompt = (idx, prompt, target) => {
    setNoteCoach(prev => ({ ...prev, [idx]: { prompt, target } }));
    window.requestAnimationFrame(() => {
      const ref = target === 'coreContent' ? coreRefs.current[idx] : thoughtRefs.current[idx];
      ref?.focus();
    });
  };

  const addSubjectRow = () => {
    if (subjects.length >= 6) return;
    setSubjects(prev => [...prev, { subject: '', coreContent: '', myThought: '', imageBase64: '' }]);
    setNoteCoach({});
  };

  const removeSubjectRow = (idx) => {
    if (subjects.length === 1) return;
    setSubjects(prev => prev.filter((_, i) => i !== idx));
    setNoteCoach({});
  };

  const isFormValid = subjects.every(s =>
    s.subject &&
    s.coreContent.length >= settings.minCoreLength &&
    s.myThought.length  >= settings.minThoughtLength &&
    !dateSubjects.has(s.subject)
  ) && new Set(subjects.map(s => s.subject).filter(Boolean)).size === subjects.filter(s => s.subject).length;

  const handleImagePick = async (idx, file) => {
    if (!file) return;
    setCompressingIdx(idx);
    try { updateField(idx, 'imageBase64', await compressImage(file)); }
    finally { setCompressingIdx(null); }
  };

  // ── 수정 모드 열기 ───────────────────────────────────────────
  const openEdit = (note) => {
    setEditingNoteId(note.id);
    setWriteDate(note.date);
    setSubjects(note.subjects.map(s => ({ ...s })));
    setView('write');
  };

  const resetForm = () => {
    setEditingNoteId(null);
    setSubjects([{ subject: '', coreContent: '', myThought: '', imageBase64: '' }]);
    setWriteDate(today);
    setNoteCoach({});
  };

  // ── 제출 (신규 or 수정) ──────────────────────────────────────
  const submit = async () => {
    if (!isFormValid || !myInfo) return;
    setIsSubmitting(true);
    try {
      const payload = {
        studentId:   myInfo.id,
        studentCode,
        studentName: myInfo.name,
        teacherUid:  myInfo.teacherUid,
        date:        writeDate,
        subjects:    subjects.map(s => ({
          subject:     s.subject,
          coreContent: s.coreContent.trim(),
          myThought:   s.myThought.trim(),
          imageBase64: s.imageBase64 || null,
        })),
        subjectCount:   subjects.length,
        status:         'pending',
        teacherComment: '',
        rewardPaid:     false,
        studentSeen:    false,
      };

      if (editingNoteId) {
        await updateDoc(doc(db, 'learningNotes', editingNoteId), payload);
        setNotes(prev => prev.map(n => n.id === editingNoteId ? { ...n, ...payload } : n));
      } else {
        payload.createdAt  = serverTimestamp();
        payload.approvedAt = null;
        const ref = await addDoc(collection(db, 'learningNotes'), payload);

        if (writeDate === today) {
          const newStreak = computeStreak([...notes, { date: today }]);
          const studentRef = doc(db, 'students', myInfo.id);
          const streakUpdate = { noteStreak: newStreak, noteLastDate: today };
          if (newStreak > 0 && newStreak % 5 === 0) {
            const prevData = (await getDoc(studentRef)).data();
            const lastBonus = prevData?.noteStreakBonusDate || '';
            if (lastBonus !== today) {
              const bonusGold = 50, bonusDia = 50, bonusExp = 50;
              const curGold = prevData?.gold || 0, curDia = prevData?.diamonds || 0;
              const curExp  = prevData?.exp  || 0, curLv  = prevData?.level   || 1;
              const getMax  = getMaxExpForLevel;
              let newExp = curExp + bonusExp, newLv = curLv;
              while (newExp >= getMax(newLv)) { newExp -= getMax(newLv); newLv++; }
              Object.assign(streakUpdate, {
                gold: curGold + bonusGold, diamonds: curDia + bonusDia,
                exp: newExp, level: newLv, noteStreakBonusDate: today,
              });
              alert(`🔥 ${newStreak}일 연속 작성! 보너스: 골드 +${bonusGold} / 다이아 +${bonusDia} / 경험치 +${bonusExp}`);
            }
          }
          await updateDoc(studentRef, streakUpdate);
          setStreak(newStreak);
        }

        setNotes(prev => [{ id: ref.id, ...payload, createdAt: { seconds: Date.now() / 1000 } }, ...prev]);
      }

      resetForm();
      setView('list');
    } catch (e) { console.error(e); alert('제출에 실패했습니다.'); }
    finally { setIsSubmitting(false); }
  };

  // ── 승인된 노트 읽음 처리 ─────────────────────────────────────
  useEffect(() => {
    if (!myInfo || notes.length === 0) return;
    notes.filter(n => n.status === 'approved' && !n.studentSeen).forEach(n => {
      updateDoc(doc(db, 'learningNotes', n.id), { studentSeen: true }).catch(() => {});
    });
  }, [notes, myInfo]);

  if (loading) return (
    <div className="flex items-center justify-center h-full text-slate-400 font-bold">불러오는 중...</div>
  );

  // ── WRITE view ─────────────────────────────────────────────────
  if (view === 'write') {
    const usedInForm = new Set(subjects.map(s => s.subject).filter(Boolean));
    return (
      <div className="max-w-2xl mx-auto pb-12">
        {/* 헤더 */}
        <div className="bg-gradient-to-br from-indigo-600 to-violet-700 px-6 py-5 mb-6 rounded-2xl shadow-lg">
          <div className="flex items-center gap-3 mb-1">
            <button onClick={() => { setView('list'); resetForm(); }}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold transition-colors text-sm">
              ←
            </button>
            <h2 className="text-xl font-extrabold text-white">
              {editingNoteId ? '✏️ 배움노트 수정' : '📝 배움노트 작성'}
            </h2>
          </div>
          <p className="text-indigo-200 text-xs ml-11">배운 내용을 정리하고 선생님께 제출해요</p>
        </div>

        <div className="px-1 space-y-4">
          {/* 날짜 + 보상 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
              <label className="text-[11px] font-bold text-slate-400 block mb-2">📅 작성 날짜</label>
              <input
                type="date" value={writeDate} min={minDate} max={today}
                onChange={e => setWriteDate(e.target.value)}
                disabled={!!editingNoteId}
                className="w-full border-2 border-slate-100 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:border-indigo-400 bg-white disabled:bg-slate-50 disabled:cursor-not-allowed"
              />
              {writeDate !== today && !editingNoteId && (
                <p className="text-[10px] text-amber-600 mt-1.5 font-bold">⚠️ 오늘 이전 날짜</p>
              )}
            </div>
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border border-amber-100 p-4 shadow-sm flex flex-col justify-center">
              <div className="text-[11px] font-bold text-amber-600 mb-1.5">🎁 과목당 보상</div>
              <div className="space-y-0.5">
                <div className="text-xs text-amber-700 font-bold">🪙 {settings.rewardGold} 골드</div>
                <div className="text-xs text-blue-600 font-bold">💎 {settings.rewardDiamond} 다이아</div>
                <div className="text-xs text-purple-600 font-bold">⭐ {settings.rewardExp} EXP</div>
              </div>
            </div>
          </div>

          {subjects.map((sub, idx) => {
            const coreOk    = sub.coreContent.length >= settings.minCoreLength;
            const thoughtOk = sub.myThought.length   >= settings.minThoughtLength;
            const dupSubject = dateSubjects.has(sub.subject);
            const dupInForm  = sub.subject && subjects.filter((s, i) => i !== idx && s.subject === sub.subject).length > 0;
            const isComplete = coreOk && thoughtOk && sub.subject && !dupSubject && !dupInForm;
            const coach = getCoachState(sub);
            const activeCoach = noteCoach[idx];
            return (
              <div key={idx} className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden transition-all
                ${isComplete ? 'border-emerald-300' : 'border-slate-100'}`}>
                <div className={`px-5 py-3 flex items-center justify-between
                  ${isComplete ? 'bg-emerald-50' : 'bg-slate-50'}`}>
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold
                      ${isComplete ? 'bg-emerald-500 text-white' : 'bg-slate-300 text-white'}`}>
                      {isComplete ? '✓' : idx + 1}
                    </div>
                    <span className={`font-extrabold text-sm ${isComplete ? 'text-emerald-700' : 'text-slate-700'}`}>
                      과목 {idx + 1}
                    </span>
                  </div>
                  {subjects.length > 1 && (
                    <button onClick={() => removeSubjectRow(idx)}
                      className="text-slate-400 hover:text-rose-500 text-xs font-bold px-2 py-1 rounded-lg hover:bg-rose-50 transition-colors">
                      ✕
                    </button>
                  )}
                </div>

                <div className="p-5 space-y-4">
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1.5">📖 과목 선택</label>
                    <select value={sub.subject} onChange={e => updateField(idx, 'subject', e.target.value)}
                      className="w-full border-2 border-slate-100 rounded-xl px-4 py-2.5 text-sm font-bold focus:outline-none focus:border-indigo-400 bg-white">
                      <option value="">-- 과목 선택 --</option>
                      {SUBJECTS.map(s => (
                        <option key={s} value={s}
                          disabled={dateSubjects.has(s) || (usedInForm.has(s) && sub.subject !== s)}>
                          {s}{dateSubjects.has(s) ? ' (이미 제출)' : ''}
                        </option>
                      ))}
                    </select>
                    {(dupSubject || dupInForm) && (
                      <p className="text-xs text-rose-500 font-bold mt-1">이미 제출했거나 중복된 과목입니다.</p>
                    )}
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-indigo-200 bg-indigo-50/80">
                    <div className="flex items-start justify-between gap-3 border-b border-indigo-100 px-4 py-3">
                      <div>
                        <p className="text-xs font-black text-indigo-900">🤖 생각 코치 · {coach.stage}</p>
                        <p className="mt-1 text-[11px] font-semibold leading-relaxed text-indigo-700">{coach.message}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-extrabold text-indigo-600">
                        {isComplete ? '작성 완료' : '작성 중'}
                      </span>
                    </div>
                    {coach.prompts.length > 0 && (
                      <div className="grid gap-2 p-3 sm:grid-cols-3">
                        {coach.prompts.map(([prompt, target]) => (
                          <button
                            type="button"
                            key={prompt}
                            onClick={() => selectCoachPrompt(idx, prompt, target)}
                            className={`rounded-xl border px-3 py-2 text-left text-[11px] font-bold leading-relaxed transition-colors ${
                              activeCoach?.prompt === prompt
                                ? 'border-indigo-500 bg-indigo-600 text-white'
                                : 'border-indigo-100 bg-white text-slate-700 hover:border-indigo-300'
                            }`}
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>
                    )}
                    {activeCoach && (
                      <div className="mx-3 mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-relaxed text-amber-800">
                        이 질문에 답하듯 직접 작성해 보세요: {activeCoach.prompt}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-bold text-slate-500">📌 핵심 배움 내용</label>
                      <div className="flex items-center gap-1.5">
                        <div className="h-1 w-16 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${coreOk ? 'bg-emerald-400' : 'bg-indigo-300'}`}
                            style={{ width: `${Math.min(100, sub.coreContent.length / settings.minCoreLength * 100)}%` }} />
                        </div>
                        <span className={`text-[10px] font-bold ${coreOk ? 'text-emerald-500' : 'text-slate-400'}`}>
                          {sub.coreContent.length}/{settings.minCoreLength}
                        </span>
                      </div>
                    </div>
                    <textarea ref={el => coreRefs.current[idx] = el} value={sub.coreContent} onChange={e => updateField(idx, 'coreContent', e.target.value)}
                      placeholder={`오늘 배운 핵심 내용을 적어주세요. (최소 ${settings.minCoreLength}자)`}
                      rows={3}
                      className={`w-full border-2 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none transition-colors
                        ${coreOk ? 'border-emerald-300 bg-emerald-50/30' : 'border-slate-100 focus:border-indigo-400'}`} />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-bold text-slate-500">💭 나의 생각 / 더 알고 싶은 점</label>
                      <div className="flex items-center gap-1.5">
                        <div className="h-1 w-16 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${thoughtOk ? 'bg-emerald-400' : 'bg-indigo-300'}`}
                            style={{ width: `${Math.min(100, sub.myThought.length / settings.minThoughtLength * 100)}%` }} />
                        </div>
                        <span className={`text-[10px] font-bold ${thoughtOk ? 'text-emerald-500' : 'text-slate-400'}`}>
                          {sub.myThought.length}/{settings.minThoughtLength}
                        </span>
                      </div>
                    </div>
                    <textarea ref={el => thoughtRefs.current[idx] = el} value={sub.myThought} onChange={e => updateField(idx, 'myThought', e.target.value)}
                      placeholder={`나의 생각이나 더 알고 싶은 점을 적어주세요. (최소 ${settings.minThoughtLength}자)`}
                      rows={3}
                      className={`w-full border-2 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none transition-colors
                        ${thoughtOk ? 'border-emerald-300 bg-emerald-50/30' : 'border-slate-100 focus:border-indigo-400'}`} />
                  </div>

                  <input ref={el => fileRefs.current[idx] = el} type="file" accept="image/*" className="hidden"
                    onChange={e => handleImagePick(idx, e.target.files?.[0])} />
                  {sub.imageBase64 ? (
                    <div className="relative inline-block">
                      <img src={sub.imageBase64} alt="" className="max-h-40 rounded-xl border border-slate-200" />
                      <button onClick={() => updateField(idx, 'imageBase64', '')}
                        className="absolute top-1.5 right-1.5 bg-black/50 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center">✕</button>
                    </div>
                  ) : (
                    <button onClick={() => fileRefs.current[idx]?.click()} disabled={compressingIdx === idx}
                      className="flex items-center gap-2 text-xs text-slate-400 hover:text-indigo-500 border border-dashed border-slate-200 hover:border-indigo-300 rounded-xl px-4 py-2.5 transition-colors w-full justify-center">
                      {compressingIdx === idx ? '⏳ 처리 중...' : '📷 사진 첨부 (선택)'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          <button onClick={addSubjectRow} disabled={subjects.length >= 6}
            className="w-full py-3 rounded-2xl border-2 border-dashed border-indigo-200 text-indigo-400 hover:text-indigo-600 hover:border-indigo-400 font-bold text-sm hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {subjects.length >= 6 ? '최대 6과목' : `+ 과목 추가 (${subjects.length}/6)`}
          </button>

          <button onClick={submit} disabled={!isFormValid || isSubmitting}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-extrabold text-base disabled:opacity-50 transition-all shadow-lg shadow-indigo-200 disabled:shadow-none active:scale-[0.98]">
            {isSubmitting ? '제출 중...' : editingNoteId ? '✏️ 수정 완료' : '📤 배움노트 제출'}
          </button>
        </div>
      </div>
    );
  }

  // ── LIST view ──────────────────────────────────────────────────
  const weekStart    = getWeekStart();
  const weekNotes    = notes.filter(n => n.date >= weekStart);
  const weekApproved = notes.filter(n => n.status === 'approved' && n.date >= weekStart);
  const weekGold     = weekApproved.reduce((s, n) => s + (n.subjectCount || 0) * settings.rewardGold,    0);
  const weekDia      = weekApproved.reduce((s, n) => s + (n.subjectCount || 0) * settings.rewardDiamond, 0);
  const weekExp      = weekApproved.reduce((s, n) => s + (n.subjectCount || 0) * settings.rewardExp,     0);

  const calendarNotes = selectedDate ? notes.filter(n => n.date === selectedDate) : null;
  const displayNotes  = selectedDate ? calendarNotes : notes;

  return (
    <div className={`w-full pb-12 space-y-4 px-4 ${themeMode === 'dark' ? '' : 'bg-slate-50'}`}>

      {/* 히어로 헤더 */}
      <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-700 rounded-2xl shadow-lg px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-white mb-1">📚 배움노트</h1>
            <p className="text-indigo-200 text-xs">배운 내용을 기록하고 선생님께 승인을 받아 보상을 획득해요</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-2xl font-extrabold text-white">{notes.length}</div>
              <div className="text-indigo-200 text-[10px] font-bold">전체 노트</div>
            </div>
            <button onClick={() => { setWriteDate(today); setView('write'); }}
              className="px-4 py-2.5 rounded-xl bg-white text-indigo-700 font-extrabold text-sm hover:bg-indigo-50 transition-colors shadow-md">
              ✏️ 작성하기
            </button>
          </div>
        </div>
      </div>

      {/* 이번주 통계 */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { value: weekNotes.length,    label: '이번주 제출', icon: '📝', from: 'from-indigo-500', to: 'to-indigo-600' },
          { value: weekApproved.length, label: '이번주 승인', icon: '✅', from: 'from-emerald-500', to: 'to-emerald-600' },
          { value: `+${weekGold}`,      label: '획득 골드',   icon: '🪙', from: 'from-amber-400',  to: 'to-amber-500' },
          { value: `+${weekDia}`,       label: '획득 다이아', icon: '💎', from: 'from-sky-500',    to: 'to-sky-600' },
          { value: `+${weekExp}`,       label: '획득 경험치', icon: '⭐', from: 'from-violet-500', to: 'to-violet-600' },
        ].map(({ value, label, icon, from, to }) => (
          <div key={label} className={`bg-gradient-to-br ${from} ${to} rounded-2xl p-4 text-center shadow-md`}>
            <div className="text-xl font-extrabold text-white">{value}</div>
            <div className="text-[10px] text-white/80 font-bold mt-0.5">{icon} {label}</div>
          </div>
        ))}
      </div>

      {/* 보상 카드 + 스트릭 카드 (필터 버튼 위) */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl border border-indigo-100 p-4">
          <div className="text-sm font-extrabold text-indigo-700 mb-3">🎁 과목당 보상 (승인 시)</div>
          <div className="space-y-2.5">
            {[
              { label: '🪙 골드',   value: settings.rewardGold,    textCls: 'text-amber-600',  barCls: 'bg-amber-400',  trackCls: 'bg-amber-100' },
              { label: '💎 다이아', value: settings.rewardDiamond, textCls: 'text-sky-600',    barCls: 'bg-sky-400',   trackCls: 'bg-sky-100' },
              { label: '⭐ EXP',   value: settings.rewardExp,     textCls: 'text-violet-600', barCls: 'bg-violet-400', trackCls: 'bg-violet-100' },
            ].map(({ label, value, textCls, barCls, trackCls }) => (
              <div key={label} className="flex items-center gap-3">
                <span className={`w-20 text-xs font-bold ${textCls}`}>{label}</span>
                <div className={`flex-1 h-2 ${trackCls} rounded-full overflow-hidden`}>
                  <div className={`h-full ${barCls} rounded-full`} style={{ width: '60%' }} />
                </div>
                <span className={`text-sm font-extrabold ${textCls} w-8 text-right`}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {streak > 0 ? (
          <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl border border-orange-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">🔥</span>
              <div>
                <div className="font-extrabold text-orange-600 text-base">{streak}일 연속 작성!</div>
                <div className="text-xs text-orange-400">주말 제외 연속 기록</div>
              </div>
            </div>
            {streak % 5 !== 0 && (
              <>
                <div className="h-2 bg-orange-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-orange-400 to-amber-500 rounded-full transition-all"
                    style={{ width: `${(streak % 5) / 5 * 100}%` }} />
                </div>
                <div className="text-xs text-orange-400 mt-1.5 font-bold">
                  {5 - (streak % 5)}일 후 보너스 (+50🪙💎⭐)
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 flex flex-col items-center justify-center text-center">
            <div className="text-3xl mb-2">✍️</div>
            <div className="text-sm font-bold text-slate-500">오늘 배움노트를 작성해보세요!</div>
            <div className="text-xs text-slate-400 mt-1">5일 연속 작성하면 보너스 보상!</div>
          </div>
        )}
      </div>

      {/* 필터 버튼 */}
      <div className="flex gap-2">
        <button
          onClick={() => setSelectedDate(null)}
          className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors
            ${!selectedDate
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
          📋 전체보기
        </button>
        <button
          onClick={() => setSelectedDate(today)}
          className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors
            ${selectedDate === today
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
          📅 오늘 노트
        </button>
      </div>

      {/* 달력 (가운데 정렬) */}
      <div className="flex justify-center">
        <div className="w-full max-w-sm">
          <CalendarView
            notes={notes}
            selectedDate={selectedDate}
            onSelectDate={d => setSelectedDate(prev => prev === d ? null : d)}
            currentMonth={currentMonth}
            onPrevMonth={() => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            onNextMonth={() => {
              const next = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
              if (next <= new Date()) setCurrentMonth(next);
            }}
          />
        </div>
      </div>

      {/* 날짜 필터 표시 (달력 아래) */}
      {selectedDate && calendarNotes && calendarNotes.length > 0 && (
        <div className="bg-indigo-50 rounded-2xl px-4 py-3 border border-indigo-100 flex items-center justify-between">
          <span className="text-sm font-bold text-indigo-700">
            📅 {selectedDate} · {calendarNotes.length}건
          </span>
          <button onClick={() => setSelectedDate(null)}
            className="text-xs text-indigo-500 hover:text-indigo-700 font-bold bg-white px-3 py-1 rounded-lg border border-indigo-200 transition-colors">
            전체보기
          </button>
        </div>
      )}

      {/* 노트 목록 */}
      {displayNotes.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className="text-6xl mb-4">{selectedDate ? '📭' : '📖'}</div>
          <div className="font-extrabold text-slate-700 text-lg mb-1">
            {selectedDate ? '이 날짜에 작성한 노트가 없어요' : '아직 작성한 배움노트가 없어요'}
          </div>
          <div className="text-sm text-slate-400 mb-5">
            {selectedDate ? '다른 날짜를 선택하거나 새로 작성해 보세요' : '오늘 배운 내용을 기록해보세요!'}
          </div>
          {!selectedDate && (
            <button onClick={() => { setWriteDate(today); setView('write'); }}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-extrabold text-sm hover:from-indigo-500 hover:to-violet-500 transition-all shadow-md">
              ✏️ 첫 번째 배움노트 작성하기
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          {displayNotes.map(note => {
            const badge     = STATUS_BADGE[note.status] || STATUS_BADGE.pending;
            const isPending = note.status === 'pending';
            const accentCls = note.status === 'approved' ? 'border-l-emerald-400'
                            : note.status === 'rejected'  ? 'border-l-rose-400'
                            : 'border-l-amber-300';
            return (
              <div key={note.id}
                className={`bg-white rounded-2xl border border-slate-100 border-l-4 ${accentCls} hover:shadow-md hover:-translate-y-0.5 transition-all flex flex-col`}>
                <div className="p-3 flex-1">
                  {/* 날짜 + 상태 */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-slate-500 font-bold bg-slate-50 px-2 py-0.5 rounded-lg">{note.date}</span>
                    <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border ${badge.cls}`}>
                      {note.status === 'approved' ? '✅' : note.status === 'rejected' ? '❌' : '🕐'}
                    </span>
                  </div>
                  {/* 과목 태그 */}
                  <div className="flex flex-wrap gap-1 mb-2">
                    {(note.subjects || []).map((s, i) => (
                      <span key={i} className="text-[9px] bg-indigo-50 text-indigo-700 font-bold px-1.5 py-0.5 rounded-lg border border-indigo-100">
                        {s.subject}
                      </span>
                    ))}
                  </div>
                  {/* 핵심 내용 미리보기 */}
                  {note.subjects?.[0]?.coreContent && (
                    <p className="text-[10px] text-slate-600 line-clamp-2 leading-relaxed mb-1.5">
                      {note.subjects[0].coreContent}
                    </p>
                  )}
                  {/* 선생님 코멘트 */}
                  {note.teacherComment && (
                    <p className={`text-[9px] rounded-lg px-2 py-1 mt-1 line-clamp-1
                      ${note.status === 'rejected'
                        ? 'text-rose-600 bg-rose-50 border border-rose-100'
                        : 'text-emerald-600 bg-emerald-50 border border-emerald-100'}`}>
                      💬 {note.teacherComment}
                    </p>
                  )}
                </div>
                <div className="px-3 pb-3 flex gap-1.5">
                  <button onClick={() => setDetailNote(note)}
                    className="flex-1 py-1.5 rounded-xl text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 transition-colors">
                    자세히 보기
                  </button>
                  {isPending && (
                    <button
                      onClick={e => { e.stopPropagation(); openEdit(note); }}
                      className="flex-1 py-1.5 rounded-xl text-[10px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-100 transition-colors">
                      ✏️ 수정
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 상세 모달 */}
      {detailNote && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setDetailNote(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
            <div className={`p-4 border-b flex items-center justify-between shrink-0
              ${detailNote.status === 'approved' ? 'bg-emerald-50 border-emerald-100'
              : detailNote.status === 'rejected'  ? 'bg-rose-50 border-rose-100'
              : 'bg-amber-50 border-amber-100'}`}>
              <div>
                <div className="font-extrabold text-slate-800 text-sm mb-1">📅 {detailNote.date}</div>
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${(STATUS_BADGE[detailNote.status] || STATUS_BADGE.pending).cls}`}>
                  {(STATUS_BADGE[detailNote.status] || STATUS_BADGE.pending).label}
                </span>
              </div>
              <button onClick={() => setDetailNote(null)}
                className="text-slate-400 hover:text-slate-600 text-xl w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white/60 transition-colors">✕</button>
            </div>
            <div className="overflow-y-auto p-4 space-y-4 flex-1">
              {detailNote.teacherComment && (
                <div className={`rounded-xl px-4 py-3 text-sm
                  ${detailNote.status === 'rejected'
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                  <span className="font-bold">선생님 코멘트: </span>{detailNote.teacherComment}
                </div>
              )}
              {(detailNote.subjects || []).map((s, i) => (
                <div key={i} className="border border-slate-100 rounded-xl p-4 space-y-3 bg-slate-50">
                  <div className="font-extrabold text-indigo-700 text-sm bg-indigo-50 inline-block px-3 py-1 rounded-lg border border-indigo-100">{s.subject}</div>
                  <div>
                    <div className="text-[11px] font-bold text-slate-500 mb-1">📌 핵심 배움</div>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{s.coreContent}</p>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-slate-500 mb-1">💭 나의 생각</div>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{s.myThought}</p>
                  </div>
                  {s.imageBase64 && (
                    <img src={s.imageBase64} alt="" className="w-full rounded-xl max-h-60 object-contain bg-white border border-slate-200" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
