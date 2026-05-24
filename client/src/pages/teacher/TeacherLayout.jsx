import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
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
import TeacherCharacter from './TeacherCharacter';
import FeedbackBoard from './FeedbackBoard';
import DataReset from './DataReset';
import BossRaid from '../student/BossRaid';
import QuizDungeon from '../student/QuizDungeon';
import ExplorationDungeon from '../student/ExplorationDungeon';
import ClassVoteManage from './ClassVoteManage';

function TeacherLayout({ user, onLogout, onStudentTestLogin, selectedClass, onChangeClass }) {
  const [currentView, setCurrentView]   = useState('dashboard');
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

  const dismiss = (id) => {
    const next = [...dismissedIds, id];
    setDismissedIds(next);
    sessionStorage.setItem('dismissedNotices', JSON.stringify(next));
  };

  const visibleNotices = notices.filter(n => !dismissedIds.includes(n.id));

  return (
    <div className="flex h-screen bg-slate-50 w-full">
      {/* 교사용 네비게이션 바 */}
      <TeacherNavigationBar
        changeView={setCurrentView}
        currentView={currentView}
        onLogout={onLogout}
      />

      {/* 우측 메인 화면 */}
      <main className="flex-1 overflow-auto relative bg-slate-100">

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

        {currentView === 'dashboard' && <TeacherDashboard key={dashboardKey} onStudentTestLogin={onStudentTestLogin} selectedClass={selectedClass} />}

        {/* 학생 계정 발급 화면 */}
        {currentView === 'accountIssue'    && <AccountIssue user={user} selectedClass={selectedClass} />}
        {currentView === 'questManage'     && <QuestManage selectedClass={selectedClass} />}
        {currentView === 'bankManage'       && <BankManage />}
        {currentView === 'classShopManage' && <ClassShopManage />}
        {currentView === 'stockManage'        && <StockManage />}
        {currentView === 'quizBank'           && <QuizBank />}
        {currentView === 'quizDungeonManage' && <QuizDungeonManage selectedClass={selectedClass} />}
        {currentView === 'bossRaidManage'    && <BossRaidManage onViewLobby={() => setCurrentView('bossRaid')} />}
        {currentView === 'bossRaid'          && <BossRaid isTeacher={true} />}
        {currentView === 'quizDungeon'       && <QuizDungeon isTeacher={true} teacherUid={selectedClass?.teacherUid} />}
        {currentView === 'explorationDungeon' && <ExplorationDungeon isTeacher={true} teacherUid={selectedClass?.teacherUid} />}

        {/* 임시 준비 중 화면들 */}
        {currentView === 'myCharacter'     && <TeacherCharacter selectedClass={selectedClass} />}
        {currentView === 'adventureManage' && <AdventureManage selectedClass={selectedClass} />}
        {currentView === 'boardManage'     && <BoardManage selectedClass={selectedClass} user={user} />}
        {currentView === 'inquiry'         && <FeedbackBoard selectedClass={selectedClass} />}
        {currentView === 'dataReset'       && <DataReset selectedClass={selectedClass} />}
        {currentView === 'classVoteManage' && <ClassVoteManage selectedClass={selectedClass} />}
        
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