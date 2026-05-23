import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, doc, writeBatch,
  onSnapshot, serverTimestamp, increment, getDoc, query, where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { MONSTERS_DB } from '../../data/monsterData';
import SpriteMonster from '../../components/SpriteMonster';

// large + boss 티어만 보스 레이드에 사용
const BOSS_MONSTERS = Object.values(MONSTERS_DB)
  .filter(m => m.tier === 'large' || m.tier === 'boss')
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

// ── 보스 몬스터 피커 ─────────────────────────────────────────────
function BossMonsterPicker({ selectedId, onSelect, onClose }) {
  const [filter, setFilter] = useState('all');
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
          {[['all', '전체'], ['large', '대형'], ['boss', '보스']].map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-colors
                ${filter === v ? 'bg-rose-600 text-white border-rose-600' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
              {l}
            </button>
          ))}
        </div>

        {/* 몬스터 그리드 */}
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-3 sm:grid-cols-4 gap-3">
          {list.map(m => (
            <button key={m.id} onClick={() => { onSelect(m.id); onClose(); }}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all
                ${selectedId === m.id
                  ? 'border-rose-500 bg-rose-50 shadow-md'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
              <div className="flex items-end justify-center" style={{ height: 56 }}>
                <SpriteMonster data={m} anim="idle" scale={m.scale * 1.1} />
              </div>
              <div className="text-xs font-bold text-slate-700 text-center leading-tight">{m.name}</div>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${TIER_COLOR[m.tier]}`}>
                {TIER_LABEL[m.tier]}
              </span>
            </button>
          ))}
        </div>
      </div>
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

// ── 진행 중 레이드 패널 ──────────────────────────────────────────
function ActiveRaidPanel({ raid, onStart, onNextQuestion, onEnd, onPayRewards, isPaying }) {
  const bossData = raid.bossId ? MONSTERS_DB[raid.bossId] : null;
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
          <div className="flex items-end justify-center shrink-0" style={{ width: 80, height: 80 }}>
            {bossData
              ? <SpriteMonster data={bossData} anim={isEnded ? 'death' : 'idle'} scale={bossData.scale * 1.2} />
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
        {isActive && !raid.autoAdvance && qIdx < totalQ - 1 && (
          <button onClick={onNextQuestion}
            className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl transition-colors">
            ▶ 다음 문제 ({qIdx + 1}/{totalQ})
          </button>
        )}
        {(isActive || isEnded) && !raid.rewardsPaid && (
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
export default function BossRaidManage() {
  const [raids, setRaids]         = useState([]);
  const [dungeons, setDungeons]   = useState([]);
  const [tab, setTab]             = useState('active');
  const [isCreating, setIsCreating] = useState(false);
  const [isPaying, setIsPaying]   = useState(false);
  const [showBossPicker, setShowBossPicker] = useState(false);

  // 생성 폼 상태
  const [form, setForm] = useState({
    bossId:           'butcher',
    bossName:         '',
    dungeonId:        '',
    maxHP:            3000,
    damagePerHit:     100,
    penaltyType:      'none',
    penaltyAmount:    50,
    questionDuration: 20,
    autoAdvance:      true,
    rewards:          { gold: 200, exp: 100, diamond: 5 },
  });

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // 레이드 실시간 리스닝
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'worldBossRaids'), snap =>
      setRaids(snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)))
    );
    return () => unsub();
  }, []);

  // 퀴즈 던전 목록
  useEffect(() => {
    getDocs(query(collection(db, 'quizDungeons'), where('active', '==', true)))
      .then(snap => setDungeons(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);

  // 선택된 보스 데이터
  const bossData       = MONSTERS_DB[form.bossId];
  const selectedDungeon = dungeons.find(d => d.id === form.dungeonId);
  const waitingOrActive = raids.filter(r => r.status === 'waiting' || r.status === 'active');
  const hasOpenRaid    = waitingOrActive.length > 0;

  // 보스 이름 자동채우기
  useEffect(() => {
    if (!form.bossName && bossData) setF('bossName', bossData.name);
  }, [form.bossId]);

  // HP 자동추천: 던전 문제수 × damagePerHit × 1.5
  const autoHP = selectedDungeon
    ? Math.ceil((selectedDungeon.questions || []).filter(q => q.type !== 'short').length * form.damagePerHit * 1.5)
    : null;

  // ── 레이드 생성 (waiting 상태) ──────────────────────────────
  const createRaid = async () => {
    if (!form.dungeonId)  return alert('퀴즈 던전을 선택해주세요.');
    if (!form.bossId)     return alert('보스 몬스터를 선택해주세요.');
    if (hasOpenRaid)      return alert('이미 진행 중인 레이드가 있습니다.');
    if (!window.confirm(`"${form.bossName}" 보스 레이드를 오픈할까요?\n학생들이 대기실에서 입장합니다.`)) return;

    const dungeon   = dungeons.find(d => d.id === form.dungeonId);
    const questions = (dungeon.questions || []).filter(q => q.type !== 'short');
    if (questions.length === 0) return alert('선택한 던전에 객관식 문제가 없습니다.');

    setIsCreating(true);
    try {
      await addDoc(collection(db, 'worldBossRaids'), {
        title:            `${dungeon.title} 보스 레이드`,
        bossId:           form.bossId,
        bossName:         form.bossName || bossData?.name || '보스',
        dungeonId:        form.dungeonId,
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
      alert('✅ 대기실이 열렸습니다! 학생들이 입장하면 시작 버튼을 눌러주세요.');
      setTab('active');
    } catch (err) {
      console.error(err);
      alert('레이드 생성 중 오류가 발생했습니다.');
    } finally {
      setIsCreating(false);
    }
  };

  // ── 레이드 시작 ─────────────────────────────────────────────
  const startRaid = async (raidId) => {
    if (!window.confirm('레이드를 시작할까요? 학생들에게 바로 문제가 출제됩니다.')) return;
    await updateDoc(doc(db, 'worldBossRaids', raidId), {
      status:             'active',
      currentQuestionIdx: 0,
      questionStartedAt:  serverTimestamp(),
      startedAt:          serverTimestamp(),
    });
  };

  // ── 다음 문제 ────────────────────────────────────────────────
  const nextQuestion = async (raid) => {
    const questions = (raid.questions || []).filter(q => q.type !== 'short');
    const nextIdx   = (raid.currentQuestionIdx ?? 0) + 1;
    if (nextIdx >= questions.length) {
      if (!window.confirm('마지막 문제입니다. 레이드를 종료할까요?')) return;
      await updateDoc(doc(db, 'worldBossRaids', raid.id), {
        status:    raid.currentHP <= 0 ? 'cleared' : 'failed',
        clearedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'worldBossRaids', raid.id), {
        currentQuestionIdx: nextIdx,
        questionStartedAt:  serverTimestamp(),
      });
    }
  };

  // ── 강제 종료 ────────────────────────────────────────────────
  const endRaid = async (raidId) => {
    if (!window.confirm('레이드를 강제 종료하시겠습니까?')) return;
    await updateDoc(doc(db, 'worldBossRaids', raidId), {
      status: 'failed', clearedAt: serverTimestamp(),
    });
  };

  // ── 보상 지급 ────────────────────────────────────────────────
  const payRewards = async (raid) => {
    const pIds = Object.keys(raid.participants || {});
    if (pIds.length === 0) return alert('참가자가 없습니다.');
    if (raid.rewardsPaid)  return alert('이미 보상이 지급됐습니다.');
    if (!window.confirm(
      `${pIds.length}명에게 보상을 지급할까요?\n🪙${raid.rewards?.gold}G · ⭐${raid.rewards?.exp}EXP · 💎${raid.rewards?.diamond}`
    )) return;

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
        batch.update(doc(db, 'students', sid), {
          gold:     (s.gold     || 0) + (raid.rewards?.gold    || 0),
          diamonds: (s.diamonds || 0) + (raid.rewards?.diamond || 0),
          exp:      (s.exp      || 0) + (raid.rewards?.exp     || 0),
        });
        count++;
      });
      batch.update(doc(db, 'worldBossRaids', raid.id), { rewardsPaid: true });
      await batch.commit();
      alert(`✅ ${count}명에게 보상 지급 완료!`);
    } catch (err) {
      console.error(err);
      alert('보상 지급 중 오류가 발생했습니다.');
    } finally {
      setIsPaying(false);
    }
  };

  const activeRaids  = raids.filter(r => r.status === 'waiting' || r.status === 'active');
  const pastRaids    = raids.filter(r => r.status === 'cleared' || r.status === 'failed');

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* 헤더 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-wrap justify-between items-center gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800">🐉 보스 레이드 관리</h1>
            <p className="text-slate-500 text-sm mt-0.5">학급 전체 협동 이벤트 — 퀴즈를 맞혀 보스를 쓰러뜨려요</p>
          </div>
          <div className="flex gap-2">
            {[['active', '진행/대기'], ['create', '레이드 생성'], ['history', '이전 기록']].map(([t, l]) => (
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
                  onStart={() => startRaid(raid.id)}
                  onNextQuestion={() => nextQuestion(raid)}
                  onEnd={() => endRaid(raid.id)}
                  onPayRewards={() => payRewards(raid)}
                  isPaying={isPaying}
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
                <div className="flex items-end justify-center shrink-0 bg-slate-900 rounded-2xl"
                  style={{ width: 100, height: 100 }}>
                  {bossData
                    ? <SpriteMonster data={bossData} anim="idle" scale={bossData.scale * 1.5} />
                    : <div className="text-4xl">👾</div>
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
                  <button onClick={() => setShowBossPicker(true)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold rounded-xl transition-colors">
                    🔄 보스 변경
                  </button>
                </div>
              </div>
            </div>

            {/* 퀴즈 선택 */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h2 className="font-bold text-slate-700 text-sm mb-4">📝 퀴즈 던전 선택</h2>
              <select value={form.dungeonId} onChange={e => setF('dungeonId', e.target.value)}
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-rose-500 mb-2">
                <option value="">— 퀴즈 던전 선택 —</option>
                {dungeons.map(d => {
                  const choiceCount = (d.questions || []).filter(q => q.type !== 'short').length;
                  return (
                    <option key={d.id} value={d.id}>
                      {d.title} (객관식 {choiceCount}문제)
                    </option>
                  );
                })}
              </select>
              {selectedDungeon && (
                <div className="text-xs text-slate-400">
                  객관식 {(selectedDungeon.questions || []).filter(q => q.type !== 'short').length}문제 사용
                </div>
              )}
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

            <button onClick={createRaid} disabled={isCreating || hasOpenRaid || !form.dungeonId || !form.bossId}
              className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-lg rounded-2xl shadow-md transition-all disabled:opacity-40">
              {isCreating ? '생성 중...' : `🐉 대기실 오픈하기`}
            </button>
          </div>
        )}

        {/* ── 이전 기록 탭 ── */}
        {tab === 'history' && (
          pastRaids.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <div className="text-5xl mb-3">📜</div>
              <p className="font-bold text-lg text-slate-600">이전 레이드 기록이 없습니다</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="divide-y divide-slate-100">
                {pastRaids.map(raid => {
                  const pCount   = Object.keys(raid.participants || {}).length;
                  const bossData = MONSTERS_DB[raid.bossId];
                  return (
                    <div key={raid.id} className="flex items-center gap-4 px-5 py-4">
                      <div className="flex items-end justify-center shrink-0" style={{ width: 48, height: 48 }}>
                        {bossData
                          ? <SpriteMonster data={bossData} anim="death" scale={bossData.scale * 0.8} />
                          : <div className="text-3xl">👾</div>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-800 text-sm truncate">{raid.bossName}</div>
                        <div className="text-[11px] text-slate-400">{fmtDate(raid.clearedAt)}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-xs font-extrabold px-2 py-0.5 rounded-full
                          ${raid.status === 'cleared' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'}`}>
                          {raid.status === 'cleared' ? '✅ 클리어' : '💀 실패'}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{pCount}명 참가</div>
                      </div>
                    </div>
                  );
                })}
              </div>
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
  );
}
