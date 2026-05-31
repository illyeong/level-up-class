import React, { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from './firebase';
import { doc, getDoc, collection, query, where, getDocs, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
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
function WalkingPet({ monsterData, isDead, energy = 100, onClick, bubbleRef, posOutRef, actionAnim, actionKey = 0 }) {
  const wrapRef  = useRef(null);
  const rafRef   = useRef(null);
  const animRef  = useRef('run'); // 현재 애니: run | idle
  const timerRef = useRef(null);
  const actionLockRef = useRef(false);

  const getRange = () => {
    const PET_W = Math.round((monsterData?.frameWidth || 80) * (monsterData?.scale || 0.5) * 2);
    const minX = Math.floor(window.innerWidth * 0.65); // 우측 35% 구간 (더 넓게)
    const maxX = window.innerWidth - PET_W - 2;        // 스크롤바 바로 옆까지
    return { minX, maxX };
  };
  const posRef = useRef({ x: getRange().minX, goRight: true });

  useEffect(() => {
    if (!monsterData) return;
    // 기력에 따른 속도 (기력 낮으면 느리게)
    const SPEED = isDead ? 0 : energy >= 50 ? 0.45 : energy >= 20 ? 0.25 : 0.12;
    // 보스: sprite RIGHT방향 → goRight 시 1(정방향), goLeft 시 -1
    // 나머지 전체: sprite LEFT방향 → goRight 시 -1(반전), goLeft 시 1
    let lastSx = null;

    const loop = () => {
      const p = posRef.current;
      // idle 상태일 때는 위치 고정 (미끄러짐 방지)
      if (!isDead && animRef.current === 'run') {
        p.x += p.goRight ? SPEED : -SPEED;
        const { minX, maxX } = getRange();
        if (p.x >= maxX) { p.x = maxX; p.goRight = false; }
        if (p.x <= minX) { p.x = minX; p.goRight = true;  }
        if (wrapRef.current) {
          wrapRef.current.style.left = p.x + 'px';
          const sx = p.goRight ? -1 : 1;
          if (sx !== lastSx) {
            wrapRef.current.style.transform = `scaleX(${sx})`;
            lastSx = sx;
          }
        }
      }
      // 말풍선 + 외부 위치 ref 항상 동기화 (run/idle 무관)
      if (bubbleRef?.current) bubbleRef.current.style.left = p.x + 'px';
      if (posOutRef?.current) posOutRef.current.x = p.x;
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [monsterData, isDead, energy]);

  // ── run↔idle 불규칙 전환 (death가 아닐 때) ───────────────────
  const [anim, setAnim] = useState('run');
  useEffect(() => {
    if (isDead) { setAnim('death'); return; }
    const schedule = () => {
      const isRunning = animRef.current === 'run';
      // 기력 낮으면 idle 시간 길어짐
      const runTime  = energy >= 50 ? 3000 + Math.random() * 4000 : 1500 + Math.random() * 2000;
      const idleTime = energy >= 50 ? 1500 + Math.random() * 2500 : 3000 + Math.random() * 4000;
      const delay = isRunning ? runTime : idleTime;
      timerRef.current = setTimeout(() => {
        if (actionLockRef.current) {
          timerRef.current = setTimeout(schedule, 150);
          return;
        }
        const next = isRunning ? 'idle' : 'run';
        animRef.current = next;
        setAnim(next);
        schedule();
      }, delay);
    };
    animRef.current = 'run';
    setAnim('run');
    schedule();
    return () => clearTimeout(timerRef.current);
  }, [monsterData, isDead, energy]);

  useEffect(() => {
    if (!actionKey || !actionAnim || isDead) return;
    actionLockRef.current = true;
    animRef.current = 'idle';
    setAnim(actionAnim);
    const t = setTimeout(() => {
      actionLockRef.current = false;
      animRef.current = 'run';
      setAnim('run');
    }, 900);
    return () => {
      clearTimeout(t);
      actionLockRef.current = false;
    };
  }, [actionKey, actionAnim, isDead]);

  const initX = Math.floor(window.innerWidth * 0.75); // 초기 위치 명시
  if (!monsterData) return null;
  return (
    <div ref={wrapRef}
      onClick={onClick}
      style={{
        position: 'fixed', bottom: 2, left: initX, zIndex: 20,
        pointerEvents: onClick ? 'auto' : 'none',
        cursor: onClick ? 'pointer' : 'default',
        transformOrigin: 'center bottom',
        willChange: 'transform, left',
        imageRendering: 'pixelated',
        opacity: isDead ? 0.4 : 1,
      }}>
      <SpriteMonster data={monsterData} anim={anim} scale={monsterData.scale * 2} />
    </div>
  );
}

// ── 펫 말풍선 대사 ────────────────────────────────────────────
const PET_DIALOGUES = {
  dead:        ['너무 배가 고파요... 😢', '밥 줘요... 제발...', '꼬르륵...'],
  hungry:      ['배가 고파요... 🍖', '밥 줘요~ 🍖', '배꼽시계가 울려요!', '간식 없어요?'],
  unhappy:     ['심심해요... 💭', '같이 놀아요!', '쓰다듬어 주세요 💝', '외로워요~'],
  dirty:       ['씻겨주세요 🛁', '좀 더러운 것 같아요...', '목욕 하고 싶어요!'],
  tired:       ['피곤해요... 😴', '조금만 쉬어도 될까요?'],
  great:       ['오늘도 같이 공부하자! 📚', '행복해요~ 😊', '최고야! 🎉', '오늘도 잘 부탁해요!', '내가 항상 응원할게! ✨'],
  normal:      ['안녕! 👋', '오늘 뭐 공부했어요?', '같이 있어서 좋아요!', '열심히 하자! 💪', '보고 싶었어! 🐾'],
  study:       ['방금 문제 정말 잘 풀었어! 👏', 'AI 학습관 같이 가요! 🤖', '오늘도 한 문제씩!', '퀴즈 던전 도전해볼까요?'],
  levelupNear: ['조금만 더 하면 성장할 수 있어! 🌟', '거의 다 왔어요! 화이팅!', '레벨업이 코앞이에요! ✨'],
};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const getPetLine = (hunger, happiness, cleanliness, energy) => {
  if (hunger <= 0)       return pick(PET_DIALOGUES.dead);
  if (hunger < 20)       return pick(PET_DIALOGUES.hungry);
  if (happiness < 20)    return pick(PET_DIALOGUES.unhappy);
  if (cleanliness < 20)  return pick(PET_DIALOGUES.dirty);
  if (energy < 10)       return pick(PET_DIALOGUES.tired);
  if (hunger >= 70 && happiness >= 70) return pick(PET_DIALOGUES.great);
  const roll = Math.random();
  if (roll < 0.25) return pick(PET_DIALOGUES.study);
  if (roll < 0.35) return pick(PET_DIALOGUES.levelupNear);
  return pick(PET_DIALOGUES.normal);
};

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
  const [activePetMonster,     setActivePetMonster]     = useState(null);
  const [activePetData,        setActivePetData]        = useState(null); // 전체 펫 데이터
  const [activePetHunger,      setActivePetHunger]      = useState(100);
  const [activePetHappiness,   setActivePetHappiness]   = useState(100);
  const [activePetEnergy,      setActivePetEnergy]      = useState(100);
  const [activePetCleanliness, setActivePetCleanliness] = useState(100);
  const [showPetPopup,         setShowPetPopup]         = useState(false);
  const [petSpeech,            setPetSpeech]            = useState(null);
  const [showPetHearts,        setShowPetHearts]        = useState(false); // 쓰다듬기 하트 이펙트
  const [heartsKey,            setHeartsKey]            = useState(0);     // 리마운트용
  const [petActionAnim,        setPetActionAnim]        = useState(null);
  const [petActionKey,         setPetActionKey]         = useState(0);
  const petBubbleRef = useRef(null); // 말풍선 DOM ref (펫 따라다니기용)
  const petPosRef    = useRef({ x: Math.floor(window.innerWidth * 0.75) }); // 펫 실시간 X 위치
  const activePetUnsubRef = useRef(null);
  const [hasPoop,              setHasPoop]              = useState(false);
  const [petVisible, setPetVisible] = useState(true);
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

  // 랜덤 말풍선 (30~90초마다)
  useEffect(() => {
    if (!activePetMonster || !petVisible) return;
    const schedule = () => {
      const delay = 30000 + Math.random() * 60000;
      return setTimeout(() => {
        const line = getPetLine(activePetHunger, activePetHappiness, activePetCleanliness, activePetEnergy);
        setPetSpeech(line);
        setTimeout(() => setPetSpeech(null), 3500);
        timerRef.current = schedule();
      }, delay);
    };
    const timerRef = { current: schedule() };
    return () => clearTimeout(timerRef.current);
  }, [activePetMonster, petVisible, activePetHunger, activePetHappiness]);

  // 대표 펫 실시간 구독 — PetHouse에서 대표 설정 시 즉시 반영
  useEffect(() => {
    if (!activeStudentCode) {
      activePetUnsubRef.current?.();
      activePetUnsubRef.current = null;
      setActivePetMonster(null);
      setActivePetData(null);
      setHasPoop(false);
      return;
    }

    const q = query(collection(db, 'students'), where('studentCode', '==', activeStudentCode));
    const unsub = onSnapshot(q, (snap) => {
      if (snap.empty) {
        activePetUnsubRef.current?.();
        activePetUnsubRef.current = null;
        setActivePetMonster(null);
        setActivePetData(null);
        setHasPoop(false);
        return;
      }

      const pid = snap.docs[0].data().activePetId;
      if (!pid) {
        activePetUnsubRef.current?.();
        activePetUnsubRef.current = null;
        setActivePetMonster(null);
        setActivePetData(null);
        setHasPoop(false);
        return;
      }

      activePetUnsubRef.current?.();
      activePetUnsubRef.current = onSnapshot(doc(db, 'studentPets', pid), (petSnap) => {
        if (!petSnap.exists()) {
          setActivePetMonster(null); setActivePetData(null); setHasPoop(false); return;
        }
        const petData = petSnap.data();
        const md = MONSTERS_DB[petData.monsterId];

        // ① 펫 state 먼저 설정 (오류가 나도 여기까지는 보장)
        setActivePetMonster(md || null);
        setActivePetData({ id: petSnap.id, ...petData });
        setActivePetHunger(petData.hunger ?? 100);
        setActivePetHappiness(petData.happiness ?? 100);
        setActivePetEnergy(petData.energy ?? 100);
        setActivePetCleanliness(petData.cleanliness ?? 100);

        // ② 똥 체크 (별도 try-catch → 오류가 펫 표시에 영향 없음)
        try {
          const poop = petData.poop;
          if (poop && !poop.cleaned) {
            setHasPoop(true);
          } else {
            const lastPoop = poop?.createdAt?.toDate?.() ?? new Date(0);
            const hoursSince = (Date.now() - lastPoop.getTime()) / 3600000;
            if (hoursSince >= 4 + Math.random() * 4) {
              setHasPoop(true);
              updateDoc(doc(db, 'studentPets', petSnap.id), {
                poop: { createdAt: serverTimestamp(), cleaned: false },
              }).catch(() => {});
            } else {
              setHasPoop(false);
            }
          }
        } catch { setHasPoop(false); }
      }, (e) => {
        console.error('펫 로드 오류:', e);
        setActivePetMonster(null);
        setActivePetData(null);
        setHasPoop(false);
      });
    });
    return () => {
      unsub();
      activePetUnsubRef.current?.();
      activePetUnsubRef.current = null;
    };
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
      {activePetMonster && petVisible && (
        <>
          <WalkingPet
            monsterData={activePetMonster}
            isDead={activePetHunger <= 0}
            energy={activePetEnergy}
            bubbleRef={petBubbleRef}
            posOutRef={petPosRef}
            actionAnim={petActionAnim}
            actionKey={petActionKey}
            onClick={() => {
              const line = getPetLine(activePetHunger, activePetHappiness, activePetCleanliness, activePetEnergy);
              setPetSpeech(line);
              clearTimeout(window._petSpeechTimer);
              window._petSpeechTimer = setTimeout(() => setPetSpeech(null), 3500);
              setShowPetPopup(v => !v);
            }}
          />

          {(() => {
            const petH = Math.round((activePetMonster?.frameHeight || 80) * (activePetMonster?.scale || 0.5) * 2);
            const bubbleBottom = 4 + petH;
            return petSpeech ? (
              <div ref={petBubbleRef}
                style={{ position:'fixed', bottom: bubbleBottom, left: -9999, zIndex:25, maxWidth:220, pointerEvents:'none' }}
                className="bg-white rounded-2xl px-3.5 py-2 shadow-lg border border-slate-200 text-sm font-bold text-slate-700 select-none whitespace-nowrap">
                {petSpeech}
                <div style={{ position:'absolute', bottom:-7, left:14, width:12, height:12,
                  background:'white', borderRight:'1px solid #e2e8f0', borderBottom:'1px solid #e2e8f0',
                  transform:'rotate(45deg)' }} />
              </div>
            ) : null;
          })()}

          {showPetHearts && (
            <div key={heartsKey} style={{
              position:'fixed',
              bottom: 4 + Math.round((activePetMonster?.frameHeight||80)*(activePetMonster?.scale||0.5)*2),
              left: petPosRef.current.x,
              width:130, height:110, zIndex:26, pointerEvents:'none'
            }}>
              <style>{`
                @keyframes wpHeart0{0%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-80px) scale(1.2) rotate(-12deg)}}
                @keyframes wpHeart1{0%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-95px) scale(1.3) rotate(9deg)}}
                @keyframes wpHeart2{0%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-65px) scale(1.1) rotate(-6deg)}}
              `}</style>
              {['💕','❤️','💖','✨','💝'].map((h, i) => (
                <span key={i} style={{
                  position:'absolute', left:`${6 + i*20}%`, bottom:0,
                  fontSize: 16 + (i%3)*5,
                  animation:`wpHeart${i%3} 1.5s ease-out ${i*0.18}s both`,
                }}>{h}</span>
              ))}
            </div>
          )}

          {hasPoop && (
            <button
              onClick={async () => {
                if (!activePetData?.id) return;
                await updateDoc(doc(db, 'studentPets', activePetData.id), { poop: { createdAt: serverTimestamp(), cleaned: true } });
                setHasPoop(false);
                const newClean = Math.min(100, activePetCleanliness + 5);
                setActivePetCleanliness(newClean);
                setActivePetData(p => ({ ...p, cleanliness: newClean }));
                await updateDoc(doc(db, 'studentPets', activePetData.id), { cleanliness: newClean });
              }}
              style={{ position:'fixed', bottom:45, right:30, zIndex:22, fontSize:28, background:'none', border:'none', cursor:'pointer', animation:'bounce 1s infinite' }}
              title="클릭해서 치우기"
            >
              💩
            </button>
          )}

          {!petSpeech && (() => {
            const urgent =
              activePetHunger <= 0 ? '💀 배가 고파요...' :
              activePetHunger < 20 ? '🍖 배고파요!' :
              hasPoop ? '💩 치워주세요~' : null;
            if (!urgent) return null;
            return (
              <div ref={petBubbleRef}
                style={{ position:'fixed', bottom: 4 + Math.round((activePetMonster?.frameHeight||80)*(activePetMonster?.scale||0.5)*2), left:-9999, zIndex:24, maxWidth:220, pointerEvents:'none' }}
                className="bg-white rounded-2xl px-3.5 py-2 shadow-lg border border-rose-200 text-sm font-bold text-rose-600 animate-bounce select-none whitespace-nowrap">
                {urgent}
                <div style={{ position:'absolute', bottom:-7, left:14, width:12, height:12,
                  background:'white', borderRight:'1px solid #fecaca', borderBottom:'1px solid #fecaca',
                  transform:'rotate(45deg)' }} />
              </div>
            );
          })()}

          {showPetPopup && activePetData && activePetMonster && (
            <div style={{ position:'fixed', bottom:90, right:12, zIndex:80, width:280 }}
              className="bg-slate-900/95 border border-indigo-400/40 rounded-2xl shadow-2xl p-4 text-white backdrop-blur">
              <button
                onClick={() => setShowPetPopup(false)}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-sm font-extrabold"
                aria-label="펫 팝업 닫기"
              >
                ×
              </button>

              <div className="flex items-center gap-3 mb-3 pr-6">
                <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-end justify-center overflow-hidden">
                  <SpriteMonster data={activePetMonster} anim="idle"
                    scale={Math.min(activePetMonster.scale * 1.8, 44 / (activePetMonster.frameHeight || 120))} />
                </div>
                <div className="min-w-0">
                  <p className="font-extrabold text-sm truncate">{activePetData.nickname || activePetMonster.name}</p>
                  <p className="text-[11px] text-indigo-200 font-bold">
                    {activePetData.rarity === 'mythic' ? '🌈 신화' : activePetData.rarity === 'legendary' ? '🟡 전설'
                      : activePetData.rarity === 'epic' ? '🟣 영웅' : activePetData.rarity === 'rare' ? '🔵 희귀' : '⚪ 일반'}
                  </p>
                </div>
              </div>

              {[
                { label:'🍖 배고픔', val: activePetHunger, color:'bg-amber-400' },
                { label:'💝 행복도', val: activePetHappiness, color:'bg-sky-400' },
                { label:'✨ 기력', val: activePetEnergy, color:'bg-violet-400' },
              ].map(({ label, val, color }) => (
                <div key={label} className="mb-2">
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-300">{label}</span>
                    <span className="text-slate-400">{val}/100</span>
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div className={`h-full ${color} rounded-full`} style={{ width: `${val}%` }} />
                  </div>
                </div>
              ))}

              {(() => {
                const TODAY = new Date().toISOString().slice(0, 10);
                const care = activePetData?.dailyCare?.date === TODAY
                  ? { feedCount:0, petCount:0, washCount:0, playCount:0, ...activePetData.dailyCare }
                  : { date: TODAY, feedCount:0, petCount:0, washCount:0, playCount:0 };
                const isDead = activePetHunger <= 0;

                const showEffect = (speech, hearts) => {
                  setShowPetPopup(false);
                  requestAnimationFrame(() => {
                    setPetSpeech(speech);
                    if (hearts) {
                      setPetActionAnim(activePetMonster?.animations?.attack ? 'attack' : 'run');
                      setPetActionKey(k => k + 1);
                      setHeartsKey(k => k + 1);
                      setShowPetHearts(true);
                    }
                    clearTimeout(window._petSpeechTimer);
                    window._petSpeechTimer = setTimeout(() => { setPetSpeech(null); setShowPetHearts(false); }, 2800);
                  });
                };

                return (
                  <div className="mt-3 space-y-2">
                    {[
                      { name:'작은 먹이', cost:100, hunger:20, happiness:0, emoji:'🌾' },
                      { name:'맛있는 먹이', cost:300, hunger:50, happiness:5, emoji:'🍖' },
                    ].map(f => {
                      const full = !isDead && activePetHunger >= 100;
                      const maxed = care.feedCount >= 3;
                      return (
                        <button key={f.name}
                          disabled={full || maxed}
                          onClick={async () => {
                            if (full || maxed) return;
                            const stuSnap = await getDocs(query(collection(db, 'students'), where('studentCode', '==', activeStudentCode)));
                            if (stuSnap.empty) return;
                            const stuDoc = stuSnap.docs[0];
                            const gold = stuDoc.data().gold || 0;
                            if (gold < f.cost) {
                              showEffect('골드가 부족해요.', false);
                              return;
                            }

                            const newHunger = Math.min(100, activePetHunger + f.hunger);
                            const newCare = { ...care, feedCount: (care.feedCount || 0) + 1 };
                            const petUpdates = { hunger: newHunger, dailyCare: newCare, lastCareAt: serverTimestamp() };
                            if (f.happiness > 0) {
                              const newHap = Math.min(100, activePetHappiness + f.happiness);
                              setActivePetHappiness(newHap);
                              petUpdates.happiness = newHap;
                            }

                            setActivePetHunger(newHunger);
                            setActivePetData(p => ({ ...p, ...petUpdates, dailyCare: newCare }));
                            await Promise.all([
                              updateDoc(doc(db, 'students', stuDoc.id), { gold: gold - f.cost }),
                              updateDoc(doc(db, 'studentPets', activePetData.id), petUpdates),
                            ]);
                            showEffect(['냠냠~ 맛있어요!', '고마워요!', '배부르다~'][Math.floor(Math.random() * 3)], f.happiness > 0);
                          }}
                          className={`w-full flex justify-between items-center px-3 py-2 rounded-xl text-xs font-bold transition-colors
                            ${full || maxed ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-slate-700 hover:bg-amber-600 text-slate-100'}`}>
                          <span>{f.emoji} {f.name}</span>
                          <span className={full || maxed ? 'text-slate-600' : 'text-slate-400'}>
                            {maxed ? '오늘 완료' : full ? '배부름' : `${f.cost}G`}
                          </span>
                        </button>
                      );
                    })}

                    {(() => {
                      const petDone = care.petCount >= 3;
                      const hapFull = activePetHappiness >= 100;
                      return (
                        <button
                          disabled={isDead || petDone || hapFull}
                          onClick={async () => {
                            if (isDead || petDone || hapFull) return;
                            const newHap = Math.min(100, activePetHappiness + 15);
                            const newAff = (activePetData.affection || 0) + 2;
                            const newCare = { ...care, petCount: (care.petCount || 0) + 1 };
                            setActivePetHappiness(newHap);
                            setActivePetData(p => ({ ...p, happiness: newHap, affection: newAff, dailyCare: newCare }));
                            await updateDoc(doc(db, 'studentPets', activePetData.id), { happiness: newHap, affection: newAff, dailyCare: newCare, lastCareAt: serverTimestamp() });
                            const lines = ['기분 좋아요!', '더 해줘요!', '행복해요!', '좋아요!', '고마워요!'];
                            showEffect(lines[Math.floor(Math.random() * lines.length)], true);
                          }}
                          className={`w-full px-3 py-2 rounded-xl text-xs font-extrabold transition-colors
                            ${isDead || petDone || hapFull ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-pink-500 hover:bg-pink-400'}`}>
                          {isDead ? '💀 밥 먼저' : petDone ? '💝 오늘 완료' : hapFull ? '💝 행복 최대' : `💝 쓰다듬기 · ${3 - care.petCount}회`}
                        </button>
                      );
                    })()}
                  </div>
                );
              })()}

              <button
                onClick={() => { setCurrentView('petHouse'); setShowPetPopup(false); }}
                className="w-full mt-3 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-xs font-extrabold transition-colors">
                🐾 펫 하우스로 이동
              </button>
            </div>
          )}
        </>
      )}
      {/* 펫 토글 버튼 */}
      {activePetMonster && (
        <button
          onClick={() => setPetVisible(v => !v)}
          style={{ position: 'fixed', bottom: 6, right: 6, zIndex: 30 }}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-extrabold shadow-lg border transition-all
            ${petVisible
              ? 'bg-indigo-600 text-white border-indigo-400 hover:bg-indigo-700'
              : 'bg-slate-700 text-slate-200 border-slate-500 hover:bg-slate-600'}`}
          title={petVisible ? '펫 숨기기' : '펫 보이기'}
        >
          {petVisible ? '🐾 숨기기' : '🐾 보이기'}
        </button>
      )}

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
