import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, doc, writeBatch,
  onSnapshot, query, where, serverTimestamp, increment,
} from 'firebase/firestore';
import { db } from '../../firebase';

const BOSS_EMOJIS = ['🐉', '👹', '💀', '🦇', '🧟', '🐲', '👾', '🦑', '🌋', '⚡'];

const fmtDate = (ts) => {
  if (!ts) return '-';
  const d = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

function BossRaidManage() {
  const [raids, setRaids]     = useState([]);
  const [dungeons, setDungeons] = useState([]);
  const [tab, setTab]         = useState('active');
  const [isCreating, setIsCreating] = useState(false);
  const [isPaying, setIsPaying]     = useState(false);

  // 폼 상태
  const [form, setForm] = useState({
    bossName:  '시험의 드래곤',
    bossEmoji: '🐉',
    dungeonId: '',
    maxHP:     5000,
    rewards:   { gold: 200, exp: 100, diamond: 2 },
  });

  // 레이드 실시간 리스닝
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'worldBossRaids'), (snap) => {
      setRaids(snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    });
    return () => unsub();
  }, []);

  // 퀴즈 던전 목록 로드
  useEffect(() => {
    getDocs(query(collection(db, 'quizDungeons'), where('active', '==', true)))
      .then(snap => setDungeons(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);

  const activeRaids  = raids.filter(r => r.status === 'active');
  const pastRaids    = raids.filter(r => r.status !== 'active');
  const hasActiveRaid = activeRaids.length > 0;

  // ── 레이드 시작 ─────────────────────────────────────────────
  const createRaid = async () => {
    if (!form.dungeonId) return alert('퀴즈 던전을 선택해주세요.');
    if (hasActiveRaid) return alert('이미 활성화된 레이드가 있습니다.\n기존 레이드를 먼저 종료해주세요.');
    const dungeon = dungeons.find(d => d.id === form.dungeonId);
    if (!dungeon) return alert('유효하지 않은 던전입니다.');

    if (!window.confirm(`"${form.bossName}" 보스 레이드를 시작할까요?\n보스 HP: ${form.maxHP.toLocaleString()}`)) return;

    setIsCreating(true);
    try {
      await addDoc(collection(db, 'worldBossRaids'), {
        title:       `${dungeon.title} 보스 레이드`,
        bossName:    form.bossName,
        bossEmoji:   form.bossEmoji,
        dungeonId:   form.dungeonId,
        questions:   dungeon.questions || [],
        maxHP:       form.maxHP,
        currentHP:   form.maxHP,
        status:      'active',
        rewards:     form.rewards,
        participants: {},
        rewardsPaid:  false,
        createdAt:   serverTimestamp(),
        clearedAt:   null,
      });
      alert('✅ 보스 레이드가 시작되었습니다!\n학생들이 접속해 참여할 수 있습니다.');
      setTab('active');
    } catch (err) {
      console.error(err);
      alert('레이드 시작 중 오류가 발생했습니다.');
    } finally {
      setIsCreating(false);
    }
  };

  // ── 레이드 강제 종료 ─────────────────────────────────────────
  const endRaid = async (raidId) => {
    if (!window.confirm('레이드를 강제 종료하시겠습니까?')) return;
    await updateDoc(doc(db, 'worldBossRaids', raidId), {
      status:    'cleared',
      clearedAt: serverTimestamp(),
    });
  };

  // ── 집단 보상 지급 ───────────────────────────────────────────
  const payRewards = async (raid) => {
    const participants = Object.keys(raid.participants || {});
    if (participants.length === 0) return alert('참여 학생이 없습니다.');
    if (raid.rewardsPaid) return alert('이미 보상이 지급된 레이드입니다.');
    if (!window.confirm(
      `${participants.length}명에게 집단 보상을 지급할까요?\n` +
      `🪙${raid.rewards?.gold || 0}G · ⭐${raid.rewards?.exp || 0} EXP · 💎${raid.rewards?.diamond || 0}`
    )) return;

    setIsPaying(true);
    try {
      const studentsSnap = await getDocs(collection(db, 'students'));
      const allStudents = {};
      studentsSnap.docs.forEach(d => { allStudents[d.id] = d.data(); });

      const batch = writeBatch(db);
      let count = 0;

      participants.forEach(sid => {
        const s = allStudents[sid];
        if (!s) return;
        batch.update(doc(db, 'students', sid), {
          gold:     (s.gold     || 0) + (raid.rewards?.gold    || 0),
          diamonds: (s.diamonds || 0) + (raid.rewards?.diamond || 0),
          exp:      (s.exp      || 0) + (raid.rewards?.exp     || 0),
        });
        count++;
      });

      batch.update(doc(db, 'worldBossRaids', raid.id), { rewardsPaid: true });
      await batch.commit();
      alert(`✅ ${count}명에게 집단 보상 지급 완료!`);
    } catch (err) {
      console.error(err);
      alert('보상 지급 중 오류가 발생했습니다.');
    } finally {
      setIsPaying(false);
    }
  };

  const hpPct = (r) => Math.max(0, Math.round(r.currentHP / r.maxHP * 100));

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-5xl mx-auto">

        {/* 헤더 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800">🐉 월드 보스 레이드 관리</h1>
            <p className="text-slate-500 text-sm mt-0.5">학급 전체가 함께 보스를 쓰러뜨리는 협동 이벤트</p>
          </div>
          <div className="flex gap-2">
            {[['active', '진행 중'], ['create', '새 레이드'], ['history', '이전 기록']].map(([t, label]) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-2 rounded-xl font-bold text-sm transition-colors
                  ${tab === t ? 'bg-rose-600 text-white shadow' : 'bg-white text-slate-600 border border-slate-200'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── 진행 중 탭 ── */}
        {tab === 'active' && (
          activeRaids.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <div className="text-5xl mb-3">🐉</div>
              <p className="font-bold text-lg text-slate-600">진행 중인 레이드가 없습니다</p>
              <p className="text-sm mt-1">"새 레이드" 탭에서 보스를 소환하세요</p>
            </div>
          ) : activeRaids.map(raid => {
            const pct  = hpPct(raid);
            const pMap = raid.participants || {};
            const pList = Object.entries(pMap)
              .map(([id, p]) => ({ id, ...p }))
              .sort((a, b) => (b.damage || 0) - (a.damage || 0));
            const totalDmg = pList.reduce((s, p) => s + (p.damage || 0), 0);

            return (
              <div key={raid.id} className="space-y-4">
                {/* 보스 HP 카드 */}
                <div className="bg-slate-900 rounded-2xl p-5 text-white shadow-xl">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-xs font-bold opacity-60 mb-0.5">진행 중인 레이드</div>
                      <h2 className="font-extrabold text-xl flex items-center gap-2">
                        {raid.bossEmoji} {raid.bossName}
                      </h2>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400">{raid.title}</div>
                      <div className="text-sm font-bold text-slate-300 mt-0.5">
                        참여 {Object.keys(pMap).length}명
                      </div>
                    </div>
                  </div>

                  <div className="mb-2">
                    <div className="flex justify-between text-sm font-bold mb-1.5">
                      <span>보스 HP</span>
                      <span>{Math.max(0, raid.currentHP).toLocaleString()} / {raid.maxHP.toLocaleString()}</span>
                    </div>
                    <div className="w-full h-6 bg-slate-700 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-700
                        ${pct > 60 ? 'bg-emerald-500' : pct > 30 ? 'bg-amber-500' : 'bg-rose-500'}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-right text-xs text-slate-400 mt-0.5">{pct}%</div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-3 text-center text-xs">
                    <div className="bg-slate-800 rounded-xl p-2">
                      <div className="font-extrabold text-lg text-rose-400">💥 {totalDmg.toLocaleString()}</div>
                      <div className="text-slate-400">총 누적 피해</div>
                    </div>
                    <div className="bg-slate-800 rounded-xl p-2">
                      <div className="font-extrabold text-lg text-emerald-400">
                        {Math.max(0, raid.maxHP - Math.max(0, raid.currentHP)).toLocaleString()}
                      </div>
                      <div className="text-slate-400">총 입힌 피해</div>
                    </div>
                  </div>
                </div>

                {/* 참여자 기여도 */}
                {pList.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500">
                      참여자 기여도 ({pList.length}명)
                    </div>
                    <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
                      {pList.map((p, idx) => (
                        <div key={p.id} className="flex items-center justify-between px-5 py-3">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-extrabold text-slate-300 w-6">{idx + 1}</span>
                            <span className="font-bold text-slate-800 text-sm">{p.name || '학생'}</span>
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <span className="text-slate-400">{p.answeredCount || 0}문제</span>
                            <span className="font-extrabold text-rose-500">💥 {(p.damage || 0).toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 액션 버튼 */}
                <div className="flex gap-3">
                  {!raid.rewardsPaid && (
                    <button onClick={() => payRewards(raid)} disabled={isPaying}
                      className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-white font-extrabold rounded-xl transition-colors disabled:opacity-50">
                      {isPaying ? '지급 중...' : `🎁 집단 보상 지급 (${Object.keys(pMap).length}명)`}
                    </button>
                  )}
                  {raid.rewardsPaid && (
                    <div className="flex-1 py-3 bg-slate-100 text-slate-400 font-bold rounded-xl text-center text-sm">
                      ✅ 보상 지급 완료
                    </div>
                  )}
                  <button onClick={() => endRaid(raid.id)}
                    className="px-5 py-3 bg-slate-200 hover:bg-rose-100 text-slate-600 hover:text-rose-600 font-bold rounded-xl transition-colors">
                    종료
                  </button>
                </div>
              </div>
            );
          })
        )}

        {/* ── 새 레이드 탭 ── */}
        {tab === 'create' && (
          <div className="space-y-5">
            {hasActiveRaid && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-sm text-amber-700 font-medium">
                ⚠️ 이미 활성화된 레이드가 있습니다. 기존 레이드를 종료한 후 새로 시작할 수 있습니다.
              </div>
            )}

            {/* 보스 설정 */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h2 className="font-bold text-slate-700 text-sm mb-4">👾 보스 설정</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">보스 이름</label>
                    <input value={form.bossName}
                      onChange={e => setForm(p => ({ ...p, bossName: e.target.value }))}
                      className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-rose-500"
                      placeholder="시험의 드래곤" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">보스 HP</label>
                    <input type="number" min="1000" step="1000" value={form.maxHP}
                      onChange={e => setForm(p => ({ ...p, maxHP: Number(e.target.value) }))}
                      className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-center focus:outline-none focus:border-rose-500" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2">보스 이모지</label>
                  <div className="flex gap-2 flex-wrap">
                    {BOSS_EMOJIS.map(e => (
                      <button key={e} onClick={() => setForm(p => ({ ...p, bossEmoji: e }))}
                        className={`w-10 h-10 text-2xl rounded-xl flex items-center justify-center transition-colors
                          ${form.bossEmoji === e ? 'bg-rose-100 ring-2 ring-rose-400' : 'bg-slate-50 hover:bg-slate-100'}`}>
                        {e}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">퀴즈 던전 선택 *</label>
                  <select value={form.dungeonId}
                    onChange={e => setForm(p => ({ ...p, dungeonId: e.target.value }))}
                    className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-rose-500">
                    <option value="">퀴즈 던전 선택 (보스가 출제할 문제)</option>
                    {dungeons.map(d => (
                      <option key={d.id} value={d.id}>{d.title} ({d.questionCount}문제)</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* 보상 설정 */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h2 className="font-bold text-slate-700 text-sm mb-4">🎁 집단 보상 (참여 전원 지급)</h2>
              <div className="flex gap-3">
                {[['gold', '🪙 골드'], ['exp', '⭐ EXP'], ['diamond', '💎 다이아']].map(([k, label]) => (
                  <div key={k}>
                    <div className="text-[10px] text-slate-400 font-semibold mb-1">{label}</div>
                    <input type="number" min="0" value={form.rewards[k]}
                      onChange={e => setForm(p => ({ ...p, rewards: { ...p.rewards, [k]: Number(e.target.value) || 0 } }))}
                      className="w-24 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-center focus:outline-none focus:border-rose-500" />
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-3">보스 처치 후 교사가 직접 보상 지급 버튼을 누릅니다.</p>
            </div>

            <button onClick={createRaid} disabled={isCreating || hasActiveRaid || !form.dungeonId}
              className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-lg rounded-2xl shadow-md transition-all disabled:opacity-40">
              {isCreating ? '소환 중...' : `🐉 ${form.bossEmoji} ${form.bossName} 소환하기!`}
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
                  const pCount = Object.keys(raid.participants || {}).length;
                  const totalDmg = Object.values(raid.participants || {}).reduce((s, p) => s + (p.damage || 0), 0);
                  return (
                    <div key={raid.id} className="px-5 py-4 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xl">{raid.bossEmoji}</span>
                          <span className="font-bold text-slate-800">{raid.bossName}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full
                            ${raid.currentHP <= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                            {raid.currentHP <= 0 ? '처치 성공' : '종료'}
                          </span>
                          {raid.rewardsPaid && (
                            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                              보상지급완료
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400">
                          {fmtDate(raid.createdAt)} · 참여 {pCount}명 · 총 피해 {totalDmg.toLocaleString()}
                        </div>
                      </div>
                      {!raid.rewardsPaid && pCount > 0 && (
                        <button onClick={() => payRewards(raid)} disabled={isPaying}
                          className="px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 font-bold text-xs rounded-xl hover:bg-amber-100 transition-colors disabled:opacity-50">
                          🎁 보상 지급
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}

export default BossRaidManage;
