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
import FreeBoard      from '../student/FreeBoard';
import HallOfFame     from '../student/HallOfFame';

function TeacherLayout({ user, onLogout, onStudentTestLogin, selectedClass, onChangeClass }) {
  const [currentView, setCurrentView]   = useState('dashboard');
  const [teacherThemeMode, setTeacherThemeMode] = useState(() => localStorage.getItem('teacherThemeMode') || 'dark');
  const [hideTeacherNav, setHideTeacherNav] = useState(false);
  const [hideStudentNav, setHideStudentNav] = useState(false);
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

  useEffect(() => {
    const loadUiPrefs = async () => {
      try {
        const snap = await getDoc(doc(db, 'systemConfig', 'uiPreferences'));
        const data = snap.exists() ? (snap.data() || {}) : {};
        setHideTeacherNav(data.hideTeacherNav === true);
        setHideStudentNav(data.hideStudentNav === true);
      } catch {
        setHideTeacherNav(false);
      }
    };
    loadUiPrefs();
  }, []);

  useEffect(() => {
    const initialView = localStorage.getItem('teacherInitialView');
    if (initialView) {
      setCurrentView(initialView);
      localStorage.removeItem('teacherInitialView');
    }
  }, []);

  const dismiss = (id) => {
    const next = [...dismissedIds, id];
    setDismissedIds(next);
    sessionStorage.setItem('dismissedNotices', JSON.stringify(next));
  };

  const visibleNotices = notices.filter(n => !dismissedIds.includes(n.id));

  const isDark = teacherThemeMode === 'dark';
  const shouldShowNav = !hideTeacherNav || forceShowNav;

  return (
    <div className={`flex h-screen w-full ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
      {/* 교사용 네비게이션 바 */}
      {shouldShowNav && (
        <TeacherNavigationBar
          changeView={setCurrentView}
          currentView={currentView}
          onLogout={onLogout}
          selectedClass={selectedClass}
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
        {currentView === 'quizBank'           && <QuizBank />}
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
        {currentView === 'inquiry'         && <FeedbackBoard selectedClass={selectedClass} />}
        {currentView === 'dataReset'       && <DataReset selectedClass={selectedClass} onClassDeleted={onChangeClass} />}
        {currentView === 'systemSettings'  && (
          <div className="p-6">
            <div className={`max-w-2xl rounded-2xl border p-5 ${isDark ? 'border-slate-700 bg-slate-800 text-slate-100' : 'border-slate-200 bg-white text-slate-800'}`}>
              <h2 className="text-xl font-extrabold mb-4">시스템 설정</h2>
              <div className="mb-5">
                <div className="text-sm font-bold mb-2">교사 다크모드</div>
                <div className="flex gap-2">
                  <button onClick={() => setTeacherThemeMode('dark')} className={`px-4 py-2 rounded-lg text-sm font-bold border ${teacherThemeMode === 'dark' ? 'bg-indigo-600 text-white border-indigo-500' : 'border-slate-400/40'}`}>어두운 모드</button>
                  <button onClick={() => setTeacherThemeMode('light')} className={`px-4 py-2 rounded-lg text-sm font-bold border ${teacherThemeMode === 'light' ? 'bg-amber-500 text-white border-amber-400' : 'border-slate-400/40'}`}>밝은 모드</button>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 p-4 mb-4">
                <div className="text-sm font-bold mb-3">메뉴 숨기기</div>
                <div className="space-y-3">
                  <label className="flex items-center justify-between text-sm">
                    <span>학생 네비게이션 숨김</span>
                    <button
                      type="button"
                      onClick={async () => {
                        const next = !hideStudentNav;
                        setHideStudentNav(next);
                        await setDoc(doc(db, 'systemConfig', 'uiPreferences'), { hideStudentNav: next }, { merge: true });
                      }}
                      className={`w-12 h-6 rounded-full transition-colors relative ${hideStudentNav ? 'bg-indigo-500' : 'bg-slate-300'}`}
                    >
                      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${hideStudentNav ? 'left-7' : 'left-1'}`} />
                    </button>
                  </label>
                  <label className="flex items-center justify-between text-sm">
                    <span>교사 네비게이션 숨김</span>
                    <button
                      type="button"
                      onClick={async () => {
                        const next = !hideTeacherNav;
                        setHideTeacherNav(next);
                        await setDoc(doc(db, 'systemConfig', 'uiPreferences'), { hideTeacherNav: next }, { merge: true });
                      }}
                      className={`w-12 h-6 rounded-full transition-colors relative ${hideTeacherNav ? 'bg-indigo-500' : 'bg-slate-300'}`}
                    >
                      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${hideTeacherNav ? 'left-7' : 'left-1'}`} />
                    </button>
                  </label>
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
