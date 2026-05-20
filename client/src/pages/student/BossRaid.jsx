import React, { useState, useEffect, useRef } from 'react';
import {
  collection, doc, getDocs, updateDoc, onSnapshot,
  query, where, getDoc, increment, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';

const DAMAGE_PER_CORRECT = 100;

const hpColor = (pct) =>
  pct > 60 ? 'from-emerald-400 to-emerald-600'
  : pct > 30 ? 'from-amber-400 to-amber-600'
  : 'from-rose-500 to-rose-700';

// ─────────────────────── HP 바 (대형) ────────────────────────
function BossHpBar({ current, max }) {
  const pct = max > 0 ? Math.max(0, Math.round((current / max) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm font-bold text-white mb-1.5">
        <span>보스 HP</span>
        <span>{Math.max(0, current).toLocaleString()} / {max.toLocaleString()}</span>
      </div>
      <div className="w-full h-5 bg-slate-700 rounded-full overflow-hidden shadow-inner">
        <div
          className={`h-full rounded-full bg-gradient-to-r transition-all duration-700 ${hpColor(pct)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-right text-xs text-slate-400 mt-0.5">{pct}%</div>
    </div>
  );
}

// ─────────────────────── 로비 ────────────────────────────────
function RaidLobby({ activeRaid, tickets, onEnter, studentDocId }) {
  const bossRaidTickets = tickets?.bossRaid ?? 0;
  const participated    = activeRaid
    ? Object.keys(activeRaid.participants || {}).includes(studentDocId)
    : false;

  if (!activeRaid) {
    return (
      <div className="flex flex-col items-center justify-center min-h-60 p-8 text-center text-slate-400">
        <div className="text-6xl mb-4 animate-pulse">🐉</div>
        <p className="font-bold text-lg text-slate-600">활성화된 보스 레이드가 없습니다</p>
        <p className="text-sm mt-1">선생님이 레이드를 열면 여기에 표시됩니다</p>
      </div>
    );
  }

  const mHpPct = Math.max(0, Math.round(activeRaid.currentHP / activeRaid.maxHP * 100));
  const participantCount = Object.keys(activeRaid.participants || {}).length;
  const totalDamage = Object.values(activeRaid.participants || {})
    .reduce((s, p) => s + (p.damage || 0), 0);

  return (
    <div className="p-5">
      {/* 경고 배너 */}
      <div className="bg-rose-600 text-white rounded-2xl p-4 mb-4 flex items-center gap-3 shadow-lg animate-pulse">
        <span className="text-3xl">⚠️</span>
        <div>
          <div className="font-extrabold text-lg">월드 보스 레이드 진행 중!</div>
          <div className="text-sm opacity-80">지금 바로 참여해 보스를 쓰러뜨리세요</div>
        </div>
      </div>

      {/* 보스 카드 */}
      <div className="bg-slate-900 rounded-2xl p-5 text-white shadow-xl mb-4">
        <div className="text-center mb-4">
          <div className="text-7xl mb-2">{activeRaid.bossEmoji || '🐉'}</div>
          <h2 className="font-extrabold text-xl">{activeRaid.bossName || '보스'}</h2>
          <p className="text-slate-400 text-xs mt-0.5">{activeRaid.title}</p>
        </div>
        <BossHpBar current={activeRaid.currentHP} max={activeRaid.maxHP} />
        <div className="grid grid-cols-2 gap-3 mt-4 text-center text-sm">
          <div className="bg-slate-800 rounded-xl p-2">
            <div className="font-extrabold text-lg">{participantCount}명</div>
            <div className="text-slate-400 text-xs">참여 중</div>
          </div>
          <div className="bg-slate-800 rounded-xl p-2">
            <div className="font-extrabold text-lg">💥 {totalDamage.toLocaleString()}</div>
            <div className="text-slate-400 text-xs">총 누적 피해</div>
          </div>
        </div>
      </div>

      {/* 보상 */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4">
        <div className="text-xs font-bold text-amber-700 mb-2">🏆 보스 처치 집단 보상</div>
        <div className="flex gap-4 text-sm font-extrabold">
          {activeRaid.rewards?.gold    > 0 && <span className="text-amber-600">🪙 {activeRaid.rewards.gold}G</span>}
          {activeRaid.rewards?.exp     > 0 && <span className="text-indigo-600">⭐ {activeRaid.rewards.exp} EXP</span>}
          {activeRaid.rewards?.diamond > 0 && <span className="text-blue-600">💎 {activeRaid.rewards.diamond}</span>}
        </div>
        <div className="text-xs text-amber-500 mt-1">참여한 모든 학생에게 지급됩니다</div>
      </div>

      {/* 입장 버튼 */}
      {participated ? (
        <button onClick={() => onEnter(activeRaid, true)}
          className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-lg rounded-2xl shadow-md transition-all active:scale-[0.99]">
          ⚔️ 전투 이어하기
        </button>
      ) : bossRaidTickets > 0 ? (
        <button onClick={() => onEnter(activeRaid, false)}
          className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-lg rounded-2xl shadow-md transition-all active:scale-[0.99]">
          ⚔️ 레이드 참여하기 (보스레이드 이용권 1개)
        </button>
      ) : (
        <button disabled
          className="w-full py-4 bg-slate-100 text-slate-400 font-extrabold text-lg rounded-2xl cursor-not-allowed">
          보스레이드 이용권 없음
        </button>
      )}
    </div>
  );
}

// ─────────────────────── 배틀 ────────────────────────────────
function RaidBattle({ raid, bossHP, participants, currentQ, myDamage,
  onAnswer, answered, selectedOption, bossShake }) {
  const qList   = raid.questions || [];
  const q       = qList[currentQ % (qList.length || 1)];
  const mHpPct  = Math.max(0, Math.round(bossHP / raid.maxHP * 100));
  const pCount  = Object.keys(participants).length;

  if (!q) return <div className="text-center p-8 text-slate-400 font-bold">문제를 불러오는 중...</div>;

  return (
    <div className="flex flex-col h-full">
      {/* 보스 HP */}
      <div className="bg-slate-900 px-4 pt-4 pb-5">
        <div className="flex items-center justify-between text-white text-xs mb-2">
          <span className="font-bold">{raid.bossEmoji} {raid.bossName}</span>
          <span className="text-slate-400">👥 {pCount}명 참전 중</span>
        </div>
        <BossHpBar current={bossHP} max={raid.maxHP} />
      </div>

      {/* 보스 이미지 */}
      <div className="bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center py-5 relative overflow-hidden">
        <div className={`text-9xl transition-transform duration-100 select-none
          ${bossShake ? 'scale-75 rotate-12' : 'scale-100'}`}>
          {raid.bossEmoji || '🐉'}
        </div>
        {answered === 'correct' && (
          <div className="absolute top-3 right-6 text-yellow-300 font-extrabold text-xl animate-bounce">
            💥 -{DAMAGE_PER_CORRECT}!
          </div>
        )}
        {answered === 'wrong' && (
          <div className="absolute top-3 left-6 text-slate-400 font-bold text-base animate-bounce">
            빗나감...
          </div>
        )}
        {/* 내 피해 + 참여 정보 */}
        <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-4 text-[10px] font-bold">
          <span className="bg-slate-900/70 text-rose-300 px-2 py-0.5 rounded-full">
            💥 내 피해: {myDamage.toLocaleString()}
          </span>
          <span className="bg-slate-900/70 text-slate-300 px-2 py-0.5 rounded-full">
            HP {Math.max(0, bossHP).toLocaleString()} / {raid.maxHP.toLocaleString()}
          </span>
        </div>
      </div>

      {/* 퀴즈 */}
      <div className="flex-1 bg-slate-50 p-4 space-y-4 overflow-y-auto">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="text-[10px] text-slate-400 font-bold mb-1">
            Q{(currentQ % qList.length) + 1}/{qList.length}
          </div>
          <p className="font-bold text-slate-800 text-base leading-relaxed">{q.question}</p>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {q.options.map((opt, oi) => {
            let cls = 'bg-white border-2 border-slate-200 text-slate-700 hover:border-rose-400 hover:bg-rose-50';
            if (answered !== null) {
              if (oi === q.answer)            cls = 'bg-emerald-100 border-2 border-emerald-500 text-emerald-800';
              else if (oi === selectedOption) cls = 'bg-slate-100 border-2 border-slate-300 text-slate-400';
              else                             cls = 'bg-slate-50 border-2 border-slate-100 text-slate-300 opacity-50';
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

        {answered !== null && q.explanation && (
          <div className={`rounded-xl p-3 text-xs font-medium leading-relaxed
            ${answered === 'correct' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-slate-50 text-slate-500 border border-slate-200'}`}>
            {answered === 'correct' ? '✅ 정답! ' : `❌ 정답: ${q.options[q.answer]}\n`}
            {q.explanation}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────── 결과 ────────────────────────────────
function RaidResult({ raid, myDamage, participants, bossCleared, onReturnLobby }) {
  const sorted = Object.entries(participants)
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => (b.damage || 0) - (a.damage || 0));

  return (
    <div className="flex flex-col items-center justify-center min-h-full p-6 bg-slate-50 text-center">
      <div className="text-7xl mb-3">{bossCleared ? '🏆' : '💀'}</div>
      <h2 className="text-2xl font-extrabold text-slate-800 mb-1">
        {bossCleared ? '보스 처치 성공!' : '레이드 종료'}
      </h2>
      <p className="text-slate-500 text-sm mb-4">{raid?.bossName}</p>

      {/* 내 기여도 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 w-full max-w-xs mb-4">
        <div className="text-xs text-slate-400 font-bold mb-2">내 기여도</div>
        <div className="text-3xl font-extrabold text-rose-500">💥 {myDamage.toLocaleString()}</div>
        <div className="text-xs text-slate-400 mt-1">피해량</div>
      </div>

      {/* 집단 보상 */}
      {bossCleared && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 w-full max-w-xs mb-4">
          <div className="font-bold text-amber-700 text-sm mb-2">🎁 집단 보상 (선생님이 지급)</div>
          <div className="flex justify-center gap-4 font-extrabold text-sm">
            {raid?.rewards?.gold    > 0 && <span className="text-amber-600">🪙 {raid.rewards.gold}G</span>}
            {raid?.rewards?.exp     > 0 && <span className="text-indigo-600">⭐ {raid.rewards.exp} EXP</span>}
            {raid?.rewards?.diamond > 0 && <span className="text-blue-600">💎 {raid.rewards.diamond}</span>}
          </div>
        </div>
      )}

      {/* 기여도 랭킹 */}
      {sorted.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm w-full max-w-xs mb-5 overflow-hidden">
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500">
            참여자 기여도 ({sorted.length}명)
          </div>
          <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
            {sorted.map((p, idx) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-extrabold text-slate-400 w-5">{idx + 1}</span>
                  <span className="text-sm font-bold text-slate-700">{p.name || '학생'}</span>
                </div>
                <span className="text-sm font-extrabold text-rose-500">💥 {(p.damage || 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={onReturnLobby}
        className="w-full max-w-xs py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-2xl transition-all active:scale-95">
        로비로 돌아가기
      </button>
    </div>
  );
}

// ─────────────────────── Main ─────────────────────────────────
function BossRaid({ studentCode, studentDocId, tickets, onUseTicket }) {
  const [screen, setScreen]           = useState('lobby');
  const [activeRaid, setActiveRaid]   = useState(null);
  const [currentRaidId, setCurrentRaidId] = useState(null);
  const [bossHP, setBossHP]           = useState(0);
  const [participants, setParticipants] = useState({});
  const [bossCleared, setBossCleared] = useState(false);
  const [currentQ, setCurrentQ]       = useState(0);
  const [myDamage, setMyDamage]       = useState(0);
  const [answered, setAnswered]       = useState(null);
  const [selectedOption, setSelectedOption] = useState(null);
  const [bossShake, setBossShake]     = useState(false);
  const [studentData, setStudentData] = useState(null);
  const timerRef = useRef(null);

  // 학생 데이터 로드
  useEffect(() => {
    if (!studentDocId) return;
    getDoc(doc(db, 'students', studentDocId)).then(snap => {
      if (snap.exists()) setStudentData({ id: snap.id, ...snap.data() });
    });
  }, [studentDocId]);

  // 활성 레이드 실시간 리스닝
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'worldBossRaids'), where('status', '==', 'active')),
      (snap) => {
        if (!snap.empty) {
          const raid = { id: snap.docs[0].id, ...snap.docs[0].data() };
          setActiveRaid(raid);
        } else {
          setActiveRaid(null);
        }
      }
    );
    return () => unsub();
  }, []);

  // 배틀 중 레이드 실시간 리스닝
  useEffect(() => {
    if (!currentRaidId || screen !== 'battle') return;
    const unsub = onSnapshot(doc(db, 'worldBossRaids', currentRaidId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setBossHP(data.currentHP);
      setParticipants(data.participants || {});
      if (data.currentHP <= 0 && screen === 'battle') {
        setBossCleared(true);
        setScreen('result');
      }
      if (data.status !== 'active' && screen === 'battle') {
        setBossCleared(data.currentHP <= 0);
        setScreen('result');
      }
    });
    return () => { unsub(); if (timerRef.current) clearTimeout(timerRef.current); };
  }, [currentRaidId, screen]);

  const enterRaid = async (raid, isReturning) => {
    if (!isReturning && onUseTicket) await onUseTicket('bossRaid');

    setCurrentRaidId(raid.id);
    setBossHP(raid.currentHP);
    setParticipants(raid.participants || {});
    setCurrentQ(0);
    setMyDamage(0);
    setAnswered(null);
    setSelectedOption(null);
    setBossCleared(false);
    setScreen('battle');

    // 참여자 등록
    if (studentDocId) {
      const existing = raid.participants?.[studentDocId];
      await updateDoc(doc(db, 'worldBossRaids', raid.id), {
        [`participants.${studentDocId}.name`]:
          studentData?.name || studentData?.studentCode || '학생',
        [`participants.${studentDocId}.damage`]:
          existing ? (existing.damage || 0) : 0,
        [`participants.${studentDocId}.answeredCount`]:
          existing ? (existing.answeredCount || 0) : 0,
      });
    }
  };

  const handleAnswer = async (optionIdx) => {
    if (answered !== null || !currentRaidId || !activeRaid) return;
    const qList = activeRaid.questions || [];
    const q     = qList[currentQ % (qList.length || 1)];
    if (!q) return;

    const isCorrect = optionIdx === q.answer;
    setSelectedOption(optionIdx);
    setAnswered(isCorrect ? 'correct' : 'wrong');

    if (isCorrect) {
      setMyDamage(d => d + DAMAGE_PER_CORRECT);
      setBossShake(true);
      setTimeout(() => setBossShake(false), 300);
      if (studentDocId && bossHP > 0) {
        await updateDoc(doc(db, 'worldBossRaids', currentRaidId), {
          currentHP: increment(-DAMAGE_PER_CORRECT),
          [`participants.${studentDocId}.damage`]: increment(DAMAGE_PER_CORRECT),
          [`participants.${studentDocId}.answeredCount`]: increment(1),
        });
      }
    }

    timerRef.current = setTimeout(() => {
      setAnswered(null);
      setSelectedOption(null);
      setCurrentQ(q => q + 1);
    }, 1500);
  };

  // ── 렌더 ──
  if (screen === 'lobby') {
    return (
      <RaidLobby
        activeRaid={activeRaid}
        tickets={tickets}
        onEnter={enterRaid}
        studentDocId={studentDocId}
      />
    );
  }

  if (screen === 'battle' && activeRaid) {
    return (
      <RaidBattle
        raid={activeRaid}
        bossHP={bossHP}
        participants={participants}
        currentQ={currentQ}
        myDamage={myDamage}
        onAnswer={handleAnswer}
        answered={answered}
        selectedOption={selectedOption}
        bossShake={bossShake}
      />
    );
  }

  if (screen === 'result') {
    return (
      <RaidResult
        raid={activeRaid}
        myDamage={myDamage}
        participants={participants}
        bossCleared={bossCleared}
        onReturnLobby={() => { setScreen('lobby'); setCurrentRaidId(null); }}
      />
    );
  }

  return null;
}

export default BossRaid;
