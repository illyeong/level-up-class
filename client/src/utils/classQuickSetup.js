import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  calculateClassOperationMaxHP,
  DEFAULT_CLASS_OPERATION_DAYS,
  DEFAULT_CLASS_OPERATION_GOAL,
} from './classOperation';

export const QUICK_SETUP_VERSION = 5;
const DUNGEON_TICKET_BASE = 3;
const ARENA_TICKET_BASE = 5;
const DEFAULT_BOSS_ID = 'redDragon';
const DEFAULT_BOSS_NAME = '붉은 드래곤';
const DEFAULT_BOSS_BG = '/images/boss-bg/boss-bg-RedDragon.png';
const DEFAULT_BOSS_DAMAGE_PER_HIT = 100;

const DEFAULT_SHOP_ITEMS = [
  {
    name: '자리바꾸기 쿠폰',
    price: 3000,
    description: '원하는 자리로 바꿀 수 있습니다.',
    icon: '🪑',
  },
  {
    name: '급식 1등권',
    price: 1500,
    description: '점심시간 급식 줄에서 1회 우선권을 사용할 수 있습니다.',
    icon: '🥇',
  },
  {
    name: '간식 교환권',
    price: 1500,
    description: '간식과 교환할 수 있는 보상권입니다.',
    icon: '🍪',
  },
  {
    name: '선생님 칭찬권',
    price: 300,
    description: '선생님께 칭찬 1회를 받아요',
    icon: '👏',
  },
  {
    name: '교실 음악 신청 쿠폰',
    price: 1000,
    description: '수업 전후로 듣고 싶은 교실 음악 1곡을 신청할 수 있습니다.',
    icon: '🎵',
  },
];

const DEFAULT_RECOMMENDED_QUESTS = [
  {
    title: '지각하지 않고 등교하기',
    type: 'daily',
    difficulty: 'easy',
    selfCheck: true,
    repeatDaily: true,
    repeatWeekly: false,
    rewards: { exp: 50, gold: 50, diamond: 25 },
    skills: ['학습태도'],
    description: '제 시간에 등교해요.',
  },
  {
    title: '아침시간에 조용히 하기',
    type: 'daily',
    difficulty: 'easy',
    selfCheck: true,
    repeatDaily: true,
    repeatWeekly: false,
    rewards: { exp: 50, gold: 50, diamond: 25 },
    skills: ['자기관리'],
    description: '아침 자습 시간에 조용히 준비해요.',
  },
  {
    title: '내 책상 위와 서랍 안 정리정돈하기',
    type: 'daily',
    difficulty: 'easy',
    selfCheck: false,
    repeatDaily: true,
    repeatWeekly: false,
    rewards: { exp: 50, gold: 50, diamond: 25 },
    skills: ['자기관리', '학습태도'],
    description: '책상 위와 서랍 안을 깔끔하게 정리해요.',
  },
  {
    title: '수업 시간에 자신감 있게 손들고 발표 1회 하기',
    type: 'daily',
    difficulty: 'medium',
    selfCheck: true,
    repeatDaily: true,
    repeatWeekly: false,
    rewards: { exp: 80, gold: 100, diamond: 50 },
    skills: ['의사소통'],
    description: '수업 중 자신 있게 손을 들고 한 번 이상 발표해요.',
  },
  {
    title: '하루종일 비속어 쓰지 않고 고운말 사용하기',
    type: 'daily',
    difficulty: 'easy',
    selfCheck: true,
    repeatDaily: true,
    repeatWeekly: false,
    rewards: { exp: 50, gold: 50, diamond: 25 },
    skills: ['인성'],
    description: '친구와 선생님께 바른말과 고운말을 사용해요.',
  },
  {
    title: '싸우지 않기 (말싸움 포함)',
    type: 'daily',
    difficulty: 'easy',
    selfCheck: true,
    repeatDaily: true,
    repeatWeekly: false,
    rewards: { exp: 50, gold: 50, diamond: 25 },
    skills: ['인성', '협동심'],
    description: '친구와 몸싸움이나 말싸움 없이 하루를 보냅니다.',
  },
  {
    title: '금지어 말하지 않기',
    type: 'daily',
    difficulty: 'easy',
    selfCheck: true,
    repeatDaily: true,
    repeatWeekly: false,
    rewards: { exp: 50, gold: 50, diamond: 25 },
    skills: ['인성'],
    description: '정해진 금지어를 하루 동안 사용하지 않아요.',
  },
  {
    title: '일주일 동안 선생님 잔소리 듣지 않기',
    type: 'weekly',
    difficulty: 'hard',
    selfCheck: false,
    repeatDaily: false,
    repeatWeekly: true,
    rewards: { exp: 150, gold: 200, diamond: 100 },
    skills: ['자기관리', '학습태도'],
    description: '일주일 동안 스스로 행동을 조절해요.',
  },
];

