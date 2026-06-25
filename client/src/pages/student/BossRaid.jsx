import { useState, useEffect, useRef } from 'react';
import { fireProjectile } from '../../utils/projectile';

const cleanExplanation = (text) => {
  if (!text) return '';
  return text
    .replace(/슬라이드\s*\d*/gi, '')
    .replace(/'[^']*용의자[^']*'/g, '')
    .replace(/"[^"]*용의자[^"]*"/g, '')
    .replace(/용의자.{0,30}코드/gi, '')
    .replace(/에서\s+로(\s|$)/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
};
import {
  collection, doc, updateDoc, onSnapshot,
  serverTimestamp, getDoc, getDocs, deleteField, writeBatch, query, where, setDoc, runTransaction, addDoc, increment,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { MONSTERS_DB, resolveBossBg as resolveBossBackground } from '../../data/monsterData';
import SpriteMonster from '../../components/SpriteMonster';
import { applyExpDelta } from '../../utils/leveling';
import { renderMath, TableRenderer, stripOptionPrefix } from '../../utils/renderMath';
import ShapeRenderer from '../../components/ShapeRenderer';

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

const normalizeBossId = (value) => String(value || '').trim();
const normalizeLookupKey = (value) =>
  normalizeBossId(value)
    .toLowerCase()
    .replace(/[\s_-]/g, '')
    .replace(/[^a-z0-9가-힣]/g, '');

const resolveKeyFromMap = (sourceMap, rawKey) => {
  const key = normalizeBossId(rawKey);
  if (!key) return null;
  if (sourceMap[key]) return key;

  const lowered = key.toLowerCase();
  const exactCaseInsensitive = Object.keys(sourceMap).find(k => k.toLowerCase() === lowered);
  if (exactCaseInsensitive) return exactCaseInsensitive;

  const compactKey = lowered.replace(/[\s_-]/g, '');
  return Object.keys(sourceMap).find(k => k.toLowerCase().replace(/[\s_-]/g, '') === compactKey) || null;
};

const resolveBossIdByName = (rawName) => {
  const target = normalizeLookupKey(rawName);
  if (!target) return null;
  return Object.keys(MONSTERS_DB).find((id) => {
    const name = normalizeLookupKey(MONSTERS_DB[id]?.name || '');
    return name === target;
  }) || null;
};

const resolveCanonicalBossId = (raid) => {
  const candidates = [raid?.bossId, raid?.bossName];

  for (const raw of candidates) {
    const byId = resolveKeyFromMap(MONSTERS_DB, raw);
    if (byId) return byId;
  }

  for (const raw of candidates) {
    const norm = normalizeLookupKey(raw);
    if (!norm) continue;
    const aliased = LEGACY_BOSS_ID_ALIASES[norm];
    if (aliased && MONSTERS_DB[aliased]) return aliased;
  }

  for (const raw of candidates) {
    const byName = resolveBossIdByName(raw);
    if (byName) return byName;
  }

  return null;
};

const normalizeBgPath = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('/')) return raw;
  return `/${raw.replace(/^\/+/, '')}`;
};

const resolveBossBg = (raid) => {
  return resolveBossBackground(raid) || normalizeBgPath(raid?.bossBg);
};

const resolveBossData = (raid) => {
  const bossKey = resolveCanonicalBossId(raid);
  return bossKey ? MONSTERS_DB[bossKey] : null;
};

const questionFingerprint = (q) =>
  [q?.question, ...(Array.isArray(q?.options) ? q.options : []), q?.answer ?? q?.answerIndex ?? '']
    .join('|')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^\w가-힣]/g, '')
    .slice(0, 80);

const bossQuestionKey = (raid, question, questionIdx) =>
  `bossRaid_${raid?.id || 'raid'}_${questionIdx}_${questionFingerprint(question)}`;

const wrongAnswerDocId = (studentCode, questionKey) =>
  `${studentCode}_${questionKey}`.replace(/[/.#[\]]/g, '_').slice(0, 1400);

const RAID_BREAK_MAX = 100;
const RAID_BREAK_GAIN = 20;
const RAID_FINISHER_DURATION_MS = 3000;
const QUESTION_DURATION_MIN = 6;
const FOCUS_BREAK_TIME_PENALTY = 2;

const PRESENTATION_FALLBACK_QUESTIONS = [
  {
    type: 'mc',
    question: '다음 중 보스레이드에서 보스에게 피해를 주는 방법은 무엇인가요?',
    options: ['정답을 고른다', '아무 버튼이나 누른다', '기다리기만 한다', '창을 닫는다'],
    answer: 0,
    explanation: '보스레이드는 퀴즈 정답을 맞힐 때 피해가 들어갑니다.',
  },
  {
    type: 'mc',
    question: '여러 학생이 동시에 참여하는 보스레이드의 핵심 목표는 무엇인가요?',
    options: ['혼자만 보상 받기', '보스 HP를 함께 줄이기', '학생 목록 숨기기', '문제를 건너뛰기'],
    answer: 1,
    explanation: '참여 학생들이 함께 문제를 풀어 보스 HP를 줄이는 구조입니다.',
  },
  {
    type: 'mc',
    question: '발표 테스트 계정은 어떤 학생 코드로 문제 풀이를 시연하나요?',
    options: ['SINSEOK-5-01', 'SINSEOK-5-07', 'SINSEOK-5-15', 'TEACHER'],
    answer: 2,
    explanation: '발표 테스트는 SINSEOK-5-15 계정으로 실제 문제 풀이를 보여줍니다.',
  },
];

const PRESENTATION_BOSS_IDS = ['demon03', 'goldenDragon', 'rockGolem'];

const choiceQuestionsOnly = (questions = []) =>
  questions.filter(q => q && q.type !== 'short' && q.type !== 'sa' && Array.isArray(q.options) && q.options.length >= 2);

export const createPresentationTestRaid = async ({ classId, teacherUid, rosterCodes }) => {
  let sourceQuizSet = null;

  if (teacherUid) {
    const quizSnap = await getDocs(query(collection(db, 'quizSets'), where('ownerId', '==', teacherUid))).catch(() => null);
    const quizSets = quizSnap?.docs
      ?.map(d => ({ id: d.id, ...d.data() }))
      ?.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)) || [];
    sourceQuizSet = quizSets.find(set => choiceQuestionsOnly(set.questions).length > 0) || null;
  }

  const questions = choiceQuestionsOnly(sourceQuizSet?.questions).slice(0, 8);
  const testQuestions = questions.length > 0 ? questions : PRESENTATION_FALLBACK_QUESTIONS;
  const bossId = 'demon03';
  const rosterCount = Math.max(1, rosterCodes.length || 15);
  const damagePerHit = 120;
  const maxHP = 10000;

  return addDoc(collection(db, 'worldBossRaids'), {
    title: sourceQuizSet?.title ? `${sourceQuizSet.title} 발표 테스트` : '보스레이드 발표 테스트',
    classId: classId || null,
    teacherUid: teacherUid || null,
    bossId,
    bossName: MONSTERS_DB[bossId]?.name || '고위 악마',
    bossBg: resolveBossBackground(bossId),
    quizSetId: sourceQuizSet?.id || null,
    maxHP,
    currentHP: maxHP,
    damagePerHit,
    penaltyType: 'morale',
    penaltyAmount: 50,
    currentQuestionIdx: -1,
    questionDuration: 12,
    questionDurationPenalty: 0,
    questionStartedAt: null,
    autoAdvance: true,
    rewards: { gold: 0, exp: 0, diamond: 0 },
    rewardsPaid: true,
    morale: 100,
    combo: 0,
    maxCombo: 0,
    breakGauge: 0,
    breakCount: 0,
    moraleBreakCount: 0,
    baseQuestionDuration: 12,
    phase: 1,
    paused: false,
    pausedTimeLeft: null,
    finishing: false,
    status: 'waiting',
    questions: testQuestions,
    participants: {},
    presentationTest: true,
    presentationSessionId: `presentation_${Date.now()}`,
    createdAt: serverTimestamp(),
    startedAt: null,
    clearedAt: null,
  });
};

const normalizeStudentCode = (code) => String(code || '').trim().toUpperCase();

const isPresentationAutoAnswerParticipant = (participantId, participant) => {
  const code = normalizeStudentCode(participant?.studentCode || participantId);
  return /^SINSEOK-5-(0[1-9]|1[0-4])$/.test(code);
};

const findParticipantIdByStudentCode = (participants, studentCode) => {
  const code = normalizeStudentCode(studentCode);
  if (!code || !participants) return null;
  const direct = participants[code];
  if (direct) return code;
  const found = Object.entries(participants).find(([id, participant]) =>
    normalizeStudentCode(participant?.studentCode || id) === code
  );
  return found?.[0] || null;
};

const chunkArray = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const getRaidPhase = (currentHP, maxHP) => {
  const ratio = maxHP > 0 ? currentHP / maxHP : 1;
  if (ratio <= 0.3) return 3;
  if (ratio <= 0.7) return 2;
  return 1;
};

const getMoralePenalty = (phase) => (phase >= 3 ? 4 : phase === 2 ? 3 : 2);
const getBossSkillMoralePenalty = (phase, wrongCount = 0) =>
  (phase >= 3 ? 18 : phase === 2 ? 15 : 12) + Math.min(6, Math.max(0, wrongCount - 3));
const getBossSkillHealAmount = (raid, phase) => {
  const maxHP = Math.max(1, Number(raid?.maxHP) || 1);
  const baseDamage = Math.max(1, Number(raid?.damagePerHit) || Math.round(maxHP * 0.02));
  return Math.max(baseDamage, Math.round(maxHP * (phase >= 3 ? 0.07 : phase === 2 ? 0.055 : 0.04)));
};
const getPhaseDamageMultiplier = (phase) => (phase >= 3 ? 1.25 : phase === 2 ? 1.1 : 1);
const getBossSkillWrongThreshold = (phase) => (phase >= 3 ? 3 : phase === 2 ? 4 : 5);

const resolveBossSkill = (bossData, raid) => {
  const id = [raid?.bossId, raid?.bossName, bossData?.id, bossData?.name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (/demon|devil|ghost|undead|skull/.test(id)) {
    return { name: '심연의 파동', icon: '☠', tone: 'violet' };
  }
  if (/golem|stone|rock|minotaur|bear/.test(id)) {
    return { name: '대지 붕괴', icon: '◆', tone: 'amber' };
  }
  if (/dragon|lizard|croc|fire/.test(id)) {
    return { name: '지옥의 화염', icon: '🔥', tone: 'rose' };
  }
  return { name: '파멸의 일격', icon: '⚡', tone: 'rose' };
};

const getCorrectIndex = (question) => {
  const raw = question?.answer ?? question?.answerIndex ?? question?.correctAnswer;
  const idx = Number(raw);
  return Number.isInteger(idx) ? idx : -1;
};

const answerText = (question, index) => {
  if (!Number.isInteger(index) || index < 0) return '선택하지 않음';
  return stripOptionPrefix(question?.options?.[index] || '');
};

// ── HP 바 ────────────────────────────────────────────────────────
function BossHpBar({ current, max }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round(current / max * 100))) : 0;
  const col  = pct > 60 ? 'from-emerald-400 to-emerald-600'
             : pct > 30 ? 'from-amber-400   to-amber-600'
             :             'from-rose-500    to-rose-700';
  return (
    <div>
      <div className="flex justify-between text-sm font-bold text-white mb-1.5">
        <span>보스 HP</span>
        <span>{Math.max(0, current).toLocaleString()} / {max.toLocaleString()}</span>
      </div>
      <div className="w-full h-5 bg-slate-700 rounded-full overflow-hidden shadow-inner">
        <div className={`h-full rounded-full bg-gradient-to-r transition-all duration-700 ${col}`}
          style={{ width: `${pct}%` }} />
      </div>
      <div className="text-right text-xs text-slate-400 mt-0.5">{pct}%</div>
    </div>
  );
}

// ── 보스 스프라이트 (SpriteMonster 래퍼) ─────────────────────────
function BossSprite({ bossData, anim, flash, scale = 2, onAnimEnd }) {
  if (!bossData) return <div className="text-8xl select-none">🐉</div>;
  return (
    <SpriteMonster
      data={bossData}
      anim={anim}
      scale={bossData.scale * scale}
      flash={flash}
      onAnimEnd={onAnimEnd}
    />
  );
}

const getRaidActorPoint = (element, actor) => {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const isBoss = actor === 'boss';
  return {
    x: rect.left + rect.width * (isBoss ? 0.5 : 0.62),
    y: rect.top + rect.height * (isBoss ? 0.6 : 0.52),
  };
};

// ── 타이머 링 ────────────────────────────────────────────────────
function TimerRing({ timeLeft, duration }) {
  const safeDuration = Math.max(1, Number(duration) || 1);
  const safeLeft = Math.max(0, Number(timeLeft) || 0);
  const pct = Math.max(0, Math.min(1, safeLeft / safeDuration));
  const r   = 18;
  const circ = 2 * Math.PI * r;
  const urgent = safeLeft <= Math.max(3, Math.ceil(safeDuration * 0.2));
  const warning = !urgent && safeLeft <= Math.ceil(safeDuration * 0.45);
  const col = urgent ? '#ef4444' : warning ? '#f59e0b' : '#22c55e';
  const tone = urgent
    ? 'border-rose-400/80 bg-rose-950/95 shadow-rose-500/30'
    : warning
      ? 'border-amber-400/80 bg-amber-950/95 shadow-amber-500/25'
      : 'border-emerald-400/70 bg-emerald-950/90 shadow-emerald-500/20';
  return (
    <div className={`h-14 min-w-[124px] rounded-2xl border px-3 flex items-center gap-2.5 shadow-lg ${tone}`}>
      <div className="relative w-10 h-10 flex items-center justify-center shrink-0">
        <svg className="absolute inset-0" viewBox="0 0 44 44">
          <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(15,23,42,0.9)" strokeWidth="4" />
          <circle cx="22" cy="22" r={r} fill="none" stroke={col} strokeWidth="4"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - pct)}
            strokeLinecap="round"
            transform="rotate(-90 22 22)"
            style={{ transition: 'stroke-dashoffset 0.4s linear, stroke 0.2s' }}
          />
        </svg>
        <span className="text-[10px] font-black text-white">⏱</span>
      </div>
      <div className="leading-none">
        <div className="text-[10px] font-extrabold text-white/70 whitespace-nowrap">남은 시간</div>
        <div className={`mt-1 flex items-end gap-0.5 ${urgent ? 'animate-pulse' : ''}`}>
          <span className="text-2xl font-black text-white tabular-nums tracking-tight">{safeLeft}</span>
          <span className="pb-0.5 text-xs font-extrabold text-white/80">초</span>
        </div>
      </div>
    </div>
  );
}

