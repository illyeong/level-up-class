import React, { useState, useEffect, useRef } from 'react';
import {
  collection, getDocs, getDoc, doc, writeBatch,
  query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';

// ── 레벨별 다음 레벨까지 필요 EXP ────────────────────────────
const getMaxExpForLevel = (lv) =>
  lv <= 10 ? 500 : lv <= 30 ? 1000 : lv <= 60 ? 2000 : 3500;

// ── 경험치 + 레벨업 계산 ──────────────────────────────────────
const calcLevelUp = (currentLevel, currentExp, currentMaxExp, gainedExp) => {
  let level  = currentLevel || 1;
  let exp    = (currentExp  || 0) + gainedExp;
  let maxExp = currentMaxExp || getMaxExpForLevel(level);
  let leveled = false;

  while (exp >= maxExp && level < 99) {
    exp    -= maxExp;
    level++;
    maxExp  = getMaxExpForLevel(level);
    leveled = true;
  }
  return { level, exp, maxExp, leveled };
};

// ─────────────────────── 상수 ─────────────────────────────────
const PLAYER_MAX_HP = 500;
const DAMAGE_WRONG  = 150;  // 오답 시 플레이어 피해
const DAMAGE_RIGHT  = 100;  // 정답 시 몬스터 피해 (문제당)

const MONSTER_BY_DIFF = {
  easy:   { name: '지식의 슬라임', emoji: '🟢', color: 'emerald', desc: '기본 개념을 확인하세요!' },
  normal: { name: '수학의 골렘',   emoji: '🗿', color: 'sky',     desc: '집중력이 필요합니다!' },
  hard:   { name: '시험의 드래곤', emoji: '🐉', color: 'rose',    desc: '최고 난이도! 도전하세요!' },
};

const DIFF_LABEL = { easy: '🟢 쉬움', normal: '🟡 보통', hard: '🔴 어려움' };
const DIFF_COLOR = { easy: 'bg-emerald-100 text-emerald-700', normal: 'bg-amber-100 text-amber-700', hard: 'bg-rose-100 text-rose-700' };

const hpColor = (pct) =>
  pct > 60 ? 'from-emerald-400 to-emerald-600'
  : pct > 30 ? 'from-amber-400 to-amber-600'
  : 'from-rose-400 to-rose-600';

// ─────────────────────── HP 바 ─────────────────────────────────
function HpBar({ current, max, label, color }) {
  const pct = max > 0 ? Math.max(0, Math.round(current / max * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-[11px] font-bold mb-1">
        <span className="text-slate-200">{label}</span>
        <span className="text-white">{current}/{max}</span>
      </div>
      <div className="w-full h-3 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─────────────────────── 던전 로비 ────────────────────────────
function DungeonLobby({ dungeons, tickets, onEnter, isLoading }) {
  const dungeonTickets = tickets?.dungeon ?? 0;

  if (isLoading) return (
    <div className="flex items-center justify-center h-60 text-slate-400 font-bold">
      던전 목록 불러오는 중...
    </div>
  );

  if (dungeons.length === 0) return (
    <div className="text-center py-20 text-slate-400">
      <div className="text-6xl mb-4">⚔️</div>
      <p className="font-bold text-lg text-slate-600">열린 퀴즈 던전이 없습니다</p>
      <p className="text-sm mt-1">선생님이 퀴즈를 만들면 여기 표시됩니다</p>
    </div>
  );

  return (
    <div className="p-5">
      {dungeonTickets <= 0 && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-sm text-amber-700 font-medium">
          ⏰ 던전 이용권이 없습니다. 매주 월요일 3개가 자동 지급됩니다.
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {dungeons.map(d => {
          const monster = MONSTER_BY_DIFF[d.difficulty] || MONSTER_BY_DIFF.normal;
          return (
            <div key={d.id}
              className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-all">
              {/* 상단 색 띠 */}
              <div className={`px-4 py-2 text-white text-xs font-bold
                ${d.difficulty === 'easy' ? 'bg-emerald-500'
                  : d.difficulty === 'hard' ? 'bg-rose-500' : 'bg-sky-500'}`}>
                {monster.emoji} {monster.name}
              </div>
              <div className="p-4">
                <h3 className="font-extrabold text-slate-800 mb-1">{d.title}</h3>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${DIFF_COLOR[d.difficulty]}`}>
                    {DIFF_LABEL[d.difficulty]}
                  </span>
                  <span className="text-[10px] text-slate-500">{d.questionCount}문제</span>
                </div>
                <div className="flex gap-3 text-xs text-slate-500 mb-4">
                  {d.rewards?.gold    > 0 && <span>🪙 {d.rewards.gold}G</span>}
                  {d.rewards?.exp     > 0 && <span>⭐ {d.rewards.exp} EXP</span>}
                  {d.rewards?.diamond > 0 && <span>💎 {d.rewards.diamond}</span>}
                </div>
                <button
                  onClick={() => onEnter(d)}
                  disabled={dungeonTickets <= 0}
                  className={`w-full py-2.5 rounded-xl font-extrabold text-sm transition-all active:scale-95
                    ${dungeonTickets > 0
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}>
                  {dungeonTickets > 0 ? '⚔️ 입장하기 (이용권 1개)' : '이용권 없음'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────── 퀴즈 배틀 ───────────────────────────
function QuizBattle({ dungeon, playerHP, monsterHP, monsterMaxHP, currentQ,
  onAnswer, answered, selectedOption, monsterShake, playerShake }) {
  const q         = dungeon.questions[currentQ];
  const qTotal    = dungeon.questions.length;
  const monster   = MONSTER_BY_DIFF[dungeon.difficulty] || MONSTER_BY_DIFF.normal;
  const mHPpct    = Math.max(0, Math.round(monsterHP / monsterMaxHP * 100));
  const pHPpct    = Math.max(0, Math.round(playerHP  / PLAYER_MAX_HP * 100));

  return (
    <div className="flex flex-col h-full">
      {/* 전투 헤더 */}
      <div className="bg-slate-900 px-4 pt-4 pb-5 space-y-2.5">
        <HpBar current={monsterHP} max={monsterMaxHP} label={`👾 ${monster.name}`}
          color={hpColor(mHPpct)} />
        <HpBar current={playerHP}  max={PLAYER_MAX_HP} label="🧙‍♂️ 나"
          color={hpColor(pHPpct)} />
      </div>

      {/* 몬스터 */}
      <div className="bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center py-6 relative overflow-hidden">
        {/* 배경 별 */}
        <div className="absolute inset-0 opacity-20 text-white text-xs select-none pointer-events-none">
          {['✦','✧','⋆','✦','✧'].map((s,i) => (
            <span key={i} className="absolute animate-pulse" style={{ top: `${20+i*15}%`, left: `${10+i*20}%`, animationDelay: `${i*0.5}s` }}>{s}</span>
          ))}
        </div>
        <div className={`text-8xl transition-transform duration-100 select-none
          ${monsterShake ? '-translate-x-3 rotate-6' : 'translate-x-0'}`}>
          {monster.emoji}
        </div>
        {/* 피격 이펙트 */}
        {answered === 'correct' && (
          <div className="absolute top-4 right-8 text-yellow-300 font-extrabold text-xl animate-bounce">
            💥 크리티컬!
          </div>
        )}
        {answered === 'wrong' && (
          <div className="absolute top-4 left-8 text-rose-400 font-extrabold text-lg animate-bounce">
            😵 빗나감!
          </div>
        )}
      </div>

      {/* 퀴즈 영역 */}
      <div className="flex-1 bg-slate-50 p-4 space-y-4 overflow-y-auto">
        {/* 진행 바 */}
        <div>
          <div className="flex justify-between text-xs text-slate-400 font-medium mb-1">
            <span>Q {currentQ + 1} / {qTotal}</span>
            <span>{Math.round((currentQ / qTotal) * 100)}% 완료</span>
          </div>
          <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full transition-all"
              style={{ width: `${(currentQ / qTotal) * 100}%` }} />
          </div>
        </div>

        {/* 문제 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <p className="font-bold text-slate-800 text-base leading-relaxed">{q.question}</p>
        </div>

        {/* 보기 */}
        <div className="grid grid-cols-2 gap-2.5">
          {q.options.map((opt, oi) => {
            let cls = 'bg-white border-2 border-slate-200 text-slate-700 hover:border-indigo-400 hover:bg-indigo-50';
            if (answered !== null) {
              if (oi === q.answer)          cls = 'bg-emerald-100 border-2 border-emerald-500 text-emerald-800';
              else if (oi === selectedOption) cls = 'bg-rose-100 border-2 border-rose-400 text-rose-700';
              else                           cls = 'bg-slate-50 border-2 border-slate-100 text-slate-400 opacity-60';
            }
            return (
              <button key={oi}
                onClick={() => onAnswer(oi)}
                disabled={answered !== null}
                className={`py-3 px-3 rounded-2xl font-bold text-sm text-left transition-all active:scale-95 ${cls}`}>
                {opt}
              </button>
            );
          })}
        </div>

        {/* 해설 */}
        {answered !== null && q.explanation && (
          <div className={`rounded-xl p-3 text-xs font-medium leading-relaxed
            ${answered === 'correct' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
            {answered === 'correct' ? '✅ 정답! ' : `❌ 오답 · 정답: ${q.options[q.answer]}\n`}
            {q.explanation}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────── 결과 화면 ───────────────────────────
function ResultScreen({ dungeon, score, totalQ, wrongIndexes, playerAlive,
  earnedRewards, leveledUp, isSaving, onReturnLobby }) {
  const accuracy = Math.round(score / totalQ * 100);
  const stars    = accuracy >= 90 ? 3 : accuracy >= 70 ? 2 : accuracy >= 50 ? 1 : 0;

  return (
    <div className="flex flex-col items-center justify-center min-h-full p-6 bg-slate-50 text-center">
      <div className="text-6xl mb-3">{playerAlive ? '🏆' : '💀'}</div>
      <h2 className="text-2xl font-extrabold text-slate-800 mb-1">
        {playerAlive ? '던전 클리어!' : '던전 실패'}
      </h2>
      <p className="text-slate-500 text-sm mb-4">{dungeon.title}</p>

      {/* 레벨업 알림 */}
      {leveledUp && (
        <div className="bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-2xl px-6 py-3 mb-4 font-extrabold text-lg shadow-lg animate-bounce">
          🎉 레벨 업! Lv.{leveledUp} 달성!
        </div>
      )}

      {/* 별 */}
      <div className="flex gap-1 text-4xl mb-4">
        {[0,1,2].map(i => <span key={i}>{i < stars ? '⭐' : '☆'}</span>)}
      </div>

      {/* 점수 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 w-full max-w-xs mb-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">정답 수</span>
          <span className="font-extrabold text-slate-800">{score} / {totalQ}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">정확도</span>
          <span className={`font-extrabold ${accuracy >= 70 ? 'text-emerald-600' : 'text-rose-500'}`}>{accuracy}%</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">오답 수</span>
          <span className="font-extrabold text-rose-500">{wrongIndexes.length}개</span>
        </div>
      </div>

      {/* 실제 보상 지급 현황 */}
      {isSaving ? (
        <div className="text-sm text-slate-400 font-medium mb-4 animate-pulse">💾 결과 저장 중...</div>
      ) : earnedRewards ? (
        <div className={`border rounded-2xl p-4 w-full max-w-xs mb-4 text-sm
          ${playerAlive ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
          <div className={`font-bold mb-2 ${playerAlive ? 'text-emerald-700' : 'text-slate-500'}`}>
            {playerAlive ? '🎁 획득한 보상' : '😢 실패 - 보상 없음'}
          </div>
          {playerAlive && (
            <div className="flex justify-center gap-4 text-sm font-extrabold">
              {earnedRewards.goldEarned    > 0 && <span className="text-amber-600">🪙 +{earnedRewards.goldEarned}G</span>}
              {earnedRewards.expEarned     > 0 && <span className="text-indigo-600">⭐ +{earnedRewards.expEarned} EXP</span>}
              {earnedRewards.diamondEarned > 0 && <span className="text-blue-600">💎 +{earnedRewards.diamondEarned}</span>}
              {earnedRewards.goldEarned === 0 && earnedRewards.expEarned === 0 && earnedRewards.diamondEarned === 0 && (
                <span className="text-slate-400 font-normal">정답이 없어 보상이 지급되지 않습니다</span>
              )}
            </div>
          )}
        </div>
      ) : null}

      {/* 오답 목록 */}
      {wrongIndexes.length > 0 && (
        <div className="bg-white border border-rose-200 rounded-2xl p-4 w-full max-w-sm mb-5 text-left">
          <div className="text-xs font-bold text-rose-600 mb-2">❌ 틀린 문제 복습</div>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {wrongIndexes.map(i => (
              <div key={i} className="text-xs text-slate-600 bg-rose-50 rounded-lg p-2">
                <div className="font-bold text-slate-700 mb-0.5">Q{i+1}. {dungeon.questions[i].question}</div>
                <div className="text-emerald-600">정답: {dungeon.questions[i].options[dungeon.questions[i].answer]}</div>
                {dungeon.questions[i].explanation && (
                  <div className="text-slate-400 mt-0.5">{dungeon.questions[i].explanation}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={onReturnLobby}
        className="w-full max-w-xs py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-2xl transition-all active:scale-95">
        던전 목록으로
      </button>
    </div>
  );
}

// ─────────────────────── Main ─────────────────────────────────
function QuizDungeon({ studentCode, studentDocId, tickets, onUseTicket }) {
  const [screen, setScreen] = useState('lobby');
  const [dungeons, setDungeons] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDungeon, setSelectedDungeon] = useState(null);
  const [studentData, setStudentData] = useState(null); // 보상 지급용

  // 배틀 상태
  const [currentQ, setCurrentQ]     = useState(0);
  const [playerHP, setPlayerHP]     = useState(PLAYER_MAX_HP);
  const [monsterHP, setMonsterHP]   = useState(0);
  const [monsterMaxHP, setMonsterMaxHP] = useState(0);
  const [score, setScore]           = useState(0);
  const [wrongIndexes, setWrongIndexes] = useState([]);
  const [answered, setAnswered]     = useState(null);
  const [selectedOption, setSelectedOption] = useState(null);
  const [monsterShake, setMonsterShake] = useState(false);
  const [playerShake, setPlayerShake]   = useState(false);
  const timerRef = useRef(null);

  // 결과 상태
  const [earnedRewards, setEarnedRewards] = useState(null);
  const [leveledUp, setLeveledUp]         = useState(null);
  const [isSaving, setIsSaving]           = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [dungeonSnap] = await Promise.all([
          getDocs(query(collection(db, 'quizDungeons'), where('active', '==', true))),
        ]);
        setDungeons(dungeonSnap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      } catch (err) { console.error(err); }
      finally { setIsLoading(false); }
    };
    load();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  // 학생 데이터 로드 (보상 지급용)
  useEffect(() => {
    if (!studentDocId) return;
    getDoc(doc(db, 'students', studentDocId)).then(snap => {
      if (snap.exists()) setStudentData({ id: snap.id, ...snap.data() });
    });
  }, [studentDocId]);

  // ── 결과 저장 + 보상 지급 ─────────────────────────────────
  const doSaveResult = async (finalScore, finalPlayerHP, finalWrong, dungeon) => {
    setIsSaving(true);
    const totalQ   = dungeon.questionCount;
    const cleared  = finalPlayerHP > 0;
    const accuracy = Math.round(finalScore / totalQ * 100);

    // 보상 계산 (정확도 비례, 퍼펙트 시 다이아 추가)
    const goldEarned    = cleared ? Math.floor((dungeon.rewards?.gold    || 0) * finalScore / totalQ) : 0;
    const expEarned     = cleared ? Math.floor((dungeon.rewards?.exp     || 0) * finalScore / totalQ) : 0;
    const diamondEarned = (cleared && finalScore === totalQ) ? (dungeon.rewards?.diamond || 0) : 0;

    setEarnedRewards({ goldEarned, expEarned, diamondEarned });

    if (!studentDocId || !studentData) { setIsSaving(false); return; }

    try {
      // 레벨업 계산
      const { level, exp, maxExp, leveled } = calcLevelUp(
        studentData.level, studentData.exp, studentData.maxExp, expEarned
      );
      if (leveled) setLeveledUp(level);

      const batch = writeBatch(db);

      // 학생 재화/경험치 업데이트
      batch.update(doc(db, 'students', studentDocId), {
        gold:     (studentData.gold     || 0) + goldEarned,
        diamonds: (studentData.diamonds || 0) + diamondEarned,
        exp, level, maxExp,
      });

      // 결과 기록
      batch.set(doc(collection(db, 'quizResults')), {
        studentId:     studentDocId,
        studentCode:   studentData.studentCode,
        studentName:   studentData.name || studentData.studentCode,
        dungeonId:     dungeon.id,
        dungeonTitle:  dungeon.title,
        score:         finalScore,
        totalQuestions: totalQ,
        accuracy,
        cleared,
        wrongIndexes:  finalWrong,
        goldEarned, expEarned, diamondEarned,
        completedAt:   serverTimestamp(),
      });

      // 던전 플레이 카운트 증가
      batch.update(doc(db, 'quizDungeons', dungeon.id), {
        playCount: (dungeon.playCount || 0) + 1,
      });

      await batch.commit();

      // 로컬 학생 데이터 갱신
      setStudentData(prev => ({
        ...prev,
        gold:     (prev?.gold     || 0) + goldEarned,
        diamonds: (prev?.diamonds || 0) + diamondEarned,
        exp, level, maxExp,
      }));
    } catch (err) {
      console.error('결과 저장 에러:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const enterDungeon = async (dungeon) => {
    if (!onUseTicket) return alert('이용권 시스템에 연결되지 않았습니다.');
    await onUseTicket('dungeon');

    const mHP = dungeon.questionCount * DAMAGE_RIGHT;
    setSelectedDungeon(dungeon);
    setCurrentQ(0);
    setPlayerHP(PLAYER_MAX_HP);
    setMonsterHP(mHP);
    setMonsterMaxHP(mHP);
    setScore(0);
    setWrongIndexes([]);
    setAnswered(null);
    setSelectedOption(null);
    setEarnedRewards(null);
    setLeveledUp(null);
    setScreen('battle');
  };

  const handleAnswer = (optionIdx) => {
    if (answered !== null) return;
    const q         = selectedDungeon.questions[currentQ];
    const isCorrect = optionIdx === q.answer;

    setSelectedOption(optionIdx);
    setAnswered(isCorrect ? 'correct' : 'wrong');

    // 최종값 계산 (stale state 방지)
    const newScore     = isCorrect ? score + 1 : score;
    const newMonsterHP = isCorrect ? Math.max(0, monsterHP - DAMAGE_RIGHT) : monsterHP;
    const newPlayerHP  = isCorrect ? playerHP : Math.max(0, playerHP - DAMAGE_WRONG);
    const newWrong     = isCorrect ? wrongIndexes : [...wrongIndexes, currentQ];

    if (isCorrect) {
      setMonsterHP(newMonsterHP);
      setScore(newScore);
      setMonsterShake(true);
      setTimeout(() => setMonsterShake(false), 300);
    } else {
      setPlayerHP(newPlayerHP);
      setWrongIndexes(newWrong);
      setPlayerShake(true);
      setTimeout(() => setPlayerShake(false), 300);
    }

    const nextQ       = currentQ + 1;
    const isOver      = newMonsterHP <= 0 || newPlayerHP <= 0
                     || nextQ >= selectedDungeon.questions.length;

    timerRef.current = setTimeout(() => {
      setAnswered(null);
      setSelectedOption(null);
      if (isOver) {
        setEarnedRewards(null);
        setLeveledUp(null);
        doSaveResult(newScore, newPlayerHP, newWrong, selectedDungeon);
        setScreen('result');
      } else {
        setCurrentQ(nextQ);
      }
    }, 1500);
  };

  // ── 렌더 ──
  if (screen === 'lobby') {
    return (
      <DungeonLobby
        dungeons={dungeons}
        tickets={tickets}
        onEnter={enterDungeon}
        isLoading={isLoading}
      />
    );
  }

  if (screen === 'battle' && selectedDungeon) {
    return (
      <QuizBattle
        dungeon={selectedDungeon}
        playerHP={playerHP}
        monsterHP={monsterHP}
        monsterMaxHP={monsterMaxHP}
        currentQ={currentQ}
        onAnswer={handleAnswer}
        answered={answered}
        selectedOption={selectedOption}
        monsterShake={monsterShake}
        playerShake={playerShake}
      />
    );
  }

  if (screen === 'result' && selectedDungeon) {
    return (
      <ResultScreen
        dungeon={selectedDungeon}
        score={score}
        totalQ={selectedDungeon.questionCount}
        wrongIndexes={wrongIndexes}
        playerAlive={playerHP > 0}
        earnedRewards={earnedRewards}
        leveledUp={leveledUp}
        isSaving={isSaving}
        onReturnLobby={() => {
          setScreen('lobby');
          setEarnedRewards(null);
          setLeveledUp(null);
        }}
      />
    );
  }

  return null;
}

export default QuizDungeon;
