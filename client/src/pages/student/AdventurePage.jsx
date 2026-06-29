import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, doc, updateDoc, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { getMaxExpForLevel } from '../../utils/leveling';
import QuizDungeon from './QuizDungeon';
import BossRaid from './BossRaid';
import ExplorationDungeon from './ExplorationDungeon';
import Arena2 from './Arena2';

// ── 이용권 설정 ────────────────────────────────────────────────
const TICKET_CONFIG = {
  dungeon:  { daily: 1, mondayBonus: 1, max: 3, icon: '🗡️', label: '던전 이용권',  color: 'sky'    },
  arena:    { daily: 2, mondayBonus: 2, max: 5, icon: '🏟️', label: '투기장 이용권', color: 'violet' },
};

// 어떤 뷰가 어떤 이용권을 사용하는지
const getDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const VIEW_CONFIG = {
  adventure:          { title: '어드벤처',   icon: '⚔️',  ticketKey: null },
  quizDungeon:        { title: '퀴즈던전',   icon: '🗡️',  ticketKey: 'dungeon'  },
  explorationDungeon: { title: '탐험던전',   icon: '🗺️',  ticketKey: 'dungeon'  },
  bossRaid:           { title: '퀴즈레이드', icon: '👹',  ticketKey: 'bossRaid' },
  arena:              { title: '투기장',     icon: '🏟️',  ticketKey: 'arena'    },
  miniGame:           { title: '미니 게임', icon: '🎮',  ticketKey: null       },
};

// 이번 주 월요일 날짜 문자열 반환 (예: "2025-05-19")
const getMostRecentMonday = () => {
  const now = new Date();
  const day = now.getDay(); // 0=일, 1=월, ..., 6=토
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(monday.getDate() - diff);
  monday.setHours(0, 0, 0, 0);
  return getDateKey(monday);
};

// ─────────────────────── 이용권 바 ────────────────────────────
function TicketBar({ tickets, isRefreshing, studentInfo }) {
  return (
    <div className="bg-slate-900 border-b border-slate-700/60 px-4 py-2 flex items-center gap-4 flex-wrap shrink-0">

      {/* 캐릭터 스탯 */}
      {studentInfo && (
        <div className="flex items-center gap-3 pr-4 border-r border-slate-700">
          {/* 레벨 */}
          <div className="flex flex-col items-center">
            <span className="text-[9px] text-slate-400 font-medium">레벨</span>
            <span className="text-sm font-extrabold text-amber-400">Lv.{studentInfo.level ?? 1}</span>
          </div>
          {/* EXP 바 */}
          <div className="flex flex-col gap-0.5 w-20">
            <span className="text-[9px] text-slate-400 font-medium">EXP</span>
            <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-400 rounded-full transition-all"
                style={{ width: `${Math.min(100, Math.round(((studentInfo.exp ?? 0) / (studentInfo.maxExp ?? 100)) * 100))}%` }}
              />
            </div>
            <span className="text-[9px] text-slate-500">{studentInfo.exp ?? 0}/{studentInfo.maxExp ?? 100}</span>
          </div>
          {/* 골드 */}
          <div className="flex flex-col items-center">
            <span className="text-[9px] text-slate-400 font-medium">골드</span>
            <span className="text-sm font-extrabold text-yellow-400">🪙{(studentInfo.gold ?? 0).toLocaleString()}</span>
          </div>
          {/* 다이아 */}
          <div className="flex flex-col items-center">
            <span className="text-[9px] text-slate-400 font-medium">다이아</span>
            <span className="text-sm font-extrabold text-cyan-400">💎{studentInfo.diamonds ?? 0}</span>
          </div>
        </div>
      )}

      {/* 이용권 */}
      {Object.entries(TICKET_CONFIG).map(([key, cfg]) => {
        const count = tickets?.[key] ?? '-';
        const filled = typeof count === 'number' ? count : 0;
        return (
          <div key={key} className="flex items-center gap-2">
            <span className="text-xl leading-none">{cfg.icon}</span>
            <div>
              <div className="text-[10px] text-slate-400 font-medium leading-none mb-1">{cfg.label}</div>
              <div className="flex items-center gap-0.5">
                {Array.from({ length: cfg.max }, (_, i) => (
                  <div
                    key={i}
                    className={`w-2.5 h-2.5 rounded-full transition-colors
                      ${i < filled
                        ? key === 'dungeon'  ? 'bg-sky-400'
                        : key === 'bossRaid' ? 'bg-rose-400'
                        : 'bg-violet-400'
                        : 'bg-slate-600'}`}
                  />
                ))}
                <span className="text-[11px] font-extrabold text-white ml-1.5">
                  {count}/{cfg.max}
                </span>
              </div>
            </div>
          </div>
        );
      })}

      {isRefreshing && (
        <span className="text-[10px] text-emerald-400 font-bold animate-pulse ml-auto">
          ✨ 오늘 이용권이 지급되었습니다!
        </span>
      )}
    </div>
  );
}

