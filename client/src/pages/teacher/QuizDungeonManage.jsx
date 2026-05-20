import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';

// ─────────────────────── 교육과정 데이터 ────────────────────
const NATIONAL = ['국정'];

const CURRICULUM = {
  1: {
    subjects: [
      { name: '국어', publishers: NATIONAL, parts: ['㉮', '㉯'] },
      { name: '국어활동', publishers: NATIONAL },
      { name: '수학', publishers: NATIONAL },
      {
        name: '통합교과', publishers: NATIONAL,
        units: { '1학기': ['학교', '사람들', '우리나라', '탐험'], '2학기': ['하루', '약속', '상상', '이야기'] },
      },
      { name: '입학초기적응활동', publishers: NATIONAL },
      { name: '국어기초학습', publishers: NATIONAL, units: ['한글', '낱말', '문장', '읽기', '쓰기'] },
    ],
  },
  2: {
    subjects: [
      { name: '국어', publishers: NATIONAL, parts: ['㉮', '㉯'] },
      { name: '수학', publishers: NATIONAL },
      {
        name: '통합교과', publishers: NATIONAL,
        units: { '1학기': ['나', '자연', '마을', '세계'], '2학기': ['계절', '인물', '물건', '기억'] },
      },
      { name: '안전한생활', publishers: NATIONAL },
      { name: '국어기초학습', publishers: NATIONAL, units: ['한글', '낱말', '문장', '읽기', '쓰기'] },
    ],
  },
  3: {
    subjects: [
      { name: '국어', publishers: NATIONAL, parts: ['㉮', '㉯'] },
      { name: '수학', publishers: NATIONAL },
      { name: '도덕', publishers: NATIONAL },
      { name: '사회', publishers: ['아이스크림', '동아출판', '미래엔', '비상', 'YBM', '지학사', '천재(박)', '천재(김)'] },
      { name: '과학', publishers: ['아이스크림', '지학사', '동아출판', '미래엔', '비상', '천재(정)', '천재(이)'] },
      { name: '체육', publishers: ['금성', '비상', '지학사', 'YBM', '천재', '교학사', '미래엔', '아이스크림', '체육과건강'] },
      { name: '음악', publishers: ['동아출판', '비상', '지학사', '천재', '아침나라', 'YBM', '아이스크림', '미래엔'] },
      { name: '미술', publishers: ['지학사', '금성', '동아출판', '비상', '아이스크림', '천재', '아트앤컬처', '교학사', '미래엔'] },
      { name: '영어', publishers: ['동아출판', 'YBM최희경', 'YBM김혜리', '천재함순애', '천재김태은', '천재이동환', '미래엔', '아이스크림'] },
    ],
  },
  4: {
    subjects: [
      { name: '국어', publishers: NATIONAL, parts: ['㉮', '㉯'] },
      { name: '수학', publishers: NATIONAL },
      { name: '도덕', publishers: NATIONAL },
      { name: '사회', publishers: ['아이스크림', '동아출판', '미래엔', '비상', 'YBM', '지학사', '천재(박)', '천재(김)'] },
      { name: '과학', publishers: ['아이스크림', '지학사', '동아출판', '미래엔', '비상', '천재(정)', '천재(이)'] },
      { name: '체육', publishers: ['금성', '비상', '지학사', '동아출판', 'YBM', '천재', '교학사', '미래엔', '아이스크림', '체육과건강'] },
      { name: '음악', publishers: ['동아출판', '비상', '지학사', '천재', '아침나라', 'YBM', '아이스크림', '미래엔'] },
      { name: '미술', publishers: ['지학사', '금성', '동아출판', '비상', '아이스크림', '천재', '아트앤컬처', '교학사', '미래엔'] },
      { name: '영어', publishers: ['동아출판', 'YBM최희경', 'YBM김혜리', '천재함순애', '천재김태은', '천재이동환', '미래엔', '아이스크림'] },
    ],
  },
  5: {
    subjects: [
      { name: '국어', publishers: NATIONAL, parts: ['㉮', '㉯'] },
      { name: '수학', publishers: NATIONAL },
      { name: '도덕', publishers: NATIONAL },
      { name: '사회', publishers: ['아이스크림', '동아출판', '미래엔', '비상', 'YBM', '지학사', '천재(박)', '천재(김)'] },
      { name: '과학', publishers: ['아이스크림', '지학사', '미래엔', '비상', '천재(정)'] },
      { name: '실과', publishers: ['아이스크림', '교학사', '비상', '동아출판', '지학사', '금성', '미래엔', 'YBM', '천재'] },
      { name: '체육', publishers: ['금성', '비상', '지학사', '동아출판', 'YBM', '천재', '교학사', '미래엔', '아이스크림', '체육과건강'] },
      { name: '음악', publishers: ['동아출판', '비상', '지학사', '천재', '아침나라', 'YBM', '아이스크림', '미래엔', '금성', '음악과생활'] },
      { name: '미술', publishers: ['지학사', '금성', '동아출판', '비상', '아이스크림', '천재', '아트앤컬처', '교학사', '미래엔', '아침나라'] },
      { name: '영어', publishers: ['동아출판', 'YBM최희경', 'YBM김혜리', '천재함순애', '천재김태은', '천재이동환', '미래엔', '아이스크림', '비상'] },
    ],
  },
  6: {
    subjects: [
      { name: '국어', publishers: NATIONAL, parts: ['㉮', '㉯'] },
      { name: '수학', publishers: NATIONAL },
      { name: '도덕', publishers: NATIONAL },
      { name: '사회', publishers: ['아이스크림', '동아출판', '미래엔', '비상', 'YBM', '지학사', '천재(박)', '천재(김)'] },
      { name: '과학', publishers: ['아이스크림', '지학사', '미래엔', '비상', '천재(정)'] },
      { name: '실과', publishers: ['아이스크림', '교학사', '비상', '동아출판', '지학사', '금성', '미래엔', 'YBM', '천재'] },
      { name: '체육', publishers: ['금성', '비상', '지학사', '동아출판', 'YBM', '천재', '교학사', '미래엔', '아이스크림', '체육과건강'] },
      { name: '음악', publishers: ['동아출판', '비상', '지학사', '천재', '아침나라', 'YBM', '아이스크림', '미래엔', '금성', '음악과생활'] },
      { name: '미술', publishers: ['지학사', '금성', '동아출판', '비상', '아이스크림', '천재', '아트앤컬처', '교학사', '미래엔', '아침나라'] },
      { name: '영어', publishers: ['동아출판', 'YBM최희경', 'YBM김혜리', '천재함순애', '천재김태은', '천재이동환', '미래엔', '아이스크림', '비상'] },
    ],
  },
};

