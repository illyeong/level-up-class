import React, { useState, useEffect } from 'react';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import TeacherNavigationBar from '../../components/TeacherNavigationBar';

// 🌟 필요한 화면 컴포넌트들 완벽하게 불러오기
import AccountIssue from './AccountIssue';
import TeacherDashboard from './TeacherDashboard';
import QuestManage from './QuestManage';
import BankManage from './BankManage';
import ClassShopManage from './ClassShopManage';
import StockManage from './StockManage';
import QuizDungeonManage from './QuizDungeonManage';
import QuizBank          from './QuizBank';
import BossRaidManage from './BossRaidManage';
import QuestKiosk from './QuestKiosk';
import AdventureManage from './AdventureManage';
import BoardManage from './BoardManage';
import LearningNoteManage from './LearningNoteManage';
import TeacherCharacter from './TeacherCharacter';
import FeedbackBoard from './FeedbackBoard';
import DataReset from './DataReset';
import BossRaid from '../student/BossRaid';
import QuizDungeon from '../student/QuizDungeon';
import ExplorationDungeon from '../student/ExplorationDungeon';
import ClassVoteManage from './ClassVoteManage';
import FreeBoard          from '../student/FreeBoard';
import HallOfFame         from '../student/HallOfFame';
import AICoursewareManage from './AICoursewareManage';

const STUDENT_MENU_IDS = [
  'dashboard','classAll','myCharacter','avatarRoom','equipment','gachaBox','quest','achievement',
  'board','learningNote','adventure','quizDungeon','explorationDungeon','arena','bossRaid','trade',
  'classBank','classShop','stockMarket','town','freeBoard','classVote','settings','editProfile','themeSettings'
];

const TEACHER_MENU_IDS = [
  'dashboard','myCharacter','questManage','questKiosk','adventure','quizBank','quizDungeonManage','bossRaidManage',
  'quizDungeon','explorationDungeon','bossRaid','adventureManage','boardManage','learningNoteManage','economyManage',
  'classShopManage','bankManage','stockManage','townManage','freeBoard','hallOfFame','classVoteManage','studentManage',
  'accountIssue','systemSettings','dataReset','inquiry'
];

const hideExcept = (allIds, visibleIds) => allIds.filter((id) => !visibleIds.includes(id));

const OPERATION_MODE_PRESETS = {
  basic: {
    title: '가볍게 시작',
    description: '퀘스트, 보상 지급/차감, 학급 상점, 배움노트 중심으로 운영합니다.',
    studentHidden: hideExcept(STUDENT_MENU_IDS, [
      'dashboard','classAll','myCharacter','quest','achievement','learningNote','trade','classShop','settings','editProfile','themeSettings'
    ]),
    teacherHidden: hideExcept(TEACHER_MENU_IDS, [
      'dashboard','myCharacter','questManage','questKiosk','boardManage','learningNoteManage','economyManage','classShopManage',
      'studentManage','accountIssue','systemSettings','dataReset','inquiry'
    ]),
  },
  game: {
    title: '게임형 학급 운영',
    description: '퀘스트와 상점에 어드벤처, 퀴즈던전, 보스레이드, 투기장을 더합니다.',
    studentHidden: hideExcept(STUDENT_MENU_IDS, [
      'dashboard','classAll','myCharacter','avatarRoom','equipment','gachaBox','quest','achievement','learningNote',
      'adventure','quizDungeon','explorationDungeon','arena','bossRaid','trade','classShop','settings','editProfile','themeSettings'
    ]),
    teacherHidden: hideExcept(TEACHER_MENU_IDS, [
      'dashboard','myCharacter','questManage','questKiosk','adventure','quizBank','quizDungeonManage','bossRaidManage',
      'quizDungeon','explorationDungeon','bossRaid','adventureManage','boardManage','learningNoteManage','economyManage',
      'classShopManage','studentManage','accountIssue','systemSettings','dataReset','inquiry'
    ]),
  },
  economy: {
    title: '경제형 학급 운영',
    description: '퀘스트, 상점, 은행, 주식 ETF로 학급 경제를 운영합니다.',
    studentHidden: hideExcept(STUDENT_MENU_IDS, [
      'dashboard','classAll','myCharacter','quest','achievement','learningNote','trade','classBank','classShop','stockMarket',
      'settings','editProfile','themeSettings'
    ]),
    teacherHidden: hideExcept(TEACHER_MENU_IDS, [
      'dashboard','myCharacter','questManage','questKiosk','boardManage','learningNoteManage','economyManage','classShopManage',
      'bankManage','stockManage','studentManage','accountIssue','systemSettings','dataReset','inquiry'
    ]),
  },
  full: {
    title: '전체 기능 사용',
    description: '모든 메뉴를 열어두고 학급 상황에 맞게 직접 운영합니다.',
    studentHidden: [],
    teacherHidden: [],
  },
};