// ─────────────────────── 메인 허브 화면 ──────────────────────
const ADVENTURE_CARDS = [
  {
    id: 'classOperation',
    icon: '🏰', sub: 'Class Mission',
    title: '우리반 대작전',
    desc: '매일 한 번 힘을 모아 우리 반 공동 목표 달성',
    ticketKey: null,
    bg: 'from-amber-950 to-rose-950',
    border: 'border-amber-700/60',
    dot: 'bg-amber-400',
    shadow: 'shadow-amber-950',
    btn: 'bg-amber-500 hover:bg-amber-400',
  },
  {
    id: 'quizDungeon',
    icon: '⚔️', sub: 'Quiz Dungeon',
    title: '퀴즈 던전',
    desc: '솔로 퀴즈 배틀로 몬스터를 처치하고 보상 획득',
    ticketKey: null,
    bg: 'from-sky-950 to-indigo-950',
    border: 'border-sky-800/60',
    dot: 'bg-sky-400',
    shadow: 'shadow-sky-950',
    btn: 'bg-sky-500 hover:bg-sky-400',
  },
  {
    id: 'explorationDungeon',
    icon: '🗺️', sub: 'Exploration',
    title: '탐험 던전',
    desc: 'Unity RPG 던전 탐험 · 보물과 아이템 수집',
    ticketKey: 'dungeon',
    bg: 'from-emerald-950 to-teal-950',
    border: 'border-emerald-800/60',
    dot: 'bg-emerald-400',
    shadow: 'shadow-emerald-950',
    btn: 'bg-emerald-500 hover:bg-emerald-400',
  },
  {
    id: 'bossRaid',
    icon: '👹', sub: 'Quiz Raid',
    title: '퀴즈레이드',
    desc: '학급 전원 협력 · 함께 푸는 퀴즈 챌린지',
    ticketKey: null,
    bg: 'from-rose-950 to-red-950',
    border: 'border-rose-800/60',
    dot: 'bg-rose-400',
    shadow: 'shadow-rose-950',
    btn: 'bg-rose-500 hover:bg-rose-400',
  },
  {
    id: 'arena',
    icon: '🏟️', sub: 'Arena',
    title: '투기장',
    desc: '1:1 랭크 퀴즈 배틀 · 실력을 겨뤄라',
    ticketKey: 'arena',
    bg: 'from-violet-950 to-purple-950',
    border: 'border-violet-800/60',
    dot: 'bg-violet-400',
    shadow: 'shadow-violet-950',
    btn: 'bg-violet-500 hover:bg-violet-400',
  },
];

const MINI_CARD = {
  id: 'miniGame',
  icon: '🎮', sub: 'Mini Game',
  title: '미니 게임',
  desc: '다양한 미니 게임으로 골드를 획득하세요 (준비 중)',
  ticketKey: null,
  bg: 'from-amber-950 to-orange-950',
  border: 'border-amber-800/60',
  btn: 'bg-amber-500 hover:bg-amber-400',
};

