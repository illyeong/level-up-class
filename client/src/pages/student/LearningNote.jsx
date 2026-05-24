import React, { useState, useEffect, useRef } from 'react';
import {
  collection, getDocs, addDoc, updateDoc,
  doc, query, where, serverTimestamp, getDoc, setDoc,
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

const STATUS_BADGE = {
  pending:  { label: '🕐 승인 대기', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  approved: { label: '✅ 승인 완료', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  rejected: { label: '❌ 반려',     cls: 'bg-rose-100 text-rose-700 border-rose-200' },
};

const HEAT_COLORS = [
  'bg-slate-100',
  'bg-emerald-200',
  'bg-emerald-400',
  'bg-emerald-600',
];

export default function LearningNote({ studentCode }) {
  const [myInfo, setMyInfo]     = useState(null);
  const [notes, setNotes]       = useState([]);
  const [settings, setSettings] = useState({ minCoreLength: 10, minThoughtLength: 20, rewardGold: 30, rewardExp: 30, rewardDiamond: 20 });
  const [loading, setLoading]   = useState(true);
  const [view, setView]         = useState('list'); // 'list' | 'write' | 'detail'
  const [selected, setSelected] = useState(null);
  const [streak, setStreak]     = useState(0);

  // write form
  const [subjects, setSubjects] = useState([{ subject: '', coreContent: '', myThought: '', imageBase64: '' }]);
  const [isSubmitting, setIsSubmitting]   = useState(false);
  const [compressingIdx, setCompressingIdx] = useState(null);
  const fileRefs = useRef([]);

  const today = toKSTDateString();

  // ── load myInfo ─────────────────────────────────────────────
  useEffect(() => {
    if (!studentCode) return;
    (async () => {
      const snap = await getDocs(query(collection(db, 'students'), where('studentCode', '==', studentCode)));
      if (!snap.empty) {
        const d = snap.docs[0];
        setMyInfo({ id: d.id, name: d.data().name, teacherUid: d.data().teacherUid, ...d.data() });
      }
    })();
  }, [studentCode]);

  // ── load notes + settings ────────────────────────────────────
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
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setNotes(list);
        if (settSnap?.exists()) {
          setSettings(s => ({ ...s, ...settSnap.data() }));
        }
        setStreak(computeStreak(list));
      } finally { setLoading(false); }
    })();
  }, [myInfo]);

  const computeStreak = (noteList) => {
    const days = new Set(noteList.map(n => n.date));
    let count = 0;
    let d = new Date(today);
    while (true) {
      const s = d.toISOString().slice(0, 10);
      if (days.has(s)) { count++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return count;
  };

  // ── heatmap data (last 16 weeks = 112 days) ──────────────────
  const heatmapData = (() => {
    const countByDate = {};
    notes.forEach(n => { countByDate[n.date] = (countByDate[n.date] || 0) + (n.subjectCount || 1); });
    const days = [];
    for (let i = 111; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const s = d.toISOString().slice(0, 10);
      days.push({ date: s, count: countByDate[s] || 0 });
    }
    return days;
  })();

  const heatColor = (count) => {
    if (count === 0) return HEAT_COLORS[0];
    if (count <= 2)  return HEAT_COLORS[1];
    if (count <= 4)  return HEAT_COLORS[2];
    return HEAT_COLORS[3];
  };

  // ── today's submitted subjects ─────────────────────────────
  const todaySubjects = new Set(
    notes.filter(n => n.date === today).flatMap(n => (n.subjects || []).map(s => s.subject))
  );

  // ── write form helpers ────────────────────────────────────────
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
    s.myThought.length >= settings.minThoughtLength &&
    !todaySubjects.has(s.subject)
  ) && new Set(subjects.map(s => s.subject).filter(Boolean)).size === subjects.filter(s => s.subject).length;

  const handleImagePick = async (idx, file) => {
    if (!file) return;
    setCompressingIdx(idx);
    try {
      const base64 = await compressImage(file);
      updateField(idx, 'imageBase64', base64);
    } finally { setCompressingIdx(null); }
  };

  // ── submit ────────────────────────────────────────────────────
  const submit = async () => {
    if (!isFormValid || !myInfo) return;
    setIsSubmitting(true);
    try {
      const payload = {
        studentId:    myInfo.id,
        studentCode,
        studentName:  myInfo.name,
        teacherUid:   myInfo.teacherUid,
        date:         today,
        subjects:     subjects.map(s => ({
          subject:      s.subject,
          coreContent:  s.coreContent.trim(),
          myThought:    s.myThought.trim(),
          imageBase64:  s.imageBase64 || null,
        })),
        subjectCount: subjects.length,
        status:       'pending',
        teacherComment: '',
        rewardPaid:   false,
        studentSeen:  false,
        createdAt:    serverTimestamp(),
        approvedAt:   null,
      };
      const ref = await addDoc(collection(db, 'learningNotes'), payload);

      // streak update
      const newStreak = computeStreak([...notes, { date: today }]);
      const studentRef = doc(db, 'students', myInfo.id);
      const streakUpdate = { noteStreak: newStreak, noteLastDate: today };

      // streak bonus: every 5 days
      if (newStreak > 0 && newStreak % 5 === 0) {
        const prevData = (await getDoc(studentRef)).data();
        const lastBonus = prevData?.noteStreakBonusDate || '';
        if (lastBonus !== today) {
          const bonusGold = 50, bonusDia = 50, bonusExp = 50;
          const curGold = prevData?.gold || 0;
          const curDia  = prevData?.diamonds || 0;
          const curExp  = prevData?.exp || 0;
          const curLv   = prevData?.level || 1;
          const getMax  = (lv) => lv <= 10 ? 100 : lv <= 30 ? 300 : lv <= 60 ? 800 : 2000;
          let newExp = curExp + bonusExp;
          let newLv  = curLv;
          while (newExp >= getMax(newLv)) { newExp -= getMax(newLv); newLv++; }
          streakUpdate.gold     = curGold + bonusGold;
          streakUpdate.diamonds = curDia  + bonusDia;
          streakUpdate.exp      = newExp;
          streakUpdate.level    = newLv;
          streakUpdate.noteStreakBonusDate = today;
          alert(`🔥 ${newStreak}일 연속 작성! 보너스 지급: 골드 +${bonusGold} / 다이아 +${bonusDia} / 경험치 +${bonusExp}`);
        }
      }
      await updateDoc(studentRef, streakUpdate);

      const newNote = { id: ref.id, ...payload, createdAt: { seconds: Date.now() / 1000 } };
      setNotes(prev => [newNote, ...prev]);
      setStreak(newStreak);
      setSubjects([{ subject: '', coreContent: '', myThought: '', imageBase64: '' }]);
      setView('list');
    } catch (e) { console.error(e); alert('제출에 실패했습니다.'); }
    finally { setIsSubmitting(false); }
  };

  // ── mark approved notes as seen ──────────────────────────────
  useEffect(() => {
    if (!myInfo || notes.length === 0) return;
    notes.filter(n => n.status === 'approved' && !n.studentSeen).forEach(n => {
      updateDoc(doc(db, 'learningNotes', n.id), { studentSeen: true }).catch(() => {});
    });
  }, [notes, myInfo]);

  if (loading) return (
    <div className="flex items-center justify-center h-full text-slate-400 font-bold">불러오는 중...</div>
  );

  // ── DETAIL view ───────────────────────────────────────────────
  if (view === 'detail' && selected) {
    const badge = STATUS_BADGE[selected.status] || STATUS_BADGE.pending;
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-4">
        <button onClick={() => { setView('list'); setSelected(null); }}
          className="text-slate-500 hover:text-slate-800 text-sm font-bold">← 목록으로</button>
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">{selected.date}</span>
            <span className={`text-xs font-bold px-3 py-1 rounded-full border ${badge.cls}`}>{badge.label}</span>
          </div>
          {selected.teacherComment && (
            <div className={`rounded-xl px-4 py-3 text-sm ${selected.status === 'rejected' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
              <span className="font-bold">선생님 코멘트: </span>{selected.teacherComment}
            </div>
          )}
          {(selected.subjects || []).map((s, i) => (
            <div key={i} className="border border-slate-100 rounded-xl p-4 space-y-2 bg-slate-50">
              <div className="font-extrabold text-indigo-700 text-sm">{s.subject}</div>
              <div>
                <div className="text-[11px] font-bold text-slate-500 mb-0.5">핵심 배움</div>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{s.coreContent}</p>
              </div>
              <div>
                <div className="text-[11px] font-bold text-slate-500 mb-0.5">나의 생각</div>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{s.myThought}</p>
              </div>
              {s.imageBase64 && (
                <img src={s.imageBase64} alt="" className="w-full rounded-xl max-h-60 object-contain bg-white border border-slate-200" />
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── WRITE view ────────────────────────────────────────────────
  if (view === 'write') {
    const usedInForm = new Set(subjects.map(s => s.subject).filter(Boolean));
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setView('list')} className="text-slate-500 hover:text-slate-800 text-sm font-bold">← 목록</button>
          <h2 className="text-xl font-extrabold text-slate-800">📝 배움노트 작성</h2>
          <span className="ml-auto text-xs text-slate-400">{today}</span>
        </div>

        {subjects.map((sub, idx) => {
          const coreOk = sub.coreContent.length >= settings.minCoreLength;
          const thoughtOk = sub.myThought.length >= settings.minThoughtLength;
          const dupSubject = todaySubjects.has(sub.subject);
          const dupInForm = sub.subject && subjects.filter((s, i) => i !== idx && s.subject === sub.subject).length > 0;
          return (
            <div key={idx} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-slate-700 text-sm">과목 {idx + 1}</span>
                {subjects.length > 1 && (
                  <button onClick={() => removeSubjectRow(idx)}
                    className="text-slate-400 hover:text-rose-500 text-xs font-bold">✕ 삭제</button>
                )}
              </div>

              {/* 과목 선택 */}
              <select value={sub.subject} onChange={e => updateField(idx, 'subject', e.target.value)}
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 bg-white">
                <option value="">-- 과목 선택 --</option>
                {SUBJECTS.map(s => (
                  <option key={s} value={s} disabled={todaySubjects.has(s) || (usedInForm.has(s) && sub.subject !== s)}>
                    {s}{todaySubjects.has(s) ? ' (오늘 이미 제출)' : ''}
                  </option>
                ))}
              </select>
              {(dupSubject || dupInForm) && <p className="text-xs text-rose-500 font-bold">이미 오늘 제출했거나 폼에서 중복된 과목입니다.</p>}

              {/* 핵심 배움 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-600">핵심 배움 내용</label>
                  <span className={`text-xs font-bold ${coreOk ? 'text-emerald-500' : 'text-slate-400'}`}>
                    {sub.coreContent.length}/{settings.minCoreLength}자
                  </span>
                </div>
                <textarea value={sub.coreContent} onChange={e => updateField(idx, 'coreContent', e.target.value)}
                  placeholder={`오늘 배운 핵심 내용을 적어주세요. (최소 ${settings.minCoreLength}자)`}
                  rows={3}
                  className={`w-full border-2 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none transition-colors ${coreOk ? 'border-emerald-300 focus:border-emerald-400' : 'border-slate-200 focus:border-indigo-400'}`} />
              </div>

              {/* 나의 생각 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-600">나의 생각 / 더 알고 싶은 점</label>
                  <span className={`text-xs font-bold ${thoughtOk ? 'text-emerald-500' : 'text-slate-400'}`}>
                    {sub.myThought.length}/{settings.minThoughtLength}자
                  </span>
                </div>
                <textarea value={sub.myThought} onChange={e => updateField(idx, 'myThought', e.target.value)}
                  placeholder={`나의 생각이나 더 알고 싶은 점을 적어주세요. (최소 ${settings.minThoughtLength}자)`}
                  rows={3}
                  className={`w-full border-2 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none transition-colors ${thoughtOk ? 'border-emerald-300 focus:border-emerald-400' : 'border-slate-200 focus:border-indigo-400'}`} />
              </div>

              {/* 사진 첨부 */}
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

        {/* + 과목 추가 */}
        <button
          onClick={addSubjectRow}
          disabled={subjects.length >= 6 || (6 - subjects.length - todaySubjects.size) <= 0}
          className="w-full py-3 rounded-2xl border-2 border-dashed border-indigo-300 text-indigo-500 font-bold text-sm hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          {subjects.length >= 6 ? '최대 6과목까지 작성 가능합니다' : `+ 과목 추가 (${subjects.length}/6)`}
        </button>

        <button onClick={submit} disabled={!isFormValid || isSubmitting}
          className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold disabled:opacity-50 transition-colors">
          {isSubmitting ? '제출 중...' : '📤 배움노트 제출'}
        </button>
        <p className="text-center text-xs text-slate-400">
          승인 시 과목당 골드 {settings.rewardGold} · 경험치 {settings.rewardExp} · 다이아 {settings.rewardDiamond} 지급
        </p>
      </div>
    );
  }

  // ── LIST view ─────────────────────────────────────────────────
  const weekDays = ['일', '월', '화', '수', '목', '금', '토'];
  const heatWeeks = [];
  for (let w = 0; w < 16; w++) heatWeeks.push(heatmapData.slice(w * 7, w * 7 + 7));

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-slate-800">📚 배움노트</h1>
        <button onClick={() => setView('write')}
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-colors">
          ✏️ 오늘 작성
        </button>
      </div>

      {/* 스트릭 + 통계 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-slate-100 text-center shadow-sm">
          <div className="text-2xl font-extrabold text-orange-500">{streak}일</div>
          <div className="text-xs text-slate-500 mt-0.5 font-bold">🔥 연속 작성</div>
          {streak > 0 && streak % 5 !== 0 && (
            <div className="text-[10px] text-slate-400 mt-1">{5 - (streak % 5)}일 후 보너스!</div>
          )}
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-100 text-center shadow-sm">
          <div className="text-2xl font-extrabold text-indigo-600">{notes.length}</div>
          <div className="text-xs text-slate-500 mt-0.5 font-bold">📝 총 노트</div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-100 text-center shadow-sm">
          <div className="text-2xl font-extrabold text-emerald-600">
            {notes.filter(n => n.status === 'approved').length}
          </div>
          <div className="text-xs text-slate-500 mt-0.5 font-bold">✅ 승인 완료</div>
        </div>
      </div>

      {/* 잔디 heatmap */}
      <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
        <div className="text-xs font-bold text-slate-600 mb-3">📅 달성 현황 (최근 16주)</div>
        <div className="flex gap-1">
          <div className="flex flex-col gap-1 mr-1 justify-between" style={{ paddingTop: '2px' }}>
            {weekDays.map(d => <div key={d} className="text-[9px] text-slate-400 font-bold h-3 flex items-center">{d}</div>)}
          </div>
          {heatWeeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-1">
              {week.map((day, di) => (
                <div key={di}
                  title={`${day.date}: ${day.count}과목`}
                  className={`w-3 h-3 rounded-sm ${heatColor(day.count)} ${day.date === today ? 'ring-1 ring-indigo-500' : ''}`} />
              ))}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-3 justify-end">
          <span className="text-[10px] text-slate-400">적음</span>
          {HEAT_COLORS.map((c, i) => <div key={i} className={`w-3 h-3 rounded-sm ${c}`} />)}
          <span className="text-[10px] text-slate-400">많음</span>
        </div>
      </div>

      {/* 노트 목록 */}
      {notes.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <div className="text-5xl mb-3">📭</div>
          <div className="font-bold">아직 작성한 노트가 없어요</div>
          <div className="text-sm mt-1">오늘의 배움을 기록해보세요!</div>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map(note => {
            const badge = STATUS_BADGE[note.status] || STATUS_BADGE.pending;
            return (
              <div key={note.id}
                onClick={() => { setSelected(note); setView('detail'); }}
                className="bg-white rounded-2xl p-4 border border-slate-100 hover:border-indigo-200 hover:shadow-sm cursor-pointer transition-all">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 font-medium">{note.date}</span>
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>
                </div>
                <div className="flex gap-2 flex-wrap mb-2">
                  {(note.subjects || []).map((s, i) => (
                    <span key={i} className="text-xs bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-lg">{s.subject}</span>
                  ))}
                </div>
                {note.teacherComment && note.status === 'rejected' && (
                  <p className="text-xs text-rose-600 bg-rose-50 rounded-lg px-3 py-1.5 mt-1">
                    반려 사유: {note.teacherComment}
                  </p>
                )}
                {note.teacherComment && note.status === 'approved' && (
                  <p className="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-1.5 mt-1">
                    선생님: {note.teacherComment}
                  </p>
                )}
                <div className="text-xs text-slate-400 mt-1">
                  📚 {note.subjectCount}과목 · 승인 시 골드 {(note.subjectCount || 1) * settings.rewardGold}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