const KOREAN_STUDENT_MENU_LABELS = {
  dashboard: '대시보드',
  classAll: '우리반 전체 보기',
  myCharacter: '내 캐릭터',
  avatarRoom: '아바타 룸',
  equipment: '장비',
  gachaBox: '보물상자',
  quest: '퀘스트',
  achievement: '업적',
  board: '공유 게시판',
  learningNote: '배움노트',
  adventure: '어드벤처',
  quizDungeon: '퀴즈던전',
  explorationDungeon: '탐험던전',
  arena: '투기장',
  bossRaid: '보스 레이드',
  trade: '무역 센터',
  classBank: '학급 은행',
  classShop: '학급 상점',
  stockMarket: '주식/ETF 거래소',
  town: '마을 광장',
  freeBoard: '자유 게시판',
  classVote: '학급 투표',
  settings: '시스템 설정',
  editProfile: '프로필 수정',
  themeSettings: '테마 설정',
};

const KOREAN_TEACHER_MENU_LABELS = {
  dashboard: '대시보드',
  myCharacter: '내 캐릭터',
  questManage: '퀘스트 관리소',
  questKiosk: '학생 셀프체크인',
  adventure: '어드벤처',
  quizBank: '퀴즈 은행',
  quizDungeonManage: '퀴즈던전 관리',
  bossRaidManage: '보스레이드 관리',
  quizDungeon: '퀴즈던전',
  explorationDungeon: '탐험던전',
  bossRaid: '보스 레이드',
  adventureManage: '어드벤처 관리',
  boardManage: '공유 게시판',
  learningNoteManage: '배움노트 관리',
  economyManage: '학급 경제 관리',
  classShopManage: '학급 상점 관리',
  bankManage: '은행 관리',
  stockManage: '주식/ETF 관리',
  townManage: '마을 광장 관리',
  freeBoard: '자유 게시판',
  hallOfFame: '명예의 전당',
  classVoteManage: '학급 투표 관리',
  studentManage: '학급/학생 관리',
  accountIssue: '학생 계정 발급',
  systemSettings: '시스템 설정',
  dataReset: '데이터 초기화',
  inquiry: '건의 및 문의하기',
};