const GRADE_QUIZ_QUESTIONS = {
  1: [
    { question: '2 + 3 = ?', options: ['4', '5', '6', '7'], answer: 1 },
    {
      question: '사탕이 5개 있습니다. 2개를 먹었습니다. 남은 사탕은 몇 개일까요?',
      options: ['2개', '3개', '4개', '5개'],
      answer: 1,
    },
    { question: '다음 수 중 가장 작은 수는?', options: ['8', '3', '6', '5'], answer: 1 },
    { question: '10보다 1 작은 수는?', options: ['8', '9', '10', '11'], answer: 1 },
    {
      question: '연필 4자루와 연필 3자루를 합하면 모두 몇 자루일까요?',
      options: ['6자루', '7자루', '8자루', '9자루'],
      answer: 1,
    },
    {
      question: '다음 중 동그라미 모양과 가장 비슷한 것은?',
      options: ['공', '책', '자', '문'],
      answer: 0,
    },
  ],
  2: [
    { question: '12 + 5 = ?', options: ['15', '16', '17', '18'], answer: 2 },
    { question: '20 - 7 = ?', options: ['11', '12', '13', '14'], answer: 2 },
    { question: '10이 3개이면 얼마일까요?', options: ['13', '20', '30', '40'], answer: 2 },
    { question: '다음 수 중 가장 큰 수는?', options: ['36', '63', '26', '53'], answer: 1 },
    {
      question: '사과가 한 봉지에 4개씩 들어 있습니다. 2봉지에는 사과가 몇 개 있을까요?',
      options: ['6개', '7개', '8개', '9개'],
      answer: 2,
    },
    {
      question: '시계가 3시를 가리키고 있습니다. 1시간 뒤는 몇 시일까요?',
      options: ['2시', '3시', '4시', '5시'],
      answer: 2,
    },
  ],
  3: [
    { question: '6 × 4 = ?', options: ['20', '22', '24', '26'], answer: 2 },
    { question: '18 ÷ 3 = ?', options: ['5', '6', '7', '8'], answer: 1 },
    { question: '125 + 234 = ?', options: ['349', '359', '369', '379'], answer: 1 },
    { question: '500 - 120 = ?', options: ['370', '380', '390', '400'], answer: 1 },
    {
      question: '한 줄에 학생이 5명씩 서 있습니다. 4줄이면 모두 몇 명일까요?',
      options: ['15명', '20명', '25명', '30명'],
      answer: 1,
    },
    { question: '다음 중 짝수는?', options: ['13', '25', '32', '47'], answer: 2 },
  ],
  4: [
    { question: '25 × 4 = ?', options: ['80', '90', '100', '110'], answer: 2 },
    { question: '96 ÷ 8 = ?', options: ['10', '11', '12', '13'], answer: 2 },
    { question: '1,000 - 350 = ?', options: ['550', '600', '650', '700'], answer: 2 },
    {
      question: '가로 6cm, 세로 4cm인 직사각형의 둘레는 몇 cm일까요?',
      options: ['10cm', '20cm', '24cm', '30cm'],
      answer: 1,
    },
    {
      question: '1/4은 다음 중 어느 것과 같을까요?',
      options: [
        '전체를 2조각 중 1조각',
        '전체를 3조각 중 1조각',
        '전체를 4조각 중 1조각',
        '전체를 5조각 중 1조각',
      ],
      answer: 2,
    },
    { question: '3시간은 몇 분일까요?', options: ['60분', '120분', '180분', '240분'], answer: 2 },
  ],
  5: [
    { question: '3/5 + 1/5 = ?', options: ['2/5', '3/5', '4/5', '5/5'], answer: 2 },
    { question: '2.5 + 1.3 = ?', options: ['3.5', '3.8', '4.0', '4.2'], answer: 1 },
    { question: '6 × 12 = ?', options: ['62', '68', '72', '78'], answer: 2 },
    { question: '1m는 몇 cm일까요?', options: ['10cm', '50cm', '100cm', '1000cm'], answer: 2 },
    {
      question: '가로 8cm, 세로 5cm인 직사각형의 넓이는 몇 ㎠일까요?',
      options: ['13㎠', '26㎠', '35㎠', '40㎠'],
      answer: 3,
    },
    { question: '1000원의 10%는 얼마일까요?', options: ['10원', '50원', '100원', '200원'], answer: 2 },
  ],
  6: [
    { question: '0.6 + 0.25 = ?', options: ['0.75', '0.85', '0.95', '1.05'], answer: 1 },
    { question: '2/3 + 1/3 = ?', options: ['1/3', '2/3', '1', '2'], answer: 2 },
    { question: '30의 20%는 얼마일까요?', options: ['3', '5', '6', '10'], answer: 2 },
    {
      question: '반지름이 3cm인 원의 지름은 몇 cm일까요?',
      options: ['3cm', '6cm', '9cm', '12cm'],
      answer: 1,
    },
    {
      question: '비율 2 : 3에서 전체가 10개라면, 2에 해당하는 양은 몇 개일까요?',
      options: ['2개', '3개', '4개', '5개'],
      answer: 2,
    },
    { question: '1시간 30분은 몇 분일까요?', options: ['60분', '80분', '90분', '100분'], answer: 2 },
  ],
};

