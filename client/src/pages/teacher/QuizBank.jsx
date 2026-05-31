import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc,
  serverTimestamp, query, where,
} from 'firebase/firestore';
import { db, auth } from '../../firebase';
import JSZip from 'jszip';
import { renderMath, stripOptionPrefix } from '../../utils/renderMath';

// ─── PPTX 텍스트 추출 ────────────────────────────────────────────
const extractPptxText = async (file) => {
  const zip = new JSZip();
  const content = await zip.loadAsync(file);
  const slideFiles = Object.keys(content.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => parseInt(a.match(/\d+/)?.[0] || 0) - parseInt(b.match(/\d+/)?.[0] || 0));
  if (slideFiles.length === 0) throw new Error('슬라이드를 찾을 수 없습니다.');
  const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const slideTexts = [];
  for (let i = 0; i < slideFiles.length; i++) {
    const xml = await content.files[slideFiles[i]].async('text');
    let text = '';
    try {
      const docEl = new DOMParser().parseFromString(xml, 'text/xml');
      if (!docEl.querySelector('parsererror')) {
        text = Array.from(docEl.getElementsByTagNameNS(NS_A, 't'))
          .map(n => n.textContent?.trim()).filter(Boolean).join(' ');
      }
    } catch (_) {}
    if (!text) {
      text = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)]
        .map(m => m[1]
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>').replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'").trim())
        .filter(Boolean).join(' ');
    }
    if (text) slideTexts.push(`[슬라이드 ${i + 1}]\n${text}`);
  }
  return slideTexts.join('\n\n');
};

// ─── 교육과정 데이터 ─────────────────────────────────────────────
const NATIONAL = ['국정'];
const MATH_PUB_LOW  = ['국정'];                                                              // 1~2학년 수학: 국정
const MATH_PUB_HIGH = ['아이스크림', '비상', '천재교과서', '동아출판', '미래엔', '지학사', 'YBM']; // 3~6학년 수학: 아이스크림 기본
const CURRICULUM = {
  1: { subjects: [{ name: '국어', publishers: NATIONAL, parts: ['㉮', '㉯'] }, { name: '국어활동', publishers: NATIONAL }, { name: '수학', publishers: MATH_PUB_LOW }, { name: '통합교과', publishers: NATIONAL, units: { '1학기': ['학교', '사람들', '우리나라', '탐험'], '2학기': ['하루', '약속', '상상', '이야기'] } }, { name: '입학초기적응활동', publishers: NATIONAL }, { name: '국어기초학습', publishers: NATIONAL }] },
  2: { subjects: [{ name: '국어', publishers: NATIONAL, parts: ['㉮', '㉯'] }, { name: '수학', publishers: MATH_PUB_LOW }, { name: '통합교과', publishers: NATIONAL, units: { '1학기': ['나', '자연', '마을', '세계'], '2학기': ['계절', '인물', '물건', '기억'] } }, { name: '안전한생활', publishers: NATIONAL }, { name: '국어기초학습', publishers: NATIONAL }] },
  3: { subjects: [{ name: '국어', publishers: NATIONAL, parts: ['㉮', '㉯'] }, { name: '수학', publishers: MATH_PUB_HIGH }, { name: '도덕', publishers: NATIONAL }, { name: '사회', publishers: ['아이스크림', '동아출판', '미래엔', '비상', 'YBM', '지학사', '천재(박)', '천재(김)'] }, { name: '과학', publishers: ['아이스크림', '지학사', '동아출판', '미래엔', '비상', '천재(정)', '천재(이)'] }, { name: '체육', publishers: ['금성', '비상', '지학사', 'YBM', '천재', '교학사', '미래엔', '아이스크림'] }, { name: '음악', publishers: ['동아출판', '비상', '지학사', '천재', '아침나라', 'YBM', '아이스크림', '미래엔'] }, { name: '미술', publishers: ['지학사', '금성', '동아출판', '비상', '아이스크림', '천재', '교학사', '미래엔'] }, { name: '영어', publishers: ['동아출판', 'YBM최희경', 'YBM김혜리', '천재함순애', '천재김태은', '미래엔', '아이스크림'] }] },
  4: { subjects: [{ name: '국어', publishers: NATIONAL, parts: ['㉮', '㉯'] }, { name: '수학', publishers: MATH_PUB_HIGH }, { name: '도덕', publishers: NATIONAL }, { name: '사회', publishers: ['아이스크림', '동아출판', '미래엔', '비상', 'YBM', '지학사', '천재(박)', '천재(김)'] }, { name: '과학', publishers: ['아이스크림', '지학사', '동아출판', '미래엔', '비상', '천재(정)', '천재(이)'] }, { name: '체육', publishers: ['금성', '비상', '지학사', '동아출판', 'YBM', '천재', '교학사', '미래엔', '아이스크림'] }, { name: '음악', publishers: ['동아출판', '비상', '지학사', '천재', '아침나라', 'YBM', '아이스크림', '미래엔'] }, { name: '미술', publishers: ['지학사', '금성', '동아출판', '비상', '아이스크림', '천재', '교학사', '미래엔'] }, { name: '영어', publishers: ['동아출판', 'YBM최희경', 'YBM김혜리', '천재함순애', '천재김태은', '미래엔', '아이스크림'] }] },
  5: { subjects: [{ name: '국어', publishers: NATIONAL, parts: ['㉮', '㉯'] }, { name: '수학', publishers: MATH_PUB_HIGH }, { name: '도덕', publishers: NATIONAL }, { name: '사회', publishers: ['아이스크림', '동아출판', '미래엔', '비상', 'YBM', '지학사', '천재(박)', '천재(김)'] }, { name: '과학', publishers: ['아이스크림', '지학사', '미래엔', '비상', '천재(정)'] }, { name: '실과', publishers: ['아이스크림', '교학사', '비상', '동아출판', '지학사', '금성', '미래엔', 'YBM', '천재'] }, { name: '체육', publishers: ['금성', '비상', '지학사', '동아출판', 'YBM', '천재', '교학사', '미래엔', '아이스크림'] }, { name: '음악', publishers: ['동아출판', '비상', '지학사', '천재', '아침나라', 'YBM', '아이스크림', '미래엔', '금성'] }, { name: '미술', publishers: ['지학사', '금성', '동아출판', '비상', '아이스크림', '천재', '교학사', '미래엔', '아침나라'] }, { name: '영어', publishers: ['동아출판', 'YBM최희경', 'YBM김혜리', '천재함순애', '천재김태은', '미래엔', '아이스크림', '비상'] }] },
  6: { subjects: [{ name: '국어', publishers: NATIONAL, parts: ['㉮', '㉯'] }, { name: '수학', publishers: MATH_PUB_HIGH }, { name: '도덕', publishers: NATIONAL }, { name: '사회', publishers: ['아이스크림', '동아출판', '미래엔', '비상', 'YBM', '지학사', '천재(박)', '천재(김)'] }, { name: '과학', publishers: ['아이스크림', '지학사', '미래엔', '비상', '천재(정)'] }, { name: '실과', publishers: ['아이스크림', '교학사', '비상', '동아출판', '지학사', '금성', '미래엔', 'YBM', '천재'] }, { name: '체육', publishers: ['금성', '비상', '지학사', '동아출판', 'YBM', '천재', '교학사', '미래엔', '아이스크림'] }, { name: '음악', publishers: ['동아출판', '비상', '지학사', '천재', '아침나라', 'YBM', '아이스크림', '미래엔', '금성'] }, { name: '미술', publishers: ['지학사', '금성', '동아출판', '비상', '아이스크림', '천재', '교학사', '미래엔', '아침나라'] }, { name: '영어', publishers: ['동아출판', 'YBM최희경', 'YBM김혜리', '천재함순애', '천재김태은', '미래엔', '아이스크림', '비상'] }] },
};
const DIFF_OPTIONS = [
  { value: 'easy',   label: '🟢 쉬움',   desc: '기본 개념 확인' },
  { value: 'normal', label: '🟡 보통',   desc: '이해 및 적용' },
  { value: 'hard',   label: '🔴 어려움', desc: '심화 사고' },
];
const DIFF_LABEL = { easy: '쉬움', normal: '보통', hard: '어려움' };
const DIFF_COLOR = {
  easy: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  normal: 'text-amber-600 bg-amber-50 border-amber-200',
  hard: 'text-rose-600 bg-rose-50 border-rose-200',
};
const fmtDate = (ts) => {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
};

