import React, { useState, useEffect, useRef } from 'react';
import {
  collection, getDocs, addDoc, updateDoc,
  doc, query, where, serverTimestamp, getDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';

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

// ── 달력 컴포넌트 (컴팩트) ───────────────────────────────────────
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
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <button onClick={onPrevMonth}
          className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 font-bold transition-colors text-sm">‹</button>
        <span className="font-extrabold text-slate-700 text-[11px]">{year}년 {month + 1}월</span>
        <button onClick={onNextMonth} disabled={isCurrentMonth}
          className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 font-bold transition-colors text-sm disabled:opacity-30 disabled:cursor-not-allowed">›</button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 mb-0.5">
        {weekLabels.map(d => (
          <div key={d} className="text-center text-[9px] font-bold text-slate-400">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((cell, i) => (
          <div key={i} className="flex items-center justify-center">
            {cell ? (
              <button
                onClick={() => onSelectDate(cell.dateStr)}
                className={`w-6 h-6 rounded-lg text-[10px] font-bold transition-all relative flex items-center justify-center
                  ${cell.dateStr === selectedDate
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : cell.dateStr === today
                      ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300'
                      : cell.hasNote
                        ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                        : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {cell.day}
                {cell.hasNote && cell.dateStr !== selectedDate && (
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0.5 h-0.5 rounded-full bg-emerald-500" />
                )}
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-slate-50 text-[9px] text-slate-400 font-bold justify-end">
        <span className="flex items-center gap-0.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-100 inline-block" /> 노트</span>
        <span className="flex items-center gap-0.5"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-100 inline-block ring-1 ring-indigo-300" /> 오늘</span>
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────
export default function LearningNote({ studentCode }) {
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
  const fileRefs = useRef([]);

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

  const addSubjectRow = () => {
    if (subjects.length >= 6) return;
    setSubjects(prev => [...prev, { subject: '', coreContent: '', myThought: '', imageBase64: '' }]);
  };

  const removeSubjectRow = (idx) => {
    if (subjects.length === 1) return;
    setSubjects(prev => prev.filter((_, i) => i !== idx));
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
              const getMax  = (lv) => lv <= 10 ? 100 : lv <= 30 ? 300 : lv <= 60 ? 800 : 2000;
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
      <div className="max-w-2xl mx-auto p-6 space-y-4 pb-12">
        <div className="flex items-center gap-3">
          <button onClick={() => { setView('list'); resetForm(); }}
            className="text-slate-500 hover:text-slate-800 text-sm font-bold px-3 py-1.5 bg-white rounded-xl border border-slate-200">
            ← 목록
          </button>
          <h2 className="text-xl font-extrabold text-slate-800">
            {editingNoteId ? '✏️ 배움노트 수정' : '📝 배움노트 작성'}
          </h2>
        </div>

        {/* 날짜 선택 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <label className="text-xs font-bold text-slate-600 block mb-2">📅 작성 날짜</label>
          <input
            type="date" value={writeDate} min={minDate} max={today}
            onChange={e => setWriteDate(e.target.value)}
            disabled={!!editingNoteId}
            className="border-2 border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-400 bg-white disabled:bg-slate-50 disabled:cursor-not-allowed"
          />
          {writeDate !== today && !editingNoteId && (
            <p className="text-xs text-amber-600 mt-1.5 font-bold">⚠️ 오늘 이전 날짜로 작성합니다.</p>
          )}
        </div>

        {/* 보상 안내 */}
        <div className="bg-indigo-50 rounded-2xl border border-indigo-100 px-4 py-3 flex items-center gap-3">
          <span className="text-xl">🎁</span>
          <span className="text-xs text-indigo-700 font-bold">
            과목당 보상: 골드 {settings.rewardGold} · 경험치 {settings.rewardExp} · 다이아 {settings.rewardDiamond}
          </span>
        </div>

        {subjects.map((sub, idx) => {
          const coreOk    = sub.coreContent.length >= settings.minCoreLength;
          const thoughtOk = sub.myThought.length   >= settings.minThoughtLength;
          const dupSubject = dateSubjects.has(sub.subject);
          const dupInForm  = sub.subject && subjects.filter((s, i) => i !== idx && s.subject === sub.subject).length > 0;
          return (
            <div key={idx} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-slate-700 text-sm">📖 과목 {idx + 1}</span>
                {subjects.length > 1 && (
                  <button onClick={() => removeSubjectRow(idx)}
                    className="text-slate-400 hover:text-rose-500 text-xs font-bold px-2 py-1 rounded-lg hover:bg-rose-50 transition-colors">
                    ✕ 삭제
                  </button>
                )}
              </div>

              <select value={sub.subject} onChange={e => updateField(idx, 'subject', e.target.value)}
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 bg-white">
                <option value="">-- 과목 선택 --</option>
                {SUBJECTS.map(s => (
                  <option key={s} value={s}
                    disabled={dateSubjects.has(s) || (usedInForm.has(s) && sub.subject !== s)}>
                    {s}{dateSubjects.has(s) ? ' (이 날짜 이미 제출)' : ''}
                  </option>
                ))}
              </select>
              {(dupSubject || dupInForm) && (
                <p className="text-xs text-rose-500 font-bold">이미 제출했거나 폼에서 중복된 과목입니다.</p>
              )}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-600">📌 핵심 배움 내용</label>
                  <span className={`text-xs font-bold ${coreOk ? 'text-emerald-500' : 'text-slate-400'}`}>
                    {sub.coreContent.length}/{settings.minCoreLength}자
                  </span>
                </div>
                <textarea value={sub.coreContent} onChange={e => updateField(idx, 'coreContent', e.target.value)}
                  placeholder={`오늘 배운 핵심 내용을 적어주세요. (최소 ${settings.minCoreLength}자)`}
                  rows={3}
                  className={`w-full border-2 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none transition-colors
                    ${coreOk ? 'border-emerald-300' : 'border-slate-200 focus:border-indigo-400'}`} />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-600">💭 나의 생각 / 더 알고 싶은 점</label>
                  <span className={`text-xs font-bold ${thoughtOk ? 'text-emerald-500' : 'text-slate-400'}`}>
                    {sub.myThought.length}/{settings.minThoughtLength}자
                  </span>
                </div>
                <textarea value={sub.myThought} onChange={e => updateField(idx, 'myThought', e.target.value)}
                  placeholder={`나의 생각이나 더 알고 싶은 점을 적어주세요. (최소 ${settings.minThoughtLength}자)`}
                  rows={3}
                  className={`w-full border-2 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none transition-colors
                    ${thoughtOk ? 'border-emerald-300' : 'border-slate-200 focus:border-indigo-400'}`} />
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
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-500 border border-dashed border-slate-300 hover:border-indigo-400 rounded-xl px-3 py-2 transition-colors">
                  {compressingIdx === idx ? '⏳ 처리 중...' : '📷 사진 첨부 (선택)'}
                </button>
              )}
            </div>
          );
        })}

        <button onClick={addSubjectRow} disabled={subjects.length >= 6}
          className="w-full py-3 rounded-2xl border-2 border-dashed border-indigo-300 text-indigo-500 font-bold text-sm hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          {subjects.length >= 6 ? '최대 6과목까지 작성 가능합니다' : `+ 과목 추가 (${subjects.length}/6)`}
        </button>

        <button onClick={submit} disabled={!isFormValid || isSubmitting}
          className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold disabled:opacity-50 transition-colors">
          {isSubmitting ? '제출 중...' : editingNoteId ? '✏️ 수정 완료' : '📤 배움노트 제출'}
        </button>
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
    <div className="max-w-5xl mx-auto p-6 space-y-4">

      {/* 헤더 — 전체 노트 수 포함 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-extrabold text-slate-800">📚 배움노트</h1>
          <span className="text-sm font-bold text-slate-500 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm">
            전체 {notes.length}건
          </span>
        </div>
        <button onClick={() => { setWriteDate(today); setView('write'); }}
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-colors">
          ✏️ 작성하기
        </button>
      </div>

      {/* 이번주 통계 5칸 (매주 월요일 초기화) */}
      <div className="grid grid-cols-5 gap-2">
        <div className="bg-indigo-50 rounded-xl p-3 text-center border border-indigo-100">
          <div className="text-xl font-extrabold text-indigo-600">{weekNotes.length}</div>
          <div className="text-[10px] text-slate-500 font-bold mt-0.5">📝 이번주 제출</div>
        </div>
        <div className="bg-emerald-50 rounded-xl p-3 text-center border border-emerald-100">
          <div className="text-xl font-extrabold text-emerald-600">{weekApproved.length}</div>
          <div className="text-[10px] text-slate-500 font-bold mt-0.5">✅ 이번주 승인</div>
        </div>
        <div className="bg-amber-50 rounded-xl p-3 text-center border border-amber-100">
          <div className="text-xl font-extrabold text-amber-600">+{weekGold}</div>
          <div className="text-[10px] text-slate-500 font-bold mt-0.5">🪙 획득 골드</div>
        </div>
        <div className="bg-sky-50 rounded-xl p-3 text-center border border-sky-100">
          <div className="text-xl font-extrabold text-sky-600">+{weekDia}</div>
          <div className="text-[10px] text-slate-500 font-bold mt-0.5">💎 획득 다이아</div>
        </div>
        <div className="bg-purple-50 rounded-xl p-3 text-center border border-purple-100">
          <div className="text-xl font-extrabold text-purple-600">+{weekExp}</div>
          <div className="text-[10px] text-slate-500 font-bold mt-0.5">⭐ 획득 경험치</div>
        </div>
      </div>

      {/* 달력(1/2 크기) + 오른쪽 패널 */}
      <div className="grid grid-cols-2 gap-3">
        {/* 왼쪽: 버튼 + 달력 */}
        <div className="space-y-2">
          {/* 달력 위 필터 버튼 */}
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedDate(null)}
              className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-colors
                ${!selectedDate
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              📋 날짜 전체보기
            </button>
            <button
              onClick={() => setSelectedDate(today)}
              className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-colors
                ${selectedDate === today
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              📅 오늘 배움노트
            </button>
          </div>
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

        {/* 오른쪽: 보상 안내 + 스트릭 + 날짜 필터 표시 */}
        <div className="flex flex-col gap-2">
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-100 px-3 py-3 flex items-center gap-2">
            <span className="text-lg shrink-0">🎁</span>
            <div>
              <div className="text-[11px] font-extrabold text-indigo-700">승인 시 과목당 보상</div>
              <div className="text-[10px] text-indigo-600 mt-0.5">
                🪙 {settings.rewardGold} · 💎 {settings.rewardDiamond} · ⭐ {settings.rewardExp} EXP
              </div>
            </div>
          </div>
          {streak > 0 && (
            <div className="bg-orange-50 rounded-xl border border-orange-100 px-3 py-3">
              <div className="text-lg font-extrabold text-orange-500">🔥 {streak}일 연속 작성!</div>
              {streak % 5 !== 0 && (
                <div className="text-[10px] text-slate-400 mt-0.5">{5 - (streak % 5)}일 후 보너스 (+50🪙💎⭐)</div>
              )}
            </div>
          )}
          {selectedDate && calendarNotes && calendarNotes.length > 0 && (
            <div className="bg-indigo-50 rounded-xl px-3 py-2.5 border border-indigo-100 flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-700">
                📅 {selectedDate} · {calendarNotes.length}건
              </span>
              <button onClick={() => setSelectedDate(null)}
                className="text-[10px] text-indigo-400 hover:text-indigo-700 font-bold">전체</button>
            </div>
          )}
        </div>
      </div>

      {/* 노트 목록 (6열 그리드) */}
      {displayNotes.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <div className="text-5xl mb-3">{selectedDate ? '📭' : '📝'}</div>
          <div className="font-bold">{selectedDate ? '이 날짜에 작성한 노트가 없습니다' : '아직 작성한 노트가 없어요'}</div>
          {!selectedDate && <div className="text-sm mt-1">배움을 기록해보세요!</div>}
        </div>
      ) : (
        <div className="grid grid-cols-6 gap-2">
          {displayNotes.map(note => {
            const badge     = STATUS_BADGE[note.status] || STATUS_BADGE.pending;
            const isPending = note.status === 'pending';
            const stripCls  = note.status === 'approved' ? 'bg-emerald-400'
                            : note.status === 'rejected'  ? 'bg-rose-400'
                            : 'bg-amber-300';
            return (
              <div key={note.id}
                className="bg-white rounded-xl border border-slate-100 hover:border-indigo-200 hover:shadow-sm transition-all overflow-hidden flex flex-col">
                <div className={`h-1 ${stripCls}`} />
                <div className="p-2.5 flex-1">
                  {/* 날짜 + 상태 */}
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-slate-400 font-medium">{note.date}</span>
                    <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full border ${badge.cls}`}>
                      {note.status === 'approved' ? '✅' : note.status === 'rejected' ? '❌' : '🕐'}
                    </span>
                  </div>
                  {/* 과목 태그 */}
                  <div className="flex flex-wrap gap-0.5 mb-1.5">
                    {(note.subjects || []).map((s, i) => (
                      <span key={i} className="text-[9px] bg-indigo-50 text-indigo-700 font-bold px-1.5 py-0.5 rounded">{s.subject}</span>
                    ))}
                  </div>
                  {/* 핵심 배움 내용 (클릭 없이 바로 표시) */}
                  {(note.subjects || []).map((s, i) => s.coreContent && (
                    <div key={i} className="mb-1">
                      <p className="text-[10px] text-slate-600 line-clamp-3 leading-relaxed">{s.coreContent}</p>
                    </div>
                  ))}
                  {/* 선생님 코멘트 */}
                  {note.teacherComment && (
                    <p className={`text-[9px] rounded px-1.5 py-1 mt-1 line-clamp-1
                      ${note.status === 'rejected' ? 'text-rose-600 bg-rose-50' : 'text-emerald-600 bg-emerald-50'}`}>
                      💬 {note.teacherComment}
                    </p>
                  )}
                  {/* 자세히 보기 */}
                  <button onClick={() => setDetailNote(note)}
                    className="text-[9px] text-indigo-400 hover:text-indigo-600 font-bold mt-1.5">
                    자세히 →
                  </button>
                </div>
                {isPending && (
                  <div className="px-2 pb-2 pt-1 border-t border-slate-50 bg-amber-50/30">
                    <button
                      onClick={e => { e.stopPropagation(); openEdit(note); }}
                      className="w-full text-[9px] font-bold text-amber-600 bg-amber-100 hover:bg-amber-200 py-1 rounded-lg transition-colors">
                      ✏️ 수정
                    </button>
                  </div>
                )}
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
            <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <div className="font-extrabold text-slate-800 text-sm mb-1">{detailNote.date}</div>
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${(STATUS_BADGE[detailNote.status] || STATUS_BADGE.pending).cls}`}>
                  {(STATUS_BADGE[detailNote.status] || STATUS_BADGE.pending).label}
                </span>
              </div>
              <button onClick={() => setDetailNote(null)}
                className="text-slate-400 hover:text-slate-600 text-xl w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100">✕</button>
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
                  <div className="font-extrabold text-indigo-700 text-sm bg-indigo-50 inline-block px-3 py-1 rounded-lg">{s.subject}</div>
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