const chunkArray = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const clampGrade = (grade) => {
  const n = Number(grade);
  if (Number.isNaN(n)) return 1;
  return Math.max(1, Math.min(6, n));
};

const buildMcQuestions = (grade) =>
  (GRADE_QUIZ_QUESTIONS[grade] || GRADE_QUIZ_QUESTIONS[1]).map((q) => ({
    type: 'mc',
    question: q.question,
    options: q.options,
    answer: q.answer,
    explanation: '',
  }));

const normalizeTemplateQuest = (quest) => ({
  title: String(quest?.title || '').trim(),
  type: quest?.type === 'weekly' ? 'weekly' : 'daily',
  difficulty: quest?.difficulty || 'easy',
  selfCheck: quest?.selfCheck !== false,
  repeatDaily: quest?.type === 'daily' ? quest?.repeatDaily !== false : false,
  repeatWeekly: quest?.type === 'weekly' ? quest?.repeatWeekly !== false : false,
  rewards: {
    exp: Number(quest?.rewards?.exp ?? quest?.exp ?? 0),
    gold: Number(quest?.rewards?.gold ?? quest?.gold ?? 0),
    diamond: Number(quest?.rewards?.diamond ?? quest?.diamond ?? 0),
  },
  description: String(quest?.description || '').trim(),
});

const normalizeQuestTitleKey = (title) =>
  String(title || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .trim();

const loadRecommendedQuestTemplates = async () => {
  const candidates = [
    doc(db, 'systemConfig', 'questTemplates'),
    doc(db, 'adminContent', 'questTemplates'),
    doc(db, 'systemConfig', 'contentQuests'),
  ];

  for (const ref of candidates) {
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) continue;
      const data = snap.data() || {};
      const list = Array.isArray(data.templates)
        ? data.templates
        : Array.isArray(data.quests)
          ? data.quests
          : Array.isArray(data.recommendedQuests)
            ? data.recommendedQuests
            : null;

      if (!Array.isArray(list) || list.length === 0) continue;
      const normalized = list
        .map(normalizeTemplateQuest)
        .filter((q) => q.title.length > 0)
        .filter((q) => normalizeQuestTitleKey(q.title) !== normalizeQuestTitleKey('지각하지 않고 등교하기'));
      if (normalized.length > 0) return normalized;
    } catch (err) {
      console.warn('[QuickSetup] quest template read failed:', ref.path, err);
    }
  }

  return DEFAULT_RECOMMENDED_QUESTS.filter(
    (q) => normalizeQuestTitleKey(q.title) !== normalizeQuestTitleKey('지각하지 않고 등교하기'),
  );
};

