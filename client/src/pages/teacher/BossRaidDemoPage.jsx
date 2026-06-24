import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import SpriteMonster from '../../components/SpriteMonster';
import { MONSTERS_DB } from '../../data/monsterData';

const DEMO_CODES = Array.from({ length: 15 }, (_, index) => `SINSEOK-5-${String(index + 1).padStart(2, '0')}`);
const TEST_CODE = 'SINSEOK-5-15';
const MAX_HP = 12000;
const TEST_DAMAGE = 900;
const AUTO_DAMAGE_VALUES = [240, 280, 320, 360, 420];

const QUESTIONS = [
  {
    question: '다음 중 5학년 1학기 수학에서 약분한 분수로 알맞은 것은?',
    options: ['12/18 = 2/3', '12/18 = 3/4', '12/18 = 4/5', '12/18 = 6/7'],
    answer: 0,
    explanation: '12와 18을 6으로 나누면 2/3입니다.',
  },
  {
    question: '1.25를 분수로 나타낸 것 중 알맞은 것은?',
    options: ['1/25', '5/4', '4/5', '125/10'],
    answer: 1,
    explanation: '1.25는 125/100이고 약분하면 5/4입니다.',
  },
  {
    question: '직육면체의 부피를 구하는 식으로 알맞은 것은?',
    options: ['가로 + 세로 + 높이', '가로 × 세로 × 높이', '가로 × 세로 ÷ 높이', '(가로 + 세로) × 2'],
    answer: 1,
    explanation: '직육면체의 부피는 가로, 세로, 높이를 모두 곱합니다.',
  },
  {
    question: '비율 0.7을 백분율로 나타내면?',
    options: ['7%', '17%', '70%', '700%'],
    answer: 2,
    explanation: '비율에 100을 곱하면 백분율이므로 0.7은 70%입니다.',
  },
];

const getSeatNum = (code) => Number(String(code || '').slice(-2)) || 0;
const normalizeCode = (code) => String(code || '').trim().toUpperCase();

const createFallbackStudents = () =>
  DEMO_CODES.map((code) => ({
    id: code,
    studentCode: code,
    name: `${getSeatNum(code)}번 학생`,
    characterImage: '',
  }));

const initialParticipantState = () =>
  Object.fromEntries(DEMO_CODES.map((code) => [
    code,
    {
      damage: code === TEST_CODE ? 0 : Math.floor(100 + getSeatNum(code) * 13),
      correct: code === TEST_CODE ? 0 : getSeatNum(code) % 2,
      status: code === TEST_CODE ? '시연 대기' : '접속 중',
    },
  ]));

function BossHpBar({ hp }) {
  const pct = Math.max(0, Math.min(100, Math.round((hp / MAX_HP) * 100)));
  const tone = pct > 60 ? 'from-emerald-400 to-lime-500' : pct > 30 ? 'from-amber-300 to-orange-500' : 'from-rose-400 to-red-700';

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm font-black text-white">
        <span>보스 HP</span>
        <span>{Math.max(0, hp).toLocaleString()} / {MAX_HP.toLocaleString()}</span>
      </div>
      <div className="h-8 overflow-hidden rounded-full border border-white/15 bg-slate-950 shadow-inner">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${tone} transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 text-right text-xs font-bold text-slate-300">{pct}%</div>
    </div>
  );
}

