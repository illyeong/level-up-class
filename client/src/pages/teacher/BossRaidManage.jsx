import React, { useState, useEffect, useRef } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, writeBatch,
  onSnapshot, serverTimestamp, increment, getDoc, query, where,
} from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { MONSTERS_DB, resolveBossBg as resolveBossBackground } from '../../data/monsterData';
import SpriteMonster from '../../components/SpriteMonster';
import { applyExpDelta } from '../../utils/leveling';
import AILessonQuizSetBuilder from '../../components/AILessonQuizSetBuilder';

// ── 퀴즈셋 선택 피커 (스크롤형 인라인) ────────────────────────────
const DIFF_LABEL_SM = { easy: '쉬움', normal: '보통', hard: '어려움' };
const DIFF_COLOR_SM = { easy: 'bg-emerald-100 text-emerald-700', normal: 'bg-sky-100 text-sky-700', hard: 'bg-rose-100 text-rose-700' };

const LEGACY_BOSS_ID_ALIASES = {
  highdemon: 'demon03',
  demon3: 'demon03',
  demon03: 'demon03',
  demon2: 'demon02',
  demon02: 'demon02',
  giantlizard: 'lizard03',
  lizard3: 'lizard03',
  lizard03: 'lizard03',
  crocodile: 'croc03',
  croc3: 'croc03',
  croc03: 'croc03',
  minotaur2: 'minotaur02',
  minotaur02: 'minotaur02',
  minotaur3: 'minotaur03',
  minotaur03: 'minotaur03',
};

const normalizeBossKey = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, '')
    .replace(/[^a-z0-9가-힣]/g, '');

const resolveBossIdByName = (rawName) => {
  const target = normalizeBossKey(rawName);
  if (!target) return null;
  return Object.keys(MONSTERS_DB).find((id) => normalizeBossKey(MONSTERS_DB[id]?.name || '') === target) || null;
};

const resolveBossDataFromRaid = (raid) => {
  const candidates = [raid?.bossId, raid?.bossName];

  for (const raw of candidates) {
    const key = String(raw || '').trim();
    if (MONSTERS_DB[key]) return MONSTERS_DB[key];
  }

  for (const raw of candidates) {
    const norm = normalizeBossKey(raw);
    if (!norm) continue;
    const aliasedId = LEGACY_BOSS_ID_ALIASES[norm];
    if (aliasedId && MONSTERS_DB[aliasedId]) return MONSTERS_DB[aliasedId];
  }

  for (const raw of candidates) {
    const byName = resolveBossIdByName(raw);
    if (byName && MONSTERS_DB[byName]) return MONSTERS_DB[byName];
  }

  return null;
};

const resolveBossBgById = (bossId) => {
  return resolveBossBackground(bossId);
};

