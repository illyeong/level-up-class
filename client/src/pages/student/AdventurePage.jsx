import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, doc, updateDoc, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import QuizDungeon from './QuizDungeon';
import BossRaid from './BossRaid';
import ExplorationDungeon from './ExplorationDungeon';

// ── 이용권 설정 ────────────────────────────────────────────────
const TICKET_CONFIG = {
  dungeon:  { weekly: 3, max: 3, icon: '🗡️', label: '던전 이용권',  color: 'sky'    },
  bossRaid: { weekly: 1, max: 3, icon: '👹', label: '보스레이드권', color: 'rose'   },
  arena:    { weekly: 5, max: 5, icon: '🏟️', label: '투기장 이용권', color: 'violet' },
};

// 어떤 뷰가 어떤 이용권을 사용하는지
const VIEW_CONFIG = {
  adventure:          { title: '어드벤처',   icon: '⚔️',  ticketKey: null },
  quizDungeon:        { title: '퀴즈던전',   icon: '🗡️',  ticketKey: 'dungeon'  },
  explorationDungeon: { title: '탐험던전',   icon: '🗺️',  ticketKey: 'dungeon'  },
  bossRaid:           { title: '보스레이드', icon: '👹',  ticketKey: 'bossRaid' },
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
  return monday.toISOString().split('T')[0];
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
                style={{ width: `${Math.min(100, Math.round(((studentInfo.exp ?? 0) / (studentInfo.maxExp ?? 1000)) * 100))}%` }}
              />
            </div>
            <span className="text-[9px] text-slate-500">{studentInfo.exp ?? 0}/{studentInfo.maxExp ?? 1000}</span>
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
          ✨ 주간 이용권 지급됨!
        </span>
      )}
    </div>
  );
}

// ─────────────────────── 메인 허브 화면 ──────────────────────
function AdventureHub({ tickets }) {
  const cards = [
    { id: 'quizDungeon',        icon: '🗡️', title: '퀴즈던전',   ticketKey: 'dungeon',  desc: '퀴즈를 풀어 던전을 공략하세요' },
    { id: 'explorationDungeon', icon: '🗺️', title: '탐험던전',   ticketKey: 'dungeon',  desc: '미지의 던전을 탐험하세요' },
    { id: 'bossRaid',           icon: '👹', title: '보스레이드', ticketKey: 'bossRaid', desc: '강력한 보스에 도전하세요' },
    { id: 'arena',              icon: '🏟️', title: '투기장',     ticketKey: 'arena',    desc: '다른 학생과 실력을 겨루세요' },
    { id: 'miniGame',           icon: '🎮', title: '미니 게임',  ticketKey: null,        desc: '다양한 미니 게임을 즐기세요' },
  ];

  return (
    <div className="p-8">
      <h1 className="text-2xl font-extrabold text-slate-800 mb-1">⚔️ 어드벤처</h1>
      <p className="text-slate-500 text-sm mb-6">이용권을 사용해 던전, 레이드, 투기장에 입장하세요!</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(({ id, icon, title, ticketKey, desc }) => {
          const count = ticketKey ? (tickets?.[ticketKey] ?? 0) : null;
          const cfg   = ticketKey ? TICKET_CONFIG[ticketKey] : null;
          const hasTicket = count === null || count > 0;
          return (
            <div
              key={id}
              className={`bg-white rounded-2xl shadow-sm border-2 p-5 transition-all
                ${hasTicket ? 'border-slate-200 hover:shadow-md hover:-translate-y-0.5' : 'border-slate-100 opacity-60'}`}>
              <div className="text-5xl mb-3">{icon}</div>
              <h3 className="font-extrabold text-slate-800 text-base mb-1">{title}</h3>
              <p className="text-xs text-slate-500 mb-3">{desc}</p>
              {count !== null && (
                <div className="flex items-center gap-1.5 mb-0">
                  <div className="flex gap-0.5">
                    {Array.from({ length: cfg.max }, (_, i) => (
                      <div key={i} className={`w-2 h-2 rounded-full ${i < count ? 'bg-indigo-400' : 'bg-slate-200'}`} />
                    ))}
                  </div>
                  <span className="text-xs text-slate-500 font-medium">{count}/{cfg.max} 이용권</span>
                </div>
              )}
            </div>
          );
        })}
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
          매주 <span className="font-bold text-indigo-400">월요일</span>에 이용권이 자동 지급됩니다
        </p>
      )}

      <div className="mt-10 bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-sm text-slate-400 max-w-xs">
        🚧 Unity 연동 후 오픈 예정입니다
      </div>
    </div>
  );
}

// ─────────────────────── Main ─────────────────────────────────
function AdventurePage({ currentView, studentCode }) {
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
        setStudentInfo({
          level:    data.level    ?? 1,
          exp:      data.exp      ?? 0,
          maxExp:   data.maxExp   ?? 1000,
          gold:     data.gold     ?? 0,
          diamonds: data.diamonds ?? 0,
        });

        const savedTickets = data.tickets || { dungeon: 0, bossRaid: 0, arena: 0 };
        const lastMonday   = getMostRecentMonday();
        const lastRefresh  = data.lastTicketRefreshDate || '';

        if (lastRefresh < lastMonday) {
          // 주간 이용권 갱신
          const newTickets = {};
          for (const [key, cfg] of Object.entries(TICKET_CONFIG)) {
            const cur = savedTickets[key] ?? 0;
            newTickets[key] = Math.min(cfg.max, cur + cfg.weekly);
          }
          await updateDoc(doc(db, 'students', sDoc.id), {
            tickets:                newTickets,
            lastTicketRefreshDate:  lastMonday,
          });
          setTickets(newTickets);
          setIsRefreshed(true);
          setTimeout(() => setIsRefreshed(false), 4000);
        } else {
          setTickets(savedTickets);
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
        <div className="flex items-center justify-center py-20 text-slate-400 font-bold">
          불러오는 중...
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
      ) : currentView === 'adventure' ? (
        <AdventureHub tickets={tickets} />
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
