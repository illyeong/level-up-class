export const STUDENT_MENU_IDS = [
  'dashboard','classAll','myCharacter','avatarRoom','equipment','gachaBox','quest','achievement',
  'board','learningNote','topicWriting','adventure','classOperation','quizDungeon','explorationDungeon','arena','bossRaid','trade',
  'classBank','classShop','stockMarket','town','freeBoard','classVote','settings','editProfile','themeSettings',
];

export const TEACHER_MENU_IDS = [
  'dashboard','myCharacter','topicWritingManage','questManage','questKiosk','adventure','classOperationManage','quizBank','quizDungeonManage','bossRaidManage',
  'quizDungeon','explorationDungeon','bossRaid','adventureManage','boardManage','learningNoteManage','economyManage',
  'classShopManage','bankManage','stockManage','townManage','freeBoard','hallOfFame','classVoteManage','studentManage',
  'accountIssue','systemSettings','dataReset','inquiry',
];

const hideExcept = (allIds, visibleIds) => allIds.filter(id => !visibleIds.includes(id));

export const OPERATION_MODE_PRESETS = {
  basic: {
    title: '가볍게 시작',
    description: '퀘스트, 보상 지급/차감, 학급 상점, 배움노트 중심으로 운영합니다.',
    studentHidden: hideExcept(STUDENT_MENU_IDS, [
      'dashboard','classAll','myCharacter','quest','achievement','learningNote','topicWriting','classOperation','trade','classShop','settings','editProfile','themeSettings',
    ]),
    teacherHidden: hideExcept(TEACHER_MENU_IDS, [
      'dashboard','myCharacter','topicWritingManage','questManage','questKiosk','boardManage','learningNoteManage','economyManage','classShopManage',
      'classOperationManage','studentManage','accountIssue','systemSettings','dataReset','inquiry',
    ]),
  },
  game: {
    title: '게임형 학급 운영',
    description: '퀘스트와 상점에 어드벤처, 퀴즈던전, 보스레이드, 투기장을 더합니다.',
    studentHidden: hideExcept(STUDENT_MENU_IDS, [
      'dashboard','classAll','myCharacter','avatarRoom','equipment','gachaBox','quest','achievement','learningNote','topicWriting',
      'adventure','classOperation','quizDungeon','explorationDungeon','arena','bossRaid','trade','classShop','settings','editProfile','themeSettings',
    ]),
    teacherHidden: hideExcept(TEACHER_MENU_IDS, [
      'dashboard','myCharacter','topicWritingManage','questManage','questKiosk','adventure','classOperationManage','quizBank','quizDungeonManage','bossRaidManage',
      'quizDungeon','explorationDungeon','bossRaid','adventureManage','boardManage','learningNoteManage','economyManage',
      'classShopManage','studentManage','accountIssue','systemSettings','dataReset','inquiry',
    ]),
  },
  economy: {
    title: '경제형 학급 운영',
    description: '퀘스트, 상점, 은행, 주식 ETF로 학급 경제를 운영합니다.',
    studentHidden: hideExcept(STUDENT_MENU_IDS, [
      'dashboard','classAll','myCharacter','quest','achievement','learningNote','topicWriting','trade','classBank','classShop','stockMarket',
      'settings','editProfile','themeSettings',
    ]),
    teacherHidden: hideExcept(TEACHER_MENU_IDS, [
      'dashboard','myCharacter','topicWritingManage','questManage','questKiosk','boardManage','learningNoteManage','economyManage','classShopManage',
      'bankManage','stockManage','studentManage','accountIssue','systemSettings','dataReset','inquiry',
    ]),
  },
  full: {
    title: '전체 기능 사용',
    description: '모든 메뉴를 열어두고 학급 상황에 맞게 직접 운영합니다.',
    studentHidden: [],
    teacherHidden: [],
  },
};

export const getOperationModeFields = (mode = 'basic') => {
  const preset = OPERATION_MODE_PRESETS[mode] || OPERATION_MODE_PRESETS.basic;
  return {
    operationMode: mode,
    hiddenStudentMenuIds: preset.studentHidden,
    hiddenTeacherMenuIds: preset.teacherHidden,
  };
};