function QuizSetPicker({ selectedSetId, onSelect }) {
  const [sets, setSets]         = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter]     = useState({ grade: '', subject: '' });

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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select value={filter.grade} onChange={e => setFilter(f => ({ ...f, grade: e.target.value }))}
          className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:border-rose-500 bg-white">
          <option value="">전체 학년</option>
          {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}학년</option>)}
        </select>
        <input value={filter.subject} onChange={e => setFilter(f => ({ ...f, subject: e.target.value }))}
          placeholder="과목명 검색"
          className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-rose-500 w-28 bg-white" />
        {(filter.grade || filter.subject) && (
          <button onClick={() => setFilter({ grade: '', subject: '' })}
            className="text-xs text-slate-400 hover:text-slate-600 font-bold px-2">초기화</button>
        )}
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-6 gap-2">
          <div className="w-4 h-4 border-2 border-slate-200 border-t-rose-500 rounded-full animate-spin" />
          <span className="text-xs text-slate-400">불러오는 중...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-6 text-slate-400">
          <p className="text-xs font-bold">
            {sets.length === 0 ? '내 퀴즈가 없습니다. 퀴즈 은행에서 먼저 퀴즈를 만들어주세요.' : '조건에 맞는 퀴즈가 없습니다.'}
          </p>
        </div>
      ) : (
        <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
          {filtered.map(s => {
            const choiceCount = (s.questions || []).filter(q => q.type !== 'short' && q.type !== 'sa').length;
            return (
              <button key={s.id} onClick={() => onSelect(s.id === selectedSetId ? null : s)}
                className={`w-full text-left p-3 rounded-xl border-2 transition-all
                  ${selectedSetId === s.id ? 'border-rose-500 bg-rose-50' : 'border-slate-200 hover:border-rose-300 hover:bg-slate-50 bg-white'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-slate-800 truncate">{s.title}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {s.grade && <span className="text-[10px] bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 rounded">{s.grade}학년</span>}
                      {s.subject && <span className="text-[10px] bg-indigo-50 text-indigo-600 font-bold px-1.5 py-0.5 rounded">{s.subject}</span>}
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${DIFF_COLOR_SM[s.difficulty] || 'bg-slate-100 text-slate-500'}`}>
                        {DIFF_LABEL_SM[s.difficulty] || '보통'}
                      </span>
                      <span className="text-[10px] text-slate-400 px-1">객관식 {choiceCount}문항</span>
                    </div>
                  </div>
                  <div className={`shrink-0 ml-3 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors
                    ${selectedSetId === s.id ? 'border-rose-500 bg-rose-500' : 'border-slate-300'}`}>
                    {selectedSetId === s.id && <span className="text-white text-xs font-bold">✓</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// large + boss 티어만 보스 레이드에 사용
const BOSS_MONSTERS = Object.values(MONSTERS_DB)
  .filter(m => m.tier === 'boss')
  .sort((a, b) => a.sizeOrder - b.sizeOrder || a.name.localeCompare(b.name));

const TIER_COLOR = { large: 'text-orange-600 bg-orange-50', boss: 'text-rose-600 bg-rose-50' };
const TIER_LABEL = { large: '대형', boss: '보스' };

const fmtDate = (ts) => {
  if (!ts) return '-';
  const d = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const hpColor = (pct) =>
  pct > 60 ? 'bg-emerald-500' : pct > 30 ? 'bg-amber-500' : 'bg-rose-500';

// 컨테이너 크기에 맞게 스케일 계산
const fitScale = (data, maxW, maxH) =>
  Math.min(maxH / data.frameHeight, maxW / data.frameWidth) * 0.88;

// ── 보스 몬스터 피커 ─────────────────────────────────────────────
function BossMonsterPicker({ selectedId, onSelect, onClose }) {
  const [filter, setFilter]   = useState('all');
  const [previewId, setPreviewId] = useState(null);
  const list = filter === 'all' ? BOSS_MONSTERS : BOSS_MONSTERS.filter(m => m.tier === filter);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-extrabold text-slate-800 text-lg">👾 보스 몬스터 선택</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl font-bold">×</button>
        </div>

        {/* 필터 */}
        <div className="flex gap-2 px-5 py-3 border-b border-slate-100">
          {[['all', '전체'], ['boss', '보스']].map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-colors
                ${filter === v ? 'bg-rose-600 text-white border-rose-600' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
              {l}
            </button>
          ))}
          <span className="ml-auto text-[10px] text-slate-400 self-center">미리보기는 선택한 보스만 불러옵니다.</span>
        </div>

        {/* 고용량 스프라이트는 미리보기에서 한 개만 불러와 선택창 렉을 방지합니다. */}
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {list.map((m) => (
            <div key={m.id}
              className={`flex flex-col gap-2 p-3 rounded-2xl border-2 transition-all
                ${selectedId === m.id
                  ? 'border-rose-500 bg-rose-50 shadow-md'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
              <button className="w-full flex items-center gap-2 text-left" onClick={() => { onSelect(m.id); onClose(); }}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-lg">👹</span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-700 truncate">{m.name}</div>
                  <div className="text-[9px] text-slate-400 mt-0.5">선택하기</div>
                </div>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${TIER_COLOR[m.tier]}`}>
                  {TIER_LABEL[m.tier]}
                </span>
              </button>
              <button onClick={() => setPreviewId(m.id)}
                className="text-[10px] text-slate-500 hover:text-rose-500 font-bold px-2 py-1 rounded-lg bg-slate-100 hover:bg-rose-50 transition-colors w-full text-center">
                미리보기
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 미리보기 팝업 */}
      {previewId && (() => {
        const pm = MONSTERS_DB[previewId];
        if (!pm) return null;
        const ps = fitScale(pm, 300, 300);
        return (
          <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center"
            onClick={() => setPreviewId(null)}>
            <div className="bg-slate-900 rounded-3xl p-8 flex flex-col items-center gap-5 shadow-2xl min-w-[320px]"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-center" style={{ width: 320, height: 320 }}>
                <SpriteMonster data={pm} anim="idle" scale={ps} frozen />
              </div>
              <div className="text-white font-extrabold text-xl">{pm.name}</div>
              <p className="text-xs text-slate-400">선택창 성능을 위해 정지 화면으로 표시합니다.</p>
              <button onClick={() => setPreviewId(null)}
                className="text-slate-400 hover:text-white text-sm font-bold">닫기</button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── HP 바 ────────────────────────────────────────────────────────
function HpBar({ current, max, height = 'h-4' }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round(current / max * 100))) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs font-bold text-white mb-1">
        <span>HP</span>
        <span>{Math.max(0, current).toLocaleString()} / {max.toLocaleString()} ({pct}%)</span>
      </div>
      <div className={`w-full ${height} bg-slate-700 rounded-full overflow-hidden`}>
        <div className={`h-full rounded-full transition-all duration-700 ${hpColor(pct)}`}
          style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function QuestionDetailModal({ question, questionNumber, onClose }) {
  if (!question) return null;
  const options = question.options || question.choices || [];
  const rawAnswer = question.answer ?? question.answerIndex ?? question.correctAnswer;
  const answerIndex = Number.isFinite(Number(rawAnswer)) ? Number(rawAnswer) : -1;

  return (
    <div className="fixed inset-0 z-[400] bg-black/60 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-[11px] font-extrabold text-indigo-500">문항 상세</p>
            <h3 className="text-lg font-extrabold text-slate-800">Q{questionNumber}</h3>
          </div>
          <button onClick={onClose} className="text-2xl font-bold text-slate-400 hover:text-slate-700">×</button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">
          <p className="whitespace-pre-wrap text-sm font-bold leading-relaxed text-slate-800">
            {question.question || question.text || '문제 내용이 없습니다.'}
          </p>
          {options.length > 0 && (
            <div className="mt-4 space-y-2">
              {options.map((option, index) => (
                <div key={index}
                  className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${
                    index === answerIndex
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-slate-50 text-slate-600'
                  }`}>
                  <span className="mr-2 text-xs font-extrabold">{index + 1}.</span>
                  {option}
                  {index === answerIndex && <span className="ml-2 text-xs font-extrabold">정답</span>}
                </div>
              ))}
            </div>
          )}
          {question.explanation && (
            <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50 p-3">
              <p className="text-[11px] font-extrabold text-indigo-500">해설</p>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-indigo-800">{question.explanation}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 결과 보기 모달 ───────────────────────────────────────────────
function RaidResultModal({ raid, onClose }) {
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(null);
  const questions = (raid.questions || []).filter(q => q.type !== 'short');
  const pList = Object.entries(raid.participants || {})
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => (b.totalDamage || 0) - (a.totalDamage || 0));

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="font-extrabold text-slate-800 text-lg">📊 레이드 결과 — {raid.bossName}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{pList.length}명 참가 · {questions.length}문제</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl font-bold">×</button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {pList.length === 0 ? (
            <p className="text-center text-slate-400 py-10">참가자 데이터가 없습니다.</p>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left px-3 py-2 font-bold text-slate-600 sticky left-0 bg-slate-50 border-b border-slate-200">학생</th>
                  <th className="px-2 py-2 font-bold text-emerald-600 border-b border-slate-200">정답</th>
                  <th className="px-2 py-2 font-bold text-rose-500 border-b border-slate-200">오답</th>
                  <th className="px-2 py-2 font-bold text-rose-600 border-b border-slate-200">데미지</th>
                  {questions.map((q, qi) => (
                    <th key={qi} className="px-2 py-2 font-bold text-slate-500 border-b border-slate-200 min-w-[32px]">
                      <button onClick={() => setSelectedQuestionIndex(qi)}
                        className="rounded-lg px-1.5 py-1 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-800"
                        title={`Q${qi + 1} 문제 보기`}>
                        Q{qi + 1}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pList.map((p, pi) => (
                  <tr key={p.id} className={pi % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                    <td className="px-3 py-2 font-bold text-slate-800 sticky left-0 bg-inherit border-b border-slate-100">
                      {p.name || '학생'}
                    </td>
                    <td className="px-2 py-2 text-center text-emerald-600 font-extrabold border-b border-slate-100">
                      {p.correctCount || 0}
                    </td>
                    <td className="px-2 py-2 text-center text-rose-500 font-extrabold border-b border-slate-100">
                      {p.wrongCount || 0}
                    </td>
                    <td className="px-2 py-2 text-center text-rose-600 font-bold border-b border-slate-100">
                      {(p.totalDamage || 0).toLocaleString()}
                    </td>
                    {questions.map((q, qi) => {
                      const res = p.qResults?.[qi];
                      return (
                        <td key={qi} className="px-1 py-2 text-center border-b border-slate-100">
                          {res === undefined ? (
                            <span className="text-slate-300">-</span>
                          ) : res ? (
                            <span className="text-emerald-500 font-bold">✓</span>
                          ) : (
                            <span className="text-rose-500 font-bold">✗</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {selectedQuestionIndex !== null && (
        <QuestionDetailModal
          question={questions[selectedQuestionIndex]}
          questionNumber={selectedQuestionIndex + 1}
          onClose={() => setSelectedQuestionIndex(null)}
        />
      )}
    </div>
  );
}

// ── 진행 중 레이드 패널 ──────────────────────────────────────────
function ActiveRaidPanel({ raid, onStart, onNextQuestion, onEnd, onPayRewards, isPaying, onViewLobby, onViewResult }) {
  const bossData = resolveBossDataFromRaid(raid);
  const pMap     = raid.participants || {};
  const pList    = Object.entries(pMap)
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => (b.totalDamage || 0) - (a.totalDamage || 0));

  const questions       = (raid.questions || []).filter(q => q.type !== 'short');
  const currentQ        = questions[raid.currentQuestionIdx] ?? null;
  const isWaiting       = raid.status === 'waiting';
  const isActive        = raid.status === 'active';
  const isEnded         = raid.status === 'cleared' || raid.status === 'failed';
  const qIdx            = raid.currentQuestionIdx ?? -1;
  const totalQ          = questions.length;

  // 현재 문제 답변 현황
  const answeredCount   = pList.filter(p => p.lastAnsweredIdx === qIdx).length;
  const correctCount    = pList.filter(p => p.lastAnsweredIdx === qIdx && p.lastAnsweredCorrect).length;

  return (
    <div className="space-y-4">
      {/* 보스 상태 카드 */}
      <div className="bg-slate-900 rounded-2xl p-5 text-white shadow-xl">
        <div className="flex items-start gap-4 mb-4">
          {/* 보스 스프라이트 */}
          <div className="flex items-center justify-center shrink-0 overflow-hidden" style={{ width: 120, height: 120 }}>
            {bossData
              ? <SpriteMonster data={bossData} anim={isEnded ? 'death' : 'idle'} scale={fitScale(bossData, 120, 120)} />
              : <div className="text-5xl">👾</div>
            }
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full
                ${isWaiting ? 'bg-sky-500/30 text-sky-300'
                : isActive  ? 'bg-rose-500/30 text-rose-300 animate-pulse'
                : raid.status === 'cleared' ? 'bg-emerald-500/30 text-emerald-300'
                : 'bg-slate-500/30 text-slate-300'}`}>
                {isWaiting ? '⏳ 대기 중' : isActive ? '⚔️ 진행 중' : raid.status === 'cleared' ? '✅ 클리어' : '💀 실패'}
              </span>
            </div>
            <div className="font-extrabold text-lg truncate">{raid.bossName}</div>
            <div className="text-xs text-slate-400 mt-0.5 truncate">{raid.title}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-extrabold text-rose-300">{pList.length}명</div>
            <div className="text-[10px] text-slate-400">참가</div>
          </div>
        </div>

        <HpBar current={raid.currentHP} max={raid.maxHP} />

        {isActive && currentQ && (
          <div className="mt-3 bg-slate-800 rounded-xl p-3">
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span className="font-bold text-white">Q{qIdx + 1}/{totalQ}</span>
              <span className="text-emerald-400 font-bold">{correctCount}명 정답 / {answeredCount}명 응답</span>
            </div>
            <div className="text-sm text-slate-200 leading-snug line-clamp-2">{currentQ.question}</div>
          </div>
        )}
      </div>

      {/* 액션 버튼 */}
      <div className="flex flex-wrap gap-3">
        {isWaiting && (
          <button onClick={onStart}
            className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-xl transition-colors shadow">
            ⚔️ 레이드 시작 ({pList.length}명 대기 중)
          </button>
        )}
        {(isWaiting || isActive) && onViewLobby && (
          <button onClick={onViewLobby}
            className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors text-sm">
            🎮 레이드 화면 보기
          </button>
        )}
        {isActive && !raid.autoAdvance && qIdx < totalQ - 1 && (
          <button onClick={onNextQuestion}
            className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl transition-colors">
            ▶ 다음 문제 ({qIdx + 1}/{totalQ})
          </button>
        )}
        {isEnded && !raid.rewardsPaid && (
          <button onClick={onPayRewards} disabled={isPaying}
            className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-white font-extrabold rounded-xl transition-colors disabled:opacity-50">
            {isPaying ? '지급 중...' : `🎁 보상 지급 (${pList.length}명)`}
          </button>
        )}
        {raid.rewardsPaid && (
          <div className="flex-1 py-3 bg-slate-100 text-slate-400 font-bold rounded-xl text-center text-sm">
            ✅ 보상 지급 완료
          </div>
        )}
        {isEnded && onViewResult && (
          <button onClick={onViewResult}
            className="px-5 py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl transition-colors text-sm">
            📊 결과 보기
          </button>
        )}
        {!isEnded && (
          <button onClick={onEnd}
            className="px-5 py-3 bg-slate-200 hover:bg-rose-100 text-slate-600 hover:text-rose-600 font-bold rounded-xl transition-colors text-sm">
            강제 종료
          </button>
        )}
      </div>

      {/* 참가자 기여도 */}
      {pList.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500">
            참가자 현황 ({pList.length}명)
          </div>
          <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
            {pList.map((p, idx) => {
              const answered = p.lastAnsweredIdx === qIdx;
              const correct  = answered && p.lastAnsweredCorrect;
              return (
                <div key={p.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="text-xs font-extrabold text-slate-300 w-5">{idx + 1}</span>
                  {/* 캐릭터 */}
                  {p.characterImage
                    ? <img src={p.characterImage} alt="" className="w-8 h-8 rounded-lg object-contain bg-slate-100" />
                    : <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-lg">🧑</div>
                  }
                  <span className="flex-1 font-bold text-slate-800 text-sm truncate">{p.name || '학생'}</span>
                  {isActive && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full
                      ${answered ? (correct ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600') : 'bg-slate-100 text-slate-400'}`}>
                      {answered ? (correct ? '✓ 정답' : '✗ 오답') : '○ 대기'}
                    </span>
                  )}
                  <div className="text-right shrink-0">
                    <div className="text-xs font-extrabold text-rose-500">💥 {(p.totalDamage || 0).toLocaleString()}</div>
                    <div className="text-[10px] text-slate-400">{p.correctCount || 0}정답</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────
export default function BossRaidManage({ selectedClass, onViewLobby }) {
  const [raids, setRaids]           = useState([]);
  const [selectedQuizSet, setSelectedQuizSet] = useState(null);
  const [classStudentCount, setClassStudentCount] = useState(0);
  const [tab, setTab]               = useState('active');
  const [isCreating, setIsCreating] = useState(false);
  const [isPaying, setIsPaying]     = useState(false);
  const [showBossPicker, setShowBossPicker] = useState(false);
  const [toast, setToast]           = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [resultRaid, setResultRaid] = useState(null);
  const [historyQuestion, setHistoryQuestion] = useState(null);
  const [expandedRaidId, setExpandedRaidId] = useState(null);
  const autoHpRef = useRef(null);
  const autoPayRaidRef = useRef(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };
  const showConfirm = (message, onConfirm) => setConfirmState({ message, onConfirm });

  // 생성 폼 상태
  const [form, setForm] = useState({
    bossId:           BOSS_MONSTERS[Math.floor(Math.random() * BOSS_MONSTERS.length)]?.id || 'butcher',
    bossName:         '',
    maxHP:            3000,
    damagePerHit:     100,
    penaltyType:      'none',
    penaltyAmount:    50,
    questionDuration: 20,
    autoAdvance:      true,
    rewards:          { gold: 200, exp: 100, diamond: 100 },
  });

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // 레이드 실시간 리스닝
  useEffect(() => {
    const classId = selectedClass?.id || null;
    const teacherUid = selectedClass?.teacherUid || auth.currentUser?.uid || null;
    const raidQuery = classId
      ? query(collection(db, 'worldBossRaids'), where('classId', '==', classId))
      : teacherUid
      ? query(collection(db, 'worldBossRaids'), where('teacherUid', '==', teacherUid))
      : null;

    if (!raidQuery) {
      setRaids([]);
      return () => {};
    }

    const unsub = onSnapshot(raidQuery, snap =>
      setRaids(snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)))
    );
    return () => unsub();
  }, [selectedClass?.id, selectedClass?.teacherUid]);

  // 현재 학급(또는 교사 범위) 학생 수 로딩
  useEffect(() => {
    let mounted = true;
    const loadStudentCount = async () => {
      try {
        const classId = selectedClass?.id || null;
        const teacherUid = selectedClass?.teacherUid || auth.currentUser?.uid || null;
        const q = classId
          ? query(collection(db, 'students'), where('classId', '==', classId))
          : teacherUid
          ? query(collection(db, 'students'), where('teacherUid', '==', teacherUid))
          : collection(db, 'students');
        const snap = await getDocs(q);
        if (mounted) setClassStudentCount(snap.size);
      } catch (err) {
        console.error('학생 수 로딩 실패:', err);
        if (mounted) setClassStudentCount(0);
      }
    };
    loadStudentCount();
    return () => { mounted = false; };
  }, [selectedClass?.id, selectedClass?.teacherUid]);

  // 선택된 보스 데이터
  const bossData        = MONSTERS_DB[form.bossId];
  const waitingOrActive = raids.filter(r => r.status === 'waiting' || r.status === 'active');
  const hasOpenRaid     = waitingOrActive.length > 0;

  // 보스 이름 자동채우기
  useEffect(() => {
    if (!form.bossName && bossData) setF('bossName', bossData.name);
  }, [form.bossId]);

  // HP 자동추천:
  // (학급 학생수 × 객관식 문제수 × 정답당 데미지)의 75%
  // 예) 14명 × 8문항 × 100 = 11,200 -> 추천 HP 8,400
  const questionCount = (selectedQuizSet?.questions || []).filter(q => q.type !== 'short' && q.type !== 'sa').length;
  const totalPerfectDamage = classStudentCount * questionCount * (Number(form.damagePerHit) || 0);
  const autoHP = (questionCount > 0 && classStudentCount > 0)
    ? Math.max(100, Math.round((totalPerfectDamage * 0.75) / 100) * 100)
    : null;

  // 추천 HP가 계산되면 기본값/직전 자동값일 때 자동 동기화
  useEffect(() => {
    if (!autoHP) return;
    setForm(prev => {
      const shouldSync = prev.maxHP === 3000 || prev.maxHP === autoHpRef.current;
      return shouldSync ? { ...prev, maxHP: autoHP } : prev;
    });
    autoHpRef.current = autoHP;
  }, [autoHP]);

  // ── 레이드 생성 (waiting 상태) ──────────────────────────────
  const createRaid = () => {
    if (!selectedQuizSet) return showToast('퀴즈를 선택해주세요.', 'error');
    if (!form.bossId)     return showToast('보스 몬스터를 선택해주세요.', 'error');
    if (hasOpenRaid)      return showToast('이미 진행 중인 레이드가 있습니다.', 'error');

    const questions = (selectedQuizSet.questions || []).filter(q => q.type !== 'short' && q.type !== 'sa');
    if (questions.length === 0) return showToast('선택한 퀴즈에 객관식 문제가 없습니다.', 'error');

    showConfirm(`"${form.bossName}" 보스 레이드를 오픈할까요?\n학생들이 대기실에서 입장합니다.`, async () => {
      setIsCreating(true);
      try {
        await addDoc(collection(db, 'worldBossRaids'), {
          title:            `${selectedQuizSet.title} 보스 레이드`,
          classId:          selectedClass?.id || null,
          teacherUid:       selectedClass?.teacherUid || auth.currentUser?.uid || null,
          bossId:           form.bossId,
          bossName:         form.bossName || bossData?.name || '보스',
          bossBg:           resolveBossBgById(form.bossId),
          quizSetId:        selectedQuizSet.id,
          maxHP:            form.maxHP,
          currentHP:        form.maxHP,
          damagePerHit:     form.damagePerHit,
          penaltyType:      form.penaltyType,
          penaltyAmount:    form.penaltyAmount,
          currentQuestionIdx: -1,
          questionDuration: form.questionDuration,
          questionStartedAt: null,
          autoAdvance:      form.autoAdvance,
          rewards:          form.rewards,
          rewardsPaid:      false,
          status:           'waiting',
          questions,
          participants:     {},
          createdAt:        serverTimestamp(),
          startedAt:        null,
          clearedAt:        null,
        });
        showToast('대기실이 열렸습니다! 학생들이 입장하면 시작 버튼을 눌러주세요.');
        setTab('active');
      } catch (err) {
        console.error(err);
        showToast('레이드 생성 중 오류가 발생했습니다.', 'error');
      } finally {
        setIsCreating(false);
      }
    });
  };

  // ── 레이드 시작 ─────────────────────────────────────────────
  const startRaid = (raidId, afterStartCb) => {
    showConfirm('레이드를 시작할까요? 학생들에게 바로 문제가 출제됩니다.', async () => {
      await updateDoc(doc(db, 'worldBossRaids', raidId), {
        status:             'active',
        currentQuestionIdx: 0,
        questionStartedAt:  serverTimestamp(),
        startedAt:          serverTimestamp(),
      });
      afterStartCb?.();
    });
  };

  // ── 다음 문제 ────────────────────────────────────────────────
  const nextQuestion = (raid) => {
    const questions = (raid.questions || []).filter(q => q.type !== 'short');
    const nextIdx   = (raid.currentQuestionIdx ?? 0) + 1;
    if (nextIdx >= questions.length) {
      showConfirm('마지막 문제입니다. 레이드를 종료할까요?', async () => {
        await updateDoc(doc(db, 'worldBossRaids', raid.id), {
          status:    raid.currentHP <= 0 ? 'cleared' : 'failed',
          clearedAt: serverTimestamp(),
        });
      });
    } else {
      updateDoc(doc(db, 'worldBossRaids', raid.id), {
        currentQuestionIdx: nextIdx,
        questionStartedAt:  serverTimestamp(),
      });
    }
  };

  // ── 강제 종료 ────────────────────────────────────────────────
  const endRaid = (raidId) => {
    showConfirm('레이드를 강제 종료하시겠습니까?', async () => {
      await updateDoc(doc(db, 'worldBossRaids', raidId), {
        status: 'failed', clearedAt: serverTimestamp(),
      });
    });
  };

  // ── 레이드 기록 삭제 ─────────────────────────────────────────
  const deleteRaid = (raidId) => {
    showConfirm('이 레이드 기록을 삭제할까요?', async () => {
      await deleteDoc(doc(db, 'worldBossRaids', raidId));
      showToast('삭제됐습니다.');
    });
  };

  const deleteAllRaids = () => {
    showConfirm(`종료된 레이드 기록 ${pastRaids.length}건을 모두 삭제할까요?\n이 작업은 되돌릴 수 없습니다.`, async () => {
      const batch = writeBatch(db);
      pastRaids.forEach(r => batch.delete(doc(db, 'worldBossRaids', r.id)));
      await batch.commit();
      showToast(`${pastRaids.length}건 모두 삭제됐습니다.`);
    });
  };

  // ── 보상 지급 ────────────────────────────────────────────────
  const payRewards = (raid) => {
    const pIds = Object.keys(raid.participants || {});
    if (pIds.length === 0) return showToast('참가자가 없습니다.', 'error');
    if (raid.rewardsPaid)  return showToast('이미 보상이 지급됐습니다.', 'error');
    showConfirm(
      `${pIds.length}명에게 보상을 지급할까요?\n🪙${raid.rewards?.gold}G · ⭐${raid.rewards?.exp}EXP · 💎${raid.rewards?.diamond}`,
      async () => {
        setIsPaying(true);
        try {
          const snap = await getDocs(collection(db, 'students'));
          const all  = {};
          snap.docs.forEach(d => { all[d.id] = d.data(); });

          const batch = writeBatch(db);
          let count = 0;
          pIds.forEach(sid => {
            if (!all[sid]) return;
            const s = all[sid];
            const nextProgress = applyExpDelta(s.level ?? 1, s.exp ?? 0, raid.rewards?.exp || 0);
            batch.update(doc(db, 'students', sid), {
              gold:     (s.gold     || 0) + (raid.rewards?.gold    || 0),
              diamonds: (s.diamonds || 0) + (raid.rewards?.diamond || 0),
              level:    nextProgress.level,
              exp:      nextProgress.exp,
              maxExp:   nextProgress.maxExp,
            });
            count++;
          });
          batch.update(doc(db, 'worldBossRaids', raid.id), { rewardsPaid: true });
          await batch.commit();
          showToast(`${count}명에게 보상 지급 완료!`);
        } catch (err) {
          console.error(err);
          showToast('보상 지급 중 오류가 발생했습니다.', 'error');
        } finally {
          setIsPaying(false);
        }
      }
    );
  };

  useEffect(() => {
    const target = raids.find(r => r.status === 'cleared' && !r.rewardsPaid);
    if (!target || isPaying) return;
    if (autoPayRaidRef.current === target.id) return;
    autoPayRaidRef.current = target.id;

    (async () => {
      try {
        const pIds = Object.keys(target.participants || {});
        if (pIds.length === 0) {
          await updateDoc(doc(db, 'worldBossRaids', target.id), { rewardsPaid: true, rewardsPaidAt: serverTimestamp() });
          return;
        }

        setIsPaying(true);
        const snap = await getDocs(collection(db, 'students'));
        const all  = {};
        snap.docs.forEach(d => { all[d.id] = d.data(); });

        const batch = writeBatch(db);
        pIds.forEach(sid => {
          if (!all[sid]) return;
          const s = all[sid];
          const nextProgress = applyExpDelta(s.level ?? 1, s.exp ?? 0, target.rewards?.exp || 0);
          batch.update(doc(db, 'students', sid), {
            gold:     (s.gold     || 0) + (target.rewards?.gold    || 0),
            diamonds: (s.diamonds || 0) + (target.rewards?.diamond || 0),
            level:    nextProgress.level,
            exp:      nextProgress.exp,
            maxExp:   nextProgress.maxExp,
          });
        });
        batch.update(doc(db, 'worldBossRaids', target.id), { rewardsPaid: true, rewardsPaidAt: serverTimestamp() });
        await batch.commit();
      } catch (err) {
        console.error('Boss raid auto reward failed:', err);
      } finally {
        setIsPaying(false);
        autoPayRaidRef.current = null;
      }
    })();
  }, [raids, isPaying]);

  const activeRaids  = raids.filter(r => r.status === 'waiting' || r.status === 'active');
  const pastRaids    = raids.filter(r => r.status === 'cleared' || r.status === 'failed');

  return (
    <>
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* 헤더 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-wrap justify-between items-center gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800">🐉 보스 레이드 관리</h1>
            <p className="text-slate-500 text-sm mt-0.5">학급 전체 협동 이벤트 — 퀴즈를 맞혀 보스를 쓰러뜨려요</p>
          </div>
          <div className="flex gap-2">
            {[['active', '진행/대기'], ['create', '레이드 생성'], ['history', '결과 확인']].map(([t, l]) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-2 rounded-xl font-bold text-sm transition-colors
                  ${tab === t ? 'bg-rose-600 text-white shadow' : 'bg-white text-slate-600 border border-slate-200'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* ── 진행/대기 탭 ── */}
        {tab === 'active' && (
          activeRaids.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <div className="text-5xl mb-3">🐉</div>
              <p className="font-bold text-lg text-slate-600">열려 있는 레이드가 없습니다</p>
              <p className="text-sm mt-1">"레이드 생성" 탭에서 새 레이드를 만드세요</p>
            </div>
          ) : (
            <div className="space-y-6">
              {activeRaids.map(raid => (
                <ActiveRaidPanel key={raid.id} raid={raid}
                  onStart={() => startRaid(raid.id, onViewLobby)}
                  onNextQuestion={() => nextQuestion(raid)}
                  onEnd={() => endRaid(raid.id)}
                  onPayRewards={() => payRewards(raid)}
                  isPaying={isPaying}
                  onViewLobby={onViewLobby}
                  onViewResult={() => setResultRaid(raid)}
                />
              ))}
            </div>
          )
        )}

        {/* ── 레이드 생성 탭 ── */}
        {tab === 'create' && (
          <div className="space-y-5">
            {hasOpenRaid && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-sm text-amber-700 font-medium">
                ⚠️ 이미 열려 있는 레이드가 있습니다. 기존 레이드를 종료한 후 새로 만들 수 있습니다.
              </div>
            )}

            {/* 보스 선택 */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h2 className="font-bold text-slate-700 text-sm mb-4">👾 보스 선택</h2>
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center shrink-0 bg-slate-900 rounded-2xl overflow-hidden"
                  style={{ width: 150, height: 150 }}>
                  {bossData
                    ? <SpriteMonster data={bossData} anim="idle" scale={fitScale(bossData, 150, 150)} frozen />
                    : <div className="text-5xl">👾</div>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold text-slate-800 text-lg mb-1">
                    {bossData?.name || '선택 안 됨'}
                    {bossData && (
                      <span className={`ml-2 text-xs font-bold px-2 py-0.5 rounded-full ${TIER_COLOR[bossData.tier]}`}>
                        {TIER_LABEL[bossData.tier]}
                      </span>
                    )}
                  </div>
                  <div className="mb-2">
                    <label className="block text-xs font-bold text-slate-500 mb-1">보스 이름 (표시용)</label>
                    <input value={form.bossName}
                      onChange={e => setF('bossName', e.target.value)}
                      placeholder={bossData?.name || '보스 이름'}
                      className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:border-rose-500"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setShowBossPicker(true)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold rounded-xl transition-colors">
                      🔄 보스 변경
                    </button>
                    <button
                      onClick={() => {
                        const picked = BOSS_MONSTERS[Math.floor(Math.random() * BOSS_MONSTERS.length)];
                        if (picked) { setF('bossId', picked.id); setF('bossName', picked.name); }
                      }}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white text-sm font-bold rounded-xl transition-colors">
                      🎲 랜덤
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 퀴즈 선택 */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-bold text-slate-700 text-sm">📝 퀴즈 선택</h2>
                  <p className="text-xs text-slate-400 mt-0.5">AI학습관 차시로 새로 만들거나, 기존 내 퀴즈를 선택하세요.</p>
                </div>
                {selectedQuizSet && (
                  <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-xl px-3 py-1.5">
                    <span className="text-xs font-extrabold text-rose-700 truncate max-w-[180px]">✓ {selectedQuizSet.title}</span>
                    <span className="text-[10px] text-rose-500 shrink-0">
                      {(selectedQuizSet.questions || []).filter(q => q.type !== 'short' && q.type !== 'sa').length}문항
                    </span>
                  </div>
                )}
              </div>
              <div className="mb-4">
                <AILessonQuizSetBuilder
                  selectedClass={selectedClass}
                  accent="rose"
                  title="AI학습관 차시로 보스레이드 퀴즈 만들기"
                  description="등록된 수학 차시를 골라 객관식 퀴즈를 생성하면 레이드 퀴즈로 바로 선택됩니다."
                  defaultQuestionCount={8}
                  defaultDifficulty="normal"
                  onCreated={(quizSet) => setSelectedQuizSet(quizSet)}
                  showToast={showToast}
                />
              </div>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-[11px] font-bold text-slate-400">또는 기존 내 퀴즈 선택</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
              <QuizSetPicker selectedSetId={selectedQuizSet?.id} onSelect={setSelectedQuizSet} />
            </div>

            {/* 전투 설정 */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h2 className="font-bold text-slate-700 text-sm mb-4">⚙️ 전투 설정</h2>
              <div className="grid grid-cols-2 gap-4">
                {/* HP */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">
                    보스 HP
                    {autoHP && <span className="text-indigo-500 ml-1">(추천: {autoHP.toLocaleString()})</span>}
                  </label>
                  <div className="text-[10px] text-slate-400 mb-1">
                    인원 {classStudentCount}명 × {questionCount}문항 × 데미지 {Number(form.damagePerHit) || 0}
                    = 총 {totalPerfectDamage.toLocaleString()} 기준의 75%
                  </div>
                  <div className="flex gap-2 items-center">
                    <input type="number" min="100" step="100" value={form.maxHP}
                      onChange={e => setF('maxHP', Number(e.target.value))}
                      className="flex-1 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-center focus:outline-none focus:border-rose-500" />
                    {autoHP && (
                      <button onClick={() => setF('maxHP', autoHP)}
                        className="text-xs text-indigo-500 font-bold hover:text-indigo-700 shrink-0">자동</button>
                    )}
                  </div>
                </div>
                {/* 타격량 */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">정답 1개당 데미지</label>
                  <input type="number" min="10" step="10" value={form.damagePerHit}
                    onChange={e => setF('damagePerHit', Number(e.target.value))}
                    className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-center focus:outline-none focus:border-rose-500" />
                </div>
                {/* 문제당 시간 */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">문제당 시간 (초): {form.questionDuration}초</label>
                  <input type="range" min="10" max="60" step="5" value={form.questionDuration}
                    onChange={e => setF('questionDuration', Number(e.target.value))}
                    className="w-full accent-rose-500" />
                  <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                    <span>10초</span><span>60초</span>
                  </div>
                </div>
                {/* 자동 진행 */}
                <div className="flex flex-col justify-center">
                  <label className="block text-xs font-bold text-slate-500 mb-2">문제 자동 진행</label>
                  <button onClick={() => setF('autoAdvance', !form.autoAdvance)}
                    className={`w-full py-2 rounded-xl font-bold text-sm transition-colors border-2
                      ${form.autoAdvance
                        ? 'bg-emerald-100 border-emerald-400 text-emerald-700'
                        : 'bg-slate-100 border-slate-200 text-slate-500'}`}>
                    {form.autoAdvance ? '✅ 자동 (타이머 후 진행)' : '🖐️ 수동 (교사가 진행)'}
                  </button>
                </div>
              </div>
            </div>

            {/* 오답 패널티 */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h2 className="font-bold text-slate-700 text-sm mb-4">⚡ 오답 패널티</h2>
              <div className="flex gap-3 mb-3">
                {[
                  { v: 'none',       l: '없음',      d: '오답이어도 보스 HP 변화 없음' },
                  { v: 'hp_restore', l: '보스 HP 회복', d: '오답 시 보스 HP가 소량 회복됨' },
                ].map(opt => (
                  <button key={opt.v} onClick={() => setF('penaltyType', opt.v)}
                    className={`flex-1 py-3 px-4 rounded-xl border-2 text-left transition-colors
                      ${form.penaltyType === opt.v
                        ? 'border-rose-500 bg-rose-50'
                        : 'border-slate-200 hover:bg-slate-50'}`}>
                    <div className={`text-sm font-bold mb-0.5 ${form.penaltyType === opt.v ? 'text-rose-700' : 'text-slate-700'}`}>
                      {opt.l}
                    </div>
                    <div className="text-[11px] text-slate-500">{opt.d}</div>
                  </button>
                ))}
              </div>
              {form.penaltyType === 'hp_restore' && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">오답 시 HP 회복량</label>
                  <input type="number" min="0" step="10" value={form.penaltyAmount}
                    onChange={e => setF('penaltyAmount', Number(e.target.value))}
                    className="w-32 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-center focus:outline-none focus:border-rose-500" />
                </div>
              )}
            </div>

            {/* 보상 */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h2 className="font-bold text-slate-700 text-sm mb-4">🎁 클리어 보상 (참가자 전원)</h2>
              <div className="flex gap-3">
                {[['gold', '🪙 골드'], ['exp', '⭐ EXP'], ['diamond', '💎 다이아']].map(([k, l]) => (
                  <div key={k}>
                    <div className="text-[10px] text-slate-400 font-semibold mb-1">{l}</div>
                    <input type="number" min="0" value={form.rewards[k]}
                      onChange={e => setForm(p => ({ ...p, rewards: { ...p.rewards, [k]: Number(e.target.value) || 0 } }))}
                      className="w-24 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-center focus:outline-none focus:border-rose-500" />
                  </div>
                ))}
              </div>
            </div>

            <button onClick={createRaid} disabled={isCreating || hasOpenRaid || !selectedQuizSet || !form.bossId}
              className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-lg rounded-2xl shadow-md transition-all disabled:opacity-40">
              {isCreating ? '생성 중...' : `🐉 대기실 오픈하기`}
            </button>
          </div>
        )}

        {/* ── 결과 확인 탭 ── */}
        {tab === 'history' && (
          pastRaids.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <div className="text-5xl mb-3">📜</div>
              <p className="font-bold text-lg text-slate-600">레이드 결과 기록이 없습니다</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-end">
                <button
                  onClick={deleteAllRaids}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors">
                  🗑 전체 기록 삭제 ({pastRaids.length}건)
                </button>
              </div>
              {pastRaids.map(raid => {
                const pCount    = Object.keys(raid.participants || {}).length;
                const isCleared = raid.status === 'cleared';
                const isExpanded = expandedRaidId === raid.id;
                const questions = (raid.questions || []).filter(q => q.type !== 'short');
                const pList = Object.entries(raid.participants || {})
                  .map(([id, p]) => ({ id, ...p }))
                  .sort((a, b) => (b.totalDamage || 0) - (a.totalDamage || 0));
                return (
                  <div key={raid.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    {/* 카드 헤더 */}
                    <div className="flex items-center gap-4 px-5 py-4">
                      {/* 결과 목록에서는 고용량 보스 이미지를 렌더링하지 않습니다. */}
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-xl" title={raid.bossName}>
                        👾
                      </div>

                      {/* 중앙: 퀴즈명 + 날짜 + 참가 */}
                      <div className="flex-1 min-w-0">
                        <div className="font-extrabold text-slate-800 text-sm truncate">{raid.title}</div>
                        <div className="mt-0.5 text-[11px] font-bold text-slate-500 truncate">{raid.bossName}</div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-[11px] text-slate-400">{fmtDate(raid.clearedAt)}</span>
                          <span className="text-[11px] text-slate-400">·</span>
                          <span className="text-[11px] text-slate-500 font-bold">{pCount}명 참가</span>
                          <span className="text-[11px] text-slate-400">·</span>
                          <span className="text-[11px] text-slate-500">{questions.length}문제</span>
                        </div>
                        {(raid.rewards?.gold || raid.rewards?.exp || raid.rewards?.diamond) && (
                          <div className="flex gap-2 mt-1.5 text-[10px] font-bold">
                            {raid.rewards?.gold    > 0 && <span className="text-amber-500">🪙{raid.rewards.gold}G</span>}
                            {raid.rewards?.exp     > 0 && <span className="text-indigo-500">⭐{raid.rewards.exp}</span>}
                            {raid.rewards?.diamond > 0 && <span className="text-blue-500">💎{raid.rewards.diamond}</span>}
                          </div>
                        )}
                      </div>

                      {/* 우측: 상태 + 펼치기 + 삭제 */}
                      <div className="shrink-0 flex flex-col items-end gap-2">
                        <span className={`text-xs font-extrabold px-2.5 py-1 rounded-full
                          ${isCleared ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'}`}>
                          {isCleared ? '✅ 클리어' : '💀 실패'}
                        </span>
                        <button
                          onClick={() => setExpandedRaidId(isExpanded ? null : raid.id)}
                          className="flex items-center gap-1 text-xs font-bold text-indigo-500 hover:text-indigo-700 px-2.5 py-1 rounded-lg hover:bg-indigo-50 transition-colors border border-indigo-200">
                          📊 결과 {isExpanded ? '▲ 접기' : '▼ 펼치기'}
                        </button>
                        <button
                          onClick={() => deleteRaid(raid.id)}
                          className="text-xs font-bold text-rose-400 hover:text-rose-600 px-2.5 py-1 rounded-lg hover:bg-rose-50 transition-colors border border-rose-200">
                          🗑 삭제
                        </button>
                      </div>
                    </div>

                    {/* 펼쳐진 결과표 */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 bg-slate-50 overflow-x-auto">
                        {pList.length === 0 ? (
                          <p className="text-center text-slate-400 text-sm py-6">참가자 데이터가 없습니다.</p>
                        ) : (
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="bg-slate-100">
                                <th className="text-left px-4 py-2 font-bold text-slate-600 border-b border-slate-200">학생</th>
                                <th className="px-3 py-2 font-bold text-emerald-600 border-b border-slate-200">정답</th>
                                <th className="px-3 py-2 font-bold text-rose-500 border-b border-slate-200">오답</th>
                                <th className="px-3 py-2 font-bold text-rose-600 border-b border-slate-200">데미지</th>
                                {questions.map((question, qi) => (
                                  <th key={qi} className="px-2 py-2 font-bold text-slate-500 border-b border-slate-200 min-w-[36px]">
                                    <button onClick={() => setHistoryQuestion({ question, number: qi + 1 })}
                                      className="rounded-lg px-1.5 py-1 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-800"
                                      title={`Q${qi + 1} 문제 보기`}>
                                      Q{qi + 1}
                                    </button>
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {pList.map((p, pi) => (
                                <tr key={p.id} className={pi % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                                  <td className="px-4 py-2 font-bold text-slate-800 border-b border-slate-100">{p.name || '학생'}</td>
                                  <td className="px-3 py-2 text-center text-emerald-600 font-extrabold border-b border-slate-100">{p.correctCount || 0}</td>
                                  <td className="px-3 py-2 text-center text-rose-500 font-extrabold border-b border-slate-100">{p.wrongCount || 0}</td>
                                  <td className="px-3 py-2 text-center text-rose-600 font-bold border-b border-slate-100">{(p.totalDamage || 0).toLocaleString()}</td>
                                  {questions.map((_, qi) => {
                                    const res = p.qResults?.[qi];
                                    return (
                                      <td key={qi} className="px-1 py-2 text-center border-b border-slate-100">
                                        {res === undefined ? <span className="text-slate-300">-</span>
                                          : res ? <span className="text-emerald-500 font-bold">✓</span>
                                          : <span className="text-rose-500 font-bold">✗</span>}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* 보스 몬스터 피커 모달 */}
      {showBossPicker && (
        <BossMonsterPicker
          selectedId={form.bossId}
          onSelect={id => { setF('bossId', id); setF('bossName', MONSTERS_DB[id]?.name || ''); }}
          onClose={() => setShowBossPicker(false)}
        />
      )}
    </div>

    {resultRaid && <RaidResultModal raid={resultRaid} onClose={() => setResultRaid(null)} />}
    {historyQuestion && (
      <QuestionDetailModal
        question={historyQuestion.question}
        questionNumber={historyQuestion.number}
        onClose={() => setHistoryQuestion(null)}
      />
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
        <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
          <p className="text-slate-700 font-bold text-sm mb-5 leading-relaxed whitespace-pre-line">{confirmState.message}</p>
          <div className="flex gap-3">
            <button onClick={() => setConfirmState(null)}
              className="flex-1 py-2.5 border-2 border-slate-200 text-slate-600 font-bold rounded-xl text-sm hover:bg-slate-50">취소</button>
            <button onClick={() => { confirmState.onConfirm(); setConfirmState(null); }}
              className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-sm">확인</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
