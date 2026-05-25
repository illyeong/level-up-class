import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from './firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { useIsAdmin } from './hooks/useIsAdmin';

import LoginPage        from './pages/LoginPage.jsx';
import ClassSelectPage  from './pages/teacher/ClassSelectPage.jsx';
import AdminPage        from './pages/admin/AdminPage.jsx';
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
import LearningNote     from './pages/student/LearningNote.jsx';
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
  const { isAdmin, loading: isAdminLoading } = useIsAdmin(teacherUser?.email);
  const [teacherAccessCode, setTeacherAccessCode] = useState('0526');
  const [teacherCodeInput, setTeacherCodeInput] = useState('');
  const [teacherCodeError, setTeacherCodeError] = useState('');

  // ── Firebase Auth 상태 감지 (교사 로그인 유지) ─────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setTeacherUser(user);
        if (user.uid && !localStorage.getItem(`teacherAuthVerified:${user.uid}`)) {
          setTeacherCodeInput('');
          setTeacherCodeError('');
          setAppMode('teacherAuth');
          return;
        }
        const savedClass = sessionStorage.getItem('selectedClass');
        if (savedClass) {
          setSelectedClass(JSON.parse(savedClass));
          setAppMode('teacher');
        } else {
          setAppMode('classSelect');
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

  useEffect(() => {
    getDoc(doc(db, 'systemConfig', 'global'))
      .then((snap) => {
        const code = snap.data()?.teacherAccessCode;
        if (code) setTeacherAccessCode(String(code));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!teacherUser) return;
    if (!teacherUser.uid) return;
    if (appMode === 'teacherAuth') return;
    if (isAdminLoading) {
      setAppMode('loading');
      return;
    }

    if (isAdmin) {
      setAppMode('admin');
      return;
    }

    const savedClass = sessionStorage.getItem('selectedClass');
    if (savedClass) {
      setSelectedClass(JSON.parse(savedClass));
      setAppMode('teacher');
    } else {
      setAppMode('classSelect');
    }
  }, [teacherUser, isAdmin, isAdminLoading]);

  // ── 학생 학급 정보 조회 ────────────────────────────────────────
  useEffect(() => {
    const classId    = studentInfo?.classId;
    const teacherUid = studentInfo?.teacherUid;
    if (!classId && !teacherUid) { setStudentClassInfo(null); return; }

    if (classId) {
      getDoc(doc(db, 'classes', classId))
        .then(snap => { if (snap.exists()) setStudentClassInfo(snap.data()); })
        .catch(() => {});
    } else {
      // classId 없는 구버전 학생 계정 → teacherUid로 학급 조회
      getDocs(query(collection(db, 'classes'), where('teacherUid', '==', teacherUid)))
        .then(snap => { if (!snap.empty) setStudentClassInfo(snap.docs[0].data()); })
        .catch(() => {});
    }
  }, [studentInfo?.classId, studentInfo?.teacherUid]);

  // ── 교사 로그인 콜백 → 학급 선택으로 (테스트는 바로 입장) ───
  const handleTeacherLogin = async (user) => {
    setTeacherUser(user);
    if (!user.uid) {
      const testCode = 'SINSEOK-5-15';
      try {
        const studentSnap = await getDocs(
          query(collection(db, 'students'), where('studentCode', '==', testCode))
        );
        if (!studentSnap.empty) {
          const studentData = studentSnap.docs[0].data();
          const classId = studentData?.classId || null;
          const teacherUid = studentData?.teacherUid || null;

          if (teacherUid) {
            // 테스트 교사는 학생 계정과 동일 스코프(teacherUid)로 묶어야
            // 기존 classId 없는 학생(구버전 계정)과도 상점/은행 데이터가 맞게 연동됩니다.
            const cls = { id: null, teacherUid };
            setSelectedClass(cls);
            sessionStorage.setItem('selectedClass', JSON.stringify(cls));
            setAppMode('teacher');
            return;
          }

          if (classId) {
            const classDoc = await getDoc(doc(db, 'classes', classId));
            if (classDoc.exists()) {
              const cls = { id: classDoc.id, ...classDoc.data() };
              setSelectedClass(cls);
              sessionStorage.setItem('selectedClass', JSON.stringify(cls));
              setAppMode('teacher');
              return;
            }
          }
        }
      } catch (e) {
        console.error('테스트 교사 학급 연동 실패:', e);
      }

      setSelectedClass({ id: null, teacherUid: 'admin_master_001' });
      setAppMode('teacher');
    } else {
      setAppMode('loading');
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
    if (teacherUser?.uid || appMode === 'teacher' || appMode === 'classSelect' || appMode === 'admin' || appMode === 'teacherAuth') {
      await signOut(auth);
    }
    sessionStorage.removeItem('studentInfo');
    sessionStorage.removeItem('selectedClass');
    setTeacherUser(null);
    setSelectedClass(null);
    setStudentInfo(null);
    setTestStudentCode(null);
    setTeacherCodeInput('');
    setTeacherCodeError('');
    setAppMode('login');
  };

  const handleTeacherAuthSubmit = () => {
    if (!teacherUser?.uid) return;
    if (teacherCodeInput.trim() !== String(teacherAccessCode)) {
      setTeacherCodeError('인증번호가 올바르지 않습니다.');
      return;
    }
    localStorage.setItem(`teacherAuthVerified:${teacherUser.uid}`, '1');
    setTeacherCodeError('');
    setAppMode('loading');
  };

  // ── 교사 → 학생 테스트 로그인 ────────────────────────────────
  const handleStudentTestLogin = async (code) => {
    const normalizedCode = String(code || 'SINSEOK-5-15').trim().toUpperCase();
    setTestStudentCode(normalizedCode);
    try {
      const snap = await getDocs(
        query(collection(db, 'students'), where('studentCode', '==', normalizedCode))
      );
      if (!snap.empty) {
        const data = { id: snap.docs[0].id, ...snap.docs[0].data() };
        setStudentInfo(data);
        sessionStorage.setItem('studentInfo', JSON.stringify(data));
      }
    } catch (e) {
      console.error('테스트 학생 연동 실패:', e);
    }
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
      />
    );
  }

  if (appMode === 'teacherAuth') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6">
          <h1 className="text-white text-xl font-extrabold mb-2">교사 계정 1회 인증</h1>
          <p className="text-slate-400 text-sm mb-5">관리자가 부여한 4자리 인증번호를 입력해 주세요.</p>
          <input
            value={teacherCodeInput}
            onChange={(e) => {
              setTeacherCodeInput(e.target.value.replace(/\D/g, '').slice(0, 4));
              if (teacherCodeError) setTeacherCodeError('');
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleTeacherAuthSubmit()}
            placeholder="4자리 인증번호"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-center text-2xl tracking-widest font-mono focus:outline-none focus:border-indigo-500"
            maxLength={4}
          />
          {teacherCodeError && (
            <p className="mt-3 text-rose-400 text-sm font-bold">{teacherCodeError}</p>
          )}
          <button
            onClick={handleTeacherAuthSubmit}
            disabled={teacherCodeInput.length !== 4}
            className="w-full mt-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-extrabold"
          >
            인증 완료
          </button>
          <button
            onClick={handleLogout}
            className="w-full mt-2 py-2 text-slate-400 hover:text-white text-sm font-bold"
          >
            로그아웃
          </button>
        </div>
      </div>
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
        {currentView === 'dashboard'    && <StudentDashboard studentCode={activeStudentCode} onChangeView={setCurrentView} />}
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
          <AdventurePage currentView={currentView} studentCode={activeStudentCode} onChangeView={setCurrentView} />
        )}
        {currentView === 'board'        && <LearningBoard  studentCode={activeStudentCode} />}
        {currentView === 'learningNote' && <LearningNote   studentCode={activeStudentCode} />}
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