function TeacherLayout({ user, onLogout, onStudentTestLogin, selectedClass, onChangeClass }) {
  const [currentView, setCurrentView]   = useState('dashboard');
  const [teacherThemeMode, setTeacherThemeMode] = useState(() => localStorage.getItem('teacherThemeMode') || 'light');
  const [hideTeacherNav, setHideTeacherNav] = useState(false);
  const [hideStudentNav, setHideStudentNav] = useState(false);
  const [hiddenTeacherMenuIds, setHiddenTeacherMenuIds] = useState([]);
  const [hiddenStudentMenuIds, setHiddenStudentMenuIds] = useState([]);
  const [operationMode, setOperationMode] = useState('custom');
  const [forceShowNav, setForceShowNav] = useState(false);
  const [dashboardKey, setDashboardKey] = useState(0);
  const [notices, setNotices]           = useState([]);
  const [dismissedIds, setDismissedIds] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('dismissedNotices') || '[]'); } catch { return []; }
  });

  useEffect(() => {
    getDocs(query(collection(db, 'notices'), where('active', '==', true)))
      .then(snap => setNotices(snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    localStorage.setItem('teacherThemeMode', teacherThemeMode);
  }, [teacherThemeMode]);

  // 학급별 UI 설정 경로 (전역 문서 대신 학급 문서에 저장)
  const uiPrefsRef = selectedClass?.id
    ? doc(db, 'classes', selectedClass.id)
    : selectedClass?.teacherUid
      ? doc(db, 'systemConfig', `uiPreferences_${selectedClass.teacherUid}`)
      : null;

  useEffect(() => {
    const loadUiPrefs = async () => {
      if (!uiPrefsRef) return;
      try {
        const snap = await getDoc(uiPrefsRef);
        const data = snap.exists() ? (snap.data() || {}) : {};
        setHideTeacherNav(data.hideTeacherNav === true);
        setHideStudentNav(data.hideStudentNav === true);
        setHiddenTeacherMenuIds(Array.isArray(data.hiddenTeacherMenuIds) ? data.hiddenTeacherMenuIds : []);
        setHiddenStudentMenuIds(Array.isArray(data.hiddenStudentMenuIds) ? data.hiddenStudentMenuIds : []);
        setOperationMode(data.operationMode || 'custom');
      } catch {
        setHideTeacherNav(false);
      }
    };
    loadUiPrefs();
  }, [selectedClass?.id, selectedClass?.teacherUid]);

  useEffect(() => {
    const initialView = localStorage.getItem('teacherInitialView');
    if (initialView) {
      setCurrentView(initialView);
      localStorage.removeItem('teacherInitialView');
    }
  }, []);

  // AI 요약 카드의 액션 버튼 → 페이지 이동
  useEffect(() => {
    const handler = (e) => {
      const view = e.detail?.view;
      if (view) setCurrentView(view);
    };
    window.addEventListener('teacher-nav', handler);
    return () => window.removeEventListener('teacher-nav', handler);
  }, []);

  const dismiss = (id) => {
    const next = [...dismissedIds, id];
    setDismissedIds(next);
    sessionStorage.setItem('dismissedNotices', JSON.stringify(next));
  };

  const visibleNotices = notices.filter(n => !dismissedIds.includes(n.id));

  const isDark = teacherThemeMode === 'dark';
  const shouldShowNav = !hideTeacherNav || forceShowNav;
  const studentMenuOptions = STUDENT_MENU_IDS;
  const teacherMenuOptions = TEACHER_MENU_IDS;
  const studentMenuLabels = {
    dashboard: '대시보드',
    classAll: '우리반 전체 보기',
    myCharacter: '내 캐릭터',
    avatarRoom: '아바타 룸',
    equipment: '장비',
    gachaBox: '보물상자',
    quest: '퀘스트',
    achievement: '업적',
    board: '공유 게시판',
    learningNote: '배움노트',
    adventure: '어드벤처',
    quizDungeon: '퀴즈던전',
    explorationDungeon: '탐험던전',
    arena: '투기장',
    bossRaid: '보스 레이드',
    trade: '무역 센터',
    classBank: '학급 은행',
    classShop: '학급 상점',
    stockMarket: '주식/ETF 거래소',
    town: '마을 광장',
    freeBoard: '자유 게시판',
    classVote: '학급 투표',
    settings: '시스템 설정',
    editProfile: '프로필 수정',
    themeSettings: '테마 설정',
  };
  const teacherMenuLabels = {
    dashboard: '대시보드',
    myCharacter: '내 캐릭터',
    questManage: '퀘스트 관리소',
    questKiosk: '학생 셀프체크인',
    adventure: '어드벤처',
    quizBank: '퀴즈 은행',
    quizDungeonManage: '퀴즈던전 관리',
    bossRaidManage: '보스레이드 관리',
    quizDungeon: '퀴즈던전',
    explorationDungeon: '탐험던전',
    bossRaid: '보스 레이드',
    adventureManage: '어드벤처 관리',
    boardManage: '공유 게시판',
    learningNoteManage: '배움노트 관리',
    economyManage: '학급 경제 관리',
    classShopManage: '학급 상점 관리',
    bankManage: '은행 관리',
    stockManage: '주식/ETF 관리',
    townManage: '마을 광장 관리',
    freeBoard: '자유 게시판',
    hallOfFame: '명예의 전당',
    classVoteManage: '학급 투표 관리',
    studentManage: '학급/학생 관리',
    accountIssue: '학생 계정 발급',
    systemSettings: '시스템 설정',
    dataReset: '데이터 초기화',
    inquiry: '건의 및 문의하기',
  };
  const studentMenuLabelMap = { ...studentMenuLabels, ...KOREAN_STUDENT_MENU_LABELS };
  const teacherMenuLabelMap = { ...teacherMenuLabels, ...KOREAN_TEACHER_MENU_LABELS };

  const toggleHiddenMenu = async (scope, id) => {
    if (!uiPrefsRef) return;
    setOperationMode('custom');
    if (scope === 'student') {
      const next = hiddenStudentMenuIds.includes(id)
        ? hiddenStudentMenuIds.filter((x) => x !== id)
        : [...hiddenStudentMenuIds, id];
      setHiddenStudentMenuIds(next);
      await setDoc(uiPrefsRef, { hiddenStudentMenuIds: next, operationMode: 'custom' }, { merge: true });
      return;
    }
    const next = hiddenTeacherMenuIds.includes(id)
      ? hiddenTeacherMenuIds.filter((x) => x !== id)
      : [...hiddenTeacherMenuIds, id];
    setHiddenTeacherMenuIds(next);
    await setDoc(uiPrefsRef, { hiddenTeacherMenuIds: next, operationMode: 'custom' }, { merge: true });
  };

  const applyOperationMode = async (mode) => {
    const preset = OPERATION_MODE_PRESETS[mode];
    if (!preset) return;
    setOperationMode(mode);
    setHiddenStudentMenuIds(preset.studentHidden);
    setHiddenTeacherMenuIds(preset.teacherHidden);
    if (uiPrefsRef) {
      await setDoc(uiPrefsRef, {
        operationMode: mode,
        hiddenStudentMenuIds: preset.studentHidden,
        hiddenTeacherMenuIds: preset.teacherHidden,
      }, { merge: true });
    }
  };

  return (
    <div className={`flex h-screen w-full ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
      {/* 교사용 네비게이션 바 */}
      {shouldShowNav && (
        <TeacherNavigationBar
          changeView={setCurrentView}
          currentView={currentView}
          onLogout={onLogout}
          selectedClass={selectedClass}
          hiddenMenuIds={hiddenTeacherMenuIds}
        />
      )}
      {!shouldShowNav && (
        <button
          onClick={() => setForceShowNav(true)}
          className="fixed left-3 top-3 z-[90] rounded-lg bg-indigo-600 px-3 py-2 text-xs font-extrabold text-white shadow-lg"
        >
          메뉴 열기
        </button>
      )}

      {/* 우측 메인 화면 */}
      <main className={`flex-1 overflow-auto relative ${isDark ? 'bg-slate-900' : 'bg-slate-100'}`}>

        {/* 공지사항 배너 */}
        {visibleNotices.map(n => (
          <div key={n.id} className={`px-5 py-2.5 flex items-center justify-between text-sm
            ${n.type === 'urgent' ? 'bg-rose-500 text-white' : n.type === 'update' ? 'bg-emerald-500 text-white' : 'bg-amber-400 text-amber-900'}`}>
            <span className="font-bold">
              {n.type === 'urgent' ? '🚨' : n.type === 'update' ? '🆕' : '📢'} {n.title} — <span className="font-normal">{n.content}</span>
            </span>
            <button onClick={() => dismiss(n.id)} className="ml-4 opacity-70 hover:opacity-100 font-bold text-lg shrink-0">✕</button>
          </div>
        ))}

        {/* 학급 정보 배너 */}
        {selectedClass && (
          <div className="bg-indigo-600 text-white px-5 py-2 flex items-center justify-between text-sm">
            <span className="font-bold">
              🏫 {selectedClass.schoolName} {selectedClass.grade}학년 {selectedClass.classNumber}반
            </span>
            {onChangeClass && (
              <button onClick={onChangeClass}
                className="text-indigo-200 hover:text-white text-xs font-bold underline">
                학급 변경
              </button>
            )}
          </div>
        )}

        {currentView === 'dashboard' && (
          <TeacherDashboard
            key={dashboardKey}
            onStudentTestLogin={onStudentTestLogin}
            selectedClass={selectedClass}
            onGoAccountIssue={() => setCurrentView('accountIssue')}
          />
        )}

        {/* 학생 계정 발급 화면 */}
        {currentView === 'accountIssue'    && <AccountIssue user={user} selectedClass={selectedClass} />}
        {currentView === 'questManage'     && <QuestManage selectedClass={selectedClass} />}
        {currentView === 'bankManage'       && <BankManage selectedClass={selectedClass} />}
        {currentView === 'classShopManage' && <ClassShopManage selectedClass={selectedClass} />}
        {currentView === 'stockManage'        && <StockManage selectedClass={selectedClass} />}
        {currentView === 'quizBank'           && <QuizBank selectedClass={selectedClass} />}
        {currentView === 'quizDungeonManage' && <QuizDungeonManage selectedClass={selectedClass} />}
        {currentView === 'bossRaidManage'    && <BossRaidManage selectedClass={selectedClass} onViewLobby={() => setCurrentView('bossRaid')} />}
        {currentView === 'bossRaid'          && <BossRaid isTeacher={true} selectedClass={selectedClass} />}
        {currentView === 'quizDungeon'       && <QuizDungeon isTeacher={true} teacherUid={selectedClass?.teacherUid} />}
        {currentView === 'explorationDungeon' && <ExplorationDungeon isTeacher={true} teacherUid={selectedClass?.teacherUid} />}

        {/* 임시 준비 중 화면들 */}
        {currentView === 'myCharacter'     && <TeacherCharacter selectedClass={selectedClass} />}
        {currentView === 'adventureManage' && <AdventureManage selectedClass={selectedClass} />}
        {currentView === 'boardManage'        && <BoardManage selectedClass={selectedClass} user={user} />}
        {currentView === 'learningNoteManage' && <LearningNoteManage selectedClass={selectedClass} />}
        {currentView === 'aiCourseware'       && <AICoursewareManage selectedClass={selectedClass} />}
        {currentView === 'inquiry'         && <FeedbackBoard selectedClass={selectedClass} />}
        {currentView === 'dataReset'       && <DataReset selectedClass={selectedClass} onClassDeleted={onChangeClass} />}
        {currentView === 'systemSettings'  && (
          <div className="p-6">
            <div className={`max-w-2xl rounded-2xl border p-5 ${isDark ? 'border-slate-700 bg-slate-800 text-slate-100' : 'border-slate-200 bg-white text-slate-800'}`}>
              <h2 className="text-xl font-extrabold mb-4">시스템 설정</h2>
              <div className="mb-5 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-slate-800">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-extrabold text-indigo-800">운영 모드 선택</div>
                    <p className="mt-1 text-xs font-semibold text-indigo-700">
                      처음에는 꼭 필요한 기능만 보이고, 학급 운영이 익숙해지면 기능을 확장할 수 있습니다.
                    </p>
                  </div>
                  {operationMode === 'custom' && (
                    <span className="rounded-full bg-slate-800 px-3 py-1 text-[11px] font-extrabold text-white">직접 설정 중</span>
                  )}
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {Object.entries(OPERATION_MODE_PRESETS).map(([mode, preset]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => applyOperationMode(mode)}
                      className={`rounded-xl border p-3 text-left transition ${
                        operationMode === mode
                          ? 'border-indigo-500 bg-white shadow-sm ring-2 ring-indigo-200'
                          : 'border-indigo-100 bg-white/70 hover:border-indigo-300'
                      }`}
                    >
                      <div className="text-sm font-extrabold text-slate-900">{preset.title}</div>
                      <div className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">{preset.description}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="mb-5">
                <div className="text-sm font-bold mb-2">교사 다크모드</div>
                <div className="flex gap-2">
                  <button onClick={() => setTeacherThemeMode('dark')} className={`px-4 py-2 rounded-lg text-sm font-bold border ${teacherThemeMode === 'dark' ? 'bg-indigo-600 text-white border-indigo-500' : 'border-slate-400/40'}`}>어두운 모드</button>
                  <button onClick={() => setTeacherThemeMode('light')} className={`px-4 py-2 rounded-lg text-sm font-bold border ${teacherThemeMode === 'light' ? 'bg-amber-500 text-white border-amber-400' : 'border-slate-400/40'}`}>밝은 모드</button>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className={`rounded-xl p-4 ${isDark ? 'border border-slate-700 bg-slate-900/40' : 'border border-slate-200 bg-white'}`}>
                  <div className="text-sm font-bold mb-2">학생 메뉴별 활성/비활성</div>
                  <div className="max-h-96 overflow-auto space-y-0.5">
                    {studentMenuOptions.map((id) => {
                      const hidden = hiddenStudentMenuIds.includes(id);
                      return (
                        <label key={id} className="flex items-center gap-2 text-xs py-1.5 cursor-pointer">
                          <span className={`flex-1 min-w-0 leading-snug ${hidden ? 'text-slate-400' : (isDark ? 'text-slate-200' : 'text-slate-700')}`}>
                            {studentMenuLabelMap[id] || id}
                          </span>
                          <span className={`shrink-0 w-10 text-right text-[11px] font-bold ${hidden ? 'text-rose-400' : 'text-emerald-500'}`}>
                            {hidden ? '비활성' : '활성'}
                          </span>
                          <input
                            type="checkbox"
                            checked={!hidden}
                            onChange={() => toggleHiddenMenu('student', id)}
                            className="shrink-0 w-4 h-4 accent-indigo-500"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className={`rounded-xl p-4 ${isDark ? 'border border-slate-700 bg-slate-900/40' : 'border border-slate-200 bg-white'}`}>
                  <div className="text-sm font-bold mb-2">교사 메뉴별 활성/비활성</div>
                  <div className="max-h-96 overflow-auto space-y-0.5">
                    {teacherMenuOptions.map((id) => {
                      const hidden = hiddenTeacherMenuIds.includes(id);
                      return (
                        <label key={id} className="flex items-center gap-2 text-xs py-1.5 cursor-pointer">
                          <span className={`flex-1 min-w-0 leading-snug ${hidden ? 'text-slate-400' : (isDark ? 'text-slate-200' : 'text-slate-700')}`}>
                            {teacherMenuLabelMap[id] || id}
                          </span>
                          <span className={`shrink-0 w-10 text-right text-[11px] font-bold ${hidden ? 'text-rose-400' : 'text-emerald-500'}`}>
                            {hidden ? '비활성' : '활성'}
                          </span>
                          <input
                            type="checkbox"
                            checked={!hidden}
                            onChange={() => toggleHiddenMenu('teacher', id)}
                            className="shrink-0 w-4 h-4 accent-indigo-500"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {currentView === 'classVoteManage' && <ClassVoteManage selectedClass={selectedClass} />}
        {currentView === 'freeBoard'       && <FreeBoard teacherUid={selectedClass?.teacherUid} isTeacher={true} />}
        {currentView === 'hallOfFame'      && <HallOfFame teacherUid={selectedClass?.teacherUid} />}
        
      </main>

      {/* 학생 체크인 키오스크 모드 - 전체 화면 오버레이 (nav 포함 모두 덮음) */}
      {currentView === 'questKiosk' && (
        <div className="fixed inset-0 z-[100] overflow-y-auto">
          <QuestKiosk selectedClass={selectedClass} onExit={() => {
            setCurrentView('dashboard');
            setDashboardKey(k => k + 1); // 대시보드 강제 재마운트 → 퀘스트 현황 최신화
          }} />
        </div>
      )}
    </div>
  );
}

export default TeacherLayout;
