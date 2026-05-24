import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';

import LoginPage        from './pages/LoginPage.jsx';
import ClassSelectPage  from './pages/teacher/ClassSelectPage.jsx';
import AdminPage        from './pages/admin/AdminPage.jsx';

const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || '')
  .split(',').map(e => e.trim()).filter(Boolean);
import NavigationBar    from './components/NavigationBar';
import TeacherLogin     from './pages/teacher/TeacherLogin.jsx';
import MyCharacter      from './components/MyCharacter';
import StudentDashboard from './components/StudentDashboard';
import AvatarRoom       from './pages/student/AvatarShop.jsx';
import StudentQuestPage from './pages/student/StudentQuestPage.jsx';
import ClassAllView     from './pages/student/ClassAllView.jsx';
import EditProfile      from './pages/student/EditProfile.jsx';
import ClassBank        from './pages/student/ClassBank.jsx';
import ClassShop        from './pages/student/ClassShop.jsx';
import AdventurePage    from './pages/student/AdventurePage.jsx';
import StockMarket      from './pages/student/StockMarket.jsx';
import LearningBoard    from './pages/student/LearningBoard.jsx';
import PetHouse        from './pages/student/PetHouse.jsx';
import Equipment      from './pages/student/Equipment.jsx';
import GachaBox       from './pages/student/GachaBox.jsx';
import Arena          from './pages/student/Arena.jsx';
import FreeBoard      from './pages/student/FreeBoard.jsx';
import HallOfFame     from './pages/student/HallOfFame.jsx';
import ClassVote      from './pages/student/ClassVote.jsx';

const ADVENTURE_VIEWS = ['adventure','quizDungeon','explorationDungeon','arena','bossRaid','miniGame'];

