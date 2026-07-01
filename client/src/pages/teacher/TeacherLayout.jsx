import React, { useState, useEffect, useCallback } from 'react';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import TeacherNavigationBar, { HELP_CONTENT as TEACHER_HELP_CONTENT } from '../../components/TeacherNavigationBar';

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
import ClassOperationManage from './ClassOperationManage';
import QuestKiosk from './QuestKiosk';
import AdventureManage from './AdventureManage';
import BoardManage from './BoardManage';
import LearningNoteManage from './LearningNoteManage';
import TopicWritingManage from './TopicWritingManage';
import TeacherCharacter from './TeacherCharacter';
import FeedbackBoard from './FeedbackBoard';
import DataReset from './DataReset';
import BossRaid, { createPresentationTestRaid } from '../student/BossRaid';
import QuizDungeon from '../student/QuizDungeon';
import ExplorationDungeon from '../student/ExplorationDungeon';
import ClassVoteManage from './ClassVoteManage';
import FreeBoard          from '../student/FreeBoard';
import HallOfFame         from '../student/HallOfFame';
import AICoursewareManage from './AICoursewareManage';
import AICourseware       from '../student/AICourseware';
import { OPERATION_MODE_PRESETS, STUDENT_MENU_IDS, TEACHER_MENU_IDS } from '../../utils/operationModePresets';
import { isTopicWritingRewardPending } from '../../utils/topicWritingRewards';

const TEACHER_FONT_OPTIONS = [
  { id: 'game', label: '게임체', description: '친근하고 재미있는 분위기의 글씨체', className: 'teacher-font-game' },
  { id: 'clean', label: '깔끔한 고딕', description: '기본 글씨체 · 표와 설정 화면을 오래 보기 편해요', className: 'teacher-font-clean' },
  { id: 'document', label: '문서형 명조', description: '안내문과 설명이 차분하게 보이는 글씨체', className: 'teacher-font-document' },
];

const BOSS_RAID_PRESENTATION_CODES = Array.from(
  { length: 15 },
  (_, index) => `SINSEOK-5-${String(index + 1).padStart(2, '0')}`,
);
const BOSS_RAID_DEMO_ALLOWED_TEACHER_EMAIL = 'imdlffud2@gmail.com';
const normalizeTeacherEmail = (email) => String(email || '').trim().toLowerCase();

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
  topicWriting: '주제글쓰기',
  adventure: '어드벤처',
  quizDungeon: '퀴즈던전',
  explorationDungeon: '탐험던전',
  arena: '투기장',
  bossRaid: '퀴즈레이드',
  classOperation: '우리반 대작전',
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
  bossRaidManage: '퀴즈레이드 관리',
  classOperationManage: '우리반 대작전 관리',
  quizDungeon: '퀴즈던전',
  explorationDungeon: '탐험던전',
  bossRaid: '퀴즈레이드',
  adventureManage: '어드벤처 관리',
  boardManage: '공유 게시판',
  learningNoteManage: '배움노트 관리',
  topicWritingManage: '주제글쓰기 관리',
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