// ─── 문제 편집 카드 ───────────────────────────────────────────────
function QuestionCard({ q, idx, onChange, onDelete, onTypeChange }) {
  const isSA = q.type === 'sa' || q.type === 'short';
  return (
    <div className="bg-white border-2 border-slate-200 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-400">Q{idx + 1}</span>
          <div className="flex rounded-lg overflow-hidden border border-slate-200 text-[10px] font-bold">
            <button onClick={() => onTypeChange(idx, 'mc')}
              className={`px-2 py-0.5 transition-colors ${!isSA ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
              객관식
            </button>
            <button onClick={() => onTypeChange(idx, 'sa')}
              className={`px-2 py-0.5 transition-colors ${isSA ? 'bg-amber-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
              주관식
            </button>
          </div>
        </div>
        <button onClick={() => onDelete(idx)} className="text-xs text-rose-400 hover:text-rose-600 font-bold">삭제</button>
      </div>
      <textarea value={q.question} onChange={e => onChange(idx, 'question', e.target.value)}
        className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 resize-none h-16 focus:outline-none focus:border-indigo-400"
        placeholder="문제 내용" />
      {isSA ? (
        <div>
          <label className="text-[10px] text-slate-400 mb-1 block">정답 (단답형)</label>
          <input value={q.answer || ''} onChange={e => onChange(idx, 'answer', e.target.value)}
            className="w-full text-sm border border-amber-200 rounded-xl px-3 py-2 focus:outline-none focus:border-amber-400"
            placeholder="정답 텍스트" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {(q.options || ['', '', '', '']).map((opt, oi) => (
              <div key={oi} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${q.answer === oi ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200'}`}>
                <button onClick={() => onChange(idx, 'answer', oi)}
                  className={`w-4 h-4 rounded-full border-2 shrink-0 transition-colors ${q.answer === oi ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`} />
                <input value={opt} onChange={e => { const o = [...(q.options || ['','','',''])]; o[oi] = e.target.value; onChange(idx, 'options', o); }}
                  className="flex-1 text-xs bg-transparent focus:outline-none" placeholder={`보기 ${oi + 1}`} />
              </div>
            ))}
          </div>
          <div className="text-[10px] text-slate-400">초록 동그라미 = 정답 선택</div>
        </>
      )}
      <input value={q.explanation || ''} onChange={e => onChange(idx, 'explanation', e.target.value)}
        className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-400"
        placeholder="해설 (선택사항)" />
    </div>
  );
}

// ─── 단원 추가 요청 모달 ─────────────────────────────────────────
function UnitRequestModal({ grade, semester, subject, publisher, currentUid, onClose, onRequested }) {
  const [unitNumber, setUnitNumber] = useState('');
  const [unitName, setUnitName]     = useState('');
  const [commonTopic, setCommonTopic] = useState('');
  const [saving, setSaving]         = useState(false);

  const handleSubmit = async () => {
    if (!unitName.trim()) return;
    setSaving(true);
    try {
      const data = {
        grade: parseInt(grade),
        semester: semester ? parseInt(semester) : null,
        subject,
        publisher: publisher || '공통',
        unitNumber: unitNumber ? parseInt(unitNumber) : null,
        unitName: unitName.trim(),
        commonTopic: commonTopic.trim() || null,
        status: 'pending',
        createdBy: currentUid,
        createdAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'curriculumUnits'), data);
      onRequested({ id: ref.id, ...data });
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[500] flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-slate-800">📚 단원 추가 요청</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl font-bold">×</button>
        </div>
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2 text-xs text-indigo-700 font-bold">
          {grade}학년 {semester ? `${semester}학기 ` : ''}{subject}{publisher && publisher !== '공통' ? ` (${publisher})` : ''}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-500 mb-1 block">단원 번호</label>
            <input type="number" min="1" value={unitNumber} onChange={e => setUnitNumber(e.target.value)}
              placeholder="예: 3"
              className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-bold text-slate-500 mb-1 block">단원명 *</label>
            <input value={unitName} onChange={e => setUnitName(e.target.value)}
              placeholder="예: 약수와 배수"
              className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:border-indigo-500" />
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 mb-1 block">공통 주제 (선택)</label>
          <input value={commonTopic} onChange={e => setCommonTopic(e.target.value)}
            placeholder="예: 수와 연산, 문학과 독해"
            className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
        </div>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          요청 즉시 사용 가능합니다. 관리자 승인 후 공통 단원 목록에 정식 반영됩니다.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 border-2 border-slate-200 text-slate-600 font-bold rounded-xl text-sm hover:bg-slate-50">취소</button>
          <button onClick={handleSubmit} disabled={saving || !unitName.trim()}
            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm disabled:opacity-40">
            {saving ? '요청 중...' : '요청하기'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 공통 단원 선택기 (단원 + 차시) ─────────────────────────────
function UnitSelector({ grade, semester, subject, publisher, unitId, topic, onUnitChange, onTopicChange, onLessonChange, currentUid }) {
  const [units, setUnits]             = useState([]);
  const [loading, setLoading]         = useState(false);
  const [showRequest, setShowRequest] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState('');

  useEffect(() => {
    if (!grade || !subject) { setUnits([]); setSelectedLesson(''); return; }
    setLoading(true);
    getDocs(query(
      collection(db, 'curriculumUnits'),
      where('grade', '==', parseInt(grade)),
      where('subject', '==', subject),
    )).then(snap => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(u => ['approved', 'pending'].includes(u.status))
        .filter(u => !semester || !u.semester || String(u.semester) === String(semester))
        .filter(u => !publisher || !u.publisher || u.publisher === publisher || u.publisher === '공통')
        .sort((a, b) => (a.unitNumber || 99) - (b.unitNumber || 99));
      setUnits(list);
    }).catch(() => setUnits([])).finally(() => setLoading(false));
  }, [grade, semester, subject, publisher]);

  // 단원 바뀌면 차시 초기화
  useEffect(() => { setSelectedLesson(''); onLessonChange?.('', ''); }, [unitId]);

  if (!grade || !subject) return null;

  const selectedUnit = units.find(u => u.id === unitId);
  const lessons = selectedUnit?.lessons || [];

  return (
    <div className="md:col-span-3 space-y-3">
      {/* 단원 선택 */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <label className="text-xs font-bold text-slate-500">단원</label>
          {loading && <span className="text-[10px] text-slate-400">불러오는 중...</span>}
        </div>
        <select value={unitId} onChange={e => {
            const sel = units.find(u => u.id === e.target.value);
            onUnitChange(e.target.value, sel?.unitName || '');
            setSelectedLesson('');
          }}
          className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
          <option value="">단원 선택 (선택사항)</option>
          {units.map(u => (
            <option key={u.id} value={u.id}>
              {u.unitNumber ? `${u.unitNumber}단원 ` : ''}{u.unitName}
              {u.status === 'pending' ? ' (승인 대기)' : ''}
            </option>
          ))}
        </select>
        {!loading && units.length === 0 && (
          <p className="text-[10px] text-slate-400 mt-1">등록된 단원이 없습니다.</p>
        )}
        <button type="button" onClick={() => setShowRequest(true)}
          className="mt-2 w-full py-2 text-sm font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border-2 border-dashed border-indigo-300 hover:border-indigo-400 rounded-xl transition-colors">
          + 단원 추가 요청
        </button>
      </div>

      {/* 차시 선택 — 단원에 lessons가 있을 때만 표시 */}
      {unitId && lessons.length > 0 && (
        <div>
          <label className="text-xs font-bold text-slate-500 mb-1.5 block">
            차시 <span className="font-normal text-slate-400">(선택 시 AI가 해당 차시 기준으로 출제)</span>
          </label>
          <select
            value={selectedLesson}
            onChange={e => {
              const val = e.target.value;
              setSelectedLesson(val);
              const lesson = lessons.find(l => String(l.no) === val);
              // no, title, keywords 세 인자로 전달
              onLessonChange?.(val, lesson?.title || '', lesson?.keywords || []);
              // 차시 키워드를 topic에 자동 반영
              if (lesson?.keywords?.length) {
                onTopicChange(lesson.keywords.slice(0, 3).join(', '));
              }
            }}
            className="w-full border-2 border-indigo-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 bg-indigo-50/30"
          >
            <option value="">차시 선택 (선택사항)</option>
            {lessons.map(l => (
              <option key={l.no} value={String(l.no)}>
                {l.no}차시 — {l.title}
              </option>
            ))}
          </select>
          {selectedLesson && (() => {
            const lesson = lessons.find(l => String(l.no) === selectedLesson);
            return lesson?.keywords?.length ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {lesson.keywords.map(k => (
                  <span key={k} className="text-[10px] bg-indigo-50 text-indigo-600 border border-indigo-200 px-2 py-0.5 rounded-full font-bold">{k}</span>
                ))}
              </div>
            ) : null;
          })()}
        </div>
      )}

      {/* 주제 입력 (선택) */}
      <div>
        <label className="text-xs font-bold text-slate-500 mb-1.5 block">주제 <span className="font-normal text-slate-400">(선택 — 차시 선택 시 자동 입력)</span></label>
        <input
          value={topic}
          onChange={e => onTopicChange(e.target.value)}
          placeholder="예: 분수의 나눗셈, 조선시대 역사"
          className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
        />
      </div>

      {showRequest && (
        <UnitRequestModal
          grade={grade} semester={semester} subject={subject} publisher={publisher}
          currentUid={currentUid}
          onClose={() => setShowRequest(false)}
          onRequested={(newUnit) => {
            setUnits(prev =>
              [...prev, newUnit].sort((a, b) => (a.unitNumber || 99) - (b.unitNumber || 99))
            );
            onUnitChange(newUnit.id, newUnit.unitName);
          }}
        />
      )}
    </div>
  );
}

// ─── 미리보기 모달 ───────────────────────────────────────────────
function PreviewModal({ set, onClose }) {
  const [page, setPage] = useState(0);
  const qs = set.questions || [];
  const q = qs[page];
  return (
    <div className="fixed inset-0 bg-black/60 z-[400] flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 bg-indigo-600 text-white">
          <div>
            <div className="font-extrabold">{set.title}</div>
            <div className="text-xs opacity-75">{qs.length}문항 · {DIFF_LABEL[set.difficulty] || '보통'}</div>
          </div>
          <button onClick={onClose} className="text-indigo-200 hover:text-white text-2xl font-bold">×</button>
        </div>
        {q ? (
          <div className="p-5 space-y-3">
            <div className="flex justify-between items-center text-xs text-slate-400 font-bold">
              <span>Q{page + 1} / {qs.length}</span>
              <span className={`px-2 py-0.5 rounded-full border text-xs font-bold ${(q.type === 'sa' || q.type === 'short') ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-indigo-50 text-indigo-600 border-indigo-200'}`}>
                {(q.type === 'sa' || q.type === 'short') ? '주관식' : '객관식'}
              </span>
            </div>
            <div className="text-base font-bold text-slate-800 leading-relaxed">{renderMath(q.question)}</div>
            {!(q.type === 'sa' || q.type === 'short') && (
              <div className="space-y-2">
                {(q.options || []).map((opt, oi) => (
                  <div key={oi} className={`px-4 py-2 rounded-xl text-sm border ${q.answer === oi ? 'bg-emerald-50 border-emerald-400 text-emerald-800 font-bold' : 'border-slate-200 text-slate-700'}`}>
                    {oi + 1}. {renderMath(stripOptionPrefix(opt))}
                  </div>
                ))}
              </div>
            )}
            {(q.type === 'sa' || q.type === 'short') && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-sm text-amber-800 font-bold">
                정답: {q.answer}
              </div>
            )}
            {q.explanation && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs text-slate-600">
                💡 {q.explanation}
              </div>
            )}
          </div>
        ) : (
          <div className="p-8 text-center text-slate-400">문제가 없습니다.</div>
        )}
        <div className="px-5 pb-4 flex justify-between">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 disabled:opacity-30">← 이전</button>
          <span className="text-xs text-slate-400 self-center">{page + 1} / {qs.length}</span>
          <button onClick={() => setPage(p => Math.min(qs.length - 1, p + 1))} disabled={page === qs.length - 1}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 disabled:opacity-30">다음 →</button>
        </div>
      </div>
    </div>
  );
}

// ─── 편집 모달 (내 퀴즈 수정) ─────────────────────────────────────
function EditModal({ set, onSave, onClose }) {
  const [title, setTitle] = useState(set.title || '');
  const [questions, setQuestions] = useState(set.questions ? JSON.parse(JSON.stringify(set.questions)) : []);
  const [isSaving, setIsSaving] = useState(false);

  const handleChange = (idx, field, value) =>
    setQuestions(prev => prev.map((q, i) => i === idx ? { ...q, [field]: value } : q));
  const handleDelete = (idx) => setQuestions(prev => prev.filter((_, i) => i !== idx));
  const handleTypeChange = (idx, newType) =>
    setQuestions(prev => prev.map((q, i) => {
      if (i !== idx) return q;
      if (newType === 'sa') return { ...q, type: 'sa', answer: '', options: q.options || ['', '', '', ''] };
      return { ...q, type: 'mc', answer: 0, options: q.options?.length ? q.options : ['', '', '', ''] };
    }));
  const addQuestion = (type) => {
    const newQ = type === 'sa'
      ? { type: 'sa', question: '', answer: '', explanation: '' }
      : { type: 'mc', question: '', options: ['', '', '', ''], answer: 0, explanation: '' };
    setQuestions(prev => [...prev, newQ]);
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'quizSets', set.id), {
        title: title.trim(),
        questions,
        questionCount: questions.length,
      });
      onSave({ ...set, title: title.trim(), questions, questionCount: questions.length });
    } finally { setIsSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[400] flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-extrabold text-slate-800">✏️ 퀴즈 수정</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl font-bold">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 mb-1 block">퀴즈 제목</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:border-indigo-500" />
          </div>
          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-500">문제 목록 ({questions.length}개)</div>
            {questions.map((q, idx) => (
              <QuestionCard key={idx} q={q} idx={idx}
                onChange={handleChange} onDelete={handleDelete} onTypeChange={handleTypeChange} />
            ))}
            <div className="flex gap-3">
              <button onClick={() => addQuestion('mc')}
                className="flex-1 py-2.5 border-2 border-dashed border-indigo-300 text-indigo-600 font-bold text-sm rounded-xl hover:bg-indigo-50 transition-colors">
                + 객관식 추가
              </button>
              <button onClick={() => addQuestion('sa')}
                className="flex-1 py-2.5 border-2 border-dashed border-amber-300 text-amber-600 font-bold text-sm rounded-xl hover:bg-amber-50 transition-colors">
                + 주관식 추가
              </button>
            </div>
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-3 border-2 border-slate-200 text-slate-600 font-bold rounded-xl text-sm">취소</button>
          <button onClick={handleSave} disabled={isSaving || !title.trim()}
            className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm disabled:opacity-40">
            {isSaving ? '저장 중...' : '💾 저장하기'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────
export default function QuizBank({ selectedClass = null }) {
  const [tab, setTab] = useState('mine'); // 'mine' | 'ai' | 'manual' | 'bank'

  // ── 내 퀴즈 상태 ─────────────────────────────────────────────────
  const [mySets, setMySets]                 = useState([]);
  const [isLoadingMine, setIsLoadingMine]   = useState(false);
  const [myFilter, setMyFilter]             = useState({ grade: '', subject: '' });
  const [previewSet, setPreviewSet]         = useState(null);
  const [editingSet, setEditingSet]         = useState(null);
  const [editingBankSet, setEditingBankSet] = useState(null); // 공유퀴즈은행 편집
  const [isAdminMode, setIsAdminMode]       = useState(false);

  // ── AI 탭 상태 ───────────────────────────────────────────────────
  const [aiStep, setAiStep]                 = useState('form'); // 'form' | 'preview'
  const [grade, setGrade]                   = useState('');
  const [semester, setSemester]             = useState('');
  const [subject, setSubject]               = useState('');
  const [publisher, setPublisher]           = useState('');
  const [part, setPart]                     = useState('');
  const [unit, setUnit]                     = useState('');
  const [sourceText, setSourceText]         = useState('');
  const [pdfBase64, setPdfBase64]           = useState('');
  const [pdfName, setPdfName]               = useState('');
  const [isPptxLoading, setIsPptxLoading]   = useState(false);
  const [count, setCount]                   = useState(5);
  const [saCount, setSaCount]               = useState(0);
  const [difficulty, setDifficulty]         = useState('normal');
  const [customTitle, setCustomTitle]       = useState('');
  const [aiQuestions, setAiQuestions]       = useState([]);
  const [isGenerating, setIsGenerating]     = useState(false);
  const [genError, setGenError]             = useState('');
  const [isSavingAi, setIsSavingAi]         = useState(false);

  // 공통 단원 선택 (AI탭 / 직접출제탭)
  const [aiUnitId, setAiUnitId]     = useState('');
  const [aiTopic,  setAiTopic]      = useState('');
  const [aiLesson, setAiLesson]     = useState({ no: '', title: '', keywords: [] });
  const [mUnitId,  setMUnitId]      = useState('');
  const [mTopic,   setMTopic]       = useState('');

  // ── 직접 출제 탭 상태 ────────────────────────────────────────────
  const [mGrade, setMGrade]                 = useState('');
  const [mSemester, setMSemester]           = useState('');
  const [mSubject, setMSubject]             = useState('');
  const [mPublisher, setMPublisher]         = useState('');
  const [mPart, setMPart]                   = useState('');
  const [mUnit, setMUnit]                   = useState('');
  const [manualTitle, setManualTitle]       = useState('');
  const [manualDiff, setManualDiff]         = useState('normal');
  const [manualQuestions, setManualQuestions] = useState([]);
  const [newQType, setNewQType]             = useState('choice');
  const [newQText, setNewQText]             = useState('');
  const [newOptions, setNewOptions]         = useState(['', '', '', '']);
  const [newAnswer, setNewAnswer]           = useState(0);
  const [newShortAnswer, setNewShortAnswer] = useState('');
  const [newExplanation, setNewExplanation] = useState('');
  const [isManualSaving, setIsManualSaving] = useState(false);

  // ── 퀴즈은행 탭 상태 ─────────────────────────────────────────────
  const [bankSets, setBankSets]             = useState([]);
  const [isLoadingBank, setIsLoadingBank]   = useState(false);
  const [bankFilter, setBankFilter]         = useState({ grade: '', subject: '' });

  // ── 공통 ─────────────────────────────────────────────────────────
  const [toast, setToast]           = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };
  const showConfirm = (message, onConfirm) => setConfirmState({ message, onConfirm });

  const currentUid = auth.currentUser?.uid || 'admin_master_001';
  const currentClassId = selectedClass?.id || null;
  // 관리자 모드: VITE_ADMIN_EMAILS에 포함된 이메일만 토글 버튼 노출 (미설정 시 아무도 불가)
  const adminEmails = (import.meta.env.VITE_ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);
  const canAdminMode = adminEmails.includes(auth.currentUser?.email || '');

  // ── 데이터 로드 ──────────────────────────────────────────────────
  useEffect(() => {
    if (tab === 'mine') fetchMySets();
    if (tab === 'bank') fetchBankSets();
  }, [tab, currentClassId]);

  const fetchMySets = async () => {
    setIsLoadingMine(true);
    try {
      const snap = await getDocs(query(collection(db, 'quizSets'), where('ownerId', '==', currentUid)));
      const mapped = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const classScoped = currentClassId
        ? mapped.filter((s) => String(s.classId || '') === String(currentClassId))
        : mapped;
      setMySets(
        classScoped.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      );
    } finally { setIsLoadingMine(false); }
  };

  const fetchBankSets = async () => {
    setIsLoadingBank(true);
    try {
      const snap = await getDocs(query(collection(db, 'quizSets'), where('isShared', '==', true)));
      setBankSets(
        snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.sharedAt?.seconds || 0) - (a.sharedAt?.seconds || 0))
      );
    } finally { setIsLoadingBank(false); }
  };

  // ── 파생 데이터 (AI탭) ───────────────────────────────────────────
  const gradeData   = grade ? CURRICULUM[parseInt(grade)] : null;
  const subjectData = gradeData?.subjects.find(s => s.name === subject);
  const publishers  = subjectData?.publishers || [];
  const parts       = subjectData?.parts || [];
  const rawUnits    = subjectData?.units;
  const unitList    = rawUnits ? (Array.isArray(rawUnits) ? rawUnits : (rawUnits[semester] || [])) : [];
  const lessonSuffix = aiLesson.no ? `${aiLesson.no}차시${aiLesson.title ? ` — ${aiLesson.title}` : ''}` : '';
  const autoTitle   = [grade ? `${grade}학년` : '', semester ? `${semester}학기` : '', subject, publisher && publisher !== '국정' ? `(${publisher})` : '', part, unit, lessonSuffix].filter(Boolean).join(' ');

  // ── 파생 데이터 (직접 출제탭) ────────────────────────────────────
  const mGradeData   = mGrade ? CURRICULUM[parseInt(mGrade)] : null;
  const mSubjectData = mGradeData?.subjects.find(s => s.name === mSubject);
  const mPublishers  = mSubjectData?.publishers || [];
  const mParts       = mSubjectData?.parts || [];
  const mRawUnits    = mSubjectData?.units;
  const mUnitList    = mRawUnits ? (Array.isArray(mRawUnits) ? mRawUnits : (mRawUnits[mSemester] || [])) : [];

  // ── PDF 업로드 ───────────────────────────────────────────────────
  const handlePdfUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') { showToast('PDF 파일만 업로드 가능합니다.', 'error'); return; }
    if (file.size > 20 * 1024 * 1024) { showToast('파일 크기는 20MB 이하여야 합니다.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => { setPdfBase64(ev.target.result.split(',')[1]); setPdfName(file.name); };
    reader.readAsDataURL(file);
  };

  // ── PPTX 업로드 ──────────────────────────────────────────────────
  const handlePptxUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['ppt', 'pptx'].includes(ext)) { showToast('PPT 또는 PPTX 파일만 업로드 가능합니다.', 'error'); return; }
    setIsPptxLoading(true);
    try {
      const text = await extractPptxText(file);
      if (!text) throw new Error('텍스트를 추출할 수 없습니다.');
      setSourceText(text);
      showToast(`✅ "${file.name}" 텍스트 추출 완료! ${text.split('\n\n').length}개 슬라이드`);
    } catch (err) {
      showToast(`PPT 텍스트 추출 실패: ${err.message}`, 'error');
    } finally {
      setIsPptxLoading(false);
      e.target.value = '';
    }
  };

  // ── AI 퀴즈 생성 ─────────────────────────────────────────────────
  const handleGenerate = async () => {
    const hasLesson = !!(aiLesson.title || aiLesson.keywords?.length);
    if (!sourceText.trim() && !pdfBase64 && !hasLesson) {
      showToast('차시를 선택하거나 수업 자료를 입력해주세요.', 'error'); return;
    }
    if (!grade || !subject) { showToast('학년과 과목을 선택해주세요.', 'error'); return; }
    setIsGenerating(true); setGenError('');
    try {
      const res = await fetch('/api/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceText: sourceText || undefined, pdfBase64: pdfBase64 || undefined,
          grade: parseInt(grade), semester: parseInt(semester) || null,
          subject, publisher, unit: [part, unit].filter(Boolean).join(' '),
          lessonNo: aiLesson.no || undefined,
          lessonTitle: aiLesson.title || undefined,
          lessonKeywords: aiLesson.keywords?.length ? aiLesson.keywords : undefined,
          count, difficulty, saCount,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setGenError(data.error || '생성 중 오류가 발생했습니다.'); return; }
      setAiQuestions(data.questions);
      setAiStep('preview');
    } catch { setGenError('네트워크 오류가 발생했습니다.'); }
    finally { setIsGenerating(false); }
  };

  const handleAiQChange = (idx, field, value) =>
    setAiQuestions(prev => prev.map((q, i) => i === idx ? { ...q, [field]: value } : q));
  const handleAiQDelete = (idx) => setAiQuestions(prev => prev.filter((_, i) => i !== idx));
  const handleAiQTypeChange = (idx, newType) =>
    setAiQuestions(prev => prev.map((q, i) => {
      if (i !== idx) return q;
      if (newType === 'sa') return { ...q, type: 'sa', answer: '', options: q.options || ['', '', '', ''] };
      return { ...q, type: 'mc', answer: 0, options: q.options?.length ? q.options : ['', '', '', ''] };
    }));
  const handleAddAiQuestion = (type = 'mc') => {
    const newQ = type === 'sa'
      ? { type: 'sa', question: '', answer: '', explanation: '' }
      : { type: 'mc', question: '', options: ['', '', '', ''], answer: 0, explanation: '' };
    setAiQuestions(prev => [...prev, newQ]);
  };

  // ── 저장 (내 퀴즈 / 내 퀴즈 + 공유) ────────────────────────────
  const saveAiQuizSet = async (isShared = false) => {
    if (aiQuestions.length === 0) { showToast('문제가 없습니다.', 'error'); return; }
    const finalTitle = customTitle.trim() || autoTitle || '퀴즈 세트';
    setIsSavingAi(true);
    try {
      await addDoc(collection(db, 'quizSets'), {
        title:         finalTitle,
        grade:         parseInt(grade) || null,
        semester:      parseInt(semester) || null,
        subject:       subject || '',
        publisher:     publisher || null,
        part:          part || null,
        unit:          unit || null,
        unitId:        aiUnitId || null,
        topic:         aiTopic.trim() || null,
        difficulty,
        questions:     aiQuestions,
        questionCount: aiQuestions.length,
        ownerId:       currentUid,
        ownerName:     auth.currentUser?.email || '선생님',
        classId:       currentClassId,
        isShared,
        sharedAt:      isShared ? serverTimestamp() : null,
        importCount:   0,
        sourceId:      null,
        createdAt:     serverTimestamp(),
      });
      showToast(isShared ? '✅ 내 퀴즈에 저장되고 퀴즈은행에 공유됐습니다!' : '✅ 내 퀴즈에 저장됐습니다!');
      resetAiForm();
      setTab('mine');
    } catch (err) {
      showToast('저장 중 오류가 발생했습니다.', 'error');
    } finally { setIsSavingAi(false); }
  };

  const resetAiForm = () => {
    setGrade(''); setSemester(''); setSubject(''); setPublisher(''); setPart(''); setUnit(''); setAiUnitId(''); setAiTopic(''); setAiLesson({ no: '', title: '', keywords: [] });
    setSourceText(''); setPdfBase64(''); setPdfName(''); setCount(5); setSaCount(0);
    setDifficulty('normal'); setCustomTitle(''); setAiQuestions([]); setAiStep('form'); setGenError('');
  };

  // ── 직접 출제: 문제 추가 ─────────────────────────────────────────
  const handleAddManualQuestion = () => {
    if (!newQText.trim()) { showToast('문제 내용을 입력해주세요.', 'error'); return; }
    if (newQType === 'choice') {
      const filled = newOptions.filter(o => o.trim());
      if (filled.length < 2) { showToast('선택지를 2개 이상 입력해주세요.', 'error'); return; }
      setManualQuestions(prev => [...prev, { type: 'mc', question: newQText.trim(), options: newOptions.map(o => o.trim()), answer: newAnswer, explanation: newExplanation.trim() }]);
    } else {
      if (!newShortAnswer.trim()) { showToast('정답을 입력해주세요.', 'error'); return; }
      setManualQuestions(prev => [...prev, { type: 'sa', question: newQText.trim(), options: [], answer: newShortAnswer.trim(), explanation: newExplanation.trim() }]);
    }
    setNewQText(''); setNewOptions(['', '', '', '']); setNewAnswer(0); setNewShortAnswer(''); setNewExplanation('');
  };

  // ── 직접 출제: 저장 ──────────────────────────────────────────────
  const saveManualQuizSet = async (isShared = false) => {
    if (!manualTitle.trim()) { showToast('퀴즈 제목을 입력해주세요.', 'error'); return; }
    if (manualQuestions.length === 0) { showToast('문제가 없습니다.', 'error'); return; }
    setIsManualSaving(true);
    try {
      await addDoc(collection(db, 'quizSets'), {
        title:         manualTitle.trim(),
        grade:         mGrade ? parseInt(mGrade) : null,
        semester:      mSemester ? parseInt(mSemester) : null,
        subject:       mSubject || '',
        publisher:     mPublisher || null,
        part:          mPart || null,
        unit:          mUnit || null,
        unitId:        mUnitId || null,
        topic:         mTopic.trim() || null,
        difficulty:    manualDiff,
        questions:     manualQuestions,
        questionCount: manualQuestions.length,
        ownerId:       currentUid,
        ownerName:     auth.currentUser?.email || '선생님',
        classId:       currentClassId,
        isShared,
        sharedAt:      isShared ? serverTimestamp() : null,
        importCount:   0,
        sourceId:      null,
        createdAt:     serverTimestamp(),
      });
      showToast(isShared ? '✅ 내 퀴즈에 저장되고 퀴즈은행에 공유됐습니다!' : '✅ 내 퀴즈에 저장됐습니다!');
      setManualTitle(''); setManualQuestions([]); setMGrade(''); setMSemester(''); setMSubject('');
      setMPublisher(''); setMPart(''); setMUnit(''); setMUnitId(''); setMTopic(''); setManualDiff('normal');
      setNewQText(''); setNewOptions(['', '', '', '']); setNewAnswer(0); setNewShortAnswer(''); setNewExplanation('');
      setTab('mine');
    } catch { showToast('저장 중 오류가 발생했습니다.', 'error'); }
    finally { setIsManualSaving(false); }
  };

  // ── 내 퀴즈: 공유 토글 ───────────────────────────────────────────
  const toggleShare = async (set) => {
    const newShared = !set.isShared;
    await updateDoc(doc(db, 'quizSets', set.id), {
      isShared: newShared,
      sharedAt: newShared ? serverTimestamp() : null,
    });
    setMySets(prev => prev.map(s => s.id === set.id ? { ...s, isShared: newShared } : s));
    showToast(newShared ? '퀴즈은행에 공유됐습니다!' : '공유가 취소됐습니다.');
  };

  // ── 내 퀴즈: 삭제 ───────────────────────────────────────────────
  const deleteSet = (set) => {
    showConfirm(`"${set.title}"을 삭제할까요?`, async () => {
      await deleteDoc(doc(db, 'quizSets', set.id));
      setMySets(prev => prev.filter(s => s.id !== set.id));
      showToast('삭제됐습니다.');
    });
  };

  // ── 공유퀴즈은행: 관리자 삭제 ─────────────────────────────────────
  const deleteBankSet = (set) => {
    showConfirm(`공유퀴즈은행에서 "${set.title}"을 삭제할까요?\n(작성자의 내 퀴즈 목록에서는 유지됩니다)`, async () => {
      await updateDoc(doc(db, 'quizSets', set.id), { isShared: false, sharedAt: null });
      setBankSets(prev => prev.filter(s => s.id !== set.id));
      showToast('공유퀴즈은행에서 제거됐습니다.');
    });
  };

  // ── 퀴즈은행: 내 퀴즈로 가져오기 ─────────────────────────────────
  const importFromBank = async (set) => {
    showConfirm(`"${set.title}"을 내 퀴즈로 가져올까요?`, async () => {
      const { id: _omit, ...setData } = set; // id 필드 제거 (Firestore는 undefined 거부)
      await addDoc(collection(db, 'quizSets'), {
        ...setData,
        ownerId:   currentUid,
        ownerName: auth.currentUser?.email || '선생님',
        classId:   currentClassId,
        isShared:  false,
        sharedAt:  null,
        sourceId:  set.id,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'quizSets', set.id), { importCount: (set.importCount || 0) + 1 });
      showToast('✅ 내 퀴즈로 가져왔습니다!');
    });
  };

  // ── 교육과정 선택 UI (재사용) ────────────────────────────────────
  const CurriculumSelect = ({ g, setG, sem, setSem, subj, setSubj, pub, setPub, pt, setPt, ut, setUt, showTitle, titleVal, setTitleVal }) => {
    const gd = g ? CURRICULUM[parseInt(g)] : null;
    const sd = gd?.subjects.find(s => s.name === subj);
    const pubs = sd?.publishers || [];
    const pts = sd?.parts || [];
    const ru = sd?.units;
    const ul = ru ? (Array.isArray(ru) ? ru : (ru[sem] || [])) : [];
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">학년</label>
          <select value={g} onChange={e => { setG(e.target.value); setSubj(''); setPub(''); setPt(''); setUt(''); }}
            className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
            <option value="">선택</option>
            {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}학년</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">학기</label>
          <select value={sem} onChange={e => { setSem(e.target.value); setUt(''); }}
            className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
            <option value="">전체</option>
            <option value="1">1학기</option>
            <option value="2">2학기</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">과목</label>
          <select value={subj} onChange={e => { setSubj(e.target.value); setPub(''); setPt(''); setUt(''); }}
            disabled={!g}
            className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50">
            <option value="">선택</option>
            {(gd?.subjects || []).map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        </div>
        {pubs.length > 1 && (
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">출판사</label>
            <select value={pub} onChange={e => setPub(e.target.value)}
              className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
              <option value="">선택</option>
              {pubs.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        )}
        {pts.length > 0 && (
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">권</label>
            <select value={pt} onChange={e => setPt(e.target.value)}
              className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
              <option value="">선택</option>
              {pts.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        )}
        {ul.length > 0 && (
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">단원</label>
            <select value={ut} onChange={e => setUt(e.target.value)}
              className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
              <option value="">전체</option>
              {ul.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        )}
        {showTitle && (
          <div className="md:col-span-3">
            <label className="block text-xs font-bold text-slate-500 mb-1">퀴즈 제목 *</label>
            <input value={titleVal} onChange={e => setTitleVal(e.target.value)}
              placeholder="제목을 직접 입력하세요"
              className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:border-indigo-500" />
          </div>
        )}
      </div>
    );
  };

  // ── 필터링 ───────────────────────────────────────────────────────
  const filteredMySets = mySets.filter(s =>
    (!myFilter.grade   || String(s.grade) === myFilter.grade) &&
    (!myFilter.subject || s.subject === myFilter.subject)
  );
  const filteredBankSets = bankSets.filter(s =>
    (!bankFilter.grade   || String(s.grade) === bankFilter.grade) &&
    (!bankFilter.subject || s.subject === bankFilter.subject)
  );
  const allSubjects = [...new Set(bankSets.map(s => s.subject).filter(Boolean))];

  return (
    <>
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-5xl mx-auto">

        {/* 헤더 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-wrap justify-between items-center gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800">📚 퀴즈 은행</h1>
            <p className="text-slate-500 text-sm mt-0.5">퀴즈를 만들고 관리하세요. 던전과 레이드에 바로 활용할 수 있습니다.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {[
              ['mine',   '📋 내 퀴즈', `(${mySets.length})`],
              ['ai',     '🤖 AI 출제',  ''],
              ['manual', '✏️ 직접 출제', ''],
              ['bank',   '🌐 퀴즈은행', ''],
            ].map(([t, label, count]) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors
                  ${tab === t ? 'bg-indigo-600 text-white shadow' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
                {label}{count && tab === 'mine' ? ` ${count}` : ''}
              </button>
            ))}
          </div>
        </div>

        {/* ══ 내 퀴즈 탭 ══ */}
        {tab === 'mine' && (
          <div className="space-y-4">
            {/* 필터 */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">학년</label>
                  <select value={myFilter.grade} onChange={e => setMyFilter(f => ({ ...f, grade: e.target.value }))}
                    className="border-2 border-slate-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500">
                    <option value="">전체</option>
                    {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}학년</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">과목</label>
                  <input value={myFilter.subject} onChange={e => setMyFilter(f => ({ ...f, subject: e.target.value }))}
                    placeholder="과목명 검색"
                    className="border-2 border-slate-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500 w-32" />
                </div>
                <button onClick={() => setMyFilter({ grade: '', subject: '' })}
                  className="text-xs text-slate-400 hover:text-slate-600 font-bold px-2 py-1.5">초기화</button>
                <div className="ml-auto">
                  <button onClick={() => setTab('ai')}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-colors">
                    + 새 퀴즈 만들기
                  </button>
                </div>
              </div>
            </div>

            {isLoadingMine ? (
              <div className="flex items-center justify-center py-20 gap-2.5">
                <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
                <span className="text-sm text-slate-400">불러오는 중...</span>
              </div>
            ) : filteredMySets.length === 0 ? (
              <div className="text-center py-20 text-slate-400">
                <div className="text-5xl mb-3">📋</div>
                <p className="font-bold text-lg text-slate-600">
                  {mySets.length === 0 ? '아직 만든 퀴즈가 없습니다' : '조건에 맞는 퀴즈가 없습니다'}
                </p>
                <p className="text-sm mt-1">AI 출제 또는 직접 출제 탭에서 첫 번째 퀴즈를 만들어보세요!</p>
                <button onClick={() => setTab('ai')}
                  className="mt-4 px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl text-sm hover:bg-indigo-700">
                  🤖 AI로 퀴즈 만들기
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredMySets.map(set => (
                  <div key={set.id} className="rounded-2xl border-2 border-slate-200 bg-white overflow-hidden hover:shadow-md transition-all group">
                    {/* 색깔 띠 */}
                    <div className={`px-4 py-1.5 text-white text-[10px] font-extrabold flex justify-between items-center
                      ${set.difficulty === 'easy' ? 'bg-emerald-500' : set.difficulty === 'hard' ? 'bg-rose-500' : 'bg-sky-500'}`}>
                      <span>{DIFF_LABEL[set.difficulty] || '보통'}</span>
                      <span>{set.questionCount || 0}문항 · {fmtDate(set.createdAt)}</span>
                    </div>
                    {/* 본문 */}
                    <div className="p-4">
                      <h3 className="font-extrabold text-slate-800 text-sm leading-snug mb-2 line-clamp-2">{set.title}</h3>
                      {/* 태그 */}
                      <div className="flex flex-wrap gap-1 mb-3">
                        {set.grade && <span className="text-[10px] bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded-full">{set.grade}학년</span>}
                        {set.semester && <span className="text-[10px] bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded-full">{set.semester}학기</span>}
                        {set.subject && <span className="text-[10px] bg-indigo-50 text-indigo-600 font-bold px-2 py-0.5 rounded-full">{set.subject}</span>}
                        {set.isShared && <span className="text-[10px] bg-emerald-50 text-emerald-600 font-bold px-2 py-0.5 rounded-full">🌐 공유중</span>}
                        {set.sourceId && <span className="text-[10px] bg-amber-50 text-amber-600 font-bold px-2 py-0.5 rounded-full">📥 가져옴</span>}
                      </div>
                    </div>
                    {/* 하단 액션 */}
                    <div className="px-3 pb-3 flex gap-1.5 flex-wrap border-t border-slate-100 pt-2.5">
                      <button onClick={() => setPreviewSet(set)}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                        👁 미리보기
                      </button>
                      <button onClick={() => setEditingSet(set)}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-colors">
                        ✏️ 수정
                      </button>
                      <button onClick={() => toggleShare(set)}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors
                          ${set.isShared ? 'border-emerald-200 text-emerald-600 bg-emerald-50 hover:bg-emerald-100' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                        {set.isShared ? '🌐 공유중' : '↑ 공유'}
                      </button>
                      <button onClick={() => deleteSet(set)}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-rose-200 text-rose-500 hover:bg-rose-50 transition-colors ml-auto">
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ AI 출제 탭 ══ */}
        {tab === 'ai' && (
          <div className="space-y-5">
            {aiStep === 'form' && (
              <>
                {/* 교육과정 선택 */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                  <h2 className="font-bold text-slate-700 text-sm mb-4">📌 교육과정 선택</h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">학년 *</label>
                      <select value={grade} onChange={e => { setGrade(e.target.value); setSubject(''); setPublisher(''); setPart(''); setUnit(''); }}
                        className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
                        <option value="">선택</option>
                        {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}학년</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">학기</label>
                      <select value={semester} onChange={e => { setSemester(e.target.value); setUnit(''); }}
                        className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
                        <option value="">전체</option>
                        <option value="1">1학기</option>
                        <option value="2">2학기</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">과목 *</label>
                      <select value={subject} onChange={e => { setSubject(e.target.value); setPublisher(''); setPart(''); setUnit(''); }}
                        disabled={!grade}
                        className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50">
                        <option value="">선택</option>
                        {(gradeData?.subjects || []).map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                      </select>
                    </div>
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
                    <UnitSelector
                      grade={grade} semester={semester} subject={subject} publisher={publisher}
                      unitId={aiUnitId} topic={aiTopic}
                      onUnitChange={(id, name) => { setAiUnitId(id); setUnit(name || ''); setAiLesson({ no: '', title: '', keywords: [] }); }}
                      onTopicChange={setAiTopic}
                      onLessonChange={(no, title, keywords) => setAiLesson({ no, title, keywords: keywords || [] })}
                      currentUid={currentUid}
                    />
                  </div>
                  <div className="mt-3">
                    <label className="block text-xs font-bold text-slate-500 mb-1">퀴즈 제목 (선택)</label>
                    <input value={customTitle} onChange={e => setCustomTitle(e.target.value)}
                      placeholder={autoTitle || '제목을 입력하거나 비워두면 자동 생성'}
                      className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:border-indigo-500" />
                    {autoTitle && !customTitle && (
                      <div className="mt-1 text-[10px] text-slate-400">자동 제목: <span className="text-indigo-500">{autoTitle}</span></div>
                    )}
                  </div>
                </div>

                {/* 수업 자료 입력 */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                  <h2 className="font-bold text-slate-700 text-sm mb-4">📝 수업 자료 입력</h2>
                  {pdfBase64 ? (
                    <div className="flex items-center gap-3 p-3 bg-indigo-50 border-2 border-indigo-300 rounded-xl mb-3">
                      <span className="text-2xl">📄</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-indigo-800 truncate">{pdfName}</div>
                        <div className="text-xs text-indigo-500">PDF 준비 완료</div>
                      </div>
                      <button onClick={() => { setPdfBase64(''); setPdfName(''); }} className="text-slate-400 hover:text-rose-500 font-bold text-lg">✕</button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <label className="flex flex-col items-center justify-center h-20 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors">
                        <span className="text-xl mb-0.5">📄</span>
                        <span className="text-xs font-bold text-slate-500">PDF 업로드</span>
                        <span className="text-[9px] text-slate-400">AI가 직접 읽음</span>
                        <input type="file" accept=".pdf" className="hidden" onChange={handlePdfUpload} />
                      </label>
                      <label className={`flex flex-col items-center justify-center h-20 border-2 border-dashed rounded-xl transition-colors
                        ${isPptxLoading ? 'border-amber-300 bg-amber-50 cursor-wait' : 'border-slate-300 cursor-pointer hover:border-amber-400 hover:bg-amber-50'}`}>
                        {isPptxLoading ? <><span className="text-xl mb-0.5 animate-pulse">⏳</span><span className="text-xs font-bold text-amber-600">텍스트 추출 중...</span></> :
                          <><span className="text-xl mb-0.5">📊</span><span className="text-xs font-bold text-slate-500">PPT / PPTX</span><span className="text-[9px] text-slate-400">텍스트 자동 추출</span></>}
                        <input type="file" accept=".ppt,.pptx" className="hidden" disabled={isPptxLoading} onChange={handlePptxUpload} />
                      </label>
                    </div>
                  )}
                  <textarea value={sourceText} onChange={e => setSourceText(e.target.value)}
                    placeholder={pdfBase64 ? "PDF 외 추가로 참고할 내용 (선택)" : "수업 자료를 붙여넣으세요. AI가 자동으로 퀴즈를 만들어드립니다."}
                    className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 resize-none h-32" />
                  <div className="text-right text-xs text-slate-400 mt-1">{sourceText.length}자</div>
                </div>

                {/* 설정 */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                  <h2 className="font-bold text-slate-700 text-sm mb-4">⚙️ 퀴즈 설정</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-2">문제 수</label>
                      <div className="flex rounded-xl border-2 border-slate-200 overflow-hidden mb-2">
                        {[5, 8, 10].map(n => (
                          <button key={n} onClick={() => { setCount(n); if (saCount > n) setSaCount(n); }}
                            className={`flex-1 py-2 text-sm font-bold transition-colors ${count === n ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                            {n}개
                          </button>
                        ))}
                      </div>
                      <input type="number" min="1" max="20" value={count}
                        onChange={e => { const v = Math.min(20, Math.max(1, parseInt(e.target.value) || 1)); setCount(v); if (saCount > v) setSaCount(v); }}
                        className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm text-center font-bold focus:outline-none focus:border-indigo-500" />
                      <div className="mt-2 pt-2 border-t border-slate-100">
                        <div className="text-[10px] text-slate-500 font-bold mb-1.5">유형 구성</div>
                        <div className="flex items-center gap-1.5 text-xs flex-wrap">
                          <span className="text-slate-500">객관식</span>
                          <span className="font-extrabold text-indigo-600 min-w-[2rem] text-center">{count - saCount}개</span>
                          <span className="text-slate-300">+</span>
                          <span className="text-slate-500">주관식</span>
                          <input type="number" min="0" max={count} value={saCount}
                            onChange={e => setSaCount(Math.min(count, Math.max(0, parseInt(e.target.value) || 0)))}
                            className="w-14 border-2 border-slate-200 rounded-lg px-2 py-0.5 text-xs text-center font-bold focus:outline-none focus:border-amber-400" />
                          <span className="font-extrabold text-amber-600">개</span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-2">난이도</label>
                      <div className="flex flex-col gap-2">
                        {DIFF_OPTIONS.map(d => (
                          <button key={d.value} onClick={() => setDifficulty(d.value)}
                            className={`py-2 rounded-xl text-xs font-bold border-2 transition-colors
                              ${difficulty === d.value ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                            {d.label} — <span className="font-normal opacity-70">{d.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {genError && (
                  <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-sm text-rose-700 whitespace-pre-line">⚠️ {genError}</div>
                )}

                <button onClick={handleGenerate}
                  disabled={isGenerating || (!sourceText.trim() && !pdfBase64 && !aiLesson.title && !aiLesson.keywords?.length) || !grade || !subject}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-lg rounded-2xl shadow-md transition-all active:scale-[0.99] disabled:opacity-40">
                  {isGenerating ? '🤖 AI가 퀴즈를 만드는 중...' : '🤖 AI 퀴즈 생성하기'}
                </button>
              </>
            )}

            {aiStep === 'preview' && (
              <>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h2 className="font-extrabold text-slate-800 text-lg">생성된 퀴즈 검토</h2>
                    <p className="text-sm text-slate-500">{customTitle.trim() || autoTitle || '퀴즈 세트'} · {aiQuestions.length}문제</p>
                  </div>
                  <button onClick={() => setAiStep('form')}
                    className="px-4 py-2 text-sm font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">
                    ← 다시 생성
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {aiQuestions.map((q, idx) => (
                    <QuestionCard key={idx} q={q} idx={idx}
                      onChange={handleAiQChange} onDelete={handleAiQDelete} onTypeChange={handleAiQTypeChange} />
                  ))}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => handleAddAiQuestion('mc')}
                    className="flex-1 py-3 border-2 border-dashed border-indigo-300 text-indigo-600 font-bold text-sm rounded-2xl hover:bg-indigo-50 transition-colors">
                    + 객관식 추가
                  </button>
                  <button onClick={() => handleAddAiQuestion('sa')}
                    className="flex-1 py-3 border-2 border-dashed border-amber-300 text-amber-600 font-bold text-sm rounded-2xl hover:bg-amber-50 transition-colors">
                    + 주관식 추가
                  </button>
                </div>
                {/* 저장 버튼 */}
                <div className="flex gap-3">
                  <button onClick={() => saveAiQuizSet(false)} disabled={isSavingAi || aiQuestions.length === 0}
                    className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-base rounded-2xl shadow-md transition-all disabled:opacity-40">
                    {isSavingAi ? '저장 중...' : '💾 내 퀴즈로 저장'}
                  </button>
                  <button onClick={() => saveAiQuizSet(true)} disabled={isSavingAi || aiQuestions.length === 0}
                    className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-base rounded-2xl shadow-md transition-all disabled:opacity-40">
                    {isSavingAi ? '저장 중...' : '🌐 저장 + 퀴즈은행 공유'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══ 직접 출제 탭 ══ */}
        {tab === 'manual' && (
          <div className="space-y-5">
            {/* 교육과정 + 제목 */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h2 className="font-bold text-slate-700 text-sm mb-4">📌 교육과정 및 제목</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">학년</label>
                  <select value={mGrade} onChange={e => { setMGrade(e.target.value); setMSubject(''); setMPublisher(''); setMPart(''); setMUnit(''); }}
                    className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
                    <option value="">선택</option>
                    {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}학년</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">학기</label>
                  <select value={mSemester} onChange={e => { setMSemester(e.target.value); setMUnit(''); }}
                    className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
                    <option value="">전체</option>
                    <option value="1">1학기</option>
                    <option value="2">2학기</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">과목</label>
                  <select value={mSubject} onChange={e => { setMSubject(e.target.value); setMPublisher(''); setMPart(''); setMUnit(''); }}
                    disabled={!mGrade}
                    className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50">
                    <option value="">선택</option>
                    {(mGradeData?.subjects || []).map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                  </select>
                </div>
                {mPublishers.length > 1 && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">출판사</label>
                    <select value={mPublisher} onChange={e => setMPublisher(e.target.value)}
                      className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
                      <option value="">선택</option>
                      {mPublishers.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                )}
                {mParts.length > 0 && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">권</label>
                    <select value={mPart} onChange={e => setMPart(e.target.value)}
                      className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
                      <option value="">선택</option>
                      {mParts.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                )}
                <UnitSelector
                  grade={mGrade} semester={mSemester} subject={mSubject} publisher={mPublisher}
                  unitId={mUnitId} topic={mTopic}
                  onUnitChange={(id, name) => { setMUnitId(id); setMUnit(name || ''); }}
                  onTopicChange={setMTopic}
                  onLessonChange={(no, desc) => { if (desc) setMUnit(prev => prev || desc); }}
                  currentUid={currentUid}
                />
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">난이도</label>
                  <div className="flex rounded-xl border-2 border-slate-200 overflow-hidden">
                    {DIFF_OPTIONS.map(d => (
                      <button key={d.value} onClick={() => setManualDiff(d.value)}
                        className={`flex-1 py-2 text-xs font-bold transition-colors
                          ${manualDiff === d.value ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                        {d.label.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <label className="block text-xs font-bold text-slate-500 mb-1">퀴즈 제목 *</label>
                <input value={manualTitle} onChange={e => setManualTitle(e.target.value)}
                  placeholder="퀴즈 제목을 입력하세요"
                  className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:border-indigo-500" />
              </div>
            </div>

            {/* 문제 추가 카드 */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h2 className="font-bold text-slate-700 text-sm mb-4">➕ 문제 추가</h2>
              <div className="flex rounded-xl border-2 border-slate-200 overflow-hidden mb-4 w-fit">
                <button onClick={() => setNewQType('choice')}
                  className={`px-5 py-2 text-sm font-bold transition-colors ${newQType === 'choice' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>객관식</button>
                <button onClick={() => setNewQType('short')}
                  className={`px-5 py-2 text-sm font-bold transition-colors ${newQType === 'short' ? 'bg-amber-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>주관식</button>
              </div>
              <div className="mb-3">
                <label className="block text-xs font-bold text-slate-500 mb-1">문제 내용 *</label>
                <textarea value={newQText} onChange={e => setNewQText(e.target.value)}
                  placeholder="문제 내용을 입력하세요"
                  className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:border-indigo-400" />
              </div>
              {newQType === 'choice' && (
                <div className="mb-3">
                  <label className="block text-xs font-bold text-slate-500 mb-2">선택지 (정답 라디오 클릭)</label>
                  <div className="grid grid-cols-2 gap-2">
                    {newOptions.map((opt, oi) => (
                      <div key={oi} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${newAnswer === oi ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200'}`}>
                        <button onClick={() => setNewAnswer(oi)}
                          className={`w-4 h-4 rounded-full border-2 shrink-0 transition-colors ${newAnswer === oi ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`} />
                        <input value={opt} onChange={e => { const u = [...newOptions]; u[oi] = e.target.value; setNewOptions(u); }}
                          className="flex-1 text-sm bg-transparent focus:outline-none" placeholder={`보기 ${oi + 1}`} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {newQType === 'short' && (
                <div className="mb-3">
                  <label className="block text-xs font-bold text-slate-500 mb-1">정답 *</label>
                  <input value={newShortAnswer} onChange={e => setNewShortAnswer(e.target.value)}
                    placeholder="정답 텍스트"
                    className="w-full border-2 border-amber-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-400" />
                </div>
              )}
              <div className="mb-4">
                <label className="block text-xs font-bold text-slate-500 mb-1">해설 (선택)</label>
                <input value={newExplanation} onChange={e => setNewExplanation(e.target.value)}
                  placeholder="해설을 입력하세요 (생략 가능)"
                  className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
              </div>
              <button onClick={handleAddManualQuestion}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-2xl transition-colors active:scale-[0.99]">
                + 문제 추가하기
              </button>
            </div>

            {/* 추가된 문제 목록 */}
            {manualQuestions.length > 0 && (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                <h2 className="font-bold text-slate-700 text-sm mb-4">📋 추가된 문제 ({manualQuestions.length}개)</h2>
                <div className="space-y-2">
                  {manualQuestions.map((q, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="text-xs font-extrabold text-slate-400 mt-0.5 shrink-0">Q{idx + 1}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${(q.type === 'mc' || q.type === 'choice') ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
                        {(q.type === 'mc' || q.type === 'choice') ? '객관식' : '주관식'}
                      </span>
                      <span className="flex-1 text-sm text-slate-700 leading-snug line-clamp-2">{q.question}</span>
                      <button onClick={() => setManualQuestions(prev => prev.filter((_, i) => i !== idx))}
                        className="text-xs text-rose-400 hover:text-rose-600 font-bold transition-colors shrink-0">삭제</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 저장 버튼 */}
            <div className="flex gap-3">
              <button onClick={() => saveManualQuizSet(false)}
                disabled={isManualSaving || manualQuestions.length === 0 || !manualTitle.trim()}
                className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-base rounded-2xl shadow-md transition-all disabled:opacity-40">
                {isManualSaving ? '저장 중...' : '💾 내 퀴즈로 저장'}
              </button>
              <button onClick={() => saveManualQuizSet(true)}
                disabled={isManualSaving || manualQuestions.length === 0 || !manualTitle.trim()}
                className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-base rounded-2xl shadow-md transition-all disabled:opacity-40">
                {isManualSaving ? '저장 중...' : '🌐 저장 + 퀴즈은행 공유'}
              </button>
            </div>
          </div>
        )}

        {/* ══ 퀴즈은행 탭 ══ */}
        {tab === 'bank' && (
          <div className="space-y-4">
            {/* 필터 */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">학년</label>
                  <select value={bankFilter.grade} onChange={e => setBankFilter(f => ({ ...f, grade: e.target.value }))}
                    className="border-2 border-slate-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500">
                    <option value="">전체 학년</option>
                    {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}학년</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">과목</label>
                  <select value={bankFilter.subject} onChange={e => setBankFilter(f => ({ ...f, subject: e.target.value }))}
                    className="border-2 border-slate-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500">
                    <option value="">전체 과목</option>
                    {allSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <button onClick={() => setBankFilter({ grade: '', subject: '' })}
                  className="text-xs text-slate-400 hover:text-slate-600 font-bold px-2 py-1.5">초기화</button>
                <div className="ml-auto flex items-center gap-2 self-center">
                  <span className="text-xs text-slate-400">{filteredBankSets.length}개 퀴즈</span>
                  {canAdminMode && (
                    <button onClick={() => setIsAdminMode(v => !v)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors
                        ${isAdminMode ? 'bg-rose-500 text-white border-rose-500' : 'border-slate-200 text-slate-500 hover:border-slate-400'}`}>
                      {isAdminMode ? '🔒 관리자 모드 ON' : '🔑 관리자 모드'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {isLoadingBank ? (
              <div className="flex items-center justify-center py-20 gap-2.5">
                <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
                <span className="text-sm text-slate-400">불러오는 중...</span>
              </div>
            ) : filteredBankSets.length === 0 ? (
              <div className="text-center py-20 text-slate-400">
                <div className="text-5xl mb-3">🌐</div>
                <p className="font-bold text-lg text-slate-600">
                  {bankSets.length === 0 ? '아직 공유된 퀴즈가 없습니다' : '조건에 맞는 퀴즈가 없습니다'}
                </p>
                <p className="text-sm mt-1">내 퀴즈에서 "공유하기" 버튼을 눌러 퀴즈를 공유해보세요!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredBankSets.map(set => (
                  <div key={set.id} className="bg-white rounded-2xl border-2 border-slate-200 hover:shadow-md transition-all overflow-hidden group">
                    {/* 색깔 띠 */}
                    <div className={`px-4 py-1.5 text-white text-[10px] font-extrabold flex justify-between items-center
                      ${set.difficulty === 'easy' ? 'bg-emerald-500' : set.difficulty === 'hard' ? 'bg-rose-500' : 'bg-sky-500'}`}>
                      <span>{DIFF_LABEL[set.difficulty] || '보통'}</span>
                      <span>{set.questionCount || 0}문항{(set.importCount || 0) > 0 ? ` · 📥 ${set.importCount}회` : ''}</span>
                    </div>
                    {/* 본문 */}
                    <div className="p-4">
                      <h3 className="font-extrabold text-slate-800 text-sm leading-snug mb-2 line-clamp-2">{set.title}</h3>
                      {/* 태그 */}
                      <div className="flex flex-wrap gap-1 mb-2">
                        {set.grade && <span className="text-[10px] bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded-full">{set.grade}학년</span>}
                        {set.semester && <span className="text-[10px] bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded-full">{set.semester}학기</span>}
                        {set.subject && <span className="text-[10px] bg-indigo-50 text-indigo-600 font-bold px-2 py-0.5 rounded-full">{set.subject}</span>}
                      </div>
                      <div className="text-[11px] text-slate-400">{fmtDate(set.sharedAt || set.createdAt)}</div>
                    </div>
                    {/* 하단 액션 */}
                    <div className="px-3 pb-3 flex gap-1.5 border-t border-slate-100 pt-2.5 flex-wrap">
                      <button onClick={() => setPreviewSet(set)}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                        👁 미리보기
                      </button>
                      <button onClick={() => importFromBank(set)}
                        className="flex-1 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors text-center">
                        📥 가져오기
                      </button>
                      {/* 관리자 모드: 수정/삭제 */}
                      {(isAdminMode || set.ownerId === currentUid) && (
                        <>
                          <button onClick={() => setEditingBankSet(set)}
                            className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-amber-200 text-amber-600 hover:bg-amber-50 transition-colors">
                            ✏️
                          </button>
                          <button onClick={() => deleteBankSet(set)}
                            className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-rose-200 text-rose-500 hover:bg-rose-50 transition-colors">
                            🗑️
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>

    {/* 미리보기 모달 */}
    {previewSet && <PreviewModal set={previewSet} onClose={() => setPreviewSet(null)} />}

    {/* 수정 모달 (내 퀴즈) */}
    {editingSet && (
      <EditModal
        set={editingSet}
        onSave={(updated) => { setMySets(prev => prev.map(s => s.id === updated.id ? updated : s)); setEditingSet(null); showToast('✅ 저장됐습니다!'); }}
        onClose={() => setEditingSet(null)}
      />
    )}

    {/* 수정 모달 (공유퀴즈은행) */}
    {editingBankSet && (
      <EditModal
        set={editingBankSet}
        onSave={(updated) => { setBankSets(prev => prev.map(s => s.id === updated.id ? updated : s)); setEditingBankSet(null); showToast('✅ 공유퀴즈 수정됐습니다!'); }}
        onClose={() => setEditingBankSet(null)}
      />
    )}

    {/* 토스트 */}
    {toast && (
      <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl font-bold text-sm shadow-2xl pointer-events-none
        ${toast.type === 'error' ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'}`}
        style={{ whiteSpace: 'nowrap' }}>
        {toast.message}
      </div>
    )}

    {/* 컨펌 다이얼로그 */}
    {confirmState && (
      <div className="fixed inset-0 bg-black/50 z-[300] flex items-center justify-center p-4"
        onClick={e => e.target === e.currentTarget && setConfirmState(null)}>
        <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
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