export async function applyClassQuickSetup(selectedClass) {
  const classId = selectedClass?.id || null;
  const teacherUid = selectedClass?.teacherUid || null;
  if (!classId || !teacherUid) {
    throw new Error('학급 정보(classId/teacherUid)가 없습니다.');
  }

  const classRef = doc(db, 'classes', classId);
  const classSnap = await getDoc(classRef);
  if (!classSnap.exists()) {
    throw new Error('학급 문서를 찾을 수 없습니다.');
  }

  const classData = classSnap.data() || {};
  const grade = clampGrade(selectedClass?.grade ?? classData?.grade ?? 1);
  const currentVersion = Number(classData.quickSetupVersion || 0);

  if (classData.quickSetupCompleted === true && currentVersion >= QUICK_SETUP_VERSION) {
    return {
      alreadyCompleted: true,
      grade,
      summary: classData.quickSetupSummary || null,
    };
  }

  const scopeKey = classId;
  const summary = {
    createdQuestCount: 0,
    createdShopItemCount: 0,
    removedLegacyShopItemCount: 0,
    updatedStudentTicketCount: 0,
    createdQuizSet: false,
    createdQuizDungeon: false,
    createdBossQuizSet: false,
    createdBossRaid: false,
    createdClassOperation: false,
    grade,
  };

  const questsSnap = await getDocs(query(collection(db, 'quests'), where('classId', '==', classId)));
  const existingQuestTitleKeys = new Set(
    questsSnap.docs
      .map((d) => normalizeQuestTitleKey(d.data()?.title))
      .filter(Boolean),
  );
  const templateQuests = await loadRecommendedQuestTemplates();
  for (const quest of templateQuests) {
    const titleKey = normalizeQuestTitleKey(quest.title);
    if (!titleKey) continue;
    if (existingQuestTitleKeys.has(titleKey)) continue;
    await addDoc(collection(db, 'quests'), {
      ...quest,
      active: true,
      importedFromShared: false,
      sharedSourceId: null,
      shareToCommunity: false,
      teacherUid,
      classId,
      createdAt: serverTimestamp(),
    });
    existingQuestTitleKeys.add(titleKey);
    summary.createdQuestCount += 1;
  }

  const shopSnap = await getDocs(query(collection(db, 'shopItems'), where('scopeKey', '==', scopeKey)));
  const legacyPassDocs = shopSnap.docs.filter((d) => String(d.data()?.name || '').trim() === '프리패스 쿠폰');
  for (const chunk of chunkArray(legacyPassDocs, 400)) {
    if (chunk.length === 0) continue;
    const batch = writeBatch(db);
    chunk.forEach((d) => batch.delete(doc(db, 'shopItems', d.id)));
    await batch.commit();
    summary.removedLegacyShopItemCount += chunk.length;
  }
  const existingShopNames = new Set(
    shopSnap.docs
      .map((d) => String(d.data()?.name || '').trim())
      .filter((name) => Boolean(name) && name !== '프리패스 쿠폰'),
  );
  for (const item of DEFAULT_SHOP_ITEMS) {
    if (existingShopNames.has(item.name)) continue;
    await addDoc(collection(db, 'shopItems'), {
      ...item,
      quantity: -1,
      active: true,
      soldCount: 0,
      classId,
      teacherUid,
      scopeKey,
      createdAt: serverTimestamp(),
    });
    summary.createdShopItemCount += 1;
  }

  const studentsSnap = await getDocs(query(collection(db, 'students'), where('classId', '==', classId)));
  const studentUpdates = [];
  studentsSnap.docs.forEach((studentDoc) => {
    const data = studentDoc.data() || {};
    const dungeon = Math.max(Number(data?.tickets?.dungeon || 0), DUNGEON_TICKET_BASE);
    const arena = Math.max(Number(data?.tickets?.arena || 0), ARENA_TICKET_BASE);
    if (Number(data?.tickets?.dungeon || 0) >= DUNGEON_TICKET_BASE && Number(data?.tickets?.arena || 0) >= ARENA_TICKET_BASE) return;
    studentUpdates.push({ id: studentDoc.id, dungeon, arena });
  });

  for (const chunk of chunkArray(studentUpdates, 400)) {
    const batch = writeBatch(db);
    chunk.forEach((row) => {
      batch.update(doc(db, 'students', row.id), {
        'tickets.dungeon': row.dungeon,
        'tickets.arena': row.arena,
      });
    });
    await batch.commit();
  }
  summary.updatedStudentTicketCount = studentUpdates.length;

  const quizSetId = `auto_${classId}_quiz_set`;
  const quizSetRef = doc(db, 'quizSets', quizSetId);
  const quizSetSnap = await getDoc(quizSetRef);
  const questions = buildMcQuestions(grade);
  const quizSetTitle = `${grade}학년 수학 예시 6문제`;

  // 같은 학급의 기존 자동 생성 퀴즈셋 중 현재 기본셋팅에서 쓰지 않는 항목은 정리
  const autoQuizSetsSnap = await getDocs(query(collection(db, 'quizSets'), where('classId', '==', classId)));
  for (const d of autoQuizSetsSnap.docs) {
    const data = d.data() || {};
    if (data.isAutoGenerated !== true) continue;
    if (d.id === quizSetId || d.id === `auto_${classId}_boss_quiz_set`) continue;
    await deleteDoc(doc(db, 'quizSets', d.id));
  }

  await setDoc(quizSetRef, {
    title: quizSetTitle,
    grade,
    semester: null,
    subject: '수학',
    publisher: null,
    part: null,
    unit: null,
    difficulty: 'easy',
    questions,
    questionCount: questions.length,
    ownerId: teacherUid,
    ownerName: selectedClass?.teacherEmail || teacherUid,
    isShared: false,
    sharedAt: null,
    importCount: 0,
    sourceId: null,
    classId,
    isAutoGenerated: true,
    createdAt: serverTimestamp(),
  });
  if (!quizSetSnap.exists()) {
    summary.createdQuizSet = true;
  }

  const quizDungeonId = `auto_${classId}_quiz_dungeon`;
  const quizDungeonRef = doc(db, 'quizDungeons', quizDungeonId);
  const quizDungeonSnap = await getDoc(quizDungeonRef);
  if (!quizDungeonSnap.exists()) {
    await setDoc(quizDungeonRef, {
      title: `${grade}학년 수학 연습 던전`,
      grade,
      semester: null,
      subject: '수학',
      publisher: null,
      part: null,
      unit: null,
      difficulty: 'normal',
      monsterId: 'random',
      monsterIds: null,
      timeLimit: null,
      rewards: { gold: 150, exp: 75, diamond: 75 },
      questions,
      questionCount: questions.length,
      quizSetId,
      teacherUid,
      classId,
      active: true,
      playCount: 0,
      isAutoGenerated: true,
      createdAt: serverTimestamp(),
    });
    summary.createdQuizDungeon = true;
  }

  const bossQuizSetId = `auto_${classId}_boss_quiz_set`;
  const bossQuizSetRef = doc(db, 'quizSets', bossQuizSetId);
  const bossQuizSetSnap = await getDoc(bossQuizSetRef);
  const bossQuestions = buildMcQuestions(grade);
  const bossQuizSetTitle = `${grade}학년 수학 보스레이드 6문제`;
  await setDoc(bossQuizSetRef, {
    title: bossQuizSetTitle,
    grade,
    semester: null,
    subject: '수학',
    publisher: null,
    part: null,
    unit: null,
    difficulty: 'normal',
    questions: bossQuestions,
    questionCount: bossQuestions.length,
    ownerId: teacherUid,
    ownerName: selectedClass?.teacherEmail || teacherUid,
    isShared: false,
    sharedAt: null,
    importCount: 0,
    sourceId: null,
    classId,
    isAutoGenerated: true,
    createdAt: serverTimestamp(),
  });
  if (!bossQuizSetSnap.exists()) {
    summary.createdBossQuizSet = true;
  }

  const bossRaidId = `auto_${classId}_boss_raid`;
  const bossRaidRef = doc(db, 'worldBossRaids', bossRaidId);
  const bossRaidSnap = await getDoc(bossRaidRef);
  if (!bossRaidSnap.exists()) {
    const classStudentCount = studentsSnap.size;
    const questionCount = bossQuestions.length;
    const maxHP = (classStudentCount > 0 && questionCount > 0)
      ? Math.max(
          100,
          Math.round((classStudentCount * questionCount * DEFAULT_BOSS_DAMAGE_PER_HIT * 0.75) / 100) * 100,
        )
      : 3000;

    await setDoc(bossRaidRef, {
      title: `${grade}학년 수학 보스 레이드`,
      bossId: DEFAULT_BOSS_ID,
      bossName: DEFAULT_BOSS_NAME,
      bossBg: DEFAULT_BOSS_BG,
      quizSetId: bossQuizSetId,
      maxHP,
      currentHP: maxHP,
      damagePerHit: DEFAULT_BOSS_DAMAGE_PER_HIT,
      penaltyType: 'none',
      penaltyAmount: 50,
      currentQuestionIdx: -1,
      questionDuration: 20,
      questionStartedAt: null,
      autoAdvance: true,
      rewards: { gold: 200, exp: 100, diamond: 100 },
      rewardsPaid: false,
      status: 'waiting',
      questions: bossQuestions,
      participants: {},
      classId,
      teacherUid,
      isAutoGenerated: true,
      createdAt: serverTimestamp(),
      startedAt: null,
      clearedAt: null,
    });
    summary.createdBossRaid = true;
  }

  const classOperationId = `auto_${classId}_class_operation`;
  const classOperationRef = doc(db, 'classOperations', classOperationId);
  const classOperationSnap = await getDoc(classOperationRef);
  if (!classOperationSnap.exists()) {
    const students = studentsSnap.docs.map(studentDoc => ({ id: studentDoc.id, ...studentDoc.data() }));
    const operationHP = calculateClassOperationMaxHP(students, [], DEFAULT_CLASS_OPERATION_DAYS);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + DEFAULT_CLASS_OPERATION_DAYS);
    await setDoc(classOperationRef, {
      title: DEFAULT_CLASS_OPERATION_GOAL,
      goalDescription: DEFAULT_CLASS_OPERATION_GOAL,
      bossId: DEFAULT_BOSS_ID,
      bossName: DEFAULT_BOSS_NAME,
      bossBg: DEFAULT_BOSS_BG,
      maxHP: operationHP.maxHP,
      currentHP: operationHP.maxHP,
      expectedDailyDamage: operationHP.expectedDailyDamage,
      assumedParticipationRate: 1,
      durationDays: DEFAULT_CLASS_OPERATION_DAYS,
      studentCountAtCreation: students.length,
      totalAttackCount: 0,
      status: 'active',
      classId,
      teacherUid,
      isAutoGenerated: true,
      startDate: serverTimestamp(),
      estimatedEndDate: endDate,
      endDate,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    summary.createdClassOperation = true;
  }

  await updateDoc(classRef, {
    quickSetupCompleted: true,
    quickSetupCompletedAt: serverTimestamp(),
    quickSetupVersion: QUICK_SETUP_VERSION,
    quickSetupSummary: summary,
  });

  return {
    alreadyCompleted: false,
    grade,
    summary,
  };
}