// ── 참가자 로스터 (하단) ─────────────────────────────────────────
function ParticipantRoster({ participants, currentQuestionIdx, setParticipantRef }) {
  const list = Object.entries(participants)
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => (b.totalDamage || 0) - (a.totalDamage || 0));

  if (list.length === 0) return null;

  const getStatus = (p) => {
    if (p.lastAnsweredIdx !== currentQuestionIdx) return 'pending';
    return p.lastAnsweredCorrect ? 'correct' : 'wrong';
  };

  return (
    <div className="boss-raid-roster bg-slate-900 border-t border-slate-700 shrink-0">
      <div className="flex gap-2.5 px-3 py-2.5 overflow-x-auto scrollbar-none">
        {list.map(p => {
          const st = getStatus(p);
          return (
            <div
              key={p.id}
              ref={(node) => setParticipantRef?.(p.id, node)}
              data-raid-participant-id={p.id}
              className="boss-raid-roster-player flex flex-col items-center gap-1 shrink-0 w-28"
            >
              <div className="relative">
                {p.characterImage
                  ? <div className="boss-raid-roster-avatar w-24 h-24 rounded-xl bg-slate-800 border border-slate-600 overflow-hidden flex items-center justify-center">
                      <img src={p.characterImage} alt=""
                        className="w-full h-full object-contain"
                        style={{ imageRendering: 'pixelated', transform: 'scale(3)', transformOrigin: 'center' }} />
                    </div>
                  : <div className="boss-raid-roster-avatar w-24 h-24 rounded-xl bg-slate-700 flex items-center justify-center text-4xl">🧑</div>
                }
                <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-2 border-slate-900 flex items-center justify-center text-[10px] font-bold
                  ${st === 'correct' ? 'bg-emerald-500' : st === 'wrong' ? 'bg-rose-500' : 'bg-slate-600'}`}>
                  {st === 'correct' ? '✓' : st === 'wrong' ? '✗' : '○'}
                </div>
              </div>
              <div className="text-xs text-slate-300 font-bold truncate w-full text-center">
                {(p.name || '학생').slice(0, 4)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 없는 레이드 화면 ─────────────────────────────────────────────
function NoBossScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-indigo-950 flex flex-col items-center justify-center p-8 text-center">
      <div className="text-7xl mb-5 opacity-40 animate-pulse">🐉</div>
      <p className="font-extrabold text-xl text-slate-400 mb-2">활성화된 보스 레이드가 없습니다</p>
      <p className="text-slate-500 text-sm">선생님이 레이드를 열면 여기에 표시됩니다</p>
    </div>
  );
}

// ── 뷰포트 진입 시에만 스프라이트 로드 (대용량 PNG 렉 방지) ────────
function LazySprite({ data, scale, w = 60, h = 60 }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.1 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ width: w, height: h }} className="flex items-center justify-center">
      {visible && <SpriteMonster data={data} anim="idle" scale={scale} frozen />}
    </div>
  );
}

// ── 초기 소개 화면 ─────────────────────────────────────────────────
function IntroScreen({ raid, bossData, onEnter }) {
  const bossList = Object.entries(MONSTERS_DB)
    .filter(([, m]) => m.tier === 'boss')
    .map(([id, m]) => ({ id, ...m }));

  const [popupBoss, setPopupBoss] = useState(null);
  const isOpen = raid && (raid.status === 'waiting' || raid.status === 'active');

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-indigo-950 overflow-y-auto">
      {/* 헤더 */}
      <div className="flex flex-col items-center px-6 pt-8 pb-4 text-center">
        <div className="text-xs font-extrabold text-rose-400 tracking-widest mb-2 uppercase">World Boss Raid</div>
        <h1 className="text-3xl font-extrabold text-white mb-3">보스 레이드</h1>
        <p className="text-slate-400 text-sm max-w-sm leading-relaxed mb-6">
          학급 전원이 힘을 합쳐 강력한 보스를 쓰러뜨려라!<br/>
          퀴즈를 맞출수록 보스에게 더 큰 데미지를 입힙니다.
        </p>

        {/* 레이드 오픈 현황 */}
        {isOpen ? (
          <div className="w-full max-w-sm bg-rose-900/40 border border-rose-600/60 rounded-3xl p-5 mb-6">
            <div className="text-xs font-extrabold text-rose-400 tracking-widest mb-1">🔥 레이드 오픈!</div>
            <div className="text-xl font-extrabold text-white mb-1">{raid.bossName}</div>
            <div className="text-sm text-slate-400 mb-4">
              {raid.status === 'waiting' ? '대기 중 — 지금 입장 가능!' : '⚔️ 전투 진행 중'}
            </div>
            {bossData && (
              <div className="flex justify-center mb-4">
                <BossSprite bossData={bossData} anim="idle" scale={1.6} />
              </div>
            )}
            <button
              onClick={onEnter}
              className="w-full py-3 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-extrabold text-base rounded-2xl shadow-lg transition-all">
              ⚔️ 입장하기
            </button>
          </div>
        ) : (
          <div className="w-full max-w-sm bg-slate-800/60 border border-slate-700 rounded-3xl p-5 mb-6 text-center">
            <div className="text-4xl mb-3 opacity-40">🔒</div>
            <div className="text-slate-400 font-bold">현재 오픈된 레이드가 없습니다</div>
            <div className="text-slate-500 text-xs mt-1">선생님이 레이드를 열면 여기에 표시됩니다</div>
          </div>
        )}
      </div>

      {/* 보스 도감 — 텍스트 카드 (클릭 시 스프라이트 팝업) */}
      <div className="px-4 pb-10">
        <div className="text-sm font-extrabold text-slate-300 mb-3 px-1">등장 보스 도감 ({bossList.length}종)</div>
        <div className="grid grid-cols-3 gap-2">
          {bossList.map(m => (
            <button key={m.id}
              onClick={() => setPopupBoss(m)}
              className="flex items-center justify-center bg-slate-900/60 border border-slate-700/60 hover:border-rose-500/60 hover:bg-slate-800/80 rounded-xl px-2 py-2.5 transition-colors active:scale-95">
              <span className="text-[10px] font-bold text-slate-400 text-center leading-tight">{m.name || m.id}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 보스 미리보기 팝업 */}
      {popupBoss && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setPopupBoss(null)}>
          <div className="bg-slate-900 rounded-3xl p-8 flex flex-col items-center gap-5 shadow-2xl min-w-[280px]"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-center" style={{ width: 220, height: 220 }}>
              <SpriteMonster data={popupBoss} anim="idle" scale={Math.min(220 / popupBoss.frameHeight, 220 / popupBoss.frameWidth) * 0.88} />
            </div>
            <div className="text-white font-extrabold text-lg">{popupBoss.name}</div>
            <button onClick={() => setPopupBoss(null)}
              className="text-slate-400 hover:text-white text-sm font-bold px-4 py-1.5 rounded-lg hover:bg-slate-800 transition-colors">
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// 교사용 레이드 시작 함수
const teacherStartRaid = async (raidId, { presentationTest = false } = {}) => {
  const updates = {
    status:             'active',
    currentQuestionIdx: 0,
    questionStartedAt:  serverTimestamp(),
    startedAt:          serverTimestamp(),
  };
  if (presentationTest) {
    updates.presentationTest = true;
    updates.baseQuestionDuration = 12;
    updates.questionDuration = 12;
    updates.questionDurationPenalty = 0;
    updates.paused = false;
    updates.pausedTimeLeft = deleteField();
    updates.pausedAt = deleteField();
  }
  await updateDoc(doc(db, 'worldBossRaids', raidId), updates);
};

// ── 대기실 (Lobby) ────────────────────────────────────────────────
function LobbyPhase({ raid, bossData, myId, isTeacher, canStartRaid = isTeacher, presentationMode = false }) {
  const participants  = raid.participants || {};
  const pList = Object.entries(participants)
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => (a.joinedAt?.seconds || 0) - (b.joinedAt?.seconds || 0));

  const bossBg = resolveBossBg(raid);

  // 보스 랜덤 애니
  const [bossLobbyAnim, setBossLobbyAnim] = useState('idle');
  const lobbyTimerRef = useRef(null);

  const scheduleNext = () => {
    const delay = 1800 + Math.random() * 2000;
    lobbyTimerRef.current = setTimeout(() => {
      const pick = Math.random();
      if (pick < 0.38) {
        setBossLobbyAnim('attack');
      } else if (pick < 0.76) {
        setBossLobbyAnim('run');
        const runDur = 2000 + Math.random() * 1000;
        lobbyTimerRef.current = setTimeout(() => { setBossLobbyAnim('idle'); scheduleNext(); }, runDur);
      } else {
        setBossLobbyAnim('idle');
        scheduleNext();
      }
    }, delay);
  };

  useEffect(() => {
    scheduleNext();
    return () => clearTimeout(lobbyTimerRef.current);
  }, []);

  return (
    <div className="min-h-screen relative" style={{ backgroundColor: '#020617' }}>
      {/* 배경 이미지 */}
      {bossBg && (
        <div className="fixed inset-0 pointer-events-none z-0"
          style={{ backgroundImage: `url(${bossBg})`, backgroundSize: 'cover', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }} />
      )}
      {/* 어두운 오버레이 */}
      <div className={`fixed inset-0 pointer-events-none z-0 ${bossBg ? 'bg-slate-950/55' : 'bg-gradient-to-b from-slate-950 to-indigo-950'}`} />

      <div className="relative z-10">
      {/* 보스 배너 */}
      <div className="flex flex-col items-center px-6 pt-6 pb-4">
        <div className="text-xs font-extrabold text-rose-400 tracking-widest mb-1 uppercase">World Boss Raid</div>
        <h1 className="text-2xl font-extrabold text-white mb-4">{raid.bossName}</h1>

        {/* 보스 스프라이트 */}
        <div className="flex items-end justify-center mb-4 bg-slate-900/50 rounded-3xl px-8 py-4 shadow-2xl border border-slate-700/60 backdrop-blur-sm">
          <BossSprite bossData={bossData} anim={bossLobbyAnim} scale={2.0}
            onAnimEnd={() => { setBossLobbyAnim('idle'); scheduleNext(); }} />
        </div>

        {/* HP */}
        <div className="w-full max-w-sm mb-3">
          <BossHpBar current={raid.maxHP} max={raid.maxHP} />
        </div>

        {/* 레이드 정보 */}
        <div className="flex gap-3 text-center text-sm mb-4">
          <div className="bg-slate-800/80 rounded-2xl px-3 py-2 border border-slate-700">
            <div className="font-extrabold text-white">{raid.questionDuration}초</div>
            <div className="text-slate-400 text-xs">문제당 시간</div>
          </div>
          <div className="bg-slate-800/80 rounded-2xl px-3 py-2 border border-slate-700">
            <div className="font-extrabold text-white">{(raid.questions || []).length}문제</div>
            <div className="text-slate-400 text-xs">총 문제 수</div>
          </div>
          <div className="bg-slate-800/80 rounded-2xl px-3 py-2 border border-slate-700">
            <div className="font-extrabold text-white">{raid.damagePerHit}</div>
            <div className="text-slate-400 text-xs">정답당 데미지</div>
          </div>
        </div>

        {/* 보상 */}
        <div className="bg-amber-900/40 border border-amber-700/50 rounded-2xl px-5 py-2.5 mb-4 flex gap-4 text-sm font-extrabold">
          {(raid.rewards?.gold    || 0) > 0 && <span className="text-amber-400">🪙 {raid.rewards.gold}G</span>}
          {(raid.rewards?.exp     || 0) > 0 && <span className="text-indigo-300">⭐ {raid.rewards.exp} EXP</span>}
          {(raid.rewards?.diamond || 0) > 0 && <span className="text-blue-300">💎 {raid.rewards.diamond}</span>}
        </div>

        {canStartRaid ? (
          <button
            onClick={() => teacherStartRaid(raid.id, { presentationTest: presentationMode })}
            className="px-10 py-4 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-extrabold text-lg rounded-2xl shadow-lg shadow-rose-900/40 transition-all">
            ⚔️ 레이드 시작 ({pList.length}명 대기 중)
          </button>
        ) : (
          <div className="flex items-center gap-2 text-slate-400 text-sm animate-pulse">
            <span className="text-lg">⏳</span>
            <span className="font-bold">선생님이 시작 버튼을 누르면 배틀이 시작됩니다!</span>
          </div>
        )}
      </div>

      {/* 참가자 목록 - 바로 아래 */}
      <div className="border-t border-slate-700/60 px-4 py-4">
        <div className="text-sm font-bold text-slate-300 mb-3">
          접속 중 {pList.length}명
          {!isTeacher && participants[myId] && <span className="text-emerald-400 ml-2">✓ 입장 완료</span>}
        </div>
        {pList.length === 0 ? (
          <div className="text-slate-500 text-sm text-center py-4">아직 참가자가 없습니다</div>
        ) : (
          <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5">
            {pList.map(p => (
              <div key={p.id}
                className={`flex flex-col items-center gap-1 p-1 rounded-xl border transition-all
                  ${!isTeacher && p.id === myId
                    ? 'border-emerald-500 bg-emerald-900/30'
                    : 'border-slate-700 bg-slate-800/60'}`}>
                {p.characterImage
                  ? <div className="w-full rounded-lg bg-slate-700 overflow-hidden flex items-center justify-center" style={{ aspectRatio: '1', minHeight: 26 }}>
                      <img src={p.characterImage} alt=""
                        className="w-full h-full object-contain"
                        style={{ imageRendering: 'pixelated', transform: 'scale(2.7)', transformOrigin: 'center' }} />
                    </div>
                  : <div className="w-full rounded-lg bg-slate-700 flex items-center justify-center text-xl" style={{ aspectRatio: '1', minHeight: 26 }}>🧑</div>
                }
                <span className={`text-[18px] font-bold text-center truncate w-full leading-tight
                  ${!isTeacher && p.id === myId ? 'text-emerald-300' : 'text-slate-200'}`}>
                  {p.name || '학생'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>{/* /relative z-10 */}
    </div>
  );
}

// ── 배틀 ─────────────────────────────────────────────────────────
function BattlePhase({
  raid, bossData, myId, myAnswer, timeLeft, bossAnim, bossAnimKey, bossFlash,
  isTeacher, onAnswer, onBossAttack, onBossAnimEnd, onExit, onAdvance, onPauseToggle, onBossSkillResolve, onChangeBoss, changingBoss = false, showExitButton = isTeacher,
}) {
  const bossBg = resolveBossBg(raid);
  const questions = (raid.questions || []).filter(q => q.type !== 'short');
  const qIdx      = raid.currentQuestionIdx ?? 0;
  const q         = questions[qIdx];
  const correctIdx = q ? getCorrectIndex(q) : -1;
  const totalQ    = questions.length;
  const myP       = raid.participants?.[myId] || {};
  const phase     = Math.max(Number(raid.phase) || 1, getRaidPhase(raid.currentHP, raid.maxHP));
  const morale    = Math.max(0, Math.min(100, Number(raid.morale ?? 100)));
  const combo     = Math.max(0, Number(raid.combo) || 0);
  const rawBreakGauge = Math.max(0, Number(raid.breakGauge) || 0);
  const breakGauge = rawBreakGauge % RAID_BREAK_MAX;
  const shieldGauge = breakGauge === 0 ? RAID_BREAK_MAX : RAID_BREAK_MAX - breakGauge;
  const stageParticipants = Object.entries(raid.participants || {})
    .map(([id, participant]) => ({ id, ...participant }))
    .sort((a, b) => {
      if (a.id === myId) return -1;
      if (b.id === myId) return 1;
      return (b.totalDamage || 0) - (a.totalDamage || 0);
    });
  const bossAreaRef = useRef(null);
  const bossActorRef = useRef(null);
  const playerActorRef = useRef(null);
  const previousBossHpRef = useRef(null);
  const participantActorRefs = useRef(new Map());
  const prevParticipantsRef = useRef({});
  const effectTimersRef = useRef(new Set());
  const impactIdRef = useRef(0);
  const skillTriggeredQuestionsRef = useRef(new Set());
  const previousPhaseRef = useRef(null);
  const previousBreakCountRef = useRef(null);
  const previousMoraleBreakCountRef = useRef(null);
  const finisherTriggeredRef = useRef(false);

  const [impactFx, setImpactFx] = useState(null);
  const [bossHitTier, setBossHitTier] = useState(0);
  const [playerHitTier, setPlayerHitTier] = useState(0);
  const [damageFloats, setDamageFloats] = useState([]);
  const [bossSkillFx, setBossSkillFx] = useState(null);
  const [phaseFx, setPhaseFx] = useState(null);
  const [breakFx, setBreakFx] = useState(false);
  const [moraleBreakFx, setMoraleBreakFx] = useState(false);
  const [bossHealNotice, setBossHealNotice] = useState(null);
  const activeBossSkillFx = bossSkillFx?.questionIdx === qIdx ? bossSkillFx : null;

  const scheduleEffect = (callback, delay) => {
    const timer = setTimeout(() => {
      effectTimersRef.current.delete(timer);
      callback();
    }, delay);
    effectTimersRef.current.add(timer);
    return timer;
  };

  const triggerRaidImpact = (target, point, damage, tier, label = null) => {
    const id = impactIdRef.current++;
    const areaRect = bossAreaRef.current?.getBoundingClientRect();
    const x = point && areaRect ? point.x - areaRect.left : areaRect?.width / 2;
    const y = point && areaRect ? point.y - areaRect.top : areaRect?.height / 2;
    const floatId = impactIdRef.current++;

    setImpactFx({ id, target, tier, x, y, label });
    setDamageFloats(current => [...current, { id: floatId, target, tier, x, y, damage, label }]);
    if (target === 'boss') setBossHitTier(tier);
    else setPlayerHitTier(tier);
    if (target === 'boss') onBossAttack?.();

    scheduleEffect(() => {
      if (target === 'boss') setBossHitTier(0);
      else setPlayerHitTier(0);
    }, 560);
    scheduleEffect(() => setImpactFx(current => current?.id === id ? null : current), 650);
    scheduleEffect(() => setDamageFloats(current => current.filter(item => item.id !== floatId)), 1100);
  };

  const setParticipantRef = (id, node) => {
    if (node) participantActorRefs.current.set(id, node);
    else participantActorRefs.current.delete(id);
  };

  useEffect(() => () => {
    effectTimersRef.current.forEach(clearTimeout);
    effectTimersRef.current.clear();
  }, []);

  useEffect(() => {
    if (previousPhaseRef.current === null) {
      previousPhaseRef.current = phase;
      return;
    }
    if (phase <= previousPhaseRef.current) return;
    previousPhaseRef.current = phase;
    setPhaseFx(phase);
    onBossAttack?.();
    scheduleEffect(() => setPhaseFx(null), 2400);
  }, [phase]);

  useEffect(() => {
    const breakCount = Number(raid.breakCount) || 0;
    if (previousBreakCountRef.current === null) {
      previousBreakCountRef.current = breakCount;
      return;
    }
    if (breakCount <= previousBreakCountRef.current) return;
    previousBreakCountRef.current = breakCount;
    setBreakFx(true);
    scheduleEffect(() => setBreakFx(false), 1500);
  }, [raid.breakCount]);

  useEffect(() => {
    const moraleBreakCount = Number(raid.moraleBreakCount) || 0;
    if (previousMoraleBreakCountRef.current === null) {
      previousMoraleBreakCountRef.current = moraleBreakCount;
      return;
    }
    if (moraleBreakCount <= previousMoraleBreakCountRef.current) return;
    previousMoraleBreakCountRef.current = moraleBreakCount;
    setMoraleBreakFx(true);
    onBossAttack?.();
    scheduleEffect(() => setMoraleBreakFx(false), 1900);
  }, [raid.moraleBreakCount]);

  useEffect(() => {
    if (!raid.finishing) {
      finisherTriggeredRef.current = false;
      return;
    }
    if (finisherTriggeredRef.current) return;
    finisherTriggeredRef.current = true;

    scheduleEffect(() => {
      const bossPoint = getRaidActorPoint(bossActorRef.current, 'boss');
      if (!bossPoint) return;
      stageParticipants.forEach((participant, index) => {
        const participantPoint = getRaidActorPoint(participantActorRefs.current.get(participant.id), 'player');
        if (!participantPoint) return;
        scheduleEffect(() => {
          fireProjectile({
            from: participantPoint,
            to: bossPoint,
            type: index % 2 ? 'magic' : 'fire',
            power: 1.8,
            onHit: () => triggerRaidImpact('boss', bossPoint, raid.damagePerHit || 100, 4),
          });
        }, index * 110);
      });
    }, 350);
  }, [raid.finishing]);

  useEffect(() => {
    const currentHP = Math.max(0, Number(raid.currentHP) || 0);
    const previousHP = previousBossHpRef.current;
    previousBossHpRef.current = currentHP;
    if (previousHP === null || currentHP <= previousHP) return;

    const healAmount = currentHP - previousHP;
    setBossHealNotice({ id: impactIdRef.current++, healAmount });
    scheduleEffect(() => {
      setBossHealNotice(current => current?.healAmount === healAmount ? null : current);
    }, 1800);
  }, [raid.currentHP]);

  useEffect(() => {
    const wrongCount = Object.values(raid.participants || {}).filter((participant) =>
      participant?.qResults?.[qIdx] === 0
    ).length;
    const skillKey = `${raid.id}:${qIdx}`;

    if (wrongCount < getBossSkillWrongThreshold(phase) || skillTriggeredQuestionsRef.current.has(skillKey)) return;
    skillTriggeredQuestionsRef.current.add(skillKey);

    const skill = resolveBossSkill(bossData, raid);
    setBossSkillFx({ ...skill, phase: 'charge', wrongCount, questionIdx: qIdx });

    scheduleEffect(() => {
      setBossSkillFx(current => current?.questionIdx === qIdx ? { ...current, phase: 'cast' } : current);
    }, 850);
    scheduleEffect(() => {
      const playerPoint = getRaidActorPoint(playerActorRef.current, 'player');
      const focusPenalty = getBossSkillMoralePenalty(phase, wrongCount);
      const penaltyLabel = morale - focusPenalty <= 0 ? '집중력 붕괴!' : `집중력 -${focusPenalty}`;
      if (playerPoint) triggerRaidImpact('player', playerPoint, 0, 4, penaltyLabel);
      setBossSkillFx(current => current?.questionIdx === qIdx ? { ...current, phase: 'impact' } : current);
      onBossSkillResolve?.({ questionIdx: qIdx, wrongCount, phase });
    }, 1750);
    scheduleEffect(() => {
      setBossSkillFx(current => current?.questionIdx === qIdx ? null : current);
    }, 3000);
  }, [raid.id, raid.participants, qIdx, bossData, phase, onBossSkillResolve]);

  const alreadyAnswered = myP.lastAnsweredIdx === qIdx || myAnswer !== null;
  const displayAnswer   = myAnswer ?? (alreadyAnswered
    ? { idx: -1, correct: myP.lastAnsweredCorrect }
    : null);

  // ── 킬피드 (정답자 이름 피드) ───────────────────────────────────
  const [hitFeed, setHitFeed] = useState([]);
  const feedPrevRef = useRef({});
  const feedIdRef   = useRef(0);

  useEffect(() => {
    if (!raid?.participants) return;
    const prev = feedPrevRef.current;
    const newHits = [];
    Object.entries(raid.participants).forEach(([id, p]) => {
      const prevP = prev[id];
      if (!prevP) return;
      if ((p.correctCount || 0) > (prevP.correctCount || 0)) {
        newHits.push({ uid: feedIdRef.current++, name: p.name || '학생', damage: p.lastDamage || raid.damagePerHit || 100, ts: Date.now() });
      }
    });
    const next = {};
    Object.entries(raid.participants).forEach(([id, p]) => { next[id] = { correctCount: p.correctCount || 0 }; });
    feedPrevRef.current = next;
    if (newHits.length === 0) return;
    setHitFeed(cur => [...newHits, ...cur].slice(0, 10));
  }, [raid?.participants]);

  // 문제 바뀌면 킬피드 초기화
  useEffect(() => {
    setHitFeed([]);
  }, [qIdx]);

  // 정답/오답 시 파티클 발사
  useEffect(() => {
    if (myAnswer === null) return;
    const bossPoint = getRaidActorPoint(bossActorRef.current, 'boss');
    const playerPoint = getRaidActorPoint(playerActorRef.current, 'player');
    if (!bossPoint || !playerPoint) return;
    if (myAnswer.correct) {
      const damage = myAnswer.damage || raid.damagePerHit || 100;
      const damageLabel = myAnswer.breakTriggered
        ? `방어막 파괴! -${damage.toLocaleString()}`
        : myAnswer.critical
          ? `CRITICAL -${damage.toLocaleString()}`
          : `-${damage.toLocaleString()}`;
      fireProjectile({
        from: playerPoint,
        to: bossPoint,
        type: 'magic',
        power: 1.55,
        onHit: () => triggerRaidImpact(
          'boss',
          bossPoint,
          damage,
          myAnswer.breakTriggered ? 4 : myAnswer.critical ? 3 : 2,
          damageLabel,
        ),
      });
    } else {
      onBossAttack?.();
      const penaltyLabel = myAnswer.moraleBroken ? '집중력 붕괴!' : `집중력 -${getMoralePenalty(phase)}`;
      fireProjectile({
        from: bossPoint,
        to: playerPoint,
        type: 'fire',
        power: 1.35,
        onHit: () => triggerRaidImpact('player', playerPoint, raid.penaltyAmount || 0, myAnswer.moraleBroken ? 4 : 2, penaltyLabel),
      });
    }
  }, [myAnswer]);

  // 모든 화면에서 실제 하단 참가자 아바타와 보스 위치를 연결한다.
  useEffect(() => {
    if (!raid?.participants) return;
    const prev = prevParticipantsRef.current;
    const bossPoint = getRaidActorPoint(bossActorRef.current, 'boss');

    Object.entries(raid.participants).forEach(([id, participant]) => {
      const previous = prev[id];
      if (!previous || (!isTeacher && id === myId) || !bossPoint) return;
      const participantPoint = getRaidActorPoint(participantActorRefs.current.get(id), 'player');
      if (!participantPoint) return;

      if ((participant.correctCount || 0) > (previous.correctCount || 0)) {
        const damage = participant.lastDamage || raid.damagePerHit || 100;
        const damageLabel = participant.lastBreakTriggered
          ? `방어막 파괴! -${damage.toLocaleString()}`
          : participant.lastHitCritical
            ? `CRITICAL -${damage.toLocaleString()}`
            : `-${damage.toLocaleString()}`;
        fireProjectile({
          from: participantPoint,
          to: bossPoint,
          type: 'magic',
          power: 1.25,
          onHit: () => triggerRaidImpact(
            'boss',
            bossPoint,
            damage,
            participant.lastBreakTriggered ? 4 : participant.lastHitCritical ? 3 : 2,
            damageLabel,
          ),
        });
      }
      if ((participant.wrongCount || 0) > (previous.wrongCount || 0)) {
        onBossAttack?.();
        const penaltyLabel = participant.lastMoraleBroken ? '집중력 붕괴!' : `집중력 -${getMoralePenalty(phase)}`;
        fireProjectile({
          from: bossPoint,
          to: participantPoint,
          type: 'fire',
          power: 1.15,
          onHit: () => triggerRaidImpact('player', participantPoint, 0, participant.lastMoraleBroken ? 4 : 2, penaltyLabel),
        });
      }
    });

    const next = {};
    Object.entries(raid.participants).forEach(([id, participant]) => {
      next[id] = {
        correctCount: participant.correctCount || 0,
        wrongCount: participant.wrongCount || 0,
      };
    });
    prevParticipantsRef.current = next;
  }, [raid?.participants, isTeacher, myId]);

  if (!q) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
      문제를 불러오는 중...
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden flex flex-col" style={{ backgroundColor: '#020617' }}>
      {bossBg && (
        <div className="fixed inset-0 pointer-events-none z-0"
          style={{ backgroundImage: `url(${bossBg})`, backgroundSize: 'cover', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }} />
      )}
      <div className={`fixed inset-0 pointer-events-none z-0 ${bossBg ? 'bg-slate-950/65' : 'bg-gradient-to-b from-slate-950 to-indigo-950'}`} />
      <div className="boss-raid-layout relative z-10 h-full min-h-0">
      {/* 상단: HP 바 */}
      <div className="bg-slate-900/90 px-4 pt-3 pb-4 shadow-lg shrink-0">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white">{raid.bossName}</span>
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-black tracking-wider ${
              phase === 3 ? 'bg-rose-500/25 text-rose-200' : phase === 2 ? 'bg-amber-500/25 text-amber-200' : 'bg-sky-500/20 text-sky-200'
            }`}>PHASE {phase}</span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            <span>👥 {Object.keys(raid.participants || {}).length}명 참전</span>
            {onChangeBoss && (
              <button
                type="button"
                onClick={onChangeBoss}
                disabled={changingBoss || raid.finishing}
                className="rounded-lg border border-violet-400/50 bg-violet-600 px-3 py-1.5 font-extrabold text-white shadow-lg shadow-violet-950/30 transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {changingBoss ? '변경 중...' : '보스 변경'}
              </button>
            )}
            {showExitButton && onExit && (
              <button
                type="button"
                onClick={onExit}
                className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 font-extrabold text-white transition-colors hover:border-rose-400 hover:bg-rose-500"
              >
                ← 관리 화면으로
              </button>
            )}
          </div>
        </div>
        <BossHpBar current={raid.currentHP} max={raid.maxHP} />
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-4">
          <div>
            <div className="mb-1 flex items-center justify-between text-[9px] font-extrabold text-slate-300 sm:text-[10px]">
              <span>🔥 우리 팀 집중력</span><span>{morale}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-700">
              <div className={`h-full rounded-full transition-all duration-500 ${morale <= 30 ? 'bg-rose-500' : morale <= 50 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                style={{ width: `${morale}%` }} />
            </div>
          </div>
          <div className={`min-w-[68px] rounded-xl border px-2 py-1 text-center ${combo >= 5 ? 'border-amber-400/70 bg-amber-500/20 text-amber-200' : 'border-slate-600 bg-slate-800/80 text-white'}`}>
            <div className="text-[8px] font-black tracking-wider text-slate-400">COMBO</div>
            <div className="text-sm font-black leading-4 sm:text-base">{combo}x</div>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-[9px] font-extrabold text-slate-300 sm:text-[10px]">
              <span>🛡️ 보스 방어막</span><span>{shieldGauge}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-700">
              <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 transition-all duration-500"
                style={{ width: `${shieldGauge}%` }} />
            </div>
          </div>
        </div>
        <p className="mt-1.5 text-[10px] font-semibold text-slate-400">
          정답은 보스를 공격하고 방어막을 깎습니다. 오답은 집중력을 떨어뜨리고, 집중력이 0이 되면 다음 문제 제한시간이 2초 줄어듭니다.
          {Number(raid.questionDurationPenalty || 0) > 0 && (
            <span className="ml-2 text-rose-300">현재 제한시간 -{raid.questionDurationPenalty}초</span>
          )}
        </p>
      </div>

      {/* 보스 전용 중앙 무대 */}
      <div
        ref={bossAreaRef}
        data-testid="boss-raid-stage"
        className={`boss-raid-stage flex items-end justify-center relative shrink-0 overflow-hidden
          boss-raid-stage-phase-${phase}
          ${impactFx ? `battle-scene-impact-${impactFx.tier}` : ''}
          ${['cast', 'impact'].includes(activeBossSkillFx?.phase) ? 'boss-skill-stage-impact' : ''}`}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/10 via-transparent to-slate-950/80 pointer-events-none" />
        <div className="absolute bottom-8 left-1/2 h-16 w-[62%] -translate-x-1/2 rounded-[100%] bg-black/55 blur-md pointer-events-none" />

        {raid.paused && (
          <div className="absolute left-1/2 top-1/2 z-[65] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-amber-300/70 bg-slate-950/85 px-8 py-5 text-center text-white shadow-2xl shadow-black/50 backdrop-blur-md">
            <p className="text-xs font-black tracking-[0.35em] text-amber-300">PAUSED</p>
            <strong className="mt-1 block text-2xl font-black">일시정지 중</strong>
          </div>
        )}

        {phaseFx && (
          <div className={`boss-raid-phase-banner boss-raid-phase-banner-${phaseFx}`} role="status">
            <small>{phaseFx === 3 ? 'FINAL PHASE' : `PHASE ${phaseFx}`}</small>
            <strong>{phaseFx === 3 ? '보스가 최후의 힘을 해방합니다!' : '보스가 분노하기 시작합니다!'}</strong>
          </div>
        )}

        {breakFx && (
          <div className="boss-raid-break-banner" role="status">
            <small>SHIELD BREAK</small>
            <strong>방어막 파괴! 큰 피해가 들어갑니다</strong>
          </div>
        )}

        {moraleBreakFx && (
          <div className="boss-raid-morale-break-banner" role="status">
            <small>FOCUS BREAK</small>
            <strong>집중력 붕괴! 보스가 회복합니다</strong>
          </div>
        )}

        {raid.finishing && (
          <div className="boss-raid-finisher" role="status">
            <div className="boss-raid-finisher-rays" />
            <small>ALL PARTY ATTACK</small>
            <strong>마지막 일격!</strong>
            <p>{raid.finisherBy || '공격대'}의 일격으로 승리가 눈앞입니다</p>
          </div>
        )}

        {activeBossSkillFx && (
          <div className={`boss-skill-overlay boss-skill-${activeBossSkillFx.tone} boss-skill-${activeBossSkillFx.phase}`}>
            <div className="boss-skill-vignette" />
            <div className="boss-skill-warning-ring" />
            <div className="boss-skill-bolts" aria-hidden="true">
              <i /><i /><i /><i /><i />
            </div>
            <div className="boss-skill-energy-core" aria-hidden="true">
              <i /><i /><b>{activeBossSkillFx.icon}</b>
            </div>
            <div className="boss-skill-attack-beam" aria-hidden="true"><i /></div>
            <div className="boss-skill-impact-zone" aria-hidden="true"><i /><i /><i /></div>
            <div className="boss-skill-banner" role="status">
              <span>{activeBossSkillFx.icon}</span>
              <div>
                <small>오답자 {activeBossSkillFx.wrongCount}명 · BOSS SKILL</small>
                <strong>{activeBossSkillFx.name}</strong>
              </div>
            </div>
          </div>
        )}

        {impactFx && (
          <div key={`raid-flash-${impactFx.id}`}
            className={`absolute inset-0 z-30 pointer-events-none battle-impact-flash ${impactFx.target === 'player' ? 'battle-impact-flash-player' : ''}`} />
        )}

        <div
          className="boss-raid-party"
          aria-label={`참가 학생 ${stageParticipants.length}명`}
        >
          {stageParticipants.map((participant, index) => {
            const isMe = participant.id === myId;
            const status = participant.lastAnsweredIdx !== qIdx
              ? 'pending'
              : participant.lastAnsweredCorrect ? 'correct' : 'wrong';
            return (
              <div
                key={participant.id}
                ref={(node) => {
                  setParticipantRef(participant.id, node);
                  if (isMe || (!myId && index === 0)) playerActorRef.current = node;
                }}
                data-testid={isMe ? 'boss-raid-player' : undefined}
                data-raid-participant-id={participant.id}
                data-battle-actor="player"
                className={`boss-raid-party-member ${isMe ? 'boss-raid-party-member-me' : ''}
                  ${isMe && playerHitTier ? `battle-player-hit-${playerHitTier}` : ''}`}
              >
                <div className="boss-raid-party-avatar">
                  {participant.characterImage
                    ? <img
                        src={participant.characterImage}
                        alt={`${participant.name || '학생'} 캐릭터`}
                        className="boss-raid-party-image"
                      />
                    : <span className="boss-raid-party-fallback">🧑</span>}
                </div>
                <span className={`boss-raid-party-status boss-raid-party-status-${status}`}>
                  {status === 'correct' ? '✓ 정답' : status === 'wrong' ? '✕ 오답' : '대기'}
                </span>
                <span className="boss-raid-party-name">{(participant.name || '학생').slice(0, 5)}</span>
              </div>
            );
          })}
        </div>

        <div ref={bossActorRef} data-testid="boss-raid-boss"
          className="boss-raid-boss-actor">
          <div className="boss-raid-boss-aura" aria-hidden="true" />
          <div data-battle-actor="boss"
            className={`relative z-10 drop-shadow-[0_18px_18px_rgba(0,0,0,0.75)] ${bossHitTier ? `boss-raid-hit-${bossHitTier}` : ''}`}>
            <BossSprite
              key={`${bossData?.id || raid.bossId || 'boss'}-${bossAnimKey}-${activeBossSkillFx?.phase || 'normal'}`}
              bossData={bossData}
              anim={activeBossSkillFx && activeBossSkillFx.phase !== 'charge' ? 'attack' : bossAnim}
              flash={bossFlash}
              scale={4.35}
              onAnimEnd={() => {
                if (!activeBossSkillFx) onBossAnimEnd?.();
              }}
            />
          </div>
        </div>

        <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full border border-rose-400/30 bg-slate-950/65 px-5 py-1.5 text-center backdrop-blur-sm">
          <span className="text-[10px] font-black tracking-[0.3em] text-rose-300">WORLD BOSS</span>
          <p className="max-w-[220px] truncate text-sm font-black text-white">{raid.bossName}</p>
        </div>

        {/* 킬피드 — 우측 세로 목록 */}

        {bossHealNotice && (
          <div
            key={`boss-heal-${bossHealNotice.id}`}
            className="absolute left-1/2 top-[22%] z-40 -translate-x-1/2 rounded-2xl border border-emerald-300/70 bg-emerald-950/90 px-5 py-2 text-center text-emerald-100 shadow-xl shadow-emerald-950/40 backdrop-blur-sm"
          >
            <div className="text-[10px] font-black tracking-[0.25em] text-emerald-300">BOSS HEAL</div>
            <strong className="block text-lg font-black">보스 HP +{bossHealNotice.healAmount.toLocaleString()} 회복</strong>
          </div>
        )}
        {hitFeed.length > 0 && (
          <div className="absolute right-3 top-14 flex flex-col gap-1 items-end pointer-events-none z-20 max-w-[160px]">
            {hitFeed.map((h, i) => (
              <div key={h.uid}
                className="flex items-center gap-2 bg-slate-900/85 border border-emerald-600/50 text-emerald-300 text-base font-bold px-4 py-2 rounded-xl backdrop-blur-sm"
                style={{ opacity: Math.max(0.35, 1 - i * 0.07) }}>
                <span className="truncate max-w-[180px]">⚔️ {h.name} 정답!</span>
              </div>
            ))}
          </div>
        )}

        {damageFloats.map(item => (
          <div key={item.id} data-testid="boss-raid-damage"
            className={`absolute z-40 pointer-events-none font-black battle-damage-float battle-damage-tier-${item.tier}
              ${item.target === 'boss' ? 'text-yellow-300' : 'text-rose-300'}`}
            style={{ left: item.x, top: item.y }}>
            {item.label || (item.target === 'boss' ? `-${item.damage}` : '집중력 하락!')}
          </div>
        ))}

        {impactFx && (
          <div key={`raid-impact-${impactFx.id}`} data-testid="boss-raid-impact"
            className={`absolute z-40 pointer-events-none battle-impact battle-impact-tier-${impactFx.tier}`}
            style={{ left: impactFx.x, top: impactFx.y }}>
            <span className="battle-impact-ring" />
            <strong className={impactFx.target === 'boss' ? 'text-amber-200' : 'text-rose-300'}>
              {impactFx.label || (impactFx.target === 'boss' ? '공격 성공!' : impactFx.tier >= 4 ? '집중력 붕괴!' : '보스 반격!')}
            </strong>
          </div>
        )}
        {/* 내 데미지 / 정답 수 */}
        <div className="absolute left-2 top-2 z-20 flex flex-col items-start gap-1 sm:left-3 sm:top-3">
          <span className="bg-slate-900/80 text-rose-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
            💥 내 데미지 {(myP.totalDamage || 0).toLocaleString()}
          </span>
          <span className="bg-slate-900/80 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
            ✓ {myP.correctCount || 0}정답
          </span>
        </div>
      </div>

      {/* 문제 영역 — 남은 공간 채우고 스크롤 */}
      <div className="boss-raid-question-panel relative z-30 min-h-0 overflow-y-auto border-t border-slate-700/80 bg-slate-950/90 px-4 pt-3 pb-3 shadow-[0_-12px_30px_rgba(2,6,23,0.72)]">
        <div className="boss-raid-question-content space-y-2.5">
        {/* 문제 헤더 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold text-slate-400">Q{qIdx + 1}/{totalQ}</span>
            <div className="h-1.5 w-24 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full transition-all"
                style={{ width: `${((qIdx + 1) / totalQ) * 100}%` }} />
            </div>
          </div>
          {raid.autoAdvance && timeLeft !== null && (
            <TimerRing timeLeft={timeLeft} duration={raid.questionDuration} />
          )}
          {onPauseToggle && (
            <button
              type="button"
              onClick={onPauseToggle}
              disabled={raid.finishing}
              className={`rounded-xl px-4 py-2 text-sm font-extrabold text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-50 ${
                raid.paused
                  ? 'bg-emerald-600 shadow-emerald-950/30 hover:bg-emerald-700'
                  : 'bg-amber-500 shadow-amber-950/30 hover:bg-amber-600'
              }`}
            >
              {raid.paused ? '재개 ▶' : '일시정지 ⏸'}
            </button>
          )}
          {onAdvance && (
            <button
              type="button"
              onClick={onAdvance}
              disabled={raid.finishing || raid.paused}
              className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-extrabold text-white shadow-lg shadow-rose-950/30 transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {qIdx >= totalQ - 1 || raid.currentHP <= 0 ? '결과 처리 →' : '다음 문제 →'}
            </button>
          )}
        </div>

        {/* 문제 */}
        <div className="bg-slate-800 rounded-2xl p-3 sm:p-4 border border-slate-700">
          <p className="font-bold text-white text-base leading-relaxed sm:text-lg lg:text-xl">{renderMath(q.question)}</p>
          <TableRenderer table={q.table} dark />
          <ShapeRenderer shape={q.shape} />
        </div>

        {/* 보기 */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {(q.options || []).map((opt, oi) => {
            let cls = 'bg-slate-800 border-2 border-slate-700 text-slate-200 hover:border-rose-400 hover:bg-slate-700 active:scale-95';
            if (displayAnswer !== null) {
              if (oi === correctIdx)                 cls = 'bg-emerald-900/60 border-2 border-emerald-500 text-emerald-200';
              else if (oi === displayAnswer?.idx)     cls = 'bg-rose-900/40 border-2 border-rose-500 text-rose-300';
              else                                    cls = 'bg-slate-800/50 border-2 border-slate-700 text-slate-500 opacity-50';
            }
            return (
              <button key={oi} onClick={() => onAnswer(oi)}
                disabled={alreadyAnswered || raid.finishing || raid.paused}
                className={`py-2.5 px-3 rounded-2xl font-bold text-sm text-left transition-all sm:py-3.5 sm:text-base ${cls}`}>
                <span className="text-xs opacity-60 mr-1">{['①','②','③','④'][oi]}</span>
                {renderMath(stripOptionPrefix(opt))}
              </button>
            );
          })}
        </div>

        {/* 정답/해설 */}
        {displayAnswer !== null && (
          <div className={`rounded-xl p-3 text-sm font-medium leading-relaxed
            ${displayAnswer?.correct
              ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-700'
              : 'bg-rose-900/30 text-rose-300 border border-rose-800'}`}>
            {displayAnswer?.correct ? '✅ 정답!' : `❌ 정답: ${answerText(q, correctIdx)}`}
            {cleanExplanation(q.explanation) && <span className="ml-1 opacity-80">{cleanExplanation(q.explanation)}</span>}
          </div>
        )}
        </div>
      </div>

      {/* 하단: 참가자 로스터 */}
      <ParticipantRoster
        participants={raid.participants || {}}
        currentQuestionIdx={qIdx}
      />
      </div>
    </div>
  );
}

// ── 결과 화면 ─────────────────────────────────────────────────────
function ResultPhase({ raid, myId, bossData, onGoToIntro }) {
  const isCleared = raid.status === 'cleared';
  const myP = raid.participants?.[myId] || {};
  const sorted = Object.entries(raid.participants || {})
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => (b.totalDamage || 0) - (a.totalDamage || 0));
  const myRank = sorted.findIndex(p => p.id === myId) + 1;
  const answerDetails = Object.values(myP.answerDetails || {})
    .sort((a, b) => (a.questionIdx || 0) - (b.questionIdx || 0));
  const wrongDetails = answerDetails.filter(item => !item.isCorrect);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-indigo-950 flex flex-col items-center p-6 text-center">
      <div className="flex items-center justify-center mb-3 mt-8 overflow-visible" style={{ height: 180 }}>
        <BossSprite bossData={bossData} anim={isCleared ? 'death' : 'idle'} scale={1.25} />
      </div>

      <div className="text-5xl mb-3">{isCleared ? '🏆' : '💀'}</div>
      <h2 className="text-3xl font-extrabold text-white mb-1">
        {isCleared ? '보스 처치 성공!' : '레이드 실패...'}
      </h2>
      <p className="text-slate-400 text-sm mb-6">{raid.bossName}</p>

      <div className="mb-4 grid w-full max-w-sm grid-cols-3 gap-2">
        {[
          ['최고 콤보', String(raid.maxCombo || 0) + 'x', 'text-amber-300'],
          ['방어막 파괴', String(raid.breakCount || 0) + '회', 'text-cyan-300'],
          ['집중력 붕괴', String(raid.moraleBreakCount || 0) + '회', 'text-rose-300'],
        ].map(([label, value, tone]) => (
          <div key={label} className="rounded-xl border border-slate-700 bg-slate-900/70 px-2 py-3">
            <div className={'text-base font-black ' + tone}>{value}</div>
            <div className="mt-0.5 text-[9px] font-bold text-slate-400">{label}</div>
          </div>
        ))}
      </div>

      <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5 w-full max-w-xs mb-4 shadow-lg">
        <div className="text-xs text-slate-400 font-bold mb-3">내 기여도</div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-xl font-extrabold text-rose-400">💥 {(myP.totalDamage || 0).toLocaleString()}</div>
            <div className="text-[10px] text-slate-400">총 데미지</div>
          </div>
          <div>
            <div className="text-xl font-extrabold text-emerald-400">{myP.correctCount || 0}</div>
            <div className="text-[10px] text-slate-400">정답 수</div>
          </div>
          <div>
            <div className="text-xl font-extrabold text-amber-400">
              {myRank > 0 ? myRank + '위' : '-'}
            </div>
            <div className="text-[10px] text-slate-400">기여 순위</div>
          </div>
        </div>
      </div>

      {isCleared && (raid.rewards?.gold || raid.rewards?.exp || raid.rewards?.diamond) && (
        <div className="bg-amber-900/40 border border-amber-700/50 rounded-2xl p-4 w-full max-w-xs mb-4">
          <div className="font-bold text-amber-300 text-sm mb-2">
            🎁 클리어 보상 {raid.rewardsPaid ? '(지급 완료!)' : '(선생님이 지급 예정)'}
          </div>
          <div className="flex justify-center gap-4 font-extrabold text-sm">
            {(raid.rewards?.gold || 0) > 0 && <span className="text-amber-400">🪙 {raid.rewards.gold}G</span>}
            {(raid.rewards?.exp || 0) > 0 && <span className="text-indigo-300">⭐ {raid.rewards.exp} EXP</span>}
            {(raid.rewards?.diamond || 0) > 0 && <span className="text-blue-300">💎 {raid.rewards.diamond}</span>}
          </div>
        </div>
      )}

      <div className="bg-slate-800 rounded-3xl border border-slate-700 p-6 w-full max-w-4xl mb-5 shadow-lg text-left">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <div className="text-sm text-slate-400 font-bold">문제별 확인</div>
            <h3 className="text-2xl font-extrabold text-white">내가 틀린 문제와 정답</h3>
          </div>
          <span className={'rounded-full px-4 py-1.5 text-sm font-extrabold ' + (wrongDetails.length ? 'bg-rose-500/15 text-rose-300' : 'bg-emerald-500/15 text-emerald-300')}>
            오답 {wrongDetails.length}개
          </span>
        </div>

        {answerDetails.length === 0 ? (
          <div className="rounded-2xl bg-slate-900/70 border border-slate-700 p-6 text-base text-slate-400 text-center">
            문제별 기록은 새로 진행한 보스레이드부터 표시됩니다.
          </div>
        ) : wrongDetails.length === 0 ? (
          <div className="rounded-2xl bg-emerald-950/40 border border-emerald-700/60 p-6 text-base font-bold text-emerald-200 text-center">
            모든 문제를 맞혔습니다.
          </div>
        ) : (
          <div className="space-y-4 max-h-[28rem] overflow-y-auto pr-2">
            {wrongDetails.map((detail, index) => (
              <div key={detail.questionKey || index} className="rounded-2xl border border-rose-800/70 bg-rose-950/30 p-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="text-sm font-extrabold text-rose-300">Q{(detail.questionIdx ?? index) + 1}</span>
                  <span className="rounded-full bg-slate-900/70 px-3 py-1 text-xs font-bold text-slate-400">
                    오답 노트 저장됨
                  </span>
                </div>
                <p className="text-base font-extrabold leading-7 text-white md:text-lg">{renderMath(detail.question || '')}</p>
                {detail.shape && <div className="mt-3 rounded-xl bg-white/95 p-3"><ShapeRenderer shape={detail.shape} /></div>}
                <div className="mt-4 grid gap-2 text-sm font-bold md:text-base">
                  <div className="text-rose-200">내 답: {renderMath(detail.selectedAnswer || '선택하지 않음')}</div>
                  <div className="text-emerald-200">정답: {renderMath(detail.correctAnswer || '')}</div>
                  {cleanExplanation(detail.explanation) && (
                    <div className="mt-2 rounded-xl bg-slate-950/50 p-3 text-slate-300 font-medium leading-6">
                      {renderMath(cleanExplanation(detail.explanation))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {onGoToIntro && (
        <button
          onClick={onGoToIntro}
          className="mt-2 mb-2 px-8 py-3 bg-slate-700 hover:bg-slate-600 active:scale-95 text-white font-bold rounded-2xl transition-all">
          🏠 초기화면으로
        </button>
      )}

      {sorted.length > 0 && (
        <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-xs overflow-hidden shadow-lg">
          <div className="px-4 py-2 bg-slate-700 text-xs font-bold text-slate-300">
            참가자 기여도 ({sorted.length}명)
          </div>
          <div className="divide-y divide-slate-700 max-h-52 overflow-y-auto">
            {sorted.map((p, idx) => (
              <div key={p.id} className={'flex items-center gap-3 px-4 py-2.5 ' + (p.id === myId ? 'bg-indigo-900/30' : '')}>
                <span className="text-xs font-extrabold text-slate-500 w-5">{idx + 1}</span>
                {p.characterImage
                  ? <img src={p.characterImage} alt="" className="w-7 h-7 rounded-lg object-contain bg-slate-700" />
                  : <div className="w-7 h-7 rounded-lg bg-slate-700 flex items-center justify-center text-sm">🧑</div>
                }
                <span className="flex-1 text-sm font-bold text-slate-200 truncate">
                  {p.name || '학생'} {p.id === myId && <span className="text-indigo-400 text-[10px]">(나)</span>}
                </span>
                <div className="text-right shrink-0">
                  <div className="text-xs font-extrabold text-rose-400">💥 {(p.totalDamage || 0).toLocaleString()}</div>
                  <div className="text-[10px] text-slate-500">{p.correctCount || 0}정답</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function BossRaid({
  studentCode,
  studentDocId: studentDocIdProp,
  isTeacher = false,
  selectedClass = null,
  onExit,
  presentationMode = false,
  presentationRosterCodes = [],
  externalPresentationRaidId = null,
}) {
  const normalizedStudentCode = normalizeStudentCode(studentCode);
  const [resolvedStudentDocId, setResolvedStudentDocId] = useState(null);
  const studentDocId = studentDocIdProp || resolvedStudentDocId;
  const [raid, setRaid]           = useState(undefined); // undefined=로딩, null=없음
  const [studentData, setStudentData] = useState(null);
  const activeRaidParticipantId = findParticipantIdByStudentCode(raid?.participants, normalizedStudentCode);
  const activeStudentId = activeRaidParticipantId || studentDocId;
  const [raidScope, setRaidScope] = useState({ classId: null, teacherUid: null });
  const [showIntro, setShowIntro] = useState(!isTeacher && !presentationMode);
  const [presentationError, setPresentationError] = useState(null);

  // 내 답변 상태 (로컬)
  const [myAnswer, setMyAnswer]   = useState(null);  // { idx, correct } | null
  const [bossAnim, setBossAnim]   = useState('idle');
  const [bossAnimKey, setBossAnimKey] = useState(0);
  const [bossFlash, setBossFlash] = useState(false);
  const [timeLeft, setTimeLeft]   = useState(null);
  const [changingBoss, setChangingBoss] = useState(false);

  const prevHpRef          = useRef(null);
  const advancedRef        = useRef(-1);
  const timerRef           = useRef(null);
  const raidRef            = useRef(null);
  const autoPayingRaidRef  = useRef(null);
  const presentationCreatingRef = useRef(false);
  const autoParticipantTimersRef = useRef(new Set());
  const scheduledAutoAnswerKeysRef = useRef(new Set());
  const autoAnsweredQuestionsRef = useRef(new Set());
  const answerSubmittingRef = useRef(false);
  const presentationRosterKey = presentationRosterCodes.map(normalizeStudentCode).filter(Boolean).join('|');
  const [presentationRaidId, setPresentationRaidId] = useState(externalPresentationRaidId || null);
  const [presentationRetryKey, setPresentationRetryKey] = useState(0);

  useEffect(() => {
    if (!presentationMode || !externalPresentationRaidId) return;
    setPresentationRaidId(externalPresentationRaidId);
    setPresentationError(null);
    setRaid(undefined);
  }, [presentationMode, externalPresentationRaidId]);

  useEffect(() => {
    if (studentDocIdProp || !normalizedStudentCode) {
      if (studentDocIdProp) setResolvedStudentDocId(null);
      return;
    }

    let cancelled = false;
    const loadStudentDocId = async () => {
      const codeAliases = Array.from(new Set([normalizedStudentCode, normalizedStudentCode.toLowerCase()]));
      try {
        const snap = await getDocs(query(collection(db, 'students'), where('studentCode', 'in', codeAliases)));
        if (cancelled) return;
        setResolvedStudentDocId(snap.empty ? null : snap.docs[0].id);
      } catch (error) {
        console.error('Boss raid student lookup failed:', error);
        if (!cancelled) setResolvedStudentDocId(null);
      }
    };

    loadStudentDocId();
    return () => {
      cancelled = true;
    };
  }, [studentDocIdProp, normalizedStudentCode]);

  // 학생 데이터 로드
  useEffect(() => {
    if (!studentDocId) return;
    getDoc(doc(db, 'students', studentDocId)).then(snap => {
      if (!snap.exists()) return;
      const data = { id: snap.id, ...snap.data() };
      setStudentData(data);
      setRaidScope({
        classId: data.classId || null,
        teacherUid: data.teacherUid || null,
      });
    });
  }, [studentDocId]);

  useEffect(() => {
    if (!isTeacher && !presentationMode) return;
    if (presentationMode && studentDocId) return;
    setRaidScope({
      classId: selectedClass?.id || null,
      teacherUid: selectedClass?.teacherUid || null,
    });
  }, [isTeacher, presentationMode, studentDocId, selectedClass?.id, selectedClass?.teacherUid]);

  // raidRef 최신 raid 추적 (언마운트 시 사용)
  useEffect(() => { raidRef.current = raid; }, [raid]);

  useEffect(() => {
    if (!presentationMode) return;
    if (externalPresentationRaidId) return;

    const classId = selectedClass?.id || raidScope.classId || null;
    const teacherUid = selectedClass?.teacherUid || raidScope.teacherUid || null;
    if ((!classId && !teacherUid) || presentationRaidId || presentationCreatingRef.current) return;

    let cancelled = false;
    presentationCreatingRef.current = true;
    setPresentationError(null);
    setRaid(undefined);

    createPresentationTestRaid({
      classId,
      teacherUid,
      rosterCodes: presentationRosterCodes.map(normalizeStudentCode).filter(Boolean),
    })
      .then((ref) => {
        if (!cancelled) setPresentationRaidId(ref.id);
      })
      .catch((error) => {
        console.error('Boss raid presentation test creation failed:', error);
        if (!cancelled) {
          setPresentationError(error?.message || '발표 테스트 레이드를 만들지 못했습니다.');
          setRaid(null);
        }
      })
      .finally(() => {
        presentationCreatingRef.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [
    presentationMode,
    presentationRaidId,
    presentationRetryKey,
    presentationRosterKey,
    selectedClass?.id,
    selectedClass?.teacherUid,
    raidScope.classId,
    raidScope.teacherUid,
  ]);

  // 페이지 이탈 시 대기실에서 자동 제거
  useEffect(() => {
    return () => {
      const r = raidRef.current;
      if (isTeacher || !r || r.status !== 'waiting' || !studentDocId) return;
      updateDoc(doc(db, 'worldBossRaids', r.id), {
        [`participants.${studentDocId}`]: deleteField(),
      }).catch(() => {});
    };
  }, []);

  // 레이드 실시간 리스닝 (컬렉션 전체 — 소규모)
  useEffect(() => {
    if (presentationMode) {
      if (!presentationRaidId) {
        setRaid(undefined);
        return () => {};
      }

      const raidDocRef = doc(db, 'worldBossRaids', presentationRaidId);
      const unsub = onSnapshot(raidDocRef, snap => {
        setRaid(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      }, error => {
        console.error('Boss raid presentation snapshot failed:', error);
        setPresentationError(error?.message || '발표 테스트 레이드를 불러오지 못했습니다.');
        setRaid(null);
      });
      return () => unsub();
    }

    const classId = raidScope.classId || null;
    const teacherUid = raidScope.teacherUid || null;
    const raidQuery = classId
      ? query(collection(db, 'worldBossRaids'), where('classId', '==', classId))
      : teacherUid
      ? query(collection(db, 'worldBossRaids'), where('teacherUid', '==', teacherUid))
      : null;

    if (!raidQuery) {
      setRaid(null);
      return () => {};
    }

    const unsub = onSnapshot(raidQuery, snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(r => !r.presentationTest)
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

      // 1순위: waiting/active
      const open = all.find(r => r.status === 'waiting' || r.status === 'active');
      if (open) { setRaid(open); return; }

      // 2순위: 최근 ended
      // - 교사: 가장 최근 종료 레이드
      // - 학생: 내가 참여한 최근 종료 레이드
      const ended = isTeacher
        ? all.find(r => r.status === 'cleared' || r.status === 'failed')
        : all.find(r =>
            (r.status === 'cleared' || r.status === 'failed') &&
            r.participants?.[studentDocId]
          );

      setRaid(ended || null);
    });
    return () => unsub();
  }, [studentDocId, isTeacher, raidScope.classId, raidScope.teacherUid, presentationMode, presentationRaidId]);

  // 대기실 자동 입장 (교사 모드에서는 참가자로 등록 안 함)
  useEffect(() => {
    if (isTeacher) return;
    if (!raid || raid.status !== 'waiting' || !studentDocId || !studentData) return;
    if (raid.participants?.[studentDocId]) return;
    updateDoc(doc(db, 'worldBossRaids', raid.id), {
      [`participants.${studentDocId}`]: {
        name:               studentData.name || studentData.studentCode || '학생',
        studentCode:        studentData.studentCode || normalizedStudentCode || '',
        characterImage:     studentData.characterImage || '',
        joinedAt:           serverTimestamp(),
        totalDamage:        0,
        correctCount:       0,
        wrongCount:         0,
        answeredCount:      0,
        lastAnsweredIdx:    -1,
        lastAnsweredCorrect: false,
      },
    }).catch(() => {});
  }, [raid?.id, raid?.status, studentDocId, studentData, isTeacher, normalizedStudentCode]);

  useEffect(() => {
    if (!presentationMode || !raid?.id) return;
    if (raid.status !== 'waiting' && raid.status !== 'active') return;

    const rosterCodes = presentationRosterCodes.map(normalizeStudentCode).filter(Boolean);
    if (rosterCodes.length === 0) return;

    let cancelled = false;
    const syncPresentationRoster = async () => {
      try {
        const aliases = Array.from(new Set([
          ...rosterCodes,
          ...rosterCodes.map(code => code.toLowerCase()),
        ]));
        const snaps = await Promise.all(
          chunkArray(aliases, 10).map(chunk =>
            getDocs(query(collection(db, 'students'), where('studentCode', 'in', chunk)))
          )
        );
        if (cancelled) return;

        const byCode = new Map();
        snaps.forEach(snap => {
          snap.docs.forEach(studentDoc => {
            const data = studentDoc.data();
            byCode.set(normalizeStudentCode(data.studentCode), {
              id: studentDoc.id,
              ...data,
            });
          });
        });

        const updates = {};
        rosterCodes.forEach((code) => {
          const student = byCode.get(code);
          const participantId = student?.id || code;
          const seatNumber = Number(code.slice(-2)) || 0;
          const existing = raid.participants?.[participantId];
          if (existing) {
            updates[`participants.${participantId}`] = {
              ...existing,
              name: existing.name || student?.name || `${seatNumber}번 학생`,
              studentCode: existing.studentCode || code,
              characterImage: existing.characterImage || student?.characterImage || '',
              presentationTest: true,
            };
            return;
          }

          updates[`participants.${participantId}`] = {
            name: student?.name || `${seatNumber}번 학생`,
            studentCode: code,
            characterImage: student?.characterImage || '',
            joinedAt: serverTimestamp(),
            totalDamage: 0,
            correctCount: 0,
            wrongCount: 0,
            answeredCount: 0,
            lastAnsweredIdx: -1,
            lastAnsweredCorrect: false,
            presentationTest: true,
          };
        });

        if (Object.keys(updates).length > 0) {
          await updateDoc(doc(db, 'worldBossRaids', raid.id), updates);
        }
      } catch (error) {
        console.error('Boss raid presentation roster sync failed:', error);
      }
    };

    syncPresentationRoster();
    return () => {
      cancelled = true;
    };
  }, [presentationMode, presentationRosterKey, raid?.id, raid?.status]);

  useEffect(() => {
    if (!presentationMode || !raid?.id || !normalizedStudentCode) return;
    if (raid.status !== 'waiting' && raid.status !== 'active') return;
    if (activeRaidParticipantId) return;

    const participantId = studentDocId || normalizedStudentCode;
    const seatNumber = Number(normalizedStudentCode.slice(-2)) || 15;
    updateDoc(doc(db, 'worldBossRaids', raid.id), {
      [`participants.${participantId}`]: {
        name: studentData?.name || `${seatNumber}번 학생`,
        studentCode: normalizedStudentCode,
        characterImage: studentData?.characterImage || '',
        joinedAt: serverTimestamp(),
        totalDamage: 0,
        correctCount: 0,
        wrongCount: 0,
        answeredCount: 0,
        lastAnsweredIdx: -1,
        lastAnsweredCorrect: false,
        presentationTest: true,
      },
    }).catch(error => console.error('Boss raid presentation player sync failed:', error));
  }, [
    presentationMode,
    raid?.id,
    raid?.status,
    normalizedStudentCode,
    activeRaidParticipantId,
    studentDocId,
    studentData,
  ]);

  // 인트로 화면에서 레이드가 active로 전환되면 자동 입장
  useEffect(() => {
    if (showIntro && raid?.status === 'active' && raid.participants?.[activeStudentId]) {
      setShowIntro(false);
    }
  }, [raid?.status, showIntro, activeStudentId]);

  // 문제 바뀌면 내 답변 초기화
  useEffect(() => {
    answerSubmittingRef.current = false;
    setMyAnswer(null);
    setBossAnim('idle');
    autoParticipantTimersRef.current.forEach(clearTimeout);
    autoParticipantTimersRef.current.clear();
    scheduledAutoAnswerKeysRef.current.clear();
  }, [raid?.currentQuestionIdx]);

  useEffect(() => () => {
    autoParticipantTimersRef.current.forEach(clearTimeout);
    autoParticipantTimersRef.current.clear();
    scheduledAutoAnswerKeysRef.current.clear();
  }, []);

  useEffect(() => {
    if (raid?.paused) {
      autoParticipantTimersRef.current.forEach(clearTimeout);
      autoParticipantTimersRef.current.clear();
      scheduledAutoAnswerKeysRef.current.clear();
    }
  }, [raid?.paused]);

  useEffect(() => {
    if (!presentationMode || !raid || raid.status !== 'active' || raid.finishing || raid.paused) return;
    const qIdx = raid.currentQuestionIdx;
    if (!Number.isInteger(qIdx) || qIdx < 0) return;

    const questions = (raid.questions || []).filter(q => q.type !== 'short');
    const q = questions[qIdx];
    if (!q) return;

    const participants = Object.entries(raid.participants || {})
      .filter(([id, participant]) =>
        id !== activeStudentId &&
        isPresentationAutoAnswerParticipant(id, participant) &&
        participant?.lastAnsweredIdx !== qIdx
      )
      .sort(([, a], [, b]) => (a.joinedAt?.seconds || 0) - (b.joinedAt?.seconds || 0));

    if (participants.length === 0) return;

    const questionDurationMs = Math.max(2000, Number(raid.questionDuration || 10) * 1000);
    const startDelayMs = Math.min(900, Math.round(questionDurationMs * 0.18));
    const endBufferMs = Math.min(1300, Math.round(questionDurationMs * 0.22));
    const spreadWindowMs = Math.max(600, questionDurationMs - startDelayMs - endBufferMs);
    const slotStepMs = participants.length > 1
      ? spreadWindowMs / (participants.length - 1)
      : 0;
    const jitterRangeMs = Math.min(220, Math.max(60, slotStepMs * 0.32));

    participants.forEach(([participantId], index) => {
      const autoKey = `${raid.id}:${qIdx}:${participantId}`;
      if (autoAnsweredQuestionsRef.current.has(autoKey)) return;
      if (scheduledAutoAnswerKeysRef.current.has(autoKey)) return;
      scheduledAutoAnswerKeysRef.current.add(autoKey);

      const slotDelayMs = startDelayMs + (slotStepMs * index);
      const jitterMs = Math.round((Math.random() - 0.5) * jitterRangeMs);
      const answerDelayMs = Math.max(450, Math.round(slotDelayMs + jitterMs));

      const timer = setTimeout(() => {
        autoParticipantTimersRef.current.delete(timer);
        scheduledAutoAnswerKeysRef.current.delete(autoKey);
        if (autoAnsweredQuestionsRef.current.has(autoKey)) return;
        autoAnsweredQuestionsRef.current.add(autoKey);
        const isCorrect = Math.random() < 0.9;
        const correctIdx = getCorrectIndex(q);
        const wrongOptions = (q.options || [])
          .map((_, optionIndex) => optionIndex)
          .filter(optionIndex => optionIndex !== correctIdx);
        const selectedIdx = isCorrect
          ? correctIdx
          : wrongOptions[Math.floor(Math.random() * wrongOptions.length)] ?? correctIdx;
        const raidDocRef = doc(db, 'worldBossRaids', raid.id);
        const currentHP = Math.max(0, Number(raid.currentHP) || 0);
        const maxHP = Math.max(1, Number(raid.maxHP) || 1);
        const currentPhase = Math.max(Number(raid.phase) || 1, getRaidPhase(currentHP, maxHP));
        const currentMorale = Math.max(0, Math.min(100, Number(raid.morale ?? 100)));
        const moralePenalty = getMoralePenalty(currentPhase);
        const moraleBroken = !isCorrect && currentMorale - moralePenalty <= 0;
        const baseDamage = Math.max(1, Number(raid.damagePerHit) || 100);
        const damage = isCorrect
          ? Math.min(currentHP, Math.round(baseDamage * (0.88 + Math.random() * 0.24)))
          : 0;
        const nextPhase = Math.max(currentPhase, getRaidPhase(Math.max(0, currentHP - damage), maxHP));
        const participantName = raid.participants?.[participantId]?.name || '학생';

        updateDoc(raidDocRef, {
          [`participants.${participantId}.answeredCount`]: increment(1),
          [`participants.${participantId}.correctCount`]: increment(isCorrect ? 1 : 0),
          [`participants.${participantId}.wrongCount`]: increment(isCorrect ? 0 : 1),
          [`participants.${participantId}.totalDamage`]: increment(damage),
          [`participants.${participantId}.lastAnsweredIdx`]: qIdx,
          [`participants.${participantId}.lastAnsweredCorrect`]: isCorrect,
          [`participants.${participantId}.lastDamage`]: damage,
          [`participants.${participantId}.lastHitCritical`]: false,
          [`participants.${participantId}.lastBreakTriggered`]: false,
          [`participants.${participantId}.lastMoraleBroken`]: moraleBroken,
          [`participants.${participantId}.lastSelectedIdx`]: selectedIdx,
          [`participants.${participantId}.qResults.${qIdx}`]: isCorrect ? 1 : 0,
          [`participants.${participantId}.answerDetails.q${qIdx}`]: {
            questionIdx: qIdx,
            questionKey: bossQuestionKey(raid, q, qIdx),
            selectedIdx,
            correctIdx,
            selectedAnswer: answerText(q, selectedIdx),
            correctAnswer: answerText(q, correctIdx),
            isCorrect,
            moraleBroken,
            autoAnswered: true,
            answeredAt: new Date().toISOString(),
          },
          ...(isCorrect ? { currentHP: increment(-damage), phase: nextPhase, breakGauge: increment(RAID_BREAK_GAIN) } : {}),
          ...(!isCorrect ? { morale: moraleBroken ? 30 : increment(-moralePenalty) } : {}),
          ...(moraleBroken ? {
            currentHP: Math.min(maxHP, currentHP + getBossSkillHealAmount(raid, currentPhase)),
            moraleBreakCount: increment(1),
            moraleBrokenAt: serverTimestamp(),
            questionDurationPenalty: increment(FOCUS_BREAK_TIME_PENALTY),
          } : {}),
          lastCombatEvent: {
            type: isCorrect ? 'partyHit' : moraleBroken ? 'moraleBreak' : 'partyMiss',
            participantId,
            participantName,
            questionIdx: qIdx,
            damage,
            phase: nextPhase,
            at: serverTimestamp(),
          },
        }).catch(error => console.error('Presentation participant auto answer failed:', error));
        return;

        runTransaction(db, async (transaction) => {
          const latestSnap = await transaction.get(raidDocRef);
          if (!latestSnap.exists()) return;

          const latest = latestSnap.data();
          const latestParticipant = latest.participants?.[participantId];
          if (
            latest.status !== 'active' ||
            latest.finishing ||
            latest.currentQuestionIdx !== qIdx ||
            !latestParticipant ||
            !isPresentationAutoAnswerParticipant(participantId, latestParticipant) ||
            latestParticipant.lastAnsweredIdx === qIdx
          ) {
            return;
          }

          const maxHP = Math.max(1, Number(latest.maxHP) || 1);
          const currentHP = Math.max(0, Number(latest.currentHP) || 0);
          const baseDamage = Math.max(1, Number(latest.damagePerHit) || 100);
          const currentPhase = Math.max(Number(latest.phase) || 1, getRaidPhase(currentHP, maxHP));
          const damage = isCorrect ? Math.min(currentHP, Math.round(baseDamage * (0.88 + Math.random() * 0.24))) : 0;
          const nextHP = isCorrect ? Math.max(0, currentHP - damage) : currentHP;
          const nextPhase = Math.max(currentPhase, getRaidPhase(nextHP, maxHP));
          const nextParticipant = {
            ...latestParticipant,
            answeredCount: (latestParticipant.answeredCount || 0) + 1,
            correctCount: (latestParticipant.correctCount || 0) + (isCorrect ? 1 : 0),
            wrongCount: (latestParticipant.wrongCount || 0) + (isCorrect ? 0 : 1),
            totalDamage: (latestParticipant.totalDamage || 0) + damage,
            lastAnsweredIdx: qIdx,
            lastAnsweredCorrect: isCorrect,
            lastDamage: damage,
            lastHitCritical: false,
            lastBreakTriggered: false,
            lastSelectedIdx: selectedIdx,
            qResults: {
              ...(latestParticipant.qResults || {}),
              [qIdx]: isCorrect ? 1 : 0,
            },
            answerDetails: {
              ...(latestParticipant.answerDetails || {}),
              [`q${qIdx}`]: {
                questionIdx: qIdx,
                questionKey: bossQuestionKey(latest, q, qIdx),
                selectedIdx,
                correctIdx,
                selectedAnswer: answerText(q, selectedIdx),
                correctAnswer: answerText(q, correctIdx),
                isCorrect,
                autoAnswered: true,
                answeredAt: new Date().toISOString(),
              },
            },
          };

          const updates = {
            [`participants.${participantId}`]: nextParticipant,
            lastCombatEvent: {
              type: isCorrect ? 'partyHit' : 'partyMiss',
              participantId,
              participantName: latestParticipant.name || '학생',
              questionIdx: qIdx,
              damage,
              phase: nextPhase,
              at: serverTimestamp(),
            },
          };

          if (isCorrect) {
            updates.currentHP = nextHP;
            updates.phase = nextPhase;
            if (nextHP <= 0) {
              updates.finishing = true;
              updates.finishingStartedAt = serverTimestamp();
              updates.finisherBy = latestParticipant.name || '학생';
            }
          }

          transaction.update(raidDocRef, updates);
        }).catch(error => console.error('Presentation participant auto answer failed:', error));
      }, answerDelayMs);

      autoParticipantTimersRef.current.add(timer);
    });
  }, [presentationMode, raid?.id, raid?.status, raid?.currentQuestionIdx, raid?.finishing, raid?.paused, raid?.participants, activeStudentId]);

  // 보스 HP 변화 → 피격 이펙트
  useEffect(() => {
    if (!raid || raid.status !== 'active') return;
    const previousHP = prevHpRef.current;
    prevHpRef.current = raid.currentHP;
    let impactTimer;
    let clearTimer;

    if (previousHP !== null && raid.currentHP < previousHP) {
      impactTimer = setTimeout(() => {
        setBossFlash(true);
      }, 180);
      clearTimer = setTimeout(() => setBossFlash(false), 560);
    }

    return () => {
      clearTimeout(impactTimer);
      clearTimeout(clearTimer);
    };
  }, [raid?.currentHP]);

  // 마지막 일격 연출이 끝난 뒤 클리어를 확정한다.
  useEffect(() => {
    if (!raid?.finishing || raid.status !== 'active') return undefined;
    const startedAt = raid.finishingStartedAt?.toDate?.()?.getTime?.() ?? Date.now();
    const remaining = Math.max(0, RAID_FINISHER_DURATION_MS - (Date.now() - startedAt));
    const timer = setTimeout(() => {
      const raidDocRef = doc(db, 'worldBossRaids', raid.id);
      runTransaction(db, async (transaction) => {
        const latestSnap = await transaction.get(raidDocRef);
        if (!latestSnap.exists()) return;
        const latest = latestSnap.data();
        if (latest.status !== 'active' || !latest.finishing) return;
        transaction.update(raidDocRef, {
          currentHP: 0,
          finishing: false,
          status: 'cleared',
          clearedAt: serverTimestamp(),
        });
      }).catch(error => console.error('보스레이드 마지막 일격 완료 오류:', error));
    }, remaining);
    return () => clearTimeout(timer);
  }, [raid?.id, raid?.status, raid?.finishing, raid?.finishingStartedAt]);

  // 클리어/실패 시 보스 애니
  useEffect(() => {
    if (raid?.status === 'cleared') setBossAnim('death');
  }, [raid?.status]);

  // 클리어 시 교사 화면에서 보상 자동 지급
  useEffect(() => {
    if (!isTeacher || !raid || raid.status !== 'cleared' || raid.rewardsPaid || raid.presentationTest) return;
    if (autoPayingRaidRef.current === raid.id) return;
    autoPayingRaidRef.current = raid.id;

    const payRewards = async () => {
      try {
        const participantIds = Object.keys(raid.participants || {});
        const raidRefDoc = doc(db, 'worldBossRaids', raid.id);

        if (participantIds.length === 0) {
          await updateDoc(raidRefDoc, { rewardsPaid: true, rewardsPaidAt: serverTimestamp() });
          return;
        }

        const studentsSnap = await getDocs(collection(db, 'students'));
        const allStudents = {};
        studentsSnap.docs.forEach(s => { allStudents[s.id] = s.data(); });

        const batch = writeBatch(db);
        participantIds.forEach((sid) => {
          const s = allStudents[sid];
          if (!s) return;
          const nextProgress = applyExpDelta(s.level ?? 1, s.exp ?? 0, raid.rewards?.exp || 0);
          batch.update(doc(db, 'students', sid), {
            gold:     (s.gold     || 0) + (raid.rewards?.gold    || 0),
            diamonds: (s.diamonds || 0) + (raid.rewards?.diamond || 0),
            level:    nextProgress.level,
            exp:      nextProgress.exp,
            maxExp:   nextProgress.maxExp,
          });
        });

        batch.update(raidRefDoc, { rewardsPaid: true, rewardsPaidAt: serverTimestamp() });
        await batch.commit();
      } catch (err) {
        console.error('Boss raid auto reward failed:', err);
        autoPayingRaidRef.current = null;
      }
    };

    payRewards();
  }, [isTeacher, raid?.id, raid?.status, raid?.rewardsPaid]);

  // 타이머
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (raid?.paused) {
      setTimeLeft(Math.max(0, Number(raid.pausedTimeLeft) || 0));
      return;
    }
    if (!raid || raid.status !== 'active' || raid.finishing || !raid.questionStartedAt) {
      setTimeLeft(null);
      return;
    }
    const tick = () => {
      const started = raid.questionStartedAt.toDate?.()?.getTime?.() ?? Date.now();
      const elapsed = (Date.now() - started) / 1000;
      const dur     = raid.questionDuration || 20;
      const left    = Math.max(0, Math.ceil(dur - elapsed));
      setTimeLeft(left);
      if (left === 0 && raid.autoAdvance) tryAdvance();
    };
    tick();
    timerRef.current = setInterval(tick, 500);
    return () => clearInterval(timerRef.current);
  }, [raid?.currentQuestionIdx, raid?.questionStartedAt, raid?.questionDuration, raid?.finishing, raid?.paused, raid?.pausedTimeLeft]);

  const tryAdvance = async () => {
    if (!raid || raid.status !== 'active' || raid.finishing || raid.paused) return;
    if (advancedRef.current === raid.currentQuestionIdx) return;
    advancedRef.current = raid.currentQuestionIdx;

    const questions = (raid.questions || []).filter(q => q.type !== 'short');
    const nextIdx   = raid.currentQuestionIdx + 1;
    const baseQuestionDuration = Math.max(1, Number(raid.baseQuestionDuration || raid.questionDuration || 20));
    const durationPenalty = Math.max(0, Number(raid.questionDurationPenalty) || 0);
    const nextQuestionDuration = Math.max(QUESTION_DURATION_MIN, baseQuestionDuration - durationPenalty);

    if (nextIdx >= questions.length || raid.currentHP <= 0) {
      updateDoc(doc(db, 'worldBossRaids', raid.id), {
        status: raid.currentHP <= 0 ? 'cleared' : 'failed',
        clearedAt: serverTimestamp(),
        paused: false,
        pausedTimeLeft: deleteField(),
        pausedAt: deleteField(),
      }).catch(() => {});
    } else {
      updateDoc(doc(db, 'worldBossRaids', raid.id), {
        currentQuestionIdx: nextIdx,
        questionStartedAt:  serverTimestamp(),
        questionDuration: nextQuestionDuration,
        baseQuestionDuration,
        paused: false,
        pausedTimeLeft: deleteField(),
        pausedAt: deleteField(),
      }).catch(() => {});
    }
  };

  const togglePresentationPause = async () => {
    if (!presentationMode || !raid?.id || raid.status !== 'active' || raid.finishing) return;
    const raidDocRef = doc(db, 'worldBossRaids', raid.id);
    const baseQuestionDuration = Math.max(1, Number(raid.baseQuestionDuration || raid.questionDuration || 12));

    if (raid.paused) {
      const remaining = Math.max(1, Math.min(baseQuestionDuration, Number(raid.pausedTimeLeft || timeLeft || baseQuestionDuration)));
      await updateDoc(raidDocRef, {
        paused: false,
        pausedTimeLeft: deleteField(),
        pausedAt: deleteField(),
        questionStartedAt: serverTimestamp(),
        questionDuration: remaining,
        baseQuestionDuration,
      }).catch(error => console.error('Boss raid presentation resume failed:', error));
      return;
    }

    let remaining = Number(timeLeft);
    if (!Number.isFinite(remaining) || remaining <= 0) {
      const started = raid.questionStartedAt?.toDate?.()?.getTime?.() ?? Date.now();
      const elapsed = (Date.now() - started) / 1000;
      remaining = Math.max(0, Math.ceil((Number(raid.questionDuration) || baseQuestionDuration) - elapsed));
    }

    await updateDoc(raidDocRef, {
      paused: true,
      pausedAt: serverTimestamp(),
      pausedTimeLeft: Math.max(0, remaining),
      baseQuestionDuration,
    }).catch(error => console.error('Boss raid presentation pause failed:', error));
  };

  const applyBossSkillPenalty = async ({ questionIdx, wrongCount, phase: skillPhase }) => {
    if (!raid?.id || raid.status !== 'active' || raid.finishing || raid.paused) return;
    const raidDocRef = doc(db, 'worldBossRaids', raid.id);

    await runTransaction(db, async (transaction) => {
      const latestSnap = await transaction.get(raidDocRef);
      if (!latestSnap.exists()) return;

      const latest = latestSnap.data();
      if (
        latest.status !== 'active' ||
        latest.finishing ||
        latest.paused ||
        latest.currentQuestionIdx !== questionIdx ||
        latest.bossSkillApplied?.[`q${questionIdx}`]
      ) {
        return;
      }

      const maxHP = Math.max(1, Number(latest.maxHP) || 1);
      const currentHP = Math.max(0, Number(latest.currentHP) || 0);
      const phase = Math.max(Number(skillPhase) || 1, Number(latest.phase) || 1, getRaidPhase(currentHP, maxHP));
      const morale = Math.max(0, Math.min(100, Number(latest.morale ?? 100)));
      const focusPenalty = getBossSkillMoralePenalty(phase, wrongCount);
      const moraleBroken = morale - focusPenalty <= 0;
      const nextMorale = moraleBroken ? 30 : Math.max(0, morale - focusPenalty);
      const healAmount = getBossSkillHealAmount(latest, phase);
      const nextHP = Math.min(maxHP, currentHP + healAmount);
      const actualHeal = Math.max(0, nextHP - currentHP);

      const updates = {
        [`bossSkillApplied.q${questionIdx}`]: true,
        morale: nextMorale,
        currentHP: nextHP,
        lastBossSkillAt: serverTimestamp(),
        lastCombatEvent: {
          type: moraleBroken ? 'bossSkillFocusBreak' : 'bossSkill',
          questionIdx,
          wrongCount,
          focusPenalty,
          healAmount: actualHeal,
          phase,
          at: serverTimestamp(),
        },
      };

      if (moraleBroken) {
        updates.moraleBreakCount = (Number(latest.moraleBreakCount) || 0) + 1;
        updates.moraleBrokenAt = serverTimestamp();
        updates.questionDurationPenalty = (Number(latest.questionDurationPenalty) || 0) + FOCUS_BREAK_TIME_PENALTY;
      }

      transaction.update(raidDocRef, updates);
    }).catch(error => console.error('Boss raid boss skill penalty failed:', error));
  };

  const changePresentationBoss = async () => {
    if (!presentationMode || !raid?.id || changingBoss || PRESENTATION_BOSS_IDS.length === 0) return;

    const currentBossId = resolveCanonicalBossId(raid) || raid.bossId;
    const currentIndex = PRESENTATION_BOSS_IDS.indexOf(currentBossId);
    const nextBossId = currentIndex >= 0
      ? PRESENTATION_BOSS_IDS[(currentIndex + 1) % PRESENTATION_BOSS_IDS.length]
      : PRESENTATION_BOSS_IDS[0];
    const nextBoss = MONSTERS_DB[nextBossId];
    if (!nextBoss) return;

    setChangingBoss(true);
    try {
      await updateDoc(doc(db, 'worldBossRaids', raid.id), {
        bossId: nextBossId,
        bossName: nextBoss.name || nextBossId,
        bossBg: resolveBossBackground(nextBossId) || null,
        bossChangedAt: serverTimestamp(),
      });
      setBossAnim('idle');
      setBossAnimKey(current => current + 1);
    } catch (error) {
      console.error('Boss raid presentation boss change failed:', error);
    } finally {
      setChangingBoss(false);
    }
  };

  const submitAnswer = async (answerIdx) => {
    if (!raid || !activeStudentId || raid.status !== 'active' || raid.paused) return;
    if (myAnswer !== null) return;
    if (answerSubmittingRef.current) return;

    const myP = raid.participants?.[activeStudentId];
    if (myP?.lastAnsweredIdx === raid.currentQuestionIdx) return;

    const questions = (raid.questions || []).filter(q => q.type !== 'short');
    const q = questions[raid.currentQuestionIdx];
    if (!q) return;

    const correctIdx = getCorrectIndex(q);
    const correct = answerIdx === correctIdx;
    const questionKey = bossQuestionKey(raid, q, raid.currentQuestionIdx);
    const detail = {
      questionIdx: raid.currentQuestionIdx,
      questionKey,
      question: q.question || '',
      type: q.type || 'mc',
      options: q.options || [],
      selectedIdx: answerIdx,
      correctIdx,
      selectedAnswer: answerText(q, answerIdx),
      correctAnswer: answerText(q, correctIdx),
      explanation: cleanExplanation(q.explanation || ''),
      shape: q.shape || null,
      table: q.table || null,
      isCorrect: correct,
      answeredAt: new Date().toISOString(),
    };
    const raidDocRef = doc(db, 'worldBossRaids', raid.id);
    answerSubmittingRef.current = true;

    if (presentationMode) {
      const currentHP = Math.max(0, Number(raid.currentHP) || 0);
      const maxHP = Math.max(1, Number(raid.maxHP) || 1);
      const currentPhase = Math.max(Number(raid.phase) || 1, getRaidPhase(currentHP, maxHP));
      const baseDamage = Math.max(1, Number(raid.damagePerHit) || 100);
      const damage = correct
        ? Math.min(currentHP, Math.round(baseDamage * getPhaseDamageMultiplier(currentPhase)))
        : 0;
      const nextHP = Math.max(0, currentHP - damage);
      const currentMorale = Math.max(0, Math.min(100, Number(raid.morale ?? 100)));
      const currentBreakGauge = Math.max(0, Number(raid.breakGauge) || 0);
      const nextBreakGaugeRaw = correct ? currentBreakGauge + RAID_BREAK_GAIN : currentBreakGauge;
      const breakTriggered = correct && nextBreakGaugeRaw > 0 && nextBreakGaugeRaw % RAID_BREAK_MAX === 0;
      const nextMorale = correct
        ? Math.min(100, currentMorale + 1)
        : Math.max(0, currentMorale - getMoralePenalty(currentPhase));
      const moraleBroken = !correct && nextMorale <= 0;
      const focusBreakHeal = moraleBroken ? getBossSkillHealAmount(raid, currentPhase) : 0;
      const resolvedNextHP = moraleBroken ? Math.min(maxHP, nextHP + focusBreakHeal) : nextHP;
      const nextPhase = Math.max(currentPhase, getRaidPhase(resolvedNextHP, maxHP));

      setMyAnswer({ idx: answerIdx, correct, damage, critical: false, breakTriggered, moraleBroken });

      const updates = {
        [`participants.${activeStudentId}.answeredCount`]: increment(1),
        [`participants.${activeStudentId}.correctCount`]: increment(correct ? 1 : 0),
        [`participants.${activeStudentId}.wrongCount`]: increment(correct ? 0 : 1),
        [`participants.${activeStudentId}.totalDamage`]: increment(damage),
        [`participants.${activeStudentId}.lastAnsweredIdx`]: raid.currentQuestionIdx,
        [`participants.${activeStudentId}.lastAnsweredCorrect`]: correct,
        [`participants.${activeStudentId}.lastDamage`]: damage,
        [`participants.${activeStudentId}.lastHitCritical`]: false,
        [`participants.${activeStudentId}.lastBreakTriggered`]: breakTriggered,
        [`participants.${activeStudentId}.lastMoraleBroken`]: moraleBroken,
        [`participants.${activeStudentId}.lastSelectedIdx`]: answerIdx,
        [`participants.${activeStudentId}.qResults.${raid.currentQuestionIdx}`]: correct ? 1 : 0,
        [`participants.${activeStudentId}.answerDetails.q${raid.currentQuestionIdx}`]: {
          ...detail,
          damage,
          critical: false,
          breakTriggered,
          moraleBroken,
        },
        morale: moraleBroken ? 30 : nextMorale,
        phase: nextPhase,
        lastCombatEvent: {
          type: correct ? 'hit' : moraleBroken ? 'moraleBreak' : 'miss',
          participantId: activeStudentId,
          participantName: myP?.name || '테스트계정',
          questionIdx: raid.currentQuestionIdx,
          damage,
          phase: nextPhase,
          at: serverTimestamp(),
        },
      };

      if (correct) updates.currentHP = increment(-damage);
      if (correct) updates.breakGauge = increment(RAID_BREAK_GAIN);
      if (correct && nextHP <= 0) {
        updates.finishing = true;
        updates.finishingStartedAt = serverTimestamp();
        updates.finisherBy = myP?.name || '테스트계정';
      }
      if (breakTriggered) {
        updates.breakCount = increment(1);
        updates.breakTriggeredAt = serverTimestamp();
      }
      if (moraleBroken) {
        updates.currentHP = resolvedNextHP;
        updates.moraleBreakCount = increment(1);
        updates.moraleBrokenAt = serverTimestamp();
        updates.questionDurationPenalty = increment(FOCUS_BREAK_TIME_PENALTY);
      }

      await updateDoc(raidDocRef, updates).catch((error) => {
        console.error('Boss raid presentation answer failed:', error);
        answerSubmittingRef.current = false;
        setMyAnswer(null);
      });
      return;
    }

    const combatResult = await runTransaction(db, async (transaction) => {
      const latestSnap = await transaction.get(raidDocRef);
      if (!latestSnap.exists()) return { accepted: false };

      const latest = latestSnap.data();
      const latestParticipant = latest.participants?.[activeStudentId];
      if (
        latest.status !== 'active' || latest.finishing ||
        !latestParticipant || latestParticipant.lastAnsweredIdx === latest.currentQuestionIdx ||
        latest.currentQuestionIdx !== raid.currentQuestionIdx
      ) {
        return { accepted: false };
      }

      const maxHP = Math.max(1, Number(latest.maxHP) || 1);
      const currentHP = Math.max(0, Number(latest.currentHP) || 0);
      const currentPhase = Math.max(Number(latest.phase) || 1, getRaidPhase(currentHP, maxHP));
      const currentMorale = Math.max(0, Math.min(100, Number(latest.morale ?? 100)));
      const currentCombo = Math.max(0, Number(latest.combo) || 0);
      const currentBreakGauge = Math.max(0, Number(latest.breakGauge) || 0);
      const baseDamage = Math.max(1, Number(latest.damagePerHit) || 100);

      let nextHP = currentHP;
      let nextMorale;
      const nextCombo = correct ? currentCombo + 1 : 0;
      let nextBreakGauge = currentBreakGauge;
      let damage = 0;
      let critical = false;
      let breakTriggered = false;
      let moraleBroken = false;

      if (correct) {
        critical = nextCombo % 5 === 0;
        nextBreakGauge += RAID_BREAK_GAIN;
        breakTriggered = nextBreakGauge >= RAID_BREAK_MAX;
        if (breakTriggered) nextBreakGauge -= RAID_BREAK_MAX;

        const moraleMultiplier = currentMorale <= 50 ? 0.85 : 1;
        damage = Math.max(1, Math.round(
          baseDamage * getPhaseDamageMultiplier(currentPhase) * moraleMultiplier +
          (critical ? baseDamage * 0.5 : 0) +
          (breakTriggered ? baseDamage : 0)
        ));
        damage = Math.min(currentHP, damage);
        nextHP = Math.max(0, currentHP - damage);
        nextMorale = Math.min(100, currentMorale + 1);
      } else {
        nextMorale = currentMorale - getMoralePenalty(currentPhase);
        if (nextMorale <= 0) {
          moraleBroken = true;
          nextMorale = 30;
          const healAmount = Math.max(10, Number(latest.penaltyAmount) || Math.round(baseDamage * 0.5));
          nextHP = Math.min(maxHP, currentHP + healAmount);
        }
      }

      const nextPhase = Math.max(currentPhase, getRaidPhase(nextHP, maxHP));
      const finishing = correct && nextHP <= 0;
      const nextParticipant = {
        ...latestParticipant,
        answeredCount: (latestParticipant.answeredCount || 0) + 1,
        correctCount: (latestParticipant.correctCount || 0) + (correct ? 1 : 0),
        wrongCount: (latestParticipant.wrongCount || 0) + (correct ? 0 : 1),
        totalDamage: (latestParticipant.totalDamage || 0) + damage,
        lastAnsweredIdx: latest.currentQuestionIdx,
        lastAnsweredCorrect: correct,
        lastDamage: damage,
        lastHitCritical: critical,
        lastBreakTriggered: breakTriggered,
        lastMoraleBroken: moraleBroken,
        qResults: {
          ...(latestParticipant.qResults || {}),
          [latest.currentQuestionIdx]: correct ? 1 : 0,
        },
        answerDetails: {
          ...(latestParticipant.answerDetails || {}),
          [`q${latest.currentQuestionIdx}`]: { ...detail, damage, critical, breakTriggered, moraleBroken },
        },
      };

      const updates = {
        [`participants.${activeStudentId}`]: nextParticipant,
        currentHP: nextHP,
        morale: nextMorale,
        combo: nextCombo,
        maxCombo: Math.max(Number(latest.maxCombo) || 0, nextCombo),
        breakGauge: nextBreakGauge,
        phase: nextPhase,
        lastCombatEvent: {
          type: correct ? (breakTriggered ? 'break' : critical ? 'critical' : 'hit') : moraleBroken ? 'moraleBreak' : 'miss',
          participantId: activeStudentId,
          participantName: latestParticipant.name || '학생',
          questionIdx: latest.currentQuestionIdx,
          damage,
          phase: nextPhase,
          at: serverTimestamp(),
        },
      };

      if (breakTriggered) {
        updates.breakCount = (Number(latest.breakCount) || 0) + 1;
        updates.breakTriggeredAt = serverTimestamp();
      }
      if (moraleBroken) {
        updates.moraleBreakCount = (Number(latest.moraleBreakCount) || 0) + 1;
        updates.moraleBrokenAt = serverTimestamp();
        updates.questionDurationPenalty = (Number(latest.questionDurationPenalty) || 0) + FOCUS_BREAK_TIME_PENALTY;
      }
      if (nextPhase > currentPhase) updates.phaseChangedAt = serverTimestamp();
      if (finishing) {
        updates.finishing = true;
        updates.finishingStartedAt = serverTimestamp();
        updates.finisherBy = latestParticipant.name || '학생';
      }

      transaction.update(raidDocRef, updates);
      return { accepted: true, damage, critical, breakTriggered, moraleBroken };
    }).catch((error) => {
      console.error('보스레이드 전투 처리 오류:', error);
      return { accepted: false };
    });

    if (!combatResult?.accepted) {
      answerSubmittingRef.current = false;
      return;
    }
    setMyAnswer({
      idx: answerIdx,
      correct,
      damage: combatResult.damage,
      critical: combatResult.critical,
      breakTriggered: combatResult.breakTriggered,
      moraleBroken: combatResult.moraleBroken,
    });

    if (!correct) {
      const code = studentData?.studentCode || studentCode || activeStudentId;
      const wrongRef = doc(db, 'aiWrongAnswers', wrongAnswerDocId(code, questionKey));
      const previousSnap = await getDoc(wrongRef).catch(() => null);
      const previous = previousSnap?.exists?.() ? previousSnap.data() : {};
      await setDoc(wrongRef, {
        studentCode: code,
        studentName: studentData?.name || code,
        teacherUid: studentData?.teacherUid || raid.teacherUid || '',
        classId: studentData?.classId || raid.classId || '',
        source: 'bossRaid',
        unitName: '보스레이드',
        lessonTitle: raid.title || raid.bossName || '보스레이드',
        lessonKey: `bossRaid_${raid.id}`,
        raidId: raid.id,
        raidTitle: raid.title || '',
        bossName: raid.bossName || '',
        questionKey,
        questionIdx: raid.currentQuestionIdx,
        questionText: (q.question || '').slice(0, 120),
        fullQuestion: q.question || '',
        options: q.options || [],
        explanation: cleanExplanation(q.explanation || ''),
        skill: '보스레이드',
        shape: q.shape || null,
        table: q.table || null,
        selectedIdx: answerIdx,
        correctIdx,
        selectedAnswer: answerText(q, answerIdx),
        correctAnswer: answerText(q, correctIdx),
        status: 'unresolved',
        resolved: false,
        wrongCount: (previous.wrongCount || 0) + 1,
        reviewCorrectCount: 0,
        completedAt: serverTimestamp(),
        date: new Date().toISOString().slice(0, 10),
      }, { merge: true }).catch(err => console.error('보스레이드 오답 저장 오류:', err));
    }
  };

  // ── 렌더링 ──────────────────────────────────────────────────
  const bossData = resolveBossData(raid);
  const isOpen   = raid && (raid.status === 'waiting' || raid.status === 'active');

  // 초기 소개 화면
  if (presentationError) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 text-5xl">⚠️</div>
        <h2 className="text-xl font-extrabold text-white mb-2">보스레이드 테스트 준비 실패</h2>
        <p className="max-w-xl text-sm font-semibold leading-relaxed text-slate-300">
          {presentationError}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              presentationCreatingRef.current = false;
              setPresentationRaidId(null);
              setPresentationError(null);
              setRaid(undefined);
              setPresentationRetryKey(key => key + 1);
            }}
            className="rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-extrabold text-white hover:bg-rose-700"
          >
            다시 만들기
          </button>
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              className="rounded-xl border border-slate-700 bg-slate-900 px-5 py-2.5 text-sm font-extrabold text-slate-200 hover:bg-slate-800"
            >
              대시보드로 돌아가기
            </button>
          )}
        </div>
      </div>
    );
  }

  if (showIntro) {
    return (
      <IntroScreen
        raid={isOpen ? raid : null}
        bossData={isOpen ? bossData : null}
        onEnter={() => setShowIntro(false)}
      />
    );
  }

  if (raid === undefined) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-white text-sm font-bold animate-pulse">로딩 중...</div>
      </div>
    );
  }

  if (!raid) return <IntroScreen raid={null} bossData={null} onEnter={() => {}} />;

  // 레이드가 active인데 내가 참가자가 아닌 경우 (늦은 접속, 학생 전용)
  if (!isTeacher && raid.status === 'active' && !raid.participants?.[activeStudentId]) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-center">
        <div className="flex items-end justify-center mb-4" style={{ height: 100 }}>
          <BossSprite bossData={bossData} anim="idle" scale={1.8} />
        </div>
        <h2 className="text-xl font-extrabold text-white mb-2">레이드 진행 중</h2>
        <p className="text-slate-400 text-sm">이미 시작된 레이드에는 참가할 수 없습니다.</p>
        <p className="text-slate-500 text-xs mt-2">다음 레이드를 기다려주세요!</p>
        <button onClick={() => setShowIntro(true)}
          className="mt-5 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-2xl transition-all">
          🏠 초기화면으로
        </button>
      </div>
    );
  }

  if (raid.status === 'waiting') {
    return (
      <LobbyPhase
        raid={raid}
        bossData={bossData}
        myId={activeStudentId}
        isTeacher={isTeacher}
        canStartRaid={isTeacher || presentationMode}
        presentationMode={presentationMode}
      />
    );
  }

  if (raid.status === 'active') {
    const playBossAttack = () => {
      setBossAnim('attack');
      setBossAnimKey(current => current + 1);
    };

    return (
      <BattlePhase
        raid={raid}
        bossData={bossData}
        myId={activeStudentId}
        myAnswer={myAnswer}
        timeLeft={timeLeft}
        bossAnim={bossAnim}
        bossAnimKey={bossAnimKey}
        bossFlash={bossFlash}
        isTeacher={isTeacher}
        onAnswer={submitAnswer}
        onBossAttack={playBossAttack}
        onBossAnimEnd={() => setBossAnim('idle')}
        onExit={onExit}
        onAdvance={(isTeacher || presentationMode) ? tryAdvance : null}
        onPauseToggle={presentationMode ? togglePresentationPause : null}
        onBossSkillResolve={applyBossSkillPenalty}
        onChangeBoss={presentationMode ? changePresentationBoss : null}
        changingBoss={changingBoss}
        showExitButton={isTeacher || presentationMode}
      />
    );
  }

  // cleared / failed
  return <ResultPhase raid={raid} myId={activeStudentId} bossData={bossData} onGoToIntro={() => setShowIntro(true)} />;
}