function StudentAvatar({ student, isTestAccount }) {
  if (student.characterImage) {
    return (
      <div className={`h-16 w-16 overflow-hidden rounded-xl border ${isTestAccount ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
        <img
          src={student.characterImage}
          alt=""
          className="h-full w-full object-contain"
          style={{ imageRendering: 'pixelated', transform: 'scale(2.5)', transformOrigin: 'center' }}
        />
      </div>
    );
  }

  return (
    <div className={`flex h-16 w-16 items-center justify-center rounded-xl border text-3xl ${isTestAccount ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
      👤
    </div>
  );
}

function BossRaidDemoPage({ onExit }) {
  const [students, setStudents] = useState(createFallbackStudents);
  const [participants, setParticipants] = useState(initialParticipantState);
  const [hp, setHp] = useState(MAX_HP);
  const [questionIdx, setQuestionIdx] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [autoRunning, setAutoRunning] = useState(true);
  const [log, setLog] = useState([
    '발표용 데모 레이드가 준비되었습니다.',
    'SINSEOK-5-01~14 학생이 모두 접속 중으로 표시됩니다.',
    '시연 계정 SINSEOK-5-15로 실제 문제 풀이를 진행합니다.',
  ]);

  const bossData = MONSTERS_DB.demon03 || Object.values(MONSTERS_DB).find(monster => monster.tier === 'boss');
  const currentQuestion = QUESTIONS[questionIdx % QUESTIONS.length];
  const cleared = hp <= 0;
  const sortedStudents = useMemo(
    () => [...students].sort((a, b) => getSeatNum(a.studentCode) - getSeatNum(b.studentCode)),
    [students]
  );
  const testStudent = sortedStudents.find(student => normalizeCode(student.studentCode) === TEST_CODE);
  const totalDamage = Object.values(participants).reduce((sum, participant) => sum + (participant.damage || 0), 0);

  useEffect(() => {
    let cancelled = false;

    const loadStudents = async () => {
      try {
        const codeAliases = [...DEMO_CODES, ...DEMO_CODES.map(code => code.toLowerCase())];
        const snap = await getDocs(query(collection(db, 'students'), where('studentCode', 'in', codeAliases)));
        if (cancelled || snap.empty) return;

        const byCode = new Map();
        snap.docs.forEach((studentDoc) => {
          const data = { id: studentDoc.id, ...studentDoc.data() };
          byCode.set(normalizeCode(data.studentCode), {
            id: studentDoc.id,
            studentCode: normalizeCode(data.studentCode),
            name: data.name || `${getSeatNum(data.studentCode)}번 학생`,
            characterImage: data.characterImage || '',
          });
        });

        setStudents(DEMO_CODES.map(code => byCode.get(code) || createFallbackStudents().find(student => student.studentCode === code)));
      } catch (error) {
        console.warn('[BossRaidDemo] student load failed:', error);
      }
    };

    loadStudents();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!autoRunning || cleared) return undefined;

    const timer = setInterval(() => {
      const virtualCodes = DEMO_CODES.filter(code => code !== TEST_CODE);
      const code = virtualCodes[Math.floor(Math.random() * virtualCodes.length)];
      const student = sortedStudents.find(item => normalizeCode(item.studentCode) === code);
      const damage = AUTO_DAMAGE_VALUES[Math.floor(Math.random() * AUTO_DAMAGE_VALUES.length)];
      const nextStatus = Math.random() > 0.35 ? '공격 완료' : '문제 풀이 중';

      setParticipants(prev => ({
        ...prev,
        [code]: {
          ...(prev[code] || {}),
          damage: (prev[code]?.damage || 0) + damage,
          correct: (prev[code]?.correct || 0) + 1,
          status: nextStatus,
        },
      }));
      setHp(prev => Math.max(0, prev - damage));
      setLog(prev => [
        `${student?.name || code}이(가) ${damage} 피해를 입혔습니다.`,
        ...prev,
      ].slice(0, 8));
    }, 3600);

    return () => clearInterval(timer);
  }, [autoRunning, cleared, sortedStudents]);

  const resetDemo = () => {
    setParticipants(initialParticipantState());
    setHp(MAX_HP);
    setQuestionIdx(0);
    setSelectedAnswer(null);
    setFeedback(null);
    setAutoRunning(true);
    setLog([
      '데모가 초기화되었습니다.',
      'SINSEOK-5-01~14 학생이 모두 접속 중으로 표시됩니다.',
      '시연 계정 SINSEOK-5-15로 실제 문제 풀이를 진행합니다.',
    ]);
  };

  const submitAnswer = (answerIdx) => {
    if (cleared || selectedAnswer !== null) return;

    const isCorrect = answerIdx === currentQuestion.answer;
    const damage = isCorrect ? Math.min(TEST_DAMAGE, hp) : 0;
    setSelectedAnswer(answerIdx);
    setFeedback({
      correct: isCorrect,
      text: isCorrect ? `정답입니다. 보스에게 ${damage.toLocaleString()} 피해를 입혔습니다.` : `오답입니다. ${currentQuestion.explanation}`,
    });
    setParticipants(prev => ({
      ...prev,
      [TEST_CODE]: {
        ...(prev[TEST_CODE] || {}),
        damage: (prev[TEST_CODE]?.damage || 0) + damage,
        correct: (prev[TEST_CODE]?.correct || 0) + (isCorrect ? 1 : 0),
        status: isCorrect ? '공격 완료' : '해설 확인',
      },
    }));
    setHp(prev => Math.max(0, prev - damage));
    setLog(prev => [
      isCorrect
        ? `시연 계정 ${TEST_CODE} 정답, ${damage.toLocaleString()} 피해`
        : `시연 계정 ${TEST_CODE} 오답, 해설 표시`,
      ...prev,
    ].slice(0, 8));
  };

  const goNextQuestion = () => {
    setQuestionIdx(prev => prev + 1);
    setSelectedAnswer(null);
    setFeedback(null);
    setParticipants(prev => ({
      ...prev,
      [TEST_CODE]: {
        ...(prev[TEST_CODE] || {}),
        status: '문제 풀이 중',
      },
    }));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-5">
        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-5 shadow-2xl md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.28em] text-amber-300">Presentation Demo Mode</div>
            <h1 className="mt-1 text-3xl font-black">보스레이드 테스트 페이지</h1>
            <p className="mt-1 text-sm font-semibold text-slate-300">
              신석초 5학년 1반 전체 접속 연출 + 시연 계정 {TEST_CODE} 문제 풀이 화면
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={resetDemo} className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-black hover:bg-slate-600">
              데모 초기화
            </button>
            <button type="button" onClick={() => setHp(Math.round(MAX_HP * 0.5))} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-black text-amber-950 hover:bg-amber-400">
              HP 50%
            </button>
            <button type="button" onClick={() => setHp(Math.round(MAX_HP * 0.1))} className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-black hover:bg-rose-400">
              HP 10%
            </button>
            <button type="button" onClick={() => setHp(0)} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-black text-emerald-950 hover:bg-emerald-400">
              즉시 클리어
            </button>
            <button type="button" onClick={onExit} className="rounded-xl border border-white/20 px-4 py-2 text-sm font-black text-slate-200 hover:bg-white/10">
              나가기
            </button>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
          <section className="overflow-hidden rounded-2xl border border-rose-400/20 bg-gradient-to-br from-slate-900 via-rose-950 to-slate-950 shadow-2xl">
            <div className="grid min-h-[440px] gap-4 p-5 md:grid-cols-[1fr_1.1fr]">
              <div className="flex flex-col justify-between gap-5">
                <div>
                  <div className="inline-flex rounded-full bg-rose-500/15 px-3 py-1 text-xs font-black text-rose-200 ring-1 ring-rose-300/20">
                    {cleared ? '레이드 클리어' : autoRunning ? '실시간 레이드 진행 중' : '수동 진행 중'}
                  </div>
                  <h2 className="mt-3 text-3xl font-black">발표회 지식 드래곤</h2>
                  <p className="mt-2 text-sm font-semibold text-slate-300">정답을 맞히면 보스 HP가 줄어드는 협동형 퀴즈 전투입니다.</p>
                </div>
                <BossHpBar hp={hp} />
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-white/8 p-3 text-center">
                    <div className="text-2xl font-black text-amber-300">15명</div>
                    <div className="text-xs font-bold text-slate-300">접속 표시</div>
                  </div>
                  <div className="rounded-xl bg-white/8 p-3 text-center">
                    <div className="text-2xl font-black text-sky-300">{totalDamage.toLocaleString()}</div>
                    <div className="text-xs font-bold text-slate-300">누적 피해</div>
                  </div>
                  <div className="rounded-xl bg-white/8 p-3 text-center">
                    <div className="text-2xl font-black text-emerald-300">{participants[TEST_CODE]?.correct || 0}</div>
                    <div className="text-xs font-bold text-slate-300">시연 정답</div>
                  </div>
                </div>
              </div>

              <div className="relative flex min-h-[320px] items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-slate-950/55">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(251,113,133,0.28),transparent_42%),radial-gradient(circle_at_45%_80%,rgba(251,191,36,0.12),transparent_34%)]" />
                {cleared && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/80 text-center">
                    <div className="text-6xl">🏆</div>
                    <div className="mt-2 text-4xl font-black text-amber-300">레이드 클리어!</div>
                    <div className="mt-2 text-sm font-bold text-slate-300">발표용 보상 화면으로 전환할 수 있는 상태입니다.</div>
                  </div>
                )}
                <div className="relative z-10 flex h-72 w-72 items-center justify-center">
                  {bossData ? (
                    <SpriteMonster data={bossData} anim={cleared ? 'death' : 'idle'} scale={(bossData.scale || 0.25) * 2.5} />
                  ) : (
                    <div className="text-8xl">🔥</div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white p-5 text-slate-900 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-black text-indigo-600">TEST PLAYER</div>
                <h2 className="text-2xl font-black">문제 풀이 시연</h2>
                <p className="text-sm font-semibold text-slate-500">
                  현재 플레이어: {testStudent?.name || '15번 학생'} ({TEST_CODE})
                </p>
              </div>
              <StudentAvatar student={testStudent || { studentCode: TEST_CODE }} isTestAccount />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 text-xs font-black text-slate-400">문제 {questionIdx + 1}</div>
              <div className="text-xl font-black leading-snug text-slate-900">{currentQuestion.question}</div>
              <div className="mt-4 grid gap-2">
                {currentQuestion.options.map((option, index) => {
                  const isSelected = selectedAnswer === index;
                  const isCorrect = currentQuestion.answer === index;
                  const showCorrect = selectedAnswer !== null && isCorrect;
                  const showWrong = selectedAnswer !== null && isSelected && !isCorrect;

                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={selectedAnswer !== null || cleared}
                      onClick={() => submitAnswer(index)}
                      className={`rounded-xl border px-4 py-3 text-left text-base font-extrabold transition ${
                        showCorrect
                          ? 'border-emerald-500 bg-emerald-100 text-emerald-800'
                          : showWrong
                            ? 'border-rose-500 bg-rose-100 text-rose-700'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-400 hover:bg-indigo-50'
                      }`}
                    >
                      {index + 1}. {option}
                    </button>
                  );
                })}
              </div>
            </div>

            {feedback && (
              <div className={`mt-3 rounded-2xl border px-4 py-3 text-sm font-black ${
                feedback.correct
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-rose-200 bg-rose-50 text-rose-700'
              }`}>
                {feedback.text}
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={goNextQuestion}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-black text-white hover:bg-indigo-700"
              >
                다음 문제
              </button>
              <button
                type="button"
                onClick={() => setAutoRunning(value => !value)}
                className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-black text-white hover:bg-slate-700"
              >
                {autoRunning ? '가상 학생 공격 멈춤' : '가상 학생 공격 시작'}
              </button>
            </div>
          </section>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
          <section className="rounded-2xl border border-white/10 bg-white p-5 text-slate-900 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black">우리반 접속 현황</h2>
                <p className="text-sm font-semibold text-slate-500">SINSEOK-5-01~14는 접속 중 연출, SINSEOK-5-15는 실제 시연 계정입니다.</p>
              </div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">전체 접속 중</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sortedStudents.map((student) => {
                const code = normalizeCode(student.studentCode);
                const participant = participants[code] || {};
                const isTestAccount = code === TEST_CODE;

                return (
                  <div
                    key={code}
                    className={`flex items-center gap-3 rounded-2xl border p-3 ${
                      isTestAccount ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <StudentAvatar student={student} isTestAccount={isTestAccount} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-base font-black text-slate-900">
                          {getSeatNum(code)}번 {student.name || '학생'}
                        </div>
                        {isTestAccount && <span className="shrink-0 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black text-amber-950">시연</span>}
                      </div>
                      <div className="truncate font-mono text-xs font-bold text-slate-400">{code}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-black">
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">{participant.status || '접속 중'}</span>
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-700">피해 {Number(participant.damage || 0).toLocaleString()}</span>
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-700">정답 {participant.correct || 0}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <aside className="rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl">
            <h2 className="text-xl font-black text-white">실시간 전투 로그</h2>
            <div className="mt-4 space-y-2">
              {log.map((item, index) => (
                <div key={`${item}-${index}`} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-slate-200">
                  {item}
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm font-bold text-amber-100">
              발표 안전장치: 이 페이지는 실제 보스레이드 문서, 학생 EXP, 골드, 다이아를 수정하지 않습니다.
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default BossRaidDemoPage;