const DIFF_OPTIONS = [
  { value: 'easy',   label: '🟢 쉬움',   desc: '기본 개념 확인' },
  { value: 'normal', label: '🟡 보통',   desc: '이해 및 적용' },
  { value: 'hard',   label: '🔴 어려움', desc: '심화 사고' },
];

const fmtDate = (ts) => {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
};

// ─────────────────────── 문제 편집 카드 ──────────────────────
function QuestionCard({ q, idx, onChange, onDelete }) {
  return (
    <div className="bg-white border-2 border-slate-200 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-400">Q{idx + 1}</span>
        <button onClick={() => onDelete(idx)}
          className="text-xs text-rose-400 hover:text-rose-600 font-bold transition-colors">
          삭제
        </button>
      </div>
      <textarea
        value={q.question}
        onChange={e => onChange(idx, 'question', e.target.value)}
        className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 resize-none h-16 focus:outline-none focus:border-indigo-400"
        placeholder="문제 내용"
      />
      <div className="grid grid-cols-2 gap-2">
        {q.options.map((opt, oi) => (
          <div key={oi} className={`flex items-center gap-2 rounded-xl border px-3 py-2
            ${q.answer === oi ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200'}`}>
            <button
              onClick={() => onChange(idx, 'answer', oi)}
              className={`w-4 h-4 rounded-full border-2 shrink-0 transition-colors
                ${q.answer === oi ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}
            />
            <input
              value={opt}
              onChange={e => {
                const newOpts = [...q.options];
                newOpts[oi] = e.target.value;
                onChange(idx, 'options', newOpts);
              }}
              className="flex-1 text-xs bg-transparent focus:outline-none"
              placeholder={`보기 ${oi + 1}`}
            />
          </div>
        ))}
      </div>
      <div className="text-[10px] text-slate-400">초록 동그라미 = 정답 선택</div>
      <input
        value={q.explanation || ''}
        onChange={e => onChange(idx, 'explanation', e.target.value)}
        className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-400"
        placeholder="해설 (선택사항)"
      />
    </div>
  );
}

// ─────────────────────── Main ─────────────────────────────────
function QuizDungeonManage() {
  const [tab, setTab]           = useState('create'); // 'create' | 'dungeons'
  const [step, setStep]         = useState('form');   // 'form' | 'preview'

  // 폼 상태
  const [grade, setGrade]       = useState('');
  const [semester, setSemester] = useState('');
  const [subject, setSubject]   = useState('');
  const [publisher, setPublisher] = useState('');
  const [part, setPart]         = useState('');
  const [unit, setUnit]         = useState('');
  const [sourceText, setSourceText] = useState('');
  const [count, setCount]       = useState(5);
  const [difficulty, setDifficulty] = useState('normal');
  const [rewards, setRewards]   = useState({ gold: 100, exp: 50, diamond: 0 });

  // 생성 상태
  const [questions, setQuestions] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState('');

  // 발행된 던전
  const [dungeons, setDungeons] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // 파생 데이터
  const gradeData    = grade ? CURRICULUM[parseInt(grade)] : null;
  const subjectData  = gradeData?.subjects.find(s => s.name === subject);
  const publishers   = subjectData?.publishers || [];
  const parts        = subjectData?.parts || [];
  const rawUnits     = subjectData?.units;
  const unitList     = rawUnits
    ? Array.isArray(rawUnits) ? rawUnits : (rawUnits[semester] || [])
    : [];

  // 제목 자동 생성
  const autoTitle = [
    grade ? `${grade}학년` : '',
    semester ? `${semester}학기` : '',
    subject,
    publisher && publisher !== '국정' ? `(${publisher})` : '',
    part,
    unit,
  ].filter(Boolean).join(' ');

  useEffect(() => {
    if (tab === 'dungeons') fetchDungeons();
  }, [tab]);

  const fetchDungeons = async () => {
    setIsLoading(true);
    try {
      const snap = await getDocs(collection(db, 'quizDungeons'));
      setDungeons(
        snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      );
    } catch (err) { console.error(err); }
    finally { setIsLoading(false); }
  };

  const resetForm = () => {
    setGrade(''); setSemester(''); setSubject(''); setPublisher('');
    setPart(''); setUnit(''); setSourceText('');
    setCount(5); setDifficulty('normal');
    setRewards({ gold: 100, exp: 50, diamond: 0 });
    setQuestions([]); setStep('form'); setGenError('');
  };

  // ── AI 퀴즈 생성 ─────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!sourceText.trim()) return alert('수업 자료를 입력해주세요.');
    if (!grade || !subject) return alert('학년과 과목을 선택해주세요.');

    setIsGenerating(true);
    setGenError('');
    try {
      const res = await fetch('/api/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceText, grade: parseInt(grade), semester: parseInt(semester) || null,
          subject, publisher, unit: [part, unit].filter(Boolean).join(' '),
          count, difficulty,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenError(data.error || '생성 중 오류가 발생했습니다.');
        if (data.hint) setGenError(prev => `${prev}\n💡 ${data.hint}`);
        return;
      }
      setQuestions(data.questions);
      setStep('preview');
    } catch (err) {
      setGenError('네트워크 오류가 발생했습니다.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleQuestionChange = (idx, field, value) => {
    setQuestions(prev => prev.map((q, i) => i === idx ? { ...q, [field]: value } : q));
  };
  const handleQuestionDelete = (idx) => {
    setQuestions(prev => prev.filter((_, i) => i !== idx));
  };

  // ── 발행 ──────────────────────────────────────────────────────
  const handlePublish = async () => {
    if (questions.length === 0) return alert('문제가 없습니다.');
    if (!window.confirm(`"${autoTitle || '퀴즈 던전'}"을 발행하시겠습니까?\n학생들이 바로 접근할 수 있습니다.`)) return;

    setIsPublishing(true);
    try {
      await addDoc(collection(db, 'quizDungeons'), {
        title:         autoTitle || '퀴즈 던전',
        grade:         parseInt(grade),
        semester:      parseInt(semester) || null,
        subject,
        publisher:     publisher || null,
        part:          part || null,
        unit:          unit || null,
        difficulty,
        rewards,
        questions,
        questionCount: questions.length,
        active:        true,
        playCount:     0,
        createdAt:     serverTimestamp(),
      });
      alert('✅ 퀴즈 던전이 발행되었습니다!');
      resetForm();
      setTab('dungeons');
    } catch (err) {
      console.error(err);
      alert('발행 중 오류가 발생했습니다.');
    } finally {
      setIsPublishing(false);
    }
  };

  const toggleDungeonActive = async (dungeon) => {
    await updateDoc(doc(db, 'quizDungeons', dungeon.id), { active: !dungeon.active });
    setDungeons(prev => prev.map(d => d.id === dungeon.id ? { ...d, active: !d.active } : d));
  };

  const deleteDungeon = async (id) => {
    if (!window.confirm('이 퀴즈 던전을 삭제할까요?')) return;
    await deleteDoc(doc(db, 'quizDungeons', id));
    setDungeons(prev => prev.filter(d => d.id !== id));
  };

  const DIFF_COLOR = { easy: 'text-emerald-600 bg-emerald-50', normal: 'text-amber-600 bg-amber-50', hard: 'text-rose-600 bg-rose-50' };
  const DIFF_LABEL = { easy: '쉬움', normal: '보통', hard: '어려움' };

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-5xl mx-auto">

        {/* 헤더 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800">⚔️ 퀴즈 던전 관리</h1>
            <p className="text-slate-500 text-sm mt-0.5">AI가 수업 자료를 퀴즈로 자동 변환합니다.</p>
          </div>
          <div className="flex gap-2">
            {['create', 'dungeons'].map((t, i) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors
                  ${tab === t ? 'bg-indigo-600 text-white shadow' : 'bg-white text-slate-600 border border-slate-200'}`}>
                {['🤖 AI 퀴즈 생성', `📚 발행된 던전 (${dungeons.length})`][i]}
              </button>
            ))}
          </div>
        </div>

        {/* ── 퀴즈 생성 탭 ── */}
        {tab === 'create' && (
          <div className="space-y-5">

            {/* STEP 1: 폼 */}
            {step === 'form' && (
              <>
                {/* 교육과정 선택 */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                  <h2 className="font-bold text-slate-700 text-sm mb-4">📌 교육과정 선택</h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {/* 학년 */}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">학년 *</label>
                      <select value={grade} onChange={e => { setGrade(e.target.value); setSubject(''); setPublisher(''); setPart(''); setUnit(''); }}
                        className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
                        <option value="">선택</option>
                        {[1,2,3,4,5,6].map(g => <option key={g} value={g}>{g}학년</option>)}
                      </select>
                    </div>

                    {/* 학기 */}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">학기</label>
                      <select value={semester} onChange={e => { setSemester(e.target.value); setUnit(''); }}
                        className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
                        <option value="">전체</option>
                        <option value="1">1학기</option>
                        <option value="2">2학기</option>
                      </select>
                    </div>

                    {/* 과목 */}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">과목 *</label>
                      <select value={subject} onChange={e => { setSubject(e.target.value); setPublisher(''); setPart(''); setUnit(''); }}
                        disabled={!grade}
                        className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50">
                        <option value="">선택</option>
                        {(gradeData?.subjects || []).map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                      </select>
                    </div>

                    {/* 출판사 */}
                    {publishers.length > 1 && (
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">출판사</label>
                        <select value={publisher} onChange={e => setPublisher(e.target.value)}
                          className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
                          <option value="">선택</option>
                          {publishers.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                    )}

                    {/* 국어 ㉮/㉯ */}
                    {parts.length > 0 && (
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">권</label>
                        <select value={part} onChange={e => setPart(e.target.value)}
                          className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
                          <option value="">선택</option>
                          {parts.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                    )}

                    {/* 단원 */}
                    {unitList.length > 0 && (
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">단원</label>
                        <select value={unit} onChange={e => setUnit(e.target.value)}
                          className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
                          <option value="">전체</option>
                          {unitList.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* 자동 생성 제목 미리보기 */}
                  {autoTitle && (
                    <div className="mt-3 p-3 bg-indigo-50 rounded-xl text-sm text-indigo-700 font-bold">
                      📁 {autoTitle}
                    </div>
                  )}
                </div>

                {/* 수업 자료 입력 */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                  <h2 className="font-bold text-slate-700 text-sm mb-3">📝 수업 자료 입력</h2>
                  <textarea
                    value={sourceText}
                    onChange={e => setSourceText(e.target.value)}
                    placeholder="수업 자료, 교과서 내용, 판서 내용 등을 여기에 붙여넣으세요.
AI가 자동으로 퀴즈 문제를 만들어드립니다."
                    className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 resize-none h-40"
                  />
                  <div className="text-right text-xs text-slate-400 mt-1">{sourceText.length}자</div>
                </div>

                {/* 설정 */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                  <h2 className="font-bold text-slate-700 text-sm mb-4">⚙️ 퀴즈 설정</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* 문제 수 */}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-2">문제 수</label>
                      <div className="flex rounded-xl border-2 border-slate-200 overflow-hidden">
                        {[5, 8, 10].map(n => (
                          <button key={n} onClick={() => setCount(n)}
                            className={`flex-1 py-2 text-sm font-bold transition-colors
                              ${count === n ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                            {n}개
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 난이도 */}
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-slate-500 mb-2">난이도</label>
                      <div className="flex gap-2">
                        {DIFF_OPTIONS.map(d => (
                          <button key={d.value} onClick={() => setDifficulty(d.value)}
                            className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-colors
                              ${difficulty === d.value ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500'}`}>
                            {d.label}<br/>
                            <span className="font-normal opacity-70">{d.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 보상 설정 */}
                    <div className="md:col-span-3">
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

                {/* 에러 메시지 */}
                {genError && (
                  <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-sm text-rose-700 whitespace-pre-line">
                    ⚠️ {genError}
                  </div>
                )}

                {/* 생성 버튼 */}
                <button onClick={handleGenerate} disabled={isGenerating || !sourceText.trim() || !grade || !subject}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-lg rounded-2xl shadow-md transition-all active:scale-[0.99] disabled:opacity-40">
                  {isGenerating ? '🤖 AI가 퀴즈를 만드는 중...' : '🤖 AI 퀴즈 생성하기'}
                </button>
              </>
            )}

            {/* STEP 2: 미리보기 + 편집 */}
            {step === 'preview' && (
              <>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h2 className="font-extrabold text-slate-800 text-lg">생성된 퀴즈 검토</h2>
                    <p className="text-sm text-slate-500">{autoTitle} · {questions.length}문제 · 초록 동그라미를 클릭해 정답 변경</p>
                  </div>
                  <button onClick={() => setStep('form')}
                    className="px-4 py-2 text-sm font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">
                    ← 다시 생성
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {questions.map((q, idx) => (
                    <QuestionCard key={idx} q={q} idx={idx}
                      onChange={handleQuestionChange} onDelete={handleQuestionDelete} />
                  ))}
                </div>

                <button onClick={handlePublish} disabled={isPublishing || questions.length === 0}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-lg rounded-2xl shadow-md transition-all disabled:opacity-40">
                  {isPublishing ? '발행 중...' : `✅ "${autoTitle || '퀴즈 던전'}" 발행하기`}
                </button>
              </>
            )}
          </div>
        )}

        {/* ── 발행된 던전 탭 ── */}
        {tab === 'dungeons' && (
          isLoading ? (
            <div className="text-center py-20 text-slate-400 font-bold">불러오는 중...</div>
          ) : dungeons.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <div className="text-5xl mb-3">⚔️</div>
              <p className="font-bold text-lg text-slate-600">발행된 퀴즈 던전이 없습니다</p>
              <p className="text-sm mt-1">AI 퀴즈 생성 탭에서 첫 번째 던전을 만들어보세요!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dungeons.map(d => (
                <div key={d.id}
                  className={`bg-white rounded-2xl shadow-sm border-2 p-5 transition-all
                    ${d.active ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-extrabold text-slate-800">{d.title}</h3>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${DIFF_COLOR[d.difficulty]}`}>
                          {DIFF_LABEL[d.difficulty]}
                        </span>
                        <span className="text-[10px] text-slate-400">{d.questionCount}문제</span>
                        <span className="text-[10px] text-slate-400">{fmtDate(d.createdAt)}</span>
                      </div>
                      <div className="flex gap-3 text-xs text-slate-500">
                        {d.rewards?.gold   > 0 && <span>🪙 {d.rewards.gold}</span>}
                        {d.rewards?.exp    > 0 && <span>⭐ {d.rewards.exp}</span>}
                        {d.rewards?.diamond > 0 && <span>💎 {d.rewards.diamond}</span>}
                        {d.playCount > 0 && <span className="text-indigo-500 font-bold">플레이 {d.playCount}회</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => toggleDungeonActive(d)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors
                          ${d.active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                        {d.active ? '✅ 활성' : '⏸️ 비활성'}
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
          )
        )}
      </div>
    </div>
  );
}

export default QuizDungeonManage;
