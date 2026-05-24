import React, { useState, useEffect, useRef } from 'react';
import {
  collection, getDocs, query, where, doc, updateDoc, addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';

// ── 레벨 기반 스탯 ───────────────────────────────────────────
const getStats = (level = 1) => ({
  hp:          100 + Math.floor(level * 10),
  attack:      10  + Math.floor(level * 2),
  defense:     5   + Math.floor(level * 1.5),
  crit:        5   + Math.floor(level * 0.5),
  attackSpeed: 10  + Math.floor(level * 1),
});

const getMaxExpForLevel = (lv) =>
  lv <= 10 ? 100 : lv <= 30 ? 300 : lv <= 60 ? 800 : 2000;

const calcLevelUp = (level, exp, gained) => {
  let lv = level || 1, ex = (exp || 0) + gained;
  let mx = getMaxExpForLevel(lv), leveled = false;
  while (ex >= mx && lv < 99) { ex -= mx; lv++; mx = getMaxExpForLevel(lv); leveled = true; }
  return { level: lv, exp: ex, maxExp: mx, leveled };
};

const STAT_META = [
  { key:'hp',          label:'체력',     img:'/images/Icon_Heart02.png',            icon:'❤️' },
  { key:'attack',      label:'공격력',   img:'/images/ItemIcon_Weapon_Sword.png',   icon:'⚔️' },
  { key:'defense',     label:'방어력',   img:'/images/ItemIcon_Weapon_Shield.png',  icon:'🛡️' },
  { key:'crit',        label:'크리티컬', img:'/images/Icon_Fire01.png',             icon:'💥' },
  { key:'attackSpeed', label:'공격속도', img:null,                                  icon:'💨' },
];

const WIN_REWARD  = { gold: 100, diamond: 50, exp: 50 };
const LOSE_REWARD = { gold: 0,   diamond: 0,  exp: 25 };
const CHANGE_COST = 30;
const MAX_CHANGES = 3;

// ── 전적 기록 화면 ────────────────────────────────────────────
function HistoryScreen({ studentDocId, studentCode, onBack }) {
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentDocId) { setLoading(false); return; }
    (async () => {
      try {
        const [asMe, asOpp] = await Promise.all([
          getDocs(query(collection(db, 'arenaLogs'), where('studentId',   '==', studentDocId))),
          getDocs(query(collection(db, 'arenaLogs'), where('opponentId',  '==', studentDocId))),
        ]);
        const all = [
          ...asMe.docs.map(d  => ({ id: d.id,  ...d.data(),  perspective: 'me'  })),
          ...asOpp.docs.map(d => ({ id: d.id,  ...d.data(),  perspective: 'opp' })),
        ].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setLogs(all);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [studentDocId]);

  const fmtDate = (ts) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const wins  = logs.filter(l => l.perspective === 'me' ? l.isWin : !l.isWin).length;
  const loses = logs.filter(l => l.perspective === 'me' ? !l.isWin : l.isWin).length;

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-950 to-indigo-950 flex flex-col p-5">
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="text-slate-400 hover:text-white text-sm font-bold px-3 py-1.5 bg-slate-800 rounded-xl">← 뒤로</button>
        <h2 className="font-extrabold text-white text-lg">📋 전적 기록</h2>
      </div>

      {/* 승패 요약 */}
      {!loading && logs.length > 0 && (
        <div className="flex gap-3 mb-5">
          <div className="flex-1 bg-slate-900/60 rounded-2xl p-3 text-center border border-slate-700">
            <div className="text-2xl font-extrabold text-white">{logs.length}</div>
            <div className="text-xs text-slate-400 mt-0.5">전체</div>
          </div>
          <div className="flex-1 bg-yellow-950/40 rounded-2xl p-3 text-center border border-yellow-700/40">
            <div className="text-2xl font-extrabold text-yellow-400">{wins}</div>
            <div className="text-xs text-slate-400 mt-0.5">승</div>
          </div>
          <div className="flex-1 bg-rose-950/40 rounded-2xl p-3 text-center border border-rose-800/40">
            <div className="text-2xl font-extrabold text-rose-400">{loses}</div>
            <div className="text-xs text-slate-400 mt-0.5">패</div>
          </div>
          <div className="flex-1 bg-indigo-950/40 rounded-2xl p-3 text-center border border-indigo-700/40">
            <div className="text-2xl font-extrabold text-indigo-400">
              {logs.length > 0 ? Math.round(wins / logs.length * 100) : 0}%
            </div>
            <div className="text-xs text-slate-400 mt-0.5">승률</div>
          </div>
        </div>
      )}

      {/* 목록 */}
      {loading ? (
        <div className="text-slate-400 text-center py-10 animate-pulse">불러오는 중...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <div className="text-4xl mb-3">⚔️</div>
          <p className="font-bold">아직 전적이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-2 overflow-y-auto flex-1">
          {logs.map(log => {
            // perspective: 'me' = 내가 도전자, 'opp' = 내가 상대로 매칭된 것
            const iWon = log.perspective === 'me' ? log.isWin : !log.isWin;
            const myName    = log.perspective === 'me' ? log.studentName  : log.opponentName;
            const enemyName = log.perspective === 'me' ? log.opponentName : log.studentName;

            // 상대방 이미지: 내가 도전자면 상대 이미지, 내가 상대로 매칭됐으면 도전자 이미지
            const enemyImg = log.perspective === 'me'
              ? log.opponentCharacterImage
              : log.studentCharacterImage;

            return (
              <div key={log.id}
                className={`rounded-2xl border p-4 flex items-center gap-3
                  ${iWon ? 'bg-yellow-950/30 border-yellow-700/40' : 'bg-rose-950/30 border-rose-800/40'}`}>
                {/* 승패 뱃지 */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-base font-extrabold shrink-0
                  ${iWon ? 'bg-yellow-500 text-yellow-900' : 'bg-slate-700 text-slate-400'}`}>
                  {iWon ? '승' : '패'}
                </div>

                {/* 상대 캐릭터 */}
                <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-600 overflow-hidden shrink-0 flex items-center justify-center">
                  {enemyImg
                    ? <img src={enemyImg} alt="" className="w-full h-full object-contain scale-[2]" />
                    : <span className="text-xl">🧑‍🎓</span>}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-white font-extrabold text-sm truncate">{enemyName}</span>
                    {log.perspective === 'opp' && (
                      <span className="text-[9px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded-full shrink-0">상대로 매칭됨</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">{fmtDate(log.createdAt)}</div>
                </div>

                {/* 보상 */}
                {iWon && log.reward && (
                  <div className="text-right shrink-0">
                    {log.reward.gold    > 0 && <div className="text-xs text-amber-400 font-bold">🪙+{log.reward.gold}</div>}
                    {log.reward.diamond > 0 && <div className="text-xs text-cyan-400 font-bold">💎+{log.reward.diamond}</div>}
                    {log.reward.exp     > 0 && <div className="text-xs text-indigo-400 font-bold">⭐+{log.reward.exp}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── 랭킹 화면 ────────────────────────────────────────────────
function RankingScreen({ classmates, studentDocId, onBack }) {
  const [ranks, setRanks]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!classmates.length) { setLoading(false); return; }
    (async () => {
      try {
        const ids = classmates.map(s => s.id);
        // studentId 기준 로그 (최대 10개씩 in 쿼리)
        const chunks = [];
        for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));

        const stats = {}; // { id: { name, code, level, characterImage, wins, loses } }
        const initStat = (s) => {
          if (!stats[s.id]) stats[s.id] = {
            id: s.id, name: s.name || s.studentCode, code: s.studentCode,
            level: s.level || 1, characterImage: s.characterImage || '',
            wins: 0, loses: 0,
          };
        };
        classmates.forEach(initStat);

        for (const chunk of chunks) {
          const [asChallenger, asOpponent] = await Promise.all([
            getDocs(query(collection(db, 'arenaLogs'), where('studentId',  'in', chunk))),
            getDocs(query(collection(db, 'arenaLogs'), where('opponentId', 'in', chunk))),
          ]);
          asChallenger.docs.forEach(d => {
            const { studentId, opponentId, isWin } = d.data();
            if (stats[studentId])  isWin ? stats[studentId].wins++  : stats[studentId].loses++;
            if (stats[opponentId]) isWin ? stats[opponentId].loses++ : stats[opponentId].wins++;
          });
          asOpponent.docs.forEach(d => {
            const { studentId, opponentId, isWin } = d.data();
            // asChallenger와 중복 방지: opponentId가 chunk에 있고 studentId가 chunk에 없는 경우만
            if (!chunk.includes(studentId)) {
              if (stats[studentId])  isWin ? stats[studentId].wins++  : stats[studentId].loses++;
              if (stats[opponentId]) isWin ? stats[opponentId].loses++ : stats[opponentId].wins++;
            }
          });
        }

        const list = Object.values(stats)
          .sort((a, b) => {
            if (b.wins !== a.wins) return b.wins - a.wins;
            const aTotal = a.wins + a.loses, bTotal = b.wins + b.loses;
            if (bTotal && aTotal) return (b.wins / bTotal) - (a.wins / aTotal);
            return bTotal - aTotal;
          });
        setRanks(list);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [classmates]);

  const MEDALS = ['🥇','🥈','🥉'];

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-950 to-indigo-950 flex flex-col p-5">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="text-slate-400 hover:text-white text-sm font-bold px-3 py-1.5 bg-slate-800 rounded-xl">← 뒤로</button>
        <h2 className="font-extrabold text-white text-lg">🏆 투기장 랭킹</h2>
      </div>

      {loading ? (
        <div className="text-slate-400 text-center py-10 animate-pulse">집계 중...</div>
      ) : ranks.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <div className="text-4xl mb-3">🏆</div><p className="font-bold">아직 전적이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-2">
          {ranks.map((r, idx) => {
            const total   = r.wins + r.loses;
            const winRate = total > 0 ? Math.round(r.wins / total * 100) : 0;
            const isMe    = r.id === studentDocId;
            return (
              <div key={r.id}
                className={`rounded-2xl p-4 flex items-center gap-3 border
                  ${isMe ? 'bg-indigo-900/50 border-indigo-500' : 'bg-slate-900/50 border-slate-700'}`}>
                {/* 순위 */}
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-lg font-extrabold
                  bg-slate-800 text-slate-300">
                  {idx < 3 ? MEDALS[idx] : <span className="text-sm">{idx + 1}</span>}
                </div>

                {/* 캐릭터 */}
                <div className="w-14 h-14 rounded-xl bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center border border-slate-600">
                  {r.characterImage
                    ? <img src={r.characterImage} alt="" className="w-full h-full object-contain scale-[2.5]" />
                    : <span className="text-2xl">🧑‍🎓</span>}
                </div>

                {/* 이름 + 정보 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`font-extrabold text-sm truncate ${isMe ? 'text-indigo-300' : 'text-white'}`}>{r.name}</span>
                    {isMe && <span className="text-[9px] bg-indigo-600 text-white px-1.5 py-0.5 rounded-full shrink-0">나</span>}
                  </div>
                  <div className="text-xs text-slate-500">Lv.{r.level} · {total}전 {r.wins}승 {r.loses}패</div>
                </div>

                {/* 승률 */}
                <div className="text-right shrink-0">
                  <div className={`text-base font-extrabold ${winRate >= 60 ? 'text-yellow-400' : winRate >= 40 ? 'text-slate-300' : 'text-rose-400'}`}>
                    {winRate}%
                  </div>
                  <div className="text-[10px] text-slate-500">{r.wins}승</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── 전적 내부 (모달용) ────────────────────────────────────────
function HistoryInner({ studentDocId }) {
  const [logs, setLogs]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentDocId) { setLoading(false); return; }
    (async () => {
      try {
        const [asMe, asOpp] = await Promise.all([
          getDocs(query(collection(db, 'arenaLogs'), where('studentId',  '==', studentDocId))),
          getDocs(query(collection(db, 'arenaLogs'), where('opponentId', '==', studentDocId))),
        ]);
        const all = [
          ...asMe.docs.map(d  => ({ id: d.id, ...d.data(), perspective: 'me'  })),
          ...asOpp.docs.map(d => ({ id: d.id, ...d.data(), perspective: 'opp' })),
        ].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setLogs(all);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [studentDocId]);

  const fmtDate = (ts) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const wins  = logs.filter(l => l.perspective === 'me' ? l.isWin  : !l.isWin).length;
  const loses = logs.filter(l => l.perspective === 'me' ? !l.isWin : l.isWin).length;

  if (loading) return <div className="text-slate-400 text-center py-8 animate-pulse">불러오는 중...</div>;
  if (logs.length === 0) return (
    <div className="text-center py-12 text-slate-500">
      <div className="text-4xl mb-3">⚔️</div><p className="font-bold">아직 전적이 없습니다</p>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* 요약 */}
      <div className="flex gap-2 mb-4">
        {[['전체', logs.length, 'text-white'], ['승', wins, 'text-yellow-400'], ['패', loses, 'text-rose-400'],
          [`${logs.length ? Math.round(wins/logs.length*100) : 0}%`, '승률', 'text-indigo-400']].map(([val, label, cls], i) => (
          <div key={i} className="flex-1 bg-slate-800 rounded-xl p-2 text-center border border-slate-700">
            <div className={`text-lg font-extrabold ${cls}`}>{i < 3 ? val : val}</div>
            <div className="text-[10px] text-slate-500">{i < 3 ? label : '승률'}</div>
          </div>
        ))}
      </div>
      {logs.map(log => {
        const iWon     = log.perspective === 'me' ? log.isWin : !log.isWin;
        const enemyName = log.perspective === 'me' ? log.opponentName : log.studentName;
        const enemyImg  = log.perspective === 'me' ? log.opponentCharacterImage : log.studentCharacterImage;
        return (
          <div key={log.id} className={`rounded-2xl border p-3 flex items-center gap-3
            ${iWon ? 'bg-yellow-950/30 border-yellow-700/40' : 'bg-rose-950/30 border-rose-800/40'}`}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-extrabold shrink-0
              ${iWon ? 'bg-yellow-500 text-yellow-900' : 'bg-slate-700 text-slate-400'}`}>
              {iWon ? '승' : '패'}
            </div>
            <div className="w-11 h-11 rounded-xl bg-slate-800 border border-slate-600 overflow-hidden shrink-0 flex items-center justify-center">
              {enemyImg ? <img src={enemyImg} alt="" className="w-full h-full object-contain scale-[2]" /> : <span className="text-xl">🧑‍🎓</span>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-white font-extrabold text-sm truncate">{enemyName}</span>
                {log.perspective === 'opp' && <span className="text-[9px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded-full shrink-0">상대로 매칭됨</span>}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">{fmtDate(log.createdAt)}</div>
            </div>
            {iWon && log.reward && (
              <div className="text-right shrink-0 text-[11px] font-bold space-y-0.5">
                {log.reward.gold    > 0 && <div className="text-amber-400">🪙+{log.reward.gold}</div>}
                {log.reward.diamond > 0 && <div className="text-cyan-400">💎+{log.reward.diamond}</div>}
                {log.reward.exp     > 0 && <div className="text-indigo-400">⭐+{log.reward.exp}</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── 랭킹 내부 (모달용) ────────────────────────────────────────
function RankingInner({ classmates, studentDocId }) {
  const [ranks, setRanks]   = useState([]);
  const [loading, setLoading] = useState(true);
  const MEDALS = ['🥇','🥈','🥉'];

  useEffect(() => {
    if (!classmates.length) { setLoading(false); return; }
    (async () => {
      try {
        const ids = classmates.map(s => s.id);
        const stats = {};
        classmates.forEach(s => {
          stats[s.id] = { id: s.id, name: s.name || s.studentCode, level: s.level || 1, characterImage: s.characterImage || '', wins: 0, loses: 0 };
        });
        const chunks = [];
        for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
        for (const chunk of chunks) {
          const snap = await getDocs(query(collection(db, 'arenaLogs'), where('studentId', 'in', chunk)));
          snap.docs.forEach(d => {
            const { studentId, opponentId, isWin } = d.data();
            if (stats[studentId])  isWin ? stats[studentId].wins++  : stats[studentId].loses++;
            if (stats[opponentId]) isWin ? stats[opponentId].loses++ : stats[opponentId].wins++;
          });
        }
        setRanks(Object.values(stats).sort((a, b) => b.wins !== a.wins ? b.wins - a.wins : ((b.wins/(b.wins+b.loses||1)) - (a.wins/(a.wins+a.loses||1)))));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [classmates]);

  if (loading) return <div className="text-slate-400 text-center py-8 animate-pulse">집계 중...</div>;

  return (
    <div className="space-y-2">
      {ranks.map((r, idx) => {
        const total   = r.wins + r.loses;
        const winRate = total > 0 ? Math.round(r.wins / total * 100) : 0;
        const isMe    = r.id === studentDocId;
        return (
          <div key={r.id} className={`rounded-2xl p-3 flex items-center gap-3 border
            ${isMe ? 'bg-indigo-900/50 border-indigo-500' : 'bg-slate-800/50 border-slate-700'}`}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-slate-700 text-base font-extrabold">
              {idx < 3 ? MEDALS[idx] : <span className="text-sm text-slate-300">{idx+1}</span>}
            </div>
            <div className="w-14 h-14 rounded-xl bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center border border-slate-600">
              {r.characterImage ? <img src={r.characterImage} alt="" className="w-full h-full object-contain scale-[2.5]" /> : <span className="text-2xl">🧑‍🎓</span>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={`font-extrabold text-sm truncate ${isMe ? 'text-indigo-300' : 'text-white'}`}>{r.name}</span>
                {isMe && <span className="text-[9px] bg-indigo-600 text-white px-1.5 py-0.5 rounded-full shrink-0">나</span>}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Lv.{r.level} · {total}전 {r.wins}승 {r.loses}패</div>
            </div>
            <div className="text-right shrink-0">
              <div className={`text-base font-extrabold ${winRate >= 60 ? 'text-yellow-400' : winRate >= 40 ? 'text-slate-300' : 'text-rose-400'}`}>{winRate}%</div>
              <div className="text-[10px] text-slate-500">{r.wins}승</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 캐릭터 카드 ───────────────────────────────────────────────
function CharacterCard({ student, label, isMe, highlight, rank }) {
  const stats = getStats(student?.level || 1);
  const lv    = student?.level || 1;
  const expPct = Math.min(100, Math.round(((student?.exp||0) / getMaxExpForLevel(lv)) * 100));

  return (
    <div className={`flex flex-col items-center rounded-3xl p-5 transition-all
      ${highlight ? 'ring-2 ring-yellow-400 shadow-lg shadow-yellow-400/20' : ''}
      ${isMe ? 'bg-indigo-950/60' : 'bg-rose-950/60'}`}>

      {/* 라벨 */}
      <div className={`text-[10px] font-extrabold px-3 py-0.5 rounded-full mb-3
        ${isMe ? 'bg-indigo-500 text-white' : 'bg-rose-500 text-white'}`}>
        {label}
      </div>

      {/* 캐릭터 이미지 */}
      <div className="w-36 h-36 rounded-2xl bg-slate-800 border border-slate-600 overflow-hidden flex items-center justify-center mb-3 relative">
        {student?.characterImage ? (
          <img src={student.characterImage} alt="" className="w-full h-full object-contain scale-[2.5]" />
        ) : (
          <span className="text-5xl">🧑‍🎓</span>
        )}
        <div className={`absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-extrabold px-2 py-0.5 rounded-full
          ${isMe ? 'bg-indigo-500' : 'bg-rose-500'} text-white whitespace-nowrap`}>
          Lv.{lv}
        </div>
      </div>

      {/* 이름 + 랭킹 */}
      <div className="flex flex-col items-center mb-1">
        <div className="font-extrabold text-white text-sm truncate max-w-[120px]">
          {student?.name || student?.studentCode || '???'}
        </div>
        {rank != null && (
          <div className="text-[10px] font-bold text-slate-400 mt-0.5">
            {rank === 0 ? '🥇 1위' : rank === 1 ? '🥈 2위' : rank === 2 ? '🥉 3위' : `${rank + 1}위`}
          </div>
        )}
      </div>

      {/* EXP 바 */}
      <div className="w-full mb-3">
        <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${isMe ? 'bg-indigo-400' : 'bg-rose-400'}`}
            style={{ width: `${expPct}%` }} />
        </div>
      </div>

      {/* 스탯 */}
      <div className="w-full space-y-2.5 mt-1">
        {STAT_META.map(s => (
          <div key={s.key} className="flex items-center justify-between">
            <span className="text-slate-400 flex items-center gap-1.5 text-base font-bold">
              {s.img
                ? <img src={s.img} alt="" className="w-5 h-5 object-contain" />
                : <span className="text-base">{s.icon}</span>}
              {s.label}
            </span>
            <span className="font-extrabold text-white text-2xl">{stats[s.key]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 결과 화면 ─────────────────────────────────────────────────
function ResultScreen({ isWin, opponent, reward, onClose }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!isWin) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');

    const COLORS = ['#FFD700','#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD','#98D8C8','#FF9F43'];
    const SHAPES = ['circle','star','rect'];
    const particles = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * 200,
      vx: (Math.random() - 0.5) * 4,
      vy: 1.5 + Math.random() * 4,
      size: 6 + Math.random() * 10,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 0.2,
      opacity: 1,
    }));

    let raf;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      particles.forEach(p => {
        p.x  += p.vx;
        p.y  += p.vy;
        p.vy += 0.08;
        p.rot += p.rotV;
        if (p.y < canvas.height + 20) { alive = true; p.opacity = Math.max(0, 1 - p.y / canvas.height); }
        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle   = p.color;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (p.shape === 'circle') {
          ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.fill();
        } else if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
          // star
          ctx.beginPath();
          for (let i = 0; i < 5; i++) {
            const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
            const b = (i * 4 * Math.PI) / 5 + Math.PI / 5 - Math.PI / 2;
            if (i === 0) ctx.moveTo(Math.cos(a) * p.size / 2, Math.sin(a) * p.size / 2);
            else ctx.lineTo(Math.cos(a) * p.size / 2, Math.sin(a) * p.size / 2);
            ctx.lineTo(Math.cos(b) * p.size / 4, Math.sin(b) * p.size / 4);
          }
          ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      });
      if (alive) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [isWin]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      {isWin && (
        <canvas ref={canvasRef}
          className="absolute inset-0 pointer-events-none"
          style={{ width: '100%', height: '100%' }} />
      )}
      <div className={`relative bg-slate-900 rounded-3xl p-8 w-full max-w-sm text-center border shadow-2xl
        ${isWin ? 'border-yellow-600/60 shadow-yellow-900/40' : 'border-slate-700'}`}>
        <div className="text-6xl mb-4">{isWin ? '🏆' : '💀'}</div>
        <h2 className={`text-3xl font-extrabold mb-2 ${isWin ? 'text-yellow-400' : 'text-slate-400'}`}>
          {isWin ? '승리!' : '패배'}
        </h2>
        <p className="text-slate-400 text-sm mb-6">
          {isWin
            ? `${opponent?.name || '상대'}를 물리쳤습니다!`
            : `${opponent?.name || '상대'}에게 패배했습니다.`}
        </p>

        {/* 보상 */}
        <div className={`rounded-2xl p-4 mb-6 ${isWin ? 'bg-yellow-950/60 border border-yellow-700' : 'bg-slate-800 border border-slate-700'}`}>
          <div className={`text-xs font-bold mb-3 ${isWin ? 'text-yellow-400' : 'text-slate-400'}`}>
            {isWin ? '🎁 획득 보상' : '위로 보상'}
          </div>
          <div className="flex justify-center gap-5">
            {reward.gold    > 0 && <div className="flex flex-col items-center"><span className="text-xl">🪙</span><span className="text-yellow-300 font-extrabold text-sm">+{reward.gold}G</span></div>}
            {reward.diamond > 0 && <div className="flex flex-col items-center"><span className="text-xl">💎</span><span className="text-cyan-300 font-extrabold text-sm">+{reward.diamond}</span></div>}
            {reward.exp     > 0 && <div className="flex flex-col items-center"><span className="text-xl">⭐</span><span className="text-indigo-300 font-extrabold text-sm">+{reward.exp}</span></div>}
          </div>
        </div>

        <button onClick={onClose}
          className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold transition-all active:scale-95">
          확인
        </button>
      </div>
    </div>
  );
}

// ── 메인 ─────────────────────────────────────────────────────
export default function Arena({ studentCode, tickets, onUseTicket }) {
  // sessionStorage로 매칭 상태 유지 (네비게이션 이동해도 상대 유지)
  const savedMatch = (() => { try { return JSON.parse(sessionStorage.getItem('arenaMatch') || 'null'); } catch { return null; } })();

  const [phase, setPhase]         = useState(savedMatch ? 'vs' : 'lobby');
  const [opponent, setOpponent]   = useState(savedMatch?.opponent || null);
  const [changes, setChanges]     = useState(savedMatch?.changes ?? 0);
  const [battleLog, setBattleLog] = useState([]);
  const [battleHP, setBattleHP]   = useState({ me: 0, opp: 0 });
  const [battleMaxHP, setBattleMaxHP] = useState({ me: 0, opp: 0 });
  const [hitFlash, setHitFlash]   = useState({ me: false, opp: false });
  const [hitDmg, setHitDmg]       = useState({ me: null, opp: null }); // { dmg, isCrit } | null
  const logRef = useRef(null);

  // 매칭 상태 저장
  const saveMatch = (opp, ch) => {
    sessionStorage.setItem('arenaMatch', JSON.stringify({ opponent: opp, changes: ch }));
  };
  const clearMatch = () => sessionStorage.removeItem('arenaMatch');

  // 최근 대련 상대 기록 (세션 내 중복 방지)
  const recentOpponents = useRef(
    (() => { try { return JSON.parse(sessionStorage.getItem('arenaRecent') || '[]'); } catch { return []; } })()
  );
  const addRecentOpponent = (id) => {
    const list = [id, ...recentOpponents.current.filter(x => x !== id)].slice(0, 5);
    recentOpponents.current = list;
    sessionStorage.setItem('arenaRecent', JSON.stringify(list));
  };

  const [me, setMe]               = useState(null);
  const [classmates, setClassmates] = useState([]);
  const [isBusy, setIsBusy]       = useState(false);
  const [result, setResult]       = useState(null);
  const [rankMap, setRankMap]     = useState({});
  const [showHistory, setShowHistory] = useState(false);
  const [showRanking, setShowRanking] = useState(false);
  const [ticketUsedMsg, setTicketUsedMsg] = useState(false);
  const [matchAnim, setMatchAnim] = useState(false);
  const studentDocIdRef           = useRef(null);
  const arenaTickets              = tickets?.arena ?? 0;

  // 내 정보 + 우리반 로드
  useEffect(() => {
    if (!studentCode) return;
    (async () => {
      try {
        const meSnap = await getDocs(query(collection(db, 'students'), where('studentCode', '==', studentCode)));
        if (meSnap.empty) return;
        const meDoc = meSnap.docs[0];
        studentDocIdRef.current = meDoc.id;
        setMe({ id: meDoc.id, ...meDoc.data() });

        const tid = meDoc.data().teacherUid;
        const q   = tid
          ? query(collection(db, 'students'), where('teacherUid', '==', tid))
          : collection(db, 'students');
        const snap = await getDocs(q);
        const isTestAccount = meDoc.data().studentCode === 'SINSEOK-5-15';
        const others = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(s => {
            if (s.id === meDoc.id) return false; // 나 자신 제외
            // 내가 테스트 계정이 아니면 SINSEOK-5-15를 상대 풀에서 제외
            if (!isTestAccount && s.studentCode === 'SINSEOK-5-15') return false;
            return true;
          });
        setClassmates(others);

        // 레벨 기반 임시 rankMap (대전 기록 없어도 표시)
        const all = [{ id: meDoc.id, ...meDoc.data() }, ...others]
          .sort((a, b) => (b.level || 1) - (a.level || 1));
        const rm = {};
        all.forEach((s, i) => { rm[s.id] = i; });
        setRankMap(rm);
      } catch (e) { console.error(e); }
    })();
  }, [studentCode]);

  const pickRandom = (excludeId = null) => {
    const recent = recentOpponents.current;
    // 최근 상대 + 현재 상대 제외한 풀
    let pool = classmates.filter(s => s.id !== excludeId && !recent.includes(s.id));
    // 풀이 비면 최근 상대 제한 완화 (현재 상대만 제외)
    if (pool.length === 0) pool = classmates.filter(s => s.id !== excludeId);
    // 그래도 비면 전체
    if (pool.length === 0) pool = classmates;
    return pool[Math.floor(Math.random() * pool.length)] ?? null;
  };

  // 매칭 시작
  const startMatching = async () => {
    if (arenaTickets <= 0 || isBusy) return;
    setIsBusy(true);
    try {
      await onUseTicket('arena'); // 매칭 시작 즉시 이용권 차감
      setTicketUsedMsg(true);
      setTimeout(() => setTicketUsedMsg(false), 2500);
    } catch (e) {
      setIsBusy(false);
      return;
    }
    setMatchAnim(true);
    setPhase('matching');
    await new Promise(r => setTimeout(r, 1800));
    const opp = pickRandom();
    setOpponent(opp);
    setChanges(0);
    saveMatch(opp, 0);
    setMatchAnim(false);
    setPhase('vs');
    setIsBusy(false);
  };

  // 상대 바꾸기
  const changeOpponent = async () => {
    if (changes >= MAX_CHANGES || isBusy) return;
    const myData = me;
    if ((myData?.diamonds || 0) < CHANGE_COST) return alert(`💎 부족! ${CHANGE_COST}💎 필요`);
    setIsBusy(true);
    try {
      const docId = studentDocIdRef.current;
      await updateDoc(doc(db, 'students', docId), {
        diamonds: (myData.diamonds || 0) - CHANGE_COST,
      });
      setMe(prev => ({ ...prev, diamonds: (prev.diamonds || 0) - CHANGE_COST }));
      setMatchAnim(true);
      await new Promise(r => setTimeout(r, 600));
      const opp = pickRandom(opponent?.id);
      const newChanges = changes + 1;
      setOpponent(opp);
      setChanges(newChanges);
      saveMatch(opp, newChanges);
      setMatchAnim(false);
    } catch (e) { console.error(e); }
    finally { setIsBusy(false); }
  };

  // ── 데미지 계산 ──────────────────────────────────────────────
  const calcDmg = (atkStats, defStats) => {
    const base   = Math.max(1, atkStats.attack - Math.floor(defStats.defense / 2));
    const isCrit = Math.random() * 100 < atkStats.crit;
    return { dmg: isCrit ? Math.floor(base * 1.6) : base, isCrit };
  };

  // ── 대련 시작 (자동 턴제) ─────────────────────────────────────
  const startBattle = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      clearMatch(); // 전투 시작 시 매칭 초기화

      const myStats  = getStats(me?.level  || 1);
      const oppStats = getStats(opponent?.level || 1);
      let myHP  = myStats.hp;
      let oppHP = oppStats.hp;

      setBattleMaxHP({ me: myHP, opp: oppHP });
      setBattleHP({ me: myHP, opp: oppHP });
      setBattleLog([]);
      setPhase('battle');

      const myName  = me?.name  || me?.studentCode  || '나';
      const oppName = opponent?.name || opponent?.studentCode || '상대';
      const log = [];
      const addLog = (msg, type = 'normal') => { log.push({ msg, type }); };

      // 공격 속도에 따른 선공 결정
      const myFirst = myStats.attackSpeed >= oppStats.attackSpeed;
      addLog(`⚔️ 대련 시작! ${myFirst ? myName : oppName}이(가) 선공!`, 'system');

      const TURN_MS  = 1000;  // 1초 간격
      const MAX_TURN = 15;    // 최대 15턴 (~15초)

      for (let turn = 1; turn <= MAX_TURN; turn++) {
        if (myHP <= 0 || oppHP <= 0) break;

        // 약간의 딜레이 후 턴 실행
        await new Promise(r => setTimeout(r, TURN_MS));

        if (myHP <= 0 || oppHP <= 0) break;

        const attackOrder = myFirst
          ? [{ atk: myStats, def: oppStats, name: myName, isMe: true  },
             { atk: oppStats, def: myStats, name: oppName, isMe: false }]
          : [{ atk: oppStats, def: myStats, name: oppName, isMe: false },
             { atk: myStats, def: oppStats, name: myName, isMe: true  }];

        for (const { atk, def, name, isMe } of attackOrder) {
          if (myHP <= 0 || oppHP <= 0) break;

          const { dmg, isCrit } = calcDmg(atk, def);
          if (isMe) {
            oppHP = Math.max(0, oppHP - dmg);
            addLog(`${isCrit ? '💥 크리티컬! ' : ''}${name}의 공격 → ${dmg} 데미지`, isCrit ? 'crit' : 'attack');
            setHitFlash(h => ({ ...h, opp: true }));
            setHitDmg(h => ({ ...h, opp: { dmg, isCrit } }));
            setTimeout(() => { setHitFlash(h => ({ ...h, opp: false })); setHitDmg(h => ({ ...h, opp: null })); }, 700);
          } else {
            myHP = Math.max(0, myHP - dmg);
            addLog(`${isCrit ? '💥 크리티컬! ' : ''}${name}의 반격 → ${dmg} 데미지`, isCrit ? 'crit' : 'attack');
            setHitFlash(h => ({ ...h, me: true }));
            setHitDmg(h => ({ ...h, me: { dmg, isCrit } }));
            setTimeout(() => { setHitFlash(h => ({ ...h, me: false })); setHitDmg(h => ({ ...h, me: null })); }, 700);
          }
          setBattleHP({ me: myHP, opp: oppHP });
          setBattleLog([...log]);
          if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;

          await new Promise(r => setTimeout(r, 500));
        }
      }

      // 결과 판정
      const isWin = myHP > oppHP;
      addLog(isWin ? `🏆 ${myName} 승리!` : `💀 ${oppName} 승리!`, 'result');
      setBattleLog([...log]);

      const reward = isWin ? WIN_REWARD : LOSE_REWARD;
      const docId  = studentDocIdRef.current;

      // 보상 지급
      const { level, exp, maxExp } = calcLevelUp(me.level, me.exp, reward.exp);
      await updateDoc(doc(db, 'students', docId), {
        gold:     (me.gold     || 0) + reward.gold,
        diamonds: (me.diamonds || 0) + reward.diamond,
        exp, level, maxExp,
      });
      setMe(prev => ({ ...prev, gold: (prev.gold||0)+reward.gold, diamonds: (prev.diamonds||0)+reward.diamond, exp, level, maxExp }));

      // 방금 싸운 상대 기록 (다음 매칭에서 제외)
      if (opponent?.id) addRecentOpponent(opponent.id);

      // 테스트 계정(SINSEOK / admin_master_001)은 전적 기록 저장 안 함
      const isTestBattle = me?.teacherUid === 'admin_master_001' || opponent?.teacherUid === 'admin_master_001';
      if (!isTestBattle) {
        await addDoc(collection(db, 'arenaLogs'), {
          studentId: docId, studentCode: me.studentCode, studentName: myName,
          studentCharacterImage: me.characterImage || '',
          opponentId: opponent?.id, opponentCode: opponent?.studentCode, opponentName: oppName,
          opponentCharacterImage: opponent?.characterImage || '',
          isWin, reward, createdAt: serverTimestamp(),
        });
      }

      await new Promise(r => setTimeout(r, 1200));
      setResult({ isWin, reward });
      setPhase('result');
    } catch (e) { console.error(e); }
    finally { setIsBusy(false); }
  };

  const reset = () => {
    clearMatch();
    setPhase('lobby');
    setOpponent(null);
    setChanges(0);
    setResult(null);
  };

  // ── 로비 ────────────────────────────────────────────────────
  if (phase === 'lobby') {
    return (
      <>
      <div className="min-h-screen bg-gradient-to-b from-slate-950 to-indigo-950 flex flex-col items-center justify-center p-6">
        <div className="text-6xl mb-4">🏟️</div>
        <h1 className="text-3xl font-extrabold text-white mb-2">투기장</h1>
        <p className="text-slate-400 text-sm mb-8 text-center">
          우리반 친구와 1:1 대련으로 실력을 겨뤄보세요!
        </p>

        {/* 내 캐릭터 미리보기 */}
        {me && (
          <div className="bg-slate-900/60 rounded-2xl p-4 mb-6 flex items-center gap-4 border border-slate-700 w-full max-w-xs">
            <div className="w-16 h-16 rounded-xl bg-slate-800 overflow-hidden flex items-center justify-center">
              {me.characterImage
                ? <img src={me.characterImage} alt="" className="w-full h-full object-contain scale-[2.2]" style={{ transform: 'scale(2.2) scaleX(-1)' }} />
                : <span className="text-2xl">🧑‍🎓</span>}
            </div>
            <div>
              <div className="font-extrabold text-white text-sm">{me.name || me.studentCode}</div>
              <div className="text-slate-400 text-xs">Lv.{me.level || 1}</div>
              <div className="flex gap-2 mt-1 text-xs">
                <span className="text-amber-400">🪙 {(me.gold||0).toLocaleString()}</span>
                <span className="text-cyan-400">💎 {me.diamonds||0}</span>
              </div>
            </div>
          </div>
        )}

        {/* 보상 안내 */}
        <div className="bg-yellow-950/40 border border-yellow-700/50 rounded-2xl px-5 py-3 mb-6 w-full max-w-xs">
          <div className="text-xs font-bold text-yellow-400 mb-2">🏆 승리 보상</div>
          <div className="flex justify-around text-sm font-extrabold">
            <span className="text-amber-300">🪙 {WIN_REWARD.gold}G</span>
            <span className="text-cyan-300">💎 {WIN_REWARD.diamond}</span>
            <span className="text-indigo-300">⭐ {WIN_REWARD.exp}</span>
          </div>
        </div>

        {/* 이용권 + 입장 버튼 */}
        <div className="flex items-center gap-2 mb-4 text-sm text-slate-400">
          <span>🏟️ 이용권</span>
          <span className={`font-extrabold ${arenaTickets > 0 ? 'text-violet-400' : 'text-rose-400'}`}>
            {arenaTickets}장
          </span>
        </div>

        <button onClick={startMatching} disabled={arenaTickets <= 0 || isBusy || classmates.length === 0}
          className={`w-full max-w-xs py-4 rounded-2xl font-extrabold text-lg transition-all active:scale-95 shadow-lg
            ${arenaTickets > 0 && classmates.length > 0
              ? 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-violet-900'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>
          {classmates.length === 0 ? '대전 상대 없음' : arenaTickets <= 0 ? '이용권 없음' : '⚔️ 대전 상대 찾기'}
        </button>

        <div className="flex gap-2 w-full max-w-xs mt-2">
          <button onClick={() => setShowHistory(true)}
            className="flex-1 py-2.5 rounded-2xl font-bold text-sm text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 transition-all">
            📋 전적 기록
          </button>
          <button onClick={() => setShowRanking(true)}
            className="flex-1 py-2.5 rounded-2xl font-bold text-sm text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 transition-all">
            🏆 랭킹
          </button>
        </div>
      </div>

      {/* 전적 기록 모달 */}
      {showHistory && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setShowHistory(false)}>
          <div className="bg-slate-900 rounded-3xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden border border-slate-700 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 shrink-0">
              <h2 className="font-extrabold text-white text-lg">📋 전적 기록</h2>
              <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-white text-xl w-8 h-8 flex items-center justify-center">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 p-4">
              <HistoryInner studentDocId={studentDocIdRef.current} />
            </div>
          </div>
        </div>
      )}

      {/* 랭킹 모달 */}
      {showRanking && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setShowRanking(false)}>
          <div className="bg-slate-900 rounded-3xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden border border-slate-700 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 shrink-0">
              <h2 className="font-extrabold text-white text-lg">🏆 투기장 랭킹</h2>
              <button onClick={() => setShowRanking(false)} className="text-slate-400 hover:text-white text-xl w-8 h-8 flex items-center justify-center">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 p-4">
              <RankingInner classmates={[...(me ? [me] : []), ...classmates]} studentDocId={studentDocIdRef.current} />
            </div>
          </div>
        </div>
      )}
      </>
    );
  }

  // ── 매칭 중 ─────────────────────────────────────────────────
  if (phase === 'matching') {
    return (
      <div className="min-h-full bg-gradient-to-b from-slate-950 to-indigo-950 flex flex-col items-center justify-center gap-6">
        <div className="text-5xl animate-spin">⚔️</div>
        <p className="text-white font-extrabold text-xl animate-pulse">상대를 찾는 중...</p>
        {ticketUsedMsg && (
          <div className="bg-violet-900/80 border border-violet-500 text-violet-200 text-sm font-bold px-5 py-2.5 rounded-2xl animate-bounce">
            🏟️ 투기장 이용권 1개 사용됨
          </div>
        )}
        <div className="flex gap-1">
          {[0,1,2].map(i => (
            <div key={i} className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: `${i*0.2}s` }} />
          ))}
        </div>
      </div>
    );
  }

  // ── VS 화면 ─────────────────────────────────────────────────
  if (phase === 'vs' && opponent) {
    const myStats  = getStats(me?.level || 1);
    const oppStats = getStats(opponent?.level || 1);
    const canChange = changes < MAX_CHANGES && (me?.diamonds || 0) >= CHANGE_COST;
    const myPower   = myStats.attack * 2 + myStats.defense + myStats.hp / 20;
    const oppPower  = oppStats.attack * 2 + oppStats.defense + oppStats.hp / 20;
    const advantage = myPower > oppPower ? 'win' : myPower < oppPower ? 'lose' : 'even';

    return (
      <>
      <div className="min-h-full bg-gradient-to-b from-slate-950 to-indigo-950 p-4 flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <div />
          <div className={`text-xs font-extrabold px-3 py-1.5 rounded-full
            ${advantage==='win' ? 'bg-emerald-900 text-emerald-400' : advantage==='lose' ? 'bg-rose-900 text-rose-400' : 'bg-slate-800 text-slate-400'}`}>
            {advantage==='win' ? '⬆️ 유리' : advantage==='lose' ? '⬇️ 불리' : '🔄 互角'}
          </div>
          <div className="text-xs text-slate-400">변경 {MAX_CHANGES - changes}회 남음</div>
        </div>

        {/* VS 카드 */}
        <div className={`flex items-stretch gap-3 mb-4 transition-opacity duration-300 ${matchAnim ? 'opacity-30' : 'opacity-100'}`}>
          <div className="flex-1"><CharacterCard student={me} label="나" isMe rank={rankMap[me?.id]} /></div>

          <div className="flex flex-col items-center justify-center gap-2 shrink-0">
            <div className="text-2xl font-extrabold text-slate-500">VS</div>
            <div className="w-px flex-1 bg-slate-700" />
          </div>

          <div className="flex-1"><CharacterCard student={opponent} label="상대" isMe={false} rank={rankMap[opponent?.id]} /></div>
        </div>

        {/* 상대 바꾸기 */}
        <button onClick={changeOpponent} disabled={!canChange || isBusy}
          className={`w-full py-3 rounded-2xl font-bold text-sm mb-3 transition-all border
            ${canChange && !isBusy
              ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-600 active:scale-95'
              : 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed'}`}>
          {changes >= MAX_CHANGES ? '변경 횟수 소진'
            : (me?.diamonds || 0) < CHANGE_COST ? `💎 부족 (${CHANGE_COST}💎 필요)`
            : `🔄 상대 바꾸기 (-💎${CHANGE_COST})  ·  ${MAX_CHANGES - changes}회 남음`}
        </button>

        {/* 대련 시작 */}
        <button onClick={startBattle} disabled={isBusy}
          className="w-full py-4 rounded-2xl font-extrabold text-lg bg-gradient-to-r from-rose-600 to-orange-500 hover:from-rose-500 hover:to-orange-400 text-white shadow-lg shadow-rose-900 transition-all active:scale-95 disabled:opacity-50">
          {isBusy ? '처리 중...' : '⚔️ 대련 시작!'}
        </button>

        <p className="text-center text-[10px] text-slate-600 mt-2">
          * 이용권 소비됨 · 대련 시작 후 취소 불가
        </p>

        {/* 전적/랭킹 */}
        <div className="flex gap-2 mt-2">
          <button onClick={() => setShowHistory(true)}
            className="flex-1 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 transition-all">
            📋 전적 기록
          </button>
          <button onClick={() => setShowRanking(true)}
            className="flex-1 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 transition-all">
            🏆 랭킹
          </button>
        </div>
      </div>

      {/* 전적 기록 모달 */}
      {showHistory && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setShowHistory(false)}>
          <div className="bg-slate-900 rounded-3xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden border border-slate-700 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 shrink-0">
              <h2 className="font-extrabold text-white text-lg">📋 전적 기록</h2>
              <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-white text-xl w-8 h-8 flex items-center justify-center">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 p-4">
              <HistoryInner studentDocId={studentDocIdRef.current} />
            </div>
          </div>
        </div>
      )}

      {/* 랭킹 모달 */}
      {showRanking && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setShowRanking(false)}>
          <div className="bg-slate-900 rounded-3xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden border border-slate-700 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 shrink-0">
              <h2 className="font-extrabold text-white text-lg">🏆 투기장 랭킹</h2>
              <button onClick={() => setShowRanking(false)} className="text-slate-400 hover:text-white text-xl w-8 h-8 flex items-center justify-center">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 p-4">
              <RankingInner classmates={[...(me ? [me] : []), ...classmates]} studentDocId={studentDocIdRef.current} />
            </div>
          </div>
        </div>
      )}
      </>
    );
  }

  // ── 자동 전투 화면 ──────────────────────────────────────────
  if (phase === 'battle') {
    const myMaxHP  = battleMaxHP.me  || 1;
    const oppMaxHP = battleMaxHP.opp || 1;
    const myPct    = Math.max(0, Math.round((battleHP.me  / myMaxHP)  * 100));
    const oppPct   = Math.max(0, Math.round((battleHP.opp / oppMaxHP) * 100));
    const LOG_COLORS = { crit: 'text-yellow-400', attack: 'text-slate-200', system: 'text-indigo-400', result: 'text-emerald-400' };

    return (
      <div className="bg-gradient-to-b from-slate-950 to-indigo-950 flex flex-col p-5 gap-5"
        style={{ height: 'calc(100vh - 88px)' }}>

        {/* 캐릭터 + HP */}
        <div className="flex items-stretch gap-4 flex-1 min-h-0" style={{ maxHeight: '55%' }}>
          {/* 나 */}
          <div className={`flex-1 flex flex-col items-center gap-3 bg-indigo-950/60 rounded-3xl p-5 border-2 transition-all
            ${hitFlash.me ? (hitDmg.me?.isCrit ? 'border-yellow-400 bg-yellow-950/30 scale-[0.95]' : 'border-rose-500 bg-rose-950/40 scale-[0.98]') : 'border-indigo-700'}`}>
            <div className="text-xs font-extrabold text-indigo-400 tracking-widest">나</div>
            <div className="flex-1 w-full flex items-center justify-center relative">
              <div className="w-44 h-44 rounded-2xl bg-slate-800 overflow-hidden flex items-center justify-center border border-slate-600">
                {me?.characterImage
                  ? <img src={me.characterImage} alt="" className="w-full h-full object-contain scale-[3]" style={{ transform: 'scale(3) scaleX(-1)' }} />
                  : <span className="text-5xl">🧑‍🎓</span>}
              </div>
              {hitDmg.me && (
                <div className={`absolute -top-2 left-1/2 -translate-x-1/2 font-extrabold animate-bounce pointer-events-none
                  ${hitDmg.me.isCrit ? 'text-yellow-300 text-2xl drop-shadow-[0_0_8px_#facc15]' : 'text-rose-400 text-xl'}`}>
                  {hitDmg.me.isCrit ? '💥 ' : ''}-{hitDmg.me.dmg}
                </div>
              )}
            </div>
            <div className="w-full">
              <div className="text-white font-extrabold text-sm truncate text-center mb-2">{me?.name || me?.studentCode}</div>
              <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                <span className="font-bold">HP</span>
                <span className={`font-extrabold ${myPct < 30 ? 'text-rose-400' : 'text-slate-300'}`}>{battleHP.me} / {myMaxHP}</span>
              </div>
              <div className="w-full h-4 bg-slate-700 rounded-full overflow-hidden shadow-inner">
                <div className={`h-full rounded-full transition-all duration-500 ${myPct > 50 ? 'bg-emerald-500' : myPct > 25 ? 'bg-amber-500' : 'bg-rose-500'}`}
                  style={{ width: `${myPct}%` }} />
              </div>
            </div>
          </div>

          {/* VS */}
          <div className="flex flex-col items-center justify-center shrink-0 gap-2">
            <div className="text-slate-500 font-extrabold text-2xl">VS</div>
            <div className="flex gap-1">
              {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: `${i*0.2}s` }} />)}
            </div>
          </div>

          {/* 상대 */}
          <div className={`flex-1 flex flex-col items-center gap-3 bg-rose-950/60 rounded-3xl p-5 border-2 transition-all
            ${hitFlash.opp ? (hitDmg.opp?.isCrit ? 'border-yellow-400 bg-yellow-950/30 scale-[0.95]' : 'border-rose-400 bg-rose-950/60 scale-[0.98]') : 'border-rose-800'}`}>
            <div className="text-xs font-extrabold text-rose-400 tracking-widest">상대</div>
            <div className="flex-1 w-full flex items-center justify-center relative">
              <div className="w-44 h-44 rounded-2xl bg-slate-800 overflow-hidden flex items-center justify-center border border-slate-600">
                {opponent?.characterImage
                  ? <img src={opponent.characterImage} alt="" className="w-full h-full object-contain scale-[3]" />
                  : <span className="text-5xl">🧑‍🎓</span>}
              </div>
              {hitDmg.opp && (
                <div className={`absolute -top-2 left-1/2 -translate-x-1/2 font-extrabold animate-bounce pointer-events-none
                  ${hitDmg.opp.isCrit ? 'text-yellow-300 text-2xl drop-shadow-[0_0_8px_#facc15]' : 'text-rose-400 text-xl'}`}>
                  {hitDmg.opp.isCrit ? '💥 ' : ''}-{hitDmg.opp.dmg}
                </div>
              )}
            </div>
            <div className="w-full">
              <div className="text-white font-extrabold text-sm truncate text-center mb-2">{opponent?.name || opponent?.studentCode}</div>
              <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                <span className="font-bold">HP</span>
                <span className={`font-extrabold ${oppPct < 30 ? 'text-rose-400' : 'text-slate-300'}`}>{battleHP.opp} / {oppMaxHP}</span>
              </div>
              <div className="w-full h-4 bg-slate-700 rounded-full overflow-hidden shadow-inner">
                <div className={`h-full rounded-full transition-all duration-500 ${oppPct > 50 ? 'bg-emerald-500' : oppPct > 25 ? 'bg-amber-500' : 'bg-rose-500'}`}
                  style={{ width: `${oppPct}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* 전투 로그 */}
        <div ref={logRef}
          className="flex-1 min-h-0 bg-slate-900/80 rounded-3xl border border-slate-700 p-4 overflow-y-auto">
          {battleLog.length === 0 ? (
            <p className="text-slate-600 text-sm text-center py-6 animate-pulse">⚔️ 전투 준비 중...</p>
          ) : (
            <div className="space-y-1.5">
              {battleLog.map((entry, i) => (
                <div key={i} className={`text-sm font-medium leading-relaxed ${LOG_COLORS[entry.type] || 'text-slate-300'}`}>
                  {entry.msg}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }


  // ── 결과 ────────────────────────────────────────────────────
  if (phase === 'result' && result) {
    return (
      <div className="min-h-full bg-gradient-to-b from-slate-950 to-indigo-950">
        <ResultScreen
          isWin={result.isWin}
          opponent={opponent}
          reward={result.reward}
          onClose={reset}
        />
      </div>
    );
  }

  return null;
}