// appMode: 'loading' | 'login' | 'classSelect' | 'student' | 'teacher' | 'admin'
function App() {
  const [appMode,        setAppMode]        = useState('loading');
  const [teacherUser,    setTeacherUser]    = useState(null);
  const [selectedClass,  setSelectedClass]  = useState(null);
  const [studentInfo,    setStudentInfo]    = useState(null);
  const [currentView,    setCurrentView]    = useState('dashboard');
  const [testStudentCode, setTestStudentCode] = useState(null);
  const [studentClassInfo, setStudentClassInfo] = useState(null);

  // ── Firebase Auth 상태 감지 (교사 로그인 유지) ─────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setTeacherUser(user);
        if (ADMIN_EMAILS.includes(user.email)) {
          setAppMode('admin');
        } else {
          const savedClass = sessionStorage.getItem('selectedClass');
          if (savedClass) {
            setSelectedClass(JSON.parse(savedClass));
            setAppMode('teacher');
          } else {
            setAppMode('classSelect');
          }
        }
      } else {
        // 로그아웃 또는 미로그인 → 학생 세션 확인
        const saved = sessionStorage.getItem('studentInfo');
        if (saved) {
          setStudentInfo(JSON.parse(saved));
          setAppMode('student');
        } else {
          setAppMode('login');
        }
      }
    });
    return unsub;
  }, []);

  // ── 학생 학급 정보 조회 ────────────────────────────────────────
  useEffect(() => {
    if (!studentInfo?.classId) { setStudentClassInfo(null); return; }
    getDoc(doc(db, 'classes', studentInfo.classId))
      .then(snap => { if (snap.exists()) setStudentClassInfo(snap.data()); })
      .catch(() => {});
  }, [studentInfo?.classId]);

  // ── 교사 로그인 콜백 → 학급 선택으로 (테스트는 바로 입장) ───
  const handleTeacherLogin = (user) => {
    setTeacherUser(user);
    if (!user.uid) {
      setSelectedClass({ id: null, teacherUid: 'admin_master_001' });
      setAppMode('teacher');
    } else if (ADMIN_EMAILS.includes(user.email)) {
      setAppMode('admin');
    } else {
      setAppMode('classSelect');
    }
  };

  // ── 학급 선택 콜백 ───────────────────────────────────────────
  const handleClassSelected = (cls) => {
    setSelectedClass(cls);
    sessionStorage.setItem('selectedClass', JSON.stringify(cls));
    setAppMode('teacher');
  };

  // ── 학생 로그인 콜백 ─────────────────────────────────────────
  const handleStudentLogin = (data) => {
    setStudentInfo(data);
    sessionStorage.setItem('studentInfo', JSON.stringify(data));
    setAppMode('student');
    setCurrentView('dashboard');
  };

  // ── 로그아웃 ─────────────────────────────────────────────────
  const handleLogout = async () => {
    if (appMode === 'teacher' || appMode === 'classSelect' || appMode === 'admin') await signOut(auth);
    sessionStorage.removeItem('studentInfo');
    sessionStorage.removeItem('selectedClass');
    setTeacherUser(null);
    setSelectedClass(null);
    setStudentInfo(null);
    setTestStudentCode(null);
    setAppMode('login');
  };

  // ── 교사 → 학생 테스트 로그인 ────────────────────────────────
  const handleStudentTestLogin = (code) => {
    setTestStudentCode(code);
    setAppMode('student');
    setCurrentView('quest');
  };

  // ── 현재 studentCode (실제 or 테스트) ────────────────────────
  const activeStudentCode = testStudentCode || studentInfo?.studentCode || null;

  // ── 렌더링 ───────────────────────────────────────────────────

  if (appMode === 'loading') {
    return (
      <div className="min-h-screen bg-indigo-950 flex items-center justify-center">
        <div className="text-white font-bold text-xl animate-pulse">🏰 로딩 중...</div>
      </div>
    );
  }

  if (appMode === 'login') {
    return (
      <LoginPage
        onTeacherLogin={handleTeacherLogin}
        onStudentLogin={handleStudentLogin}
        onAdminLogin={() => setAppMode('admin')}
      />
    );
  }

  if (appMode === 'admin') {
    return <AdminPage adminUser={teacherUser} onLogout={handleLogout} />;
  }

  if (appMode === 'classSelect') {
    return (
      <ClassSelectPage
        teacherUser={teacherUser}
        onClassSelected={handleClassSelected}
        onLogout={handleLogout}
      />
    );
  }

  if (appMode === 'teacher') {
    return (
      <div className="relative w-full h-screen">
        <TeacherLogin
          onStudentTestLogin={handleStudentTestLogin}
          onLogout={handleLogout}
          teacherEmail={teacherUser?.email}
          selectedClass={selectedClass}
          onChangeClass={() => {
            sessionStorage.removeItem('selectedClass');
            setSelectedClass(null);
            setAppMode('classSelect');
          }}
        />
      </div>
    );
  }

  // ── 학생 모드 ─────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-slate-50 relative">
      <NavigationBar changeView={setCurrentView} currentView={currentView} classInfo={studentClassInfo} />

      <main className="flex-1 overflow-auto relative">
        {currentView === 'dashboard'    && <StudentDashboard studentCode={activeStudentCode} />}
        {currentView === 'myCharacter'  && <MyCharacter      studentCode={activeStudentCode} />}
        {currentView === 'avatarRoom'   && <AvatarRoom        studentCode={activeStudentCode} />}
        {currentView === 'quest'        && <StudentQuestPage  studentCode={activeStudentCode} />}
        {currentView === 'classAll'     && <ClassAllView studentCode={activeStudentCode} />}
        {currentView === 'classBank'    && <ClassBank         studentCode={activeStudentCode} />}
        {currentView === 'classShop'    && <ClassShop         studentCode={activeStudentCode} />}
        {currentView === 'stockMarket'  && <StockMarket       studentCode={activeStudentCode} />}
        {currentView === 'editProfile'  && (
          <EditProfile
            studentCode={activeStudentCode}
            onNameSaved={(name) => console.log('이름 저장됨:', name)}
          />
        )}
        {ADVENTURE_VIEWS.includes(currentView) && (
          <AdventurePage currentView={currentView} studentCode={activeStudentCode} />
        )}
        {currentView === 'board'      && <LearningBoard studentCode={activeStudentCode} />}
        {currentView === 'freeBoard'  && <FreeBoard    studentCode={activeStudentCode} />}
        {currentView === 'hallOfFame' && <HallOfFame   studentCode={activeStudentCode} />}
        {currentView === 'classVote'  && <ClassVote    studentCode={activeStudentCode} />}
        {currentView === 'petHouse'  && <PetHouse />}
        {currentView === 'equipment' && <Equipment studentCode={activeStudentCode} />}
        {currentView === 'gachaBox'  && <GachaBox  studentCode={activeStudentCode} />}
        {currentView === 'academy' && (
          <div className="p-8 text-2xl font-bold text-slate-800">아카데미 화면 (준비 중 📚)</div>
        )}
      </main>

      {/* 로그아웃 버튼 */}
      <button
        onClick={handleLogout}
        className="absolute bottom-2 left-2 text-slate-300 hover:text-rose-400 transition-colors z-50 p-2 text-xs font-bold"
        title="로그아웃">
        🚪
      </button>
    </div>
  );
}

export default App;
