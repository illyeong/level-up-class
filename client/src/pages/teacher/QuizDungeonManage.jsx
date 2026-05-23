import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import JSZip from 'jszip';
import { MONSTERS_DB, TIER_LABEL, TIER_COST } from '../../data/monsterData';
import SpriteMonster from '../../components/SpriteMonster';

// PPTX에서 텍스트 추출 (슬라이드별 XML 파싱)
const extractPptxText = async (file) => {
  const zip = new JSZip();
  const content = await zip.loadAsync(file);

  const slideFiles = Object.keys(content.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => parseInt(a.match(/\d+/)?.[0]||0) - parseInt(b.match(/\d+/)?.[0]||0));

  if (slideFiles.length === 0) throw new Error('슬라이드를 찾을 수 없습니다.');

  const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';

  const slideTexts = [];
  for (let i = 0; i < slideFiles.length; i++) {
    const xml = await content.files[slideFiles[i]].async('text');
    let text = '';

    // 1차: DOMParser로 정확한 XML 파싱 (텍스트 노드만 추출)
    try {
      const doc = new DOMParser().parseFromString(xml, 'text/xml');
      if (!doc.querySelector('parsererror')) {
        text = Array.from(doc.getElementsByTagNameNS(NS_A, 't'))
          .map(n => n.textContent?.trim())
          .filter(Boolean)
          .join(' ');
      }
    } catch (_) {}

    // 2차 fallback: XML 태그 미포함 정규식 ([^<]* 사용)
    if (!text) {
      text = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)]
        .map(m => m[1]
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>').replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'").trim()
        )
        .filter(Boolean)
        .join(' ');
    }

    if (text) slideTexts.push(`[슬라이드 ${i + 1}]\n${text}`);
  }
  return slideTexts.join('\n\n');
};

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

// ── 정적 썸네일 (애니 없음 — 선택 그리드용) ──────────────────
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

// ── 몬스터 선택 피커 ─────────────────────────────────────────
const TIER_FILTERS = [
  { key: 'all',    label: '전체' },
  { key: 'tiny',   label: '극소' },
  { key: 'small',  label: '소형' },
  { key: 'medium', label: '중형' },
  { key: 'large',  label: '대형' },
  { key: 'boss',   label: '보스' },
];

const ALL_MONSTERS = Object.values(MONSTERS_DB)
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

  const handleRemove = (idx) => {
    onMonstersChange(selectedMonsters.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3">
      {/* 모드 토글 */}
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
            <div className="text-[10px] text-slate-400 mt-0.5">
              문제 수에 맞게 다양한 크기의 몬스터가 랜덤 배정됩니다
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* 예산 바 */}
          {questionCount === 0 ? (
            <div className="bg-slate-100 rounded-xl p-3 text-xs text-slate-400 text-center">
              문제를 먼저 추가하면 몬스터 예산이 생성됩니다.
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

          {/* 선택된 웨이브 목록 */}
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
                      <div className="text-[10px] text-slate-400">
                        {m ? TIER_LABEL[m.tier] : ''} · {cost}문제
                      </div>
                    </div>
                    <button onClick={() => handleRemove(idx)}
                      className="text-rose-400 hover:text-rose-600 text-lg leading-none font-bold transition-colors">×</button>
                  </div>
                );
              })}
            </div>
          )}

          {/* 몬스터 추가 그리드 */}
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