function AdventureHub({ tickets, onNavigate }) {
  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, #020617 0%, #0f172a 50%, #1e1b4b 100%)' }}>

      {/* 헤더 */}
      <div className="px-5 pt-8 pb-5 text-center">
        <p className="text-[10px] font-extrabold tracking-[0.3em] text-indigo-400 mb-2 uppercase">Adventure Hub</p>
        <h1 className="text-3xl font-extrabold text-white mb-1.5 tracking-wide">⚔️ 어드벤처</h1>
        <p className="text-slate-500 text-sm">이용권으로 다양한 어드벤처에 도전하세요</p>
      </div>

      {/* 2×2 메인 그리드 */}
      <div className="px-4 pb-3 grid grid-cols-2 gap-3">
        {ADVENTURE_CARDS.map(adv => {
          const cfg    = adv.ticketKey ? TICKET_CONFIG[adv.ticketKey] : null;
          const count  = adv.ticketKey ? (tickets?.[adv.ticketKey] ?? 0) : null;
          const locked = cfg ? count <= 0 : false;
          return (
            <button key={adv.id}
              onClick={() => !locked && onNavigate?.(adv.id)}
              disabled={locked}
              className={`relative bg-gradient-to-br ${adv.bg} border ${adv.border} rounded-2xl p-4 text-left
                flex flex-col gap-2.5 transition-all active:scale-95
                ${locked
                  ? 'opacity-50 cursor-not-allowed'
                  : `shadow-lg ${adv.shadow} hover:brightness-110`}`}>

              {locked && (
                <div className="absolute top-2.5 right-2.5 text-[10px] text-white/40 font-bold bg-black/30 px-1.5 py-0.5 rounded-full">
                  🔒
                </div>
              )}

              {/* 아이콘 */}
              <div className="text-4xl leading-none">{adv.icon}</div>

              {/* 텍스트 */}
              <div className="flex-1">
                <div className="text-[9px] font-extrabold tracking-widest text-white/35 mb-0.5">{adv.sub}</div>
                <div className="text-sm font-extrabold text-white leading-tight mb-1">{adv.title}</div>
                <div className="text-[10px] text-white/45 leading-snug line-clamp-2">{adv.desc}</div>
              </div>

              {/* 이용권 도트 — ticketKey가 있을 때만 표시 */}
              {cfg && count !== null && (
                <div className="flex items-center gap-1">
                  {Array.from({ length: cfg.max }, (_, i) => (
                    <div key={i} className={`w-2 h-2 rounded-full transition-colors
                      ${i < count ? adv.dot : 'bg-white/15'}`} />
                  ))}
                  <span className="text-[10px] text-white/40 font-bold ml-0.5">{count}/{cfg.max}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* 미니 게임 — 풀 너비 */}
      <div className="px-4 pb-8">
        <button
          onClick={() => onNavigate?.(MINI_CARD.id)}
          className={`w-full bg-gradient-to-r ${MINI_CARD.bg} border ${MINI_CARD.border} rounded-2xl p-4
            flex items-center gap-4 transition-all active:scale-95 hover:brightness-110 shadow-lg`}>
          <div className="text-5xl leading-none shrink-0">{MINI_CARD.icon}</div>
          <div className="flex-1 text-left">
            <div className="text-[9px] font-extrabold tracking-widest text-white/35 mb-0.5">{MINI_CARD.sub}</div>
            <div className="text-base font-extrabold text-white">{MINI_CARD.title}</div>
            <div className="text-xs text-white/45 mt-0.5">{MINI_CARD.desc}</div>
          </div>
          <div className="shrink-0 text-white/30 text-lg">→</div>
        </button>
      </div>
    </div>
  );
}

// ─────────────────────── 개별 콘텐츠 화면 ────────────────────
function AdventureContent({ view, tickets, onUseTicket, isBusy }) {
  const cfg       = VIEW_CONFIG[view];
  const ticketCfg = cfg.ticketKey ? TICKET_CONFIG[cfg.ticketKey] : null;
  const count     = cfg.ticketKey ? (tickets?.[cfg.ticketKey] ?? 0) : null;
  const hasTicket = count === null || count > 0;

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="text-8xl mb-5 drop-shadow-lg">{cfg.icon}</div>
      <h1 className="text-3xl font-extrabold text-slate-800 mb-2">{cfg.title}</h1>

      {/* 이용권 표시 */}
      {count !== null && ticketCfg && (
        <div className="flex items-center gap-3 mb-6 bg-slate-100 px-6 py-3 rounded-2xl border border-slate-200">
          <span className="text-2xl">{ticketCfg.icon}</span>
          <div className="text-left">
            <div className="text-xs text-slate-500 font-medium">{ticketCfg.label}</div>
            <div className="flex items-center gap-1 mt-0.5">
              {Array.from({ length: ticketCfg.max }, (_, i) => (
                <div key={i} className={`w-3 h-3 rounded-full border
                  ${i < count
                    ? cfg.ticketKey === 'dungeon'  ? 'bg-sky-400 border-sky-300'
                    : cfg.ticketKey === 'bossRaid' ? 'bg-rose-400 border-rose-300'
                    : 'bg-violet-400 border-violet-300'
                    : 'bg-slate-200 border-slate-300'}`} />
              ))}
              <span className={`ml-1 font-extrabold text-sm ${count > 0 ? 'text-slate-700' : 'text-rose-500'}`}>
                {count}/{ticketCfg.max}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 입장 버튼 */}
      <button
        onClick={() => hasTicket && onUseTicket(cfg.ticketKey)}
        disabled={!hasTicket || isBusy}
        className={`px-10 py-4 rounded-2xl font-extrabold text-lg transition-all active:scale-95 shadow-lg
          ${hasTicket && !isBusy
            ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200 cursor-pointer'
            : 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'}`}>
        {isBusy ? '처리 중...' : !hasTicket ? '이용권 없음' : '입장하기 →'}
      </button>

      {!hasTicket && (
        <p className="text-sm text-slate-400 mt-3">
          매일 기본 이용권이 자동 지급되고, 월요일에는 보너스 이용권이 추가 지급됩니다
        </p>
      )}

      <div className="mt-10 bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-sm text-slate-400 max-w-xs">
        🚧 Unity 연동 후 오픈 예정입니다
      </div>
    </div>
  );
}

// ─────────────────────── Main ─────────────────────────────────
function AdventurePage({ currentView, studentCode, onChangeView }) {
  const [studentDocId, setStudentDocId] = useState(null);
  const [tickets, setTickets]           = useState(null);
  const [studentInfo, setStudentInfo]   = useState(null);
  const [isLoading, setIsLoading]       = useState(true);
  const [isRefreshed, setIsRefreshed]   = useState(false);
  const [isBusy, setIsBusy]             = useState(false);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setIsRefreshed(false);
      if (!studentCode) { setIsLoading(false); return; }

      try {
        const q    = query(collection(db, 'students'), where('studentCode', '==', studentCode));
        const snap = await getDocs(q);
        if (snap.empty) { setIsLoading(false); return; }

        const sDoc = snap.docs[0];
        const data = sDoc.data();
        setStudentDocId(sDoc.id);
        const calcMaxExp = getMaxExpForLevel;
        let lv = data.level ?? 1;
        let ex = data.exp ?? 0;
        let mx = calcMaxExp(lv);
        let normalized = false;
        while (ex >= mx && lv < 99) {
          ex -= mx;
          lv += 1;
          mx = calcMaxExp(lv);
          normalized = true;
        }
        if (normalized || (data.maxExp ?? 0) !== mx) {
          await updateDoc(doc(db, 'students', sDoc.id), {
            level: lv,
            exp: ex,
            maxExp: mx,
          });
        }
        setStudentInfo({
          level:    lv,
          exp:      ex,
          maxExp:   mx,
          gold:     data.gold     ?? 0,
          diamonds: data.diamonds ?? 0,
        });

        const savedTickets = data.tickets || { dungeon: 0, arena: 0 };
        const todayKey = getDateKey();
        const mondayKey = getMostRecentMonday();
        const lastDailyRefresh = data.lastTicketDailyRefreshDate || data.lastTicketRefreshDate || '';
        const lastMondayBonus = data.lastTicketWeeklyBonusDate || data.lastTicketRefreshDate || '';
        const shouldDailyRefresh = lastDailyRefresh < todayKey;
        const shouldMondayBonus = lastMondayBonus < mondayKey;

        if (shouldDailyRefresh || shouldMondayBonus) {
          // 주간 이용권 갱신
          const newTickets = { ...savedTickets };
          for (const [key, cfg] of Object.entries(TICKET_CONFIG)) {
            const cur = savedTickets[key] ?? 0;
            const dailyAmount = shouldDailyRefresh ? Number(cfg.daily || 0) : 0;
            const bonusAmount = shouldMondayBonus ? Number(cfg.mondayBonus || 0) : 0;
            newTickets[key] = Math.min(cfg.max, cur + dailyAmount + bonusAmount);
          }
          const updates = { tickets: newTickets };
          if (shouldDailyRefresh) updates.lastTicketDailyRefreshDate = todayKey;
          if (shouldMondayBonus) updates.lastTicketWeeklyBonusDate = mondayKey;
          await updateDoc(doc(db, 'students', sDoc.id), updates);
          setTickets(newTickets);
          setIsRefreshed(true);
          setTimeout(() => setIsRefreshed(false), 4000);
        } else {
          setTickets(savedTickets);
        }

        // 테스트 계정 무한 이용권
        if (studentCode === 'SINSEOK-5-15') {
          setTickets({ dungeon: 9999, bossRaid: 9999, arena: 9999 });
        }
      } catch (err) {
        console.error('어드벤처 로딩 에러:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [studentCode]);

  // 이용권 1개 소비
  const handleUseTicket = useCallback(async (ticketKey) => {
    if (!ticketKey || !studentDocId || !tickets) return;
    if (studentCode === 'SINSEOK-5-15') return; // 테스트 계정 소비 없음
    const count = tickets[ticketKey] ?? 0;
    if (count <= 0) return;

    setIsBusy(true);
    try {
      const newCount = count - 1;
      await updateDoc(doc(db, 'students', studentDocId), {
        [`tickets.${ticketKey}`]: newCount,
      });
      setTickets(prev => ({ ...prev, [ticketKey]: newCount }));
      // TODO: Unity 게임 실행 연동
      alert(`${TICKET_CONFIG[ticketKey].label} 1개를 사용했습니다.\n(게임 연동 후 자동 실행 예정)`);
    } catch (err) {
      console.error('이용권 사용 에러:', err);
    } finally {
      setIsBusy(false);
    }
  }, [studentDocId, tickets]);

  if (!studentCode) {
    return (
      <div className="min-h-full bg-slate-50">
        <div className="sticky top-0 z-10">
          <TicketBar tickets={null} />
        </div>
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <div className="text-6xl mb-4">⚔️</div>
          <p className="font-bold text-lg text-slate-600">로그인이 필요합니다</p>
          <p className="text-sm mt-1">교사 페이지에서 테스트 로그인하세요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50">
      {/* 티켓바: sticky로 스크롤해도 항상 상단 고정 */}
      <div className="sticky top-0 z-10">
        <TicketBar tickets={isLoading ? null : tickets} isRefreshing={isRefreshed} studentInfo={isLoading ? null : studentInfo} />
      </div>
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
          <div className="text-slate-400 font-bold text-sm">불러오는 중...</div>
        </div>
      ) : currentView === 'quizDungeon' ? (
        <QuizDungeon
          studentCode={studentCode}
          studentDocId={studentDocId}
          tickets={tickets}
          onUseTicket={handleUseTicket}
        />
      ) : currentView === 'bossRaid' ? (
        <BossRaid
          studentCode={studentCode}
          studentDocId={studentDocId}
          tickets={tickets}
          onUseTicket={handleUseTicket}
        />
      ) : currentView === 'explorationDungeon' ? (
        <ExplorationDungeon
          studentCode={studentCode}
          tickets={tickets}
          onUseTicket={handleUseTicket}
        />
      ) : currentView === 'arena' ? (
        <Arena2
          studentCode={studentCode}
          tickets={tickets}
          onUseTicket={handleUseTicket}
        />
      ) : currentView === 'adventure' ? (
        <AdventureHub tickets={tickets} onNavigate={onChangeView} />
      ) : (
        <AdventureContent
          view={currentView}
          tickets={tickets}
          onUseTicket={handleUseTicket}
          isBusy={isBusy}
        />
      )}
    </div>
  );
}

export default AdventurePage;