function TeacherLayout({ user, onLogout, onStudentTestLogin, selectedClass, onChangeClass, autoOpenBossRaidDemoKey = 0 }) {
  const [currentView, setCurrentView]   = useState('dashboard');
  const [quizCreationDraft, setQuizCreationDraft] = useState(null);
  const [teacherThemeMode, setTeacherThemeMode] = useState(() => localStorage.getItem('teacherThemeMode') || 'light');
  const [teacherFont, setTeacherFont] = useState(() => {
    const savedFont = localStorage.getItem('teacherFont');
    return TEACHER_FONT_OPTIONS.some(option => option.id === savedFont) ? savedFont : 'clean';
  });
  const [hideTeacherNav, setHideTeacherNav] = useState(false);
  const [hideStudentNav, setHideStudentNav] = useState(false);
  const [hiddenTeacherMenuIds, setHiddenTeacherMenuIds] = useState([]);
  const [hiddenStudentMenuIds, setHiddenStudentMenuIds] = useState([]);
  const [operationMode, setOperationMode] = useState('custom');
  const [forceShowNav, setForceShowNav] = useState(false);
  const [dashboardKey, setDashboardKey] = useState(0);
  const [activeHelpId, setActiveHelpId] = useState(null);
  const [bossRaidDemo, setBossRaidDemo] = useState({ status: 'idle', raidId: null, error: null });
  const autoOpenedBossRaidDemoRef = React.useRef(0);
  const [approvalBadges, setApprovalBadges] = useState({});
  const [notices, setNotices]           = useState([]);
  const [dismissedIds, setDismissedIds] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('dismissedNotices') || '[]'); } catch { return []; }
  });
  const currentTeacherEmail = normalizeTeacherEmail(user?.email);
  const canUseBossRaidDemo = currentTeacherEmail === BOSS_RAID_DEMO_ALLOWED_TEACHER_EMAIL;

  useEffect(() => {
    getDocs(query(collection(db, 'notices'), where('active', '==', true)))
      .then(snap => setNotices(snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))))
      .catch(() => {});
  }, []);

  const refreshApprovalBadgeCounts = useCallback(async () => {
    const teacherUid = selectedClass?.teacherUid;
    if (!teacherUid) {
      setApprovalBadges({});
      return;
    }

    try {
      const studentQuery = selectedClass?.id
        ? query(collection(db, 'students'), where('classId', '==', selectedClass.id))
        : query(collection(db, 'students'), where('teacherUid', '==', teacherUid));

      const [studentSnap, noteSnap, writingSnap] = await Promise.all([
        getDocs(studentQuery),
        getDocs(query(
          collection(db, 'learningNotes'),
          where('teacherUid', '==', teacherUid),
          where('status', '==', 'pending'),
        )),
        getDocs(query(
          collection(db, 'writingSubmissions'),
          where('teacherUid', '==', teacherUid),
        )),
      ]);

      const studentIds = new Set(studentSnap.docs.map(studentDoc => studentDoc.id));
      const pendingNotes = noteSnap.docs.filter(noteDoc => studentIds.has(noteDoc.data().studentId)).length;
      const pendingTopicWritings = writingSnap.docs.filter(writingDoc => {
        const data = writingDoc.data();
        return studentIds.has(data.studentId) && isTopicWritingRewardPending(data);
      }).length;

      setApprovalBadges({
        learningNoteManage: pendingNotes,
        topicWritingManage: pendingTopicWritings,
      });
    } catch (error) {
      console.error('[TeacherLayout] approval badge count failed:', error);
    }
  }, [selectedClass?.id, selectedClass?.teacherUid]);

  useEffect(() => {
    refreshApprovalBadgeCounts();
  }, [refreshApprovalBadgeCounts]);

  useEffect(() => {
    localStorage.setItem('teacherThemeMode', teacherThemeMode);
  }, [teacherThemeMode]);

  useEffect(() => {
    localStorage.setItem('teacherFont', teacherFont);
  }, [teacherFont]);

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

  const openQuizCreation = (targetView, quizSet) => {
    setQuizCreationDraft({ targetView, quizSet });
    setCurrentView(targetView);
  };
  const clearQuizCreationDraft = useCallback(() => setQuizCreationDraft(null), []);
  const closeBossRaidDemo = useCallback(() => {
    setBossRaidDemo({ status: 'idle', raidId: null, error: null });
    setCurrentView('dashboard');
  }, []);

  const openBossRaidDemo = useCallback(async () => {
    if (!canUseBossRaidDemo) {
      setCurrentView('dashboard');
      setBossRaidDemo({ status: 'idle', raidId: null, error: null });
      return;
    }
    setCurrentView('bossRaidDemo');
    setBossRaidDemo({ status: 'creating', raidId: null, error: null });
    try {
      const ref = await createPresentationTestRaid({
        classId: selectedClass?.id || null,
        teacherUid: selectedClass?.teacherUid || user?.uid || null,
        rosterCodes: BOSS_RAID_PRESENTATION_CODES,
      });
      setBossRaidDemo({ status: 'ready', raidId: ref.id, error: null });
    } catch (error) {
      console.error('Boss raid demo creation failed:', error);
      setBossRaidDemo({
        status: 'error',
        raidId: null,
        error: error?.message || '퀴즈레이드 발표 테스트를 만들지 못했습니다.',
      });
    }
  }, [canUseBossRaidDemo, selectedClass?.id, selectedClass?.teacherUid, user?.uid]);

  useEffect(() => {
    if (!canUseBossRaidDemo || !autoOpenBossRaidDemoKey || autoOpenedBossRaidDemoRef.current === autoOpenBossRaidDemoKey) return;
    autoOpenedBossRaidDemoRef.current = autoOpenBossRaidDemoKey;
    openBossRaidDemo();
  }, [autoOpenBossRaidDemoKey, canUseBossRaidDemo, openBossRaidDemo]);

  const visibleNotices = notices.filter(n => !dismissedIds.includes(n.id));

  const isDark = teacherThemeMode === 'dark';
  const teacherFontClass = TEACHER_FONT_OPTIONS.find(option => option.id === teacherFont)?.className || 'teacher-font-clean';
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
    bossRaid: '퀴즈레이드',
    classOperation: '우리반 대작전',
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
    bossRaidManage: '퀴즈레이드 관리',
    classOperationManage: '우리반 대작전 관리',
    quizDungeon: '퀴즈던전',
    explorationDungeon: '탐험던전',
    bossRaid: '퀴즈레이드',
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
  const currentHelp = TEACHER_HELP_CONTENT[currentView];
  const activeHelp = activeHelpId ? TEACHER_HELP_CONTENT[activeHelpId] : null;

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
    <div className={`flex h-screen w-full ${teacherFontClass} ${isDark ? 'teacher-theme-dark bg-slate-950 text-slate-100' : 'bg-slate-50'}`}>
      {/* 교사용 네비게이션 바 */}
      {shouldShowNav && (
        <TeacherNavigationBar
          changeView={setCurrentView}
          currentView={currentView}
          onLogout={onLogout}
          selectedClass={selectedClass}
          hiddenMenuIds={hiddenTeacherMenuIds}
          approvalBadges={approvalBadges}
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

        {currentHelp && currentView !== 'questKiosk' && (
          <div className="sticky top-3 z-40 flex justify-end px-5 pointer-events-none">
            <button
              type="button"
              onClick={() => setActiveHelpId(currentView)}
              className={`pointer-events-auto inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-black shadow-lg border transition ${
                isDark
                  ? 'border-indigo-400/30 bg-slate-800/95 text-indigo-100 hover:bg-indigo-700'
                  : 'border-indigo-100 bg-white text-indigo-700 hover:bg-indigo-50'
              }`}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white">?</span>
              이 페이지 사용법
            </button>
          </div>
        )}

        {currentView === 'dashboard' && (
          <TeacherDashboard
            key={dashboardKey}
            onStudentTestLogin={onStudentTestLogin}
            selectedClass={selectedClass}
            onGoAccountIssue={() => setCurrentView('accountIssue')}
            onOpenBossRaidDemo={openBossRaidDemo}
            canUseBossRaidDemo={canUseBossRaidDemo}
            isDark={isDark}
            operationMode={operationMode}
            onApplyOperationMode={applyOperationMode}
            onApprovalBadgeRefresh={refreshApprovalBadgeCounts}
          />
        )}

        {/* 학생 계정 발급 화면 */}
        {currentView === 'accountIssue'    && <AccountIssue user={user} selectedClass={selectedClass} />}
        {currentView === 'questManage'     && <QuestManage selectedClass={selectedClass} />}
        {currentView === 'bankManage'       && <BankManage selectedClass={selectedClass} />}
        {currentView === 'classShopManage' && <ClassShopManage selectedClass={selectedClass} />}
        {currentView === 'stockManage'        && <StockManage selectedClass={selectedClass} />}
        {currentView === 'classOperationManage' && <ClassOperationManage selectedClass={selectedClass} />}
        {currentView === 'quizBank' && (
          <QuizBank
            selectedClass={selectedClass}
            onCreateDungeon={(quizSet) => openQuizCreation('quizDungeonManage', quizSet)}
            onCreateBossRaid={(quizSet) => openQuizCreation('bossRaidManage', quizSet)}
          />
        )}
        {currentView === 'quizDungeonManage' && (
          <QuizDungeonManage
            selectedClass={selectedClass}
            initialQuizSet={quizCreationDraft?.targetView === 'quizDungeonManage' ? quizCreationDraft.quizSet : null}
            onInitialQuizSetConsumed={clearQuizCreationDraft}
            onViewStudent={() => setCurrentView('quizDungeon')}
          />
        )}
        {currentView === 'bossRaidManage' && (
          <BossRaidManage
            selectedClass={selectedClass}
            initialQuizSet={quizCreationDraft?.targetView === 'bossRaidManage' ? quizCreationDraft.quizSet : null}
            onInitialQuizSetConsumed={clearQuizCreationDraft}
            onViewLobby={() => setCurrentView('bossRaid')}
          />
        )}
        {currentView === 'bossRaid'          && (
          <BossRaid
            isTeacher={true}
            selectedClass={selectedClass}
            onExit={() => setCurrentView('bossRaidManage')}
          />
        )}
        {canUseBossRaidDemo && currentView === 'bossRaidDemo' && bossRaidDemo.status === 'creating' && (
          <div className="flex min-h-[calc(100vh-48px)] items-center justify-center bg-slate-950 p-6 text-center">
            <div className="max-w-md rounded-3xl border border-slate-700 bg-slate-900 px-8 py-7 shadow-2xl">
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-rose-500" />
              <h2 className="text-xl font-extrabold text-white">퀴즈레이드 발표 테스트 준비 중</h2>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-300">
                새 테스트 레이드를 만들고 SINSEOK-5-01~15 학생을 참여자로 불러오는 중입니다.
              </p>
            </div>
          </div>
        )}
        {canUseBossRaidDemo && currentView === 'bossRaidDemo' && bossRaidDemo.status === 'error' && (
          <div className="flex min-h-[calc(100vh-48px)] items-center justify-center bg-slate-950 p-6 text-center">
            <div className="max-w-lg rounded-3xl border border-rose-500/40 bg-slate-900 px-8 py-7 shadow-2xl">
              <div className="mb-4 text-5xl">⚠️</div>
              <h2 className="text-xl font-extrabold text-white">퀴즈레이드 발표 테스트 생성 실패</h2>
              <p className="mt-2 break-words text-sm font-semibold leading-relaxed text-rose-100">
                {bossRaidDemo.error}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={openBossRaidDemo}
                  className="rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-extrabold text-white hover:bg-rose-700"
                >
                  다시 만들기
                </button>
                <button
                  type="button"
                  onClick={closeBossRaidDemo}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-2.5 text-sm font-extrabold text-slate-100 hover:bg-slate-700"
                >
                  대시보드로 돌아가기
                </button>
              </div>
            </div>
          </div>
        )}
        {canUseBossRaidDemo && currentView === 'bossRaidDemo' && bossRaidDemo.status === 'ready' && bossRaidDemo.raidId && (
          <BossRaid
            studentCode="SINSEOK-5-15"
            selectedClass={selectedClass}
            presentationMode={true}
            presentationRosterCodes={BOSS_RAID_PRESENTATION_CODES}
            externalPresentationRaidId={bossRaidDemo.raidId}
            onExit={closeBossRaidDemo}
          />
        )}
        {currentView === 'quizDungeon'       && <QuizDungeon isTeacher={true} teacherUid={selectedClass?.teacherUid} />}
        {currentView === 'explorationDungeon' && <ExplorationDungeon isTeacher={true} teacherUid={selectedClass?.teacherUid} />}

        {/* 임시 준비 중 화면들 */}
        {currentView === 'myCharacter'     && <TeacherCharacter selectedClass={selectedClass} />}
        {currentView === 'adventureManage' && <AdventureManage selectedClass={selectedClass} />}
        {currentView === 'boardManage'        && <BoardManage selectedClass={selectedClass} user={user} themeMode={teacherThemeMode} />}
        {currentView === 'learningNoteManage' && <LearningNoteManage selectedClass={selectedClass} onApprovalBadgeRefresh={refreshApprovalBadgeCounts} />}
        {currentView === 'topicWritingManage' && <TopicWritingManage selectedClass={selectedClass} onApprovalBadgeRefresh={refreshApprovalBadgeCounts} />}
        {currentView === 'aiCourseware'       && <AICoursewareManage selectedClass={selectedClass} onNavigate={setCurrentView} />}
        {currentView === 'aiCoursewareView'   && <AICourseware teacherUid={selectedClass?.teacherUid} classGrade={selectedClass?.grade} isTeacher themeMode={teacherThemeMode} />}
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
              <div className="mb-5">
                <div className="text-sm font-bold">교사 화면 글씨체</div>
                <p className={`mt-1 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>교사 네비게이션과 모든 관리 화면에 바로 적용됩니다.</p>
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  {TEACHER_FONT_OPTIONS.map(option => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setTeacherFont(option.id)}
                      className={`${option.className} rounded-xl border p-3 text-left transition ${
                        teacherFont === option.id
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-200'
                          : isDark
                            ? 'border-slate-700 bg-slate-900/50 text-slate-200 hover:border-indigo-500'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-base">{option.label}</strong>
                        {teacherFont === option.id && <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">사용 중</span>}
                      </div>
                      <div className="mt-2 text-lg font-bold">우리반 학급운영</div>
                      <div className="mt-1 text-[11px] leading-5 opacity-65">{option.description}</div>
                    </button>
                  ))}
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
        {currentView === 'freeBoard'       && <FreeBoard teacherUid={selectedClass?.teacherUid} isTeacher={true} themeMode={teacherThemeMode} />}
        {currentView === 'hallOfFame'      && <HallOfFame teacherUid={selectedClass?.teacherUid} themeMode={teacherThemeMode} />}
        
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

      {activeHelp && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[210] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="p-5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-extrabold text-indigo-100">페이지 도움말</p>
                <h2 className="text-xl font-black mt-1">{activeHelp.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setActiveHelpId(null)}
                className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 text-white font-black"
                aria-label="도움말 닫기"
              >
                ×
              </button>
            </div>
            <div className="p-5 space-y-5 text-slate-800">
              <p className="text-sm leading-relaxed font-semibold text-slate-700">{activeHelp.summary}</p>
              <div>
                <h3 className="text-sm font-black text-slate-900 mb-2">사용 방법</h3>
                <ol className="space-y-2">
                  {activeHelp.steps.map((step, idx) => (
                    <li key={idx} className="flex gap-2 text-sm leading-relaxed">
                      <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-black text-xs flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
              {activeHelp.tip && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <span className="font-black">운영 팁: </span>{activeHelp.tip}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveHelpId(null)}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TeacherLayout;