// ─────────────────────── 문제 편집 카드 ──────────────────────
function QuestionCard({ q, idx, onChange, onDelete, onTypeChange }) {
  const isSA = q.type === 'sa';
  return (
    <div className="bg-white border-2 border-slate-200 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-400">Q{idx + 1}</span>
          <div className="flex rounded-lg overflow-hidden border border-slate-200 text-[10px] font-bold">
            <button
              onClick={() => onTypeChange(idx, 'mc')}
              className={`px-2 py-0.5 transition-colors ${!isSA ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
              객관식
            </button>
            <button
              onClick={() => onTypeChange(idx, 'sa')}
              className={`px-2 py-0.5 transition-colors ${isSA ? 'bg-amber-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
              주관식
            </button>
          </div>
        </div>
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
      {isSA ? (
        <div>
          <label className="text-[10px] text-slate-400 mb-1 block">정답 (단답형)</label>
          <input
            value={q.answer || ''}
            onChange={e => onChange(idx, 'answer', e.target.value)}
            className="w-full text-sm border border-amber-200 rounded-xl px-3 py-2 focus:outline-none focus:border-amber-400"
            placeholder="정답 텍스트 입력 (짧은 단어/구문)"
          />
          <div className="text-[10px] text-slate-400 mt-0.5">학생 답변과 대소문자 구분 없이 비교됩니다</div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {(q.options || ['', '', '', '']).map((opt, oi) => (
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
                    const newOpts = [...(q.options || ['', '', '', ''])];
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
        </>
      )}
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
  const [tab, setTab]           = useState('create'); // 'create' | 'manual' | 'dungeons'
  const [step, setStep]         = useState('form');   // 'form' | 'preview'

  // ── 직접 출제 탭 state ──────────────────────────────────────
  const [manualTitle, setManualTitle]             = useState('');
  const [manualQuestions, setManualQuestions]     = useState([]);
  const [newQType, setNewQType]                   = useState('choice'); // 'choice' | 'short'
  const [newQText, setNewQText]                   = useState('');
  const [newOptions, setNewOptions]               = useState(['', '', '', '']);
  const [newAnswer, setNewAnswer]                 = useState(0);
  const [newShortAnswer, setNewShortAnswer]       = useState('');
  const [newExplanation, setNewExplanation]       = useState('');
  const [isManualPublishing, setIsManualPublishing] = useState(false);
  const [manualMonsterMode, setManualMonsterMode]       = useState('random');
  const [manualSelectedMonsters, setManualSelectedMonsters] = useState([]);

  // 폼 상태
  const [grade, setGrade]       = useState('');
  const [semester, setSemester] = useState('');
  const [subject, setSubject]   = useState('');
  const [publisher, setPublisher] = useState('');
  const [part, setPart]         = useState('');
  const [unit, setUnit]         = useState('');
  const [sourceText, setSourceText] = useState('');
  const [pdfBase64, setPdfBase64]   = useState('');
  const [pdfName, setPdfName]       = useState('');
  const [isPptxLoading, setIsPptxLoading] = useState(false);
  const [count, setCount]       = useState(5);
  const [saCount, setSaCount]   = useState(0);
  const [difficulty, setDifficulty] = useState('normal');
  const [monsterMode, setMonsterMode]         = useState('random'); // 'random' | 'manual'
  const [selectedMonsters, setSelectedMonsters] = useState([]);     // string[] of monster IDs
  const [timeLimit, setTimeLimit]             = useState(null);     // null=난이도별, 0=무제한, N=초
  const [customTitle, setCustomTitle] = useState('');
  const [rewards, setRewards]   = useState({ gold: 150, exp: 75, diamond: 75 });

  const DIFF_REWARDS = {
    easy:   { gold: 100, exp: 50,  diamond: 50  },
    normal: { gold: 150, exp: 75,  diamond: 75  },
    hard:   { gold: 200, exp: 100, diamond: 100 },
  };

  const handleDifficultyChange = (d) => {
    setDifficulty(d);
    setRewards(DIFF_REWARDS[d]);
  };

  // 생성 상태
  const [questions, setQuestions] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState('');

  // 발행된 던전
  const [dungeons, setDungeons] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const [toast, setToast] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };
  const showConfirm = (message, onConfirm) => setConfirmState({ message, onConfirm });

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
    setPart(''); setUnit(''); setSourceText(''); setCustomTitle('');
    setPdfBase64(''); setPdfName(''); setIsPptxLoading(false);
    setCount(5); setSaCount(0); setDifficulty('normal');
    setMonsterMode('random'); setSelectedMonsters([]); setTimeLimit(null);
    setRewards({ gold: 150, exp: 75, diamond: 75 });
    setQuestions([]); setStep('form'); setGenError('');
  };

  // PDF 파일 읽기
  const handlePdfUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') { showToast('PDF 파일만 업로드 가능합니다.', 'error'); return; }
    if (file.size > 20 * 1024 * 1024) { showToast('파일 크기는 20MB 이하여야 합니다.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target.result.split(',')[1]; // data: 부분 제거
      setPdfBase64(base64);
      setPdfName(file.name);
    };
    reader.readAsDataURL(file);
  };

  // PPTX 파일 읽기 → 텍스트 추출 → sourceText에 자동 입력
  const handlePptxUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['ppt', 'pptx'].includes(ext)) { showToast('PPT 또는 PPTX 파일만 업로드 가능합니다.', 'error'); return; }
    if (file.size > 200 * 1024 * 1024) { showToast('파일 크기는 200MB 이하여야 합니다.', 'error'); return; }

    setIsPptxLoading(true);
    try {
      const text = await extractPptxText(file);
      if (!text) throw new Error('텍스트를 추출할 수 없습니다.');
      setSourceText(text);
      showToast(`✅ "${file.name}" 텍스트 추출 완료! ${text.split('\n\n').length}개 슬라이드`);
    } catch (err) {
      console.error(err);
      showToast(`PPT 텍스트 추출 실패: ${err.message}`, 'error');
    } finally {
      setIsPptxLoading(false);
      e.target.value = ''; // 같은 파일 재업로드 허용
    }
  };

  // ── 테스트 던전 (인구 분포) 직접 삽입 ───────────────────────
  const insertTestDungeon = () => {
    showConfirm('테스트용 퀴즈 던전 "우리나라의 인구 분포"를 추가할까요?', async () => {
    const TEST = {
      title: '5학년 사회 - 우리나라의 인구 분포',
      grade: 5, semester: 1, subject: '사회', publisher: null, part: null,
      unit: '우리나라의 인구 분포', difficulty: 'normal',
      active: true, playCount: 0,
      rewards: { gold: 100, exp: 80, diamond: 1 },
      questionCount: 5,
      questions: [
        {
          question: '농사를 짓던 과거에 사람들이 주로 모여 살았던 곳은 어디인가요?',
          options: ['①산지', '②평야', '③해안', '④섬'],
          answer: 1,
          explanation: '농사에 유리한 평야 지역에 사람들이 많이 모여 살았습니다.',
        },
        {
          question: '1960년대 이후 사람들이 도시로 이동하게 된 주요 원인은 무엇인가요?',
          options: ['①자연재해', '②전쟁', '③산업화', '④기후변화'],
          answer: 2,
          explanation: '1960년대 산업화가 발달하면서 일자리를 찾아 사람들이 도시로 이동하기 시작했습니다.',
        },
        {
          question: '수도권에 인구가 집중되어 생기는 문제점이 아닌 것은?',
          options: ['①환경오염', '②교통 혼잡', '③주택 부족', '④농업 발전'],
          answer: 3,
          explanation: '수도권 과밀화로 환경오염·교통 혼잡·주택 부족이 발생하며, 농업 발전은 해당되지 않습니다.',
        },
        {
          question: '비수도권 지역에서 인구가 줄어들 때 나타나는 문제는?',
          options: ['①교통 혼잡', '②빈집 증가와 폐업', '③주택 부족', '④환경오염'],
          answer: 1,
          explanation: '인구가 줄면 빈집이 늘어나고 가게들이 폐업하며 일손이 부족해집니다.',
        },
        {
          question: '비수도권 청년들이 수도권으로 이동하는 주된 이유는?',
          options: ['①좋은 날씨', '②일자리와 교육 기회', '③아름다운 자연', '④전통문화 체험'],
          answer: 1,
          explanation: '수도권의 일자리·교육 기회·편의 시설 등을 찾아 청장년층이 이동합니다.',
        },
      ],
      createdAt: serverTimestamp(),
    };
    try {
      await addDoc(collection(db, 'quizDungeons'), TEST);
      showToast('✅ 테스트 던전이 추가됐습니다! "발행된 던전" 탭에서 확인하세요.');
      fetchDungeons();
      setTab('dungeons');
    } catch (err) {
      console.error(err);
      showToast('오류가 발생했습니다: ' + err.message, 'error');
    }
  });
  };

  // ── AI 퀴즈 생성 ─────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!sourceText.trim() && !pdfBase64) { showToast('수업 자료를 입력하거나 PDF를 업로드해주세요.', 'error'); return; }
    if (!grade || !subject) { showToast('학년과 과목을 선택해주세요.', 'error'); return; }

    setIsGenerating(true);
    setGenError('');
    try {
      const res = await fetch('/api/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceText: sourceText || undefined,
          pdfBase64:  pdfBase64  || undefined,
          grade: parseInt(grade), semester: parseInt(semester) || null,
          subject, publisher, unit: [part, unit].filter(Boolean).join(' '),
          count, difficulty, saCount,
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
  const handleQuestionTypeChange = (idx, newType) => {
    setQuestions(prev => prev.map((q, i) => {
      if (i !== idx) return q;
      if (newType === 'sa') return { ...q, type: 'sa', answer: '', options: q.options || ['', '', '', ''] };
      return { ...q, type: 'mc', answer: 0, options: q.options?.length ? q.options : ['', '', '', ''] };
    }));
  };
  const handleAddQuestion = (type = 'mc') => {
    const newQ = type === 'sa'
      ? { type: 'sa', question: '', answer: '', explanation: '' }
      : { type: 'mc', question: '', options: ['', '', '', ''], answer: 0, explanation: '' };
    setQuestions(prev => [...prev, newQ]);
  };

  // ── 발행 ──────────────────────────────────────────────────────
  const handlePublish = () => {
    if (questions.length === 0) { showToast('문제가 없습니다.', 'error'); return; }
    const finalTitle = customTitle.trim() || autoTitle || '퀴즈 던전';
    showConfirm(`"${finalTitle}"을 발행하시겠습니까?\n학생들이 바로 접근할 수 있습니다.`, async () => {
      setIsPublishing(true);
      try {
        await addDoc(collection(db, 'quizDungeons'), {
          title:         finalTitle,
          grade:         parseInt(grade),
          semester:      parseInt(semester) || null,
          subject,
          publisher:     publisher || null,
          part:          part || null,
          unit:          unit || null,
          difficulty,
          monsterId:     monsterMode === 'random' ? 'random' : null,
          monsterIds:    monsterMode === 'manual' ? selectedMonsters : null,
          timeLimit:     timeLimit,
          rewards,
          questions,
          questionCount: questions.length,
          active:        true,
          playCount:     0,
          createdAt:     serverTimestamp(),
        });
        showToast('✅ 퀴즈 던전이 발행되었습니다!');
        resetForm();
        setTab('dungeons');
      } catch (err) {
        console.error(err);
        showToast('발행 중 오류가 발생했습니다.', 'error');
      } finally {
        setIsPublishing(false);
      }
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
    });
  };

  // ── 직접 출제: 문제 추가 ─────────────────────────────────────
  const handleAddManualQuestion = () => {
    if (!newQText.trim()) { showToast('문제 내용을 입력해주세요.', 'error'); return; }
    if (newQType === 'choice') {
      const filledOptions = newOptions.filter(o => o.trim());
      if (filledOptions.length < 2) { showToast('선택지를 2개 이상 입력해주세요.', 'error'); return; }
      setManualQuestions(prev => [...prev, {
        type: 'choice',
        question: newQText.trim(),
        options: newOptions.map(o => o.trim()),
        answer: newAnswer,
        explanation: newExplanation.trim(),
      }]);
    } else {
      if (!newShortAnswer.trim()) { showToast('정답을 입력해주세요.', 'error'); return; }
      setManualQuestions(prev => [...prev, {
        type: 'short',
        question: newQText.trim(),
        options: [],
        answer: newShortAnswer.trim(),
        explanation: newExplanation.trim(),
      }]);
    }
    // 폼 초기화
    setNewQText('');
    setNewOptions(['', '', '', '']);
    setNewAnswer(0);
    setNewShortAnswer('');
    setNewExplanation('');
  };

  const handleDeleteManualQuestion = (idx) => {
    setManualQuestions(prev => prev.filter((_, i) => i !== idx));
  };

  // ── 직접 출제: 발행 ──────────────────────────────────────────
  const handleManualPublish = () => {
    if (!manualTitle.trim()) { showToast('던전 제목을 입력해주세요.', 'error'); return; }
    if (manualQuestions.length === 0) { showToast('문제가 없습니다.', 'error'); return; }
    showConfirm(`"${manualTitle.trim()}"을 발행하시겠습니까?\n학생들이 바로 접근할 수 있습니다.`, async () => {
      setIsManualPublishing(true);
      try {
        await addDoc(collection(db, 'quizDungeons'), {
          title:         manualTitle.trim(),
          grade:         grade ? parseInt(grade) : null,
          semester:      semester ? parseInt(semester) : null,
          subject:       subject || '',
          publisher:     publisher || '',
          part:          part || '',
          unit:          unit || '',
          difficulty,
          monsterId:     manualMonsterMode === 'random' ? 'random' : null,
          monsterIds:    manualMonsterMode === 'manual' ? manualSelectedMonsters : null,
          timeLimit:     null,
          rewards:       DIFF_REWARDS[difficulty] || DIFF_REWARDS.normal,
          questions:     manualQuestions,
          questionCount: manualQuestions.length,
          active:        true,
          playCount:     0,
          teacherUid:    null,
          createdAt:     serverTimestamp(),
        });
        showToast('✅ 퀴즈 던전이 발행되었습니다!');
        setManualTitle('');
        setManualQuestions([]);
        setNewQText('');
        setNewOptions(['', '', '', '']);
        setNewAnswer(0);
        setNewShortAnswer('');
        setNewExplanation('');
        setManualMonsterMode('random');
        setManualSelectedMonsters([]);
        setTab('dungeons');
        fetchDungeons();
      } catch (err) {
        console.error(err);
        showToast('발행 중 오류가 발생했습니다.', 'error');
      } finally {
        setIsManualPublishing(false);
      }
    });
  };

  const DIFF_COLOR = { easy: 'text-emerald-600 bg-emerald-50', normal: 'text-amber-600 bg-amber-50', hard: 'text-rose-600 bg-rose-50' };
  const DIFF_LABEL = { easy: '쉬움', normal: '보통', hard: '어려움' };

  return (
    <>
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-5xl mx-auto">

        {/* 헤더 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800">⚔️ 퀴즈 던전 관리</h1>
            <p className="text-slate-500 text-sm mt-0.5">AI가 수업 자료를 퀴즈로 자동 변환합니다.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {['create', 'manual', 'dungeons'].map((t, i) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors
                  ${tab === t ? 'bg-indigo-600 text-white shadow' : 'bg-white text-slate-600 border border-slate-200'}`}>
                {['🤖 AI 퀴즈 생성', '✏️ 직접 출제', `📚 발행된 던전 (${dungeons.length})`][i]}
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

                  {/* 던전 제목 입력 */}
                  <div className="mt-3">
                    <label className="block text-xs font-bold text-slate-500 mb-1">던전 제목</label>
                    <input
                      value={customTitle}
                      onChange={e => setCustomTitle(e.target.value)}
                      placeholder={autoTitle || '던전 제목을 입력하세요'}
                      className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:border-indigo-500"
                    />
                    {autoTitle && !customTitle && (
                      <div className="mt-1 text-[10px] text-slate-400">
                        비워두면 자동 제목 사용: <span className="text-indigo-500">{autoTitle}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 수업 자료 입력 */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                  <h2 className="font-bold text-slate-700 text-sm mb-4">📝 수업 자료 입력</h2>

                  {/* 파일 업로드 */}
                  <div className="mb-4">
                    <label className="block text-xs font-bold text-slate-500 mb-2">
                      📎 파일 업로드 (PDF / PPT / PPTX)
                    </label>

                    {/* PDF 선택됨 */}
                    {pdfBase64 ? (
                      <div className="flex items-center gap-3 p-3 bg-indigo-50 border-2 border-indigo-300 rounded-xl mb-2">
                        <span className="text-2xl">📄</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-indigo-800 truncate">{pdfName}</div>
                          <div className="text-xs text-indigo-500">PDF 준비 완료 · AI가 직접 읽습니다</div>
                        </div>
                        <button onClick={() => { setPdfBase64(''); setPdfName(''); }}
                          className="text-slate-400 hover:text-rose-500 font-bold text-lg transition-colors shrink-0">✕</button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        {/* PDF 업로드 */}
                        <label className="flex flex-col items-center justify-center h-20 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors">
                          <span className="text-xl mb-0.5">📄</span>
                          <span className="text-xs font-bold text-slate-500">PDF 업로드</span>
                          <span className="text-[9px] text-slate-400">AI가 직접 읽음</span>
                          <input type="file" accept=".pdf" className="hidden" onChange={handlePdfUpload} />
                        </label>

                        {/* PPT 업로드 */}
                        <label className={`flex flex-col items-center justify-center h-20 border-2 border-dashed rounded-xl transition-colors
                          ${isPptxLoading
                            ? 'border-amber-300 bg-amber-50 cursor-wait'
                            : 'border-slate-300 cursor-pointer hover:border-amber-400 hover:bg-amber-50'}`}>
                          {isPptxLoading ? (
                            <>
                              <span className="text-xl mb-0.5 animate-pulse">⏳</span>
                              <span className="text-xs font-bold text-amber-600">텍스트 추출 중...</span>
                            </>
                          ) : (
                            <>
                              <span className="text-xl mb-0.5">📊</span>
                              <span className="text-xs font-bold text-slate-500">PPT / PPTX 업로드</span>
                              <span className="text-[9px] text-slate-400">텍스트 자동 추출</span>
                            </>
                          )}
                          <input type="file" accept=".ppt,.pptx" className="hidden"
                            disabled={isPptxLoading} onChange={handlePptxUpload} />
                        </label>
                      </div>
                    )}

                    {/* 업로드 방식 안내 */}
                    <div className="flex gap-3 text-[10px] text-slate-400">
                      <span>📄 PDF: AI가 직접 분석</span>
                      <span>📊 PPT: 텍스트 추출 → 편집 가능</span>
                    </div>
                  </div>

                  {/* 텍스트 입력 */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">
                      ✏️ 텍스트로 직접 입력 {pdfBase64 && <span className="text-slate-300">(PDF와 함께 참고 내용 추가 가능)</span>}
                    </label>
                    <textarea
                      value={sourceText}
                      onChange={e => setSourceText(e.target.value)}
                      placeholder={pdfBase64
                        ? "PDF 외 추가로 참고할 내용이 있으면 입력하세요 (선택)"
                        : "수업 자료, 교과서 내용, 판서 내용 등을 붙여넣으세요.\nAI가 자동으로 퀴즈 문제를 만들어드립니다."}
                      className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 resize-none h-32"
                    />
                    <div className="text-right text-xs text-slate-400 mt-1">{sourceText.length}자</div>
                  </div>
                </div>

                {/* 설정 */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                  <h2 className="font-bold text-slate-700 text-sm mb-4">⚙️ 퀴즈 설정</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* 문제 수 */}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-2">문제 수</label>
                      <div className="flex rounded-xl border-2 border-slate-200 overflow-hidden mb-2">
                        {[5, 8, 10].map(n => (
                          <button key={n} onClick={() => { setCount(n); if (saCount > n) setSaCount(n); }}
                            className={`flex-1 py-2 text-sm font-bold transition-colors
                              ${count === n ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                            {n}개
                          </button>
                        ))}
                      </div>
                      <input
                        type="number" min="1" max="20" value={count}
                        onChange={e => {
                          const v = Math.min(20, Math.max(1, parseInt(e.target.value) || 1));
                          setCount(v);
                          if (saCount > v) setSaCount(v);
                        }}
                        className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm text-center font-bold focus:outline-none focus:border-indigo-500"
                        placeholder="직접 입력 (최대 20개)"
                      />
                      <div className="text-[10px] text-slate-400 mt-1 text-center">최대 20개</div>
                      {/* 유형 구성 */}
                      <div className="mt-2 pt-2 border-t border-slate-100">
                        <div className="text-[10px] text-slate-500 font-bold mb-1.5">문제 유형 구성</div>
                        <div className="flex items-center gap-1.5 text-xs flex-wrap">
                          <span className="text-slate-500">객관식</span>
                          <span className="font-extrabold text-indigo-600 min-w-[2rem] text-center">{count - saCount}개</span>
                          <span className="text-slate-300">+</span>
                          <span className="text-slate-500">주관식</span>
                          <input
                            type="number" min="0" max={count} value={saCount}
                            onChange={e => setSaCount(Math.min(count, Math.max(0, parseInt(e.target.value) || 0)))}
                            className="w-14 border-2 border-slate-200 rounded-lg px-2 py-0.5 text-xs text-center font-bold focus:outline-none focus:border-amber-400"
                          />
                          <span className="font-extrabold text-amber-600">개</span>
                        </div>
                        {saCount > 0 && (
                          <div className="text-[10px] text-amber-600 mt-1">
                            AI가 객관식 {count - saCount}개 + 주관식 {saCount}개를 생성합니다
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 난이도 */}
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-slate-500 mb-2">난이도</label>
                      <div className="flex gap-2">
                        {DIFF_OPTIONS.map(d => (
                          <button key={d.value} onClick={() => handleDifficultyChange(d.value)}
                            className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-colors
                              ${difficulty === d.value ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500'}`}>
                            {d.label}<br/>
                            <span className="font-normal opacity-70">{d.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 제한 시간 */}
                    <div className="md:col-span-3">
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
                      {timeLimit === 0    && <div className="text-[10px] text-amber-600">시간 제한 없음 — 학생이 원하는 만큼 생각 가능</div>}
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

                {/* 출현 몬스터 */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                  <h2 className="font-bold text-slate-700 text-sm mb-4">👾 출현 몬스터 구성</h2>
                  <MonsterPicker
                    mode={monsterMode}
                    selectedMonsters={selectedMonsters}
                    questionCount={count}
                    onModeChange={setMonsterMode}
                    onMonstersChange={setSelectedMonsters}
                  />
                </div>

                {/* 에러 메시지 */}
                {genError && (
                  <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-sm text-rose-700 whitespace-pre-line">
                    ⚠️ {genError}
                  </div>
                )}

                {/* 생성 버튼 */}
                <button onClick={handleGenerate} disabled={isGenerating || (!sourceText.trim() && !pdfBase64) || !grade || !subject}
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
                    <p className="text-sm text-slate-500">{customTitle.trim() || autoTitle || '퀴즈 던전'} · {questions.length}문제 · 초록 동그라미를 클릭해 정답 변경</p>
                  </div>
                  <button onClick={() => setStep('form')}
                    className="px-4 py-2 text-sm font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">
                    ← 다시 생성
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {questions.map((q, idx) => (
                    <QuestionCard key={idx} q={q} idx={idx}
                      onChange={handleQuestionChange}
                      onDelete={handleQuestionDelete}
                      onTypeChange={handleQuestionTypeChange}
                    />
                  ))}
                </div>

                {/* 문제 추가 버튼 */}
                <div className="flex gap-3">
                  <button onClick={() => handleAddQuestion('mc')}
                    className="flex-1 py-3 border-2 border-dashed border-indigo-300 text-indigo-600 font-bold text-sm rounded-2xl hover:bg-indigo-50 transition-colors active:scale-95">
                    + 객관식 문제 추가
                  </button>
                  <button onClick={() => handleAddQuestion('sa')}
                    className="flex-1 py-3 border-2 border-dashed border-amber-300 text-amber-600 font-bold text-sm rounded-2xl hover:bg-amber-50 transition-colors active:scale-95">
                    + 주관식 문제 추가
                  </button>
                </div>

                <button onClick={handlePublish} disabled={isPublishing || questions.length === 0}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-lg rounded-2xl shadow-md transition-all disabled:opacity-40">
                  {isPublishing ? '발행 중...' : `✅ "${customTitle.trim() || autoTitle || '퀴즈 던전'}" 발행하기`}
                </button>
              </>
            )}
          </div>
        )}

        {/* ── 직접 출제 탭 ── */}
        {tab === 'manual' && (
          <div className="space-y-5">

            {/* 교육과정 선택 (AI탭과 동일 구성) */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h2 className="font-bold text-slate-700 text-sm mb-4">📌 교육과정 선택</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {/* 학년 */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">학년</label>
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
                  <label className="block text-xs font-bold text-slate-500 mb-1">과목</label>
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
                {/* 권 */}
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
                {/* 난이도 */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">난이도</label>
                  <div className="flex rounded-xl border-2 border-slate-200 overflow-hidden">
                    {DIFF_OPTIONS.map(d => (
                      <button key={d.value} onClick={() => handleDifficultyChange(d.value)}
                        className={`flex-1 py-2 text-xs font-bold transition-colors
                          ${difficulty === d.value ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {/* 던전 제목 */}
              <div className="mt-3">
                <label className="block text-xs font-bold text-slate-500 mb-1">던전 제목 *</label>
                <input
                  value={manualTitle}
                  onChange={e => setManualTitle(e.target.value)}
                  placeholder="던전 제목을 입력하세요"
                  className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* 문제 추가 카드 */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h2 className="font-bold text-slate-700 text-sm mb-4">➕ 문제 추가</h2>

              {/* 타입 토글 */}
              <div className="flex rounded-xl border-2 border-slate-200 overflow-hidden mb-4 w-fit">
                <button
                  onClick={() => setNewQType('choice')}
                  className={`px-5 py-2 text-sm font-bold transition-colors
                    ${newQType === 'choice' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                  객관식
                </button>
                <button
                  onClick={() => setNewQType('short')}
                  className={`px-5 py-2 text-sm font-bold transition-colors
                    ${newQType === 'short' ? 'bg-amber-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                  주관식
                </button>
              </div>

              {/* 문제 텍스트 */}
              <div className="mb-3">
                <label className="block text-xs font-bold text-slate-500 mb-1">문제 내용 *</label>
                <textarea
                  value={newQText}
                  onChange={e => setNewQText(e.target.value)}
                  placeholder="문제 내용을 입력하세요"
                  className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:border-indigo-400"
                />
              </div>

              {/* 객관식: 선택지 + 정답 라디오 */}
              {newQType === 'choice' && (
                <div className="mb-3">
                  <label className="block text-xs font-bold text-slate-500 mb-2">선택지 (정답 라디오 클릭)</label>
                  <div className="grid grid-cols-2 gap-2">
                    {newOptions.map((opt, oi) => (
                      <div key={oi} className={`flex items-center gap-2 rounded-xl border px-3 py-2
                        ${newAnswer === oi ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200'}`}>
                        <button
                          onClick={() => setNewAnswer(oi)}
                          className={`w-4 h-4 rounded-full border-2 shrink-0 transition-colors
                            ${newAnswer === oi ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}
                        />
                        <input
                          value={opt}
                          onChange={e => {
                            const updated = [...newOptions];
                            updated[oi] = e.target.value;
                            setNewOptions(updated);
                          }}
                          className="flex-1 text-sm bg-transparent focus:outline-none"
                          placeholder={`보기 ${oi + 1}`}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">초록 라디오 = 정답 선택</div>
                </div>
              )}

              {/* 주관식: 정답 입력 */}
              {newQType === 'short' && (
                <div className="mb-3">
                  <label className="block text-xs font-bold text-slate-500 mb-1">정답 *</label>
                  <input
                    value={newShortAnswer}
                    onChange={e => setNewShortAnswer(e.target.value)}
                    placeholder="정답 텍스트 (짧은 단어/구문)"
                    className="w-full border-2 border-amber-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
                  />
                  <div className="text-[10px] text-slate-400 mt-0.5">학생 답변과 대소문자 구분 없이 비교됩니다</div>
                </div>
              )}

              {/* 해설 */}
              <div className="mb-4">
                <label className="block text-xs font-bold text-slate-500 mb-1">해설 (선택)</label>
                <input
                  value={newExplanation}
                  onChange={e => setNewExplanation(e.target.value)}
                  placeholder="해설을 입력하세요 (생략 가능)"
                  className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
                />
              </div>

              <button
                onClick={handleAddManualQuestion}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-2xl transition-colors active:scale-[0.99]">
                + 문제 추가하기
              </button>
            </div>

            {/* 추가된 문제 목록 */}
            {manualQuestions.length > 0 && (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                <h2 className="font-bold text-slate-700 text-sm mb-4">
                  📋 추가된 문제 ({manualQuestions.length}개)
                </h2>
                <div className="space-y-2">
                  {manualQuestions.map((q, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="text-xs font-extrabold text-slate-400 mt-0.5 shrink-0">Q{idx + 1}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 mt-0.5
                        ${q.type === 'choice' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
                        {q.type === 'choice' ? '객관식' : '주관식'}
                      </span>
                      <span className="flex-1 text-sm text-slate-700 leading-snug line-clamp-2">{q.question}</span>
                      <button
                        onClick={() => handleDeleteManualQuestion(idx)}
                        className="text-xs text-rose-400 hover:text-rose-600 font-bold transition-colors shrink-0">
                        삭제
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 출현 몬스터 — 직접출제 탭 */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h2 className="font-bold text-slate-700 text-sm mb-4">👾 출현 몬스터 구성</h2>
              <MonsterPicker
                mode={manualMonsterMode}
                selectedMonsters={manualSelectedMonsters}
                questionCount={manualQuestions.length}
                onModeChange={setManualMonsterMode}
                onMonstersChange={setManualSelectedMonsters}
              />
            </div>

            {/* 발행 버튼 */}
            <button
              onClick={handleManualPublish}
              disabled={isManualPublishing || manualQuestions.length === 0 || !manualTitle.trim()}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-lg rounded-2xl shadow-md transition-all active:scale-[0.99] disabled:opacity-40">
              {isManualPublishing ? '발행 중...' : `✅ "${manualTitle.trim() || '퀴즈 던전'}" 발행하기`}
            </button>
          </div>
        )}

        {/* ── 발행된 던전 탭 ── */}
        {tab === 'dungeons' && (
          <div>
            {/* 요약 카드 */}
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
                <p className="text-sm mt-1">AI 퀴즈 생성 탭에서 첫 번째 던전을 만들어보세요!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {dungeons.map(d => (
                  <div key={d.id}
                    className={`bg-white rounded-2xl shadow-sm border-2 overflow-hidden transition-all
                      ${d.active ? 'border-slate-200 hover:shadow-md' : 'border-slate-100 opacity-60'}`}>
                    {/* 상단 색 띠 */}
                    <div className={`px-4 py-2 text-white text-[10px] font-bold flex justify-between
                      ${d.difficulty === 'easy' ? 'bg-emerald-500' : d.difficulty === 'hard' ? 'bg-rose-500' : 'bg-sky-500'}`}>
                      <span>{DIFF_LABEL[d.difficulty]}</span>
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

export default QuizDungeonManage;
