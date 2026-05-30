import React, { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from './firebase';
import { doc, getDoc, collection, query, where, getDocs, updateDoc, onSnapshot } from 'firebase/firestore';
import { useIsAdmin } from './hooks/useIsAdmin';
import { normalizeLevelProgress } from './utils/leveling';

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
import AICourseware  from './pages/student/AICourseware.jsx';
import SpriteMonster from './components/SpriteMonster';
import { MONSTERS_DB } from './data/monsterData';

// ── 전역 걷는 펫 (우측 하단 영역) ───────────────────────────
function WalkingPet({ monsterData }) {
  const wrapRef = useRef(null);
  const rafRef  = useRef(null);

  const getRange = () => {
    const PET_W = Math.round((monsterData?.frameWidth || 80) * (monsterData?.scale || 0.5) * 2);
    const minX = Math.floor(window.innerWidth * 0.55); // 우측 45% 구간
    const maxX = window.innerWidth - PET_W - 2;        // 오른쪽 벽까지 최대한
    return { minX, maxX };
  };
  const posRef = useRef({ x: getRange().minX, goRight: true });

  useEffect(() => {
    if (!monsterData) return;
    const SPEED = 0.45;
    // 보스 티어는 스프라이트 방향이 일반 몬스터와 반대 → flip 논리 반전
    const effectiveFlip = monsterData.tier === 'boss'
      ? !monsterData.flip
      : monsterData.flip;

    const loop = () => {
      const p = posRef.current;
      p.x += p.goRight ? SPEED : -SPEED;
      const { minX, maxX } = getRange();
      if (p.x >= maxX) { p.x = maxX; p.goRight = false; }
      if (p.x <= minX) { p.x = minX; p.goRight = true;  }

      if (wrapRef.current) {
        wrapRef.current.style.left = p.x + 'px';
        const sx = (p.goRight !== effectiveFlip) ? 1 : -1;
        wrapRef.current.style.transform = `scaleX(${sx})`;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [monsterData]);

  if (!monsterData) return null;
  return (
    <div ref={wrapRef} style={{
      position: 'fixed', bottom: 2, zIndex: 20,
      pointerEvents: 'none', transformOrigin: 'center bottom',
    }}>
      <SpriteMonster data={monsterData} anim="run" scale={monsterData.scale * 2} />
    </div>
  );
}

const ADVENTURE_VIEWS = ['adventure','quizDungeon','explorationDungeon','arena','bossRaid','miniGame'];
const THEMEABLE_VIEWS = new Set(['dashboard', 'classAll', 'quest', 'learningNote', 'myCharacter']);
const ADVENTURE_BG = 'linear-gradient(160deg, #020617 0%, #0f172a 50%, #1e1b4b 100%)';
const STUDENT_SESSION_KEY = 'studentInfo';
const STUDENT_AUTO_LOGIN_KEY = 'levelupStudentAutoLogin';

const readSavedStudentSession = () => {
  const raw = sessionStorage.getItem(STUDENT_SESSION_KEY) || localStorage.getItem(STUDENT_AUTO_LOGIN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const saveStudentSession = (data) => {
  const payload = JSON.stringify({ ...data, savedAt: Date.now() });
  sessionStorage.setItem(STUDENT_SESSION_KEY, payload);
  localStorage.setItem(STUDENT_AUTO_LOGIN_KEY, payload);
};

// appMode: 'loading' | 'login' | 'classSelect' | 'student' | 'teacher' | 'admin'
function App() {
  const [appMode,        setAppMode]        = useState('loading');
  const [teacherUser,    setTeacherUser]    = useState(null);
  const [selectedClass,  setSelectedClass]  = useState(null);
  const [studentInfo,    setStudentInfo]    = useState(null);
  const [activePetMonster, setActivePetMonster] = useState(null);
  const [currentView,    setCurrentView]    = useState('dashboard');
  const [testStudentCode, setTestStudentCode] = useState(null);
  const [studentClassInfo, setStudentClassInfo] = useState(null);
  const { isAdmin, loading: isAdminLoading } = useIsAdmin(teacherUser?.email);
  const [teacherAccessCode, setTeacherAccessCode] = useState('0526');
  const [teacherCodeInput, setTeacherCodeInput] = useState('');
  const [teacherCodeError, setTeacherCodeError] = useState('');
  const [themeMode, setThemeMode] = useState(() => localStorage.getItem('studentThemeMode') || 'dark');
  const [hideStudentNav, setHideStudentNav] = useState(false);
  const [hiddenStudentMenuIds, setHiddenStudentMenuIds] = useState([]);
  const [forceShowStudentNav, setForceShowStudentNav] = useState(false);

  useEffect(() => {
    localStorage.setItem('studentThemeMode', themeMode);
  }, [themeMode]);

  useEffect(() => {
    const loadUiPrefs = async () => {
      // 학급별 설정 읽기: classes/{classId} → 없으면 전역 fallback
      const classId = studentInfo?.classId;
      const uiRef = classId
        ? doc(db, 'classes', classId)
        : doc(db, 'systemConfig', 'uiPreferences');
      try {
        const snap = await getDoc(uiRef);
        const data = snap.exists() ? (snap.data() || {}) : {};
        setHideStudentNav(data.hideStudentNav === true);
        setHiddenStudentMenuIds(Array.isArray(data.hiddenStudentMenuIds) ? data.hiddenStudentMenuIds : []);
      } catch {
        setHideStudentNav(false);
        setHiddenStudentMenuIds([]);
      }
    };
    loadUiPrefs();
  }, [studentInfo?.classId]);

  // ── Firebase Auth 상태 감지 (교사 로그인 유지) ─────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setTeacherUser(user);
        // 인증 미완료 시 ClassSelectPage에서 인라인으로 처리
        const savedClass = sessionStorage.getItem('selectedClass');
        if (savedClass) {
          setSelectedClass(JSON.parse(savedClass));
          setAppMode('teacher');
        } else {
          setAppMode('classSelect');
        }
      } else {
        // 로그아웃 또는 미로그인 → 학생 세션 확인
        if (sessionStorage.getItem('skipStudentAutoLoginOnce') === '1') {
          sessionStorage.removeItem('skipStudentAutoLoginOnce');
          setAppMode('login');
          return;
        }

        if (new URLSearchParams(window.location.search).get('code')) {
          setAppMode('login');
          return;
        }

        const saved = readSavedStudentSession();
        if (saved) {
          setStudentInfo(saved);
          sessionStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(saved));
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
      setAppMode('classSelect');
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

  const handleTeacherTestPage = () => {
    const cls = { id: null, teacherUid: 'admin_master_001', schoolName: '교사 테스트 페이지' };
    setSelectedClass(cls);
    sessionStorage.setItem('selectedClass', JSON.stringify(cls));
    setAppMode('teacher');
  };

  // ── 학생 로그인 콜백 ─────────────────────────────────────────
  const handleStudentLogin = (data) => {
    setStudentInfo(data);
    saveStudentSession(data);
    setAppMode('student');
    setCurrentView('dashboard');
  };

  // ── 로그아웃 ─────────────────────────────────────────────────
  const handleLogout = async () => {
    if (teacherUser?.uid || appMode === 'teacher' || appMode === 'classSelect' || appMode === 'admin' || appMode === 'teacherAuth') {
      sessionStorage.setItem('skipStudentAutoLoginOnce', '1');
      await signOut(auth);
    }
    sessionStorage.removeItem(STUDENT_SESSION_KEY);
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
        saveStudentSession(data);
      }
    } catch (e) {
      console.error('테스트 학생 연동 실패:', e);
    }
    setAppMode('student');
    setCurrentView('quest');
  };

  // ── 현재 studentCode (실제 or 테스트) ────────────────────────
  const activeStudentCode = testStudentCode || studentInfo?.studentCode || null;

  // 학생 로그인 후 공통 레벨/경험치 정규화(화면 진입 경로와 무관하게 1회 보정)
  useEffect(() => {
    if (appMode !== 'student' || !activeStudentCode) return;

    const normalizeStudentProgress = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'students'), where('studentCode', '==', activeStudentCode))
        );
        if (snap.empty) return;

        const sDoc = snap.docs[0];
        const data = sDoc.data();
        const currentLevel = data.level ?? 1;
        const currentExp = data.exp ?? 0;
        const { level, exp, maxExp, changed } = normalizeLevelProgress(currentLevel, currentExp);

        const maxExpMismatch = (data.maxExp ?? 0) !== maxExp;
        if (changed || maxExpMismatch) {
          await updateDoc(doc(db, 'students', sDoc.id), { level, exp, maxExp });
        }

        if ((studentInfo?.id && studentInfo.id === sDoc.id) || (studentInfo?.studentCode === activeStudentCode)) {
          setStudentInfo((prev) => {
            if (!prev) return prev;
            return { ...prev, level, exp, maxExp };
          });
          saveStudentSession({
            ...(studentInfo || {}),
            id: sDoc.id,
            level,
            exp,
            maxExp,
          });
        }
      } catch (error) {
        console.error('학생 레벨/경험치 정규화 실패:', error);
      }
    };

    normalizeStudentProgress();
  }, [appMode, activeStudentCode]);

  // 대표 펫 실시간 구독 — PetHouse에서 대표 설정 시 즉시 반영
  useEffect(() => {
    if (!activeStudentCode) { setActivePetMonster(null); return; }

    const q = query(collection(db, 'students'), where('studentCode', '==', activeStudentCode));
    const unsub = onSnapshot(q, async (snap) => {
      if (snap.empty) { setActivePetMonster(null); return; }
      const pid = snap.docs[0].data().activePetId;
      if (!pid) { setActivePetMonster(null); return; }
      try {
        const petSnap = await getDoc(doc(db, 'studentPets', pid));
        if (petSnap.exists()) {
          const md = MONSTERS_DB[petSnap.data().monsterId];
          setActivePetMonster(md || null);
        } else { setActivePetMonster(null); }
      } catch { setActivePetMonster(null); }
    });
    return () => unsub();
  }, [activeStudentCode]);

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
    return (
      <AdminPage
        adminUser={teacherUser}
        onLogout={handleLogout}
        onBackToClassSelect={() => setAppMode('classSelect')}
      />
    );
  }

  if (appMode === 'classSelect') {
    return (
      <ClassSelectPage
        teacherUser={teacherUser}
        onClassSelected={handleClassSelected}
        isAdmin={isAdmin}
        onEnterAdmin={() => setAppMode('admin')}
        onEnterTeacherTest={handleTeacherTestPage}
        onLogout={handleLogout}
        teacherAccessCode={teacherAccessCode}
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
  const shouldUseAdventureBg = THEMEABLE_VIEWS.has(currentView) && themeMode === 'dark';
  const isStudentTestAccount = activeStudentCode?.toLowerCase?.() === 'sinseok-5-15';
  const effectiveHiddenStudentMenuIds = isStudentTestAccount ? [] : hiddenStudentMenuIds;
  const showStudentNav = isStudentTestAccount || !hideStudentNav || forceShowStudentNav;

  return (
    <div className={`flex h-screen relative ${themeMode === 'dark' ? 'bg-slate-950' : 'bg-slate-50'}`}>
      {/* 전역 걷는 펫 */}
      {activePetMonster && <WalkingPet monsterData={activePetMonster} />}

      {showStudentNav && (
        <NavigationBar changeView={setCurrentView} currentView={currentView} classInfo={studentClassInfo} hiddenMenuIds={effectiveHiddenStudentMenuIds} />
      )}
      {!showStudentNav && (
        <button
          onClick={() => setForceShowStudentNav(true)}
          className="fixed left-3 top-3 z-[90] rounded-lg bg-indigo-600 px-3 py-2 text-xs font-extrabold text-white shadow-lg"
        >
          메뉴 열기
        </button>
      )}

      <main className="flex-1 overflow-auto relative" style={shouldUseAdventureBg ? { background: ADVENTURE_BG } : undefined}>
        {currentView === 'dashboard'    && <StudentDashboard studentCode={activeStudentCode} onChangeView={setCurrentView} themeMode={themeMode} />}
        {currentView === 'myCharacter'  && <MyCharacter      studentCode={activeStudentCode} themeMode={themeMode} />}
        {currentView === 'avatarRoom'   && <AvatarRoom        studentCode={activeStudentCode} />}
        {currentView === 'quest'        && <StudentQuestPage  studentCode={activeStudentCode} themeMode={themeMode} />}
        {currentView === 'classAll'     && <ClassAllView studentCode={activeStudentCode} themeMode={themeMode} />}
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
        {currentView === 'learningNote' && <LearningNote   studentCode={activeStudentCode} themeMode={themeMode} />}
        {currentView === 'themeSettings' && (
          <div className="p-6 md:p-8">
            <div className={`max-w-xl rounded-3xl border p-6 ${
              themeMode === 'dark'
                ? 'bg-slate-900/70 border-slate-700 text-slate-100'
                : 'bg-white border-slate-200 text-slate-800'
            }`}>
              <h2 className="text-2xl font-extrabold mb-2">테마 설정</h2>
              <p className={`text-sm mb-5 ${themeMode === 'dark' ? 'text-slate-300' : 'text-slate-500'}`}>
                기본값은 어두운 모드이며, 어드벤처 화면은 테마 변경과 무관하게 동일합니다.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setThemeMode('dark')}
                  className={`rounded-2xl px-4 py-3 font-bold border ${
                    themeMode === 'dark'
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : 'bg-transparent border-slate-400/40'
                  }`}
                >
                  어두운 모드
                </button>
                <button
                  type="button"
                  onClick={() => setThemeMode('light')}
                  className={`rounded-2xl px-4 py-3 font-bold border ${
                    themeMode === 'light'
                      ? 'bg-amber-500 text-white border-amber-400'
                      : 'bg-transparent border-slate-400/40'
                  }`}
                >
                  밝은 모드
                </button>
              </div>
            </div>
          </div>
        )}
        {currentView === 'freeBoard'  && <FreeBoard    studentCode={activeStudentCode} />}
        {currentView === 'hallOfFame' && <HallOfFame   studentCode={activeStudentCode} />}
        {currentView === 'classVote'  && <ClassVote    studentCode={activeStudentCode} />}
        {currentView === 'petHouse'  && <PetHouse studentCode={activeStudentCode} />}
        {currentView === 'equipment' && <Equipment studentCode={activeStudentCode} themeMode={themeMode} />}
        {currentView === 'gachaBox'     && <GachaBox     studentCode={activeStudentCode} />}
        {currentView === 'aiCourseware' && <AICourseware studentCode={activeStudentCode} />}
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
