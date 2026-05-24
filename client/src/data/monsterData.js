/**
 * 퀴즈 던전 몬스터 스프라이트 DB
 * sheetCols = 16 (공통 가정 — 실제 이미지 확인 후 수정 가능)
 * tier: tiny(1) / small(2) / medium(3) / large(4) / boss(5)
 * scale = targetDisplayHeight / frameHeight
 *   tiny→50px, small→70px, medium→100px, large→135px, boss→145px
 */

// 표준 4행 (Idle Run Attack Death)
const SA = {
  idle:   { row: 0, frames: 16, fps: 8,  loop: true  },
  run:    { row: 1, frames: 16, fps: 10, loop: true  },
  attack: { row: 2, frames: 16, fps: 12, loop: false },
  death:  { row: 3, frames: 16, fps: 8,  loop: false },
};

// 5행 (Run Idle Run Attack Death) — Horse, Pony, PirateBoar
const SA5 = {
  idle:   { row: 1, frames: 16, fps: 8,  loop: true  },
  run:    { row: 2, frames: 16, fps: 10, loop: true  },
  attack: { row: 3, frames: 16, fps: 12, loop: false },
  death:  { row: 4, frames: 16, fps: 8,  loop: false },
};

// 4행 20프레임 (골렘·웜 계열 보스)
const SA_20 = {
  idle:   { row: 0, frames: 20, fps: 8,  loop: true  },
  run:    { row: 1, frames: 20, fps: 10, loop: true  },
  attack: { row: 2, frames: 20, fps: 12, loop: false },
  death:  { row: 3, frames: 20, fps: 8,  loop: false },
};

// 5행 16프레임 (AttackAlt/Fire 0행 포함 — Lizard03, Demon03, 와이번)
const SA5_16 = {
  idle:   { row: 1, frames: 16, fps: 8,  loop: true  },
  run:    { row: 2, frames: 16, fps: 10, loop: true  },
  attack: { row: 3, frames: 16, fps: 12, loop: false },
  death:  { row: 4, frames: 16, fps: 8,  loop: false },
};

// 5행 20프레임 (Fire/AttackAlt 0행 포함 — 드래곤·대형 보스)
const SA5_20 = {
  idle:   { row: 1, frames: 20, fps: 8,  loop: true  },
  run:    { row: 2, frames: 20, fps: 10, loop: true  },
  attack: { row: 3, frames: 20, fps: 12, loop: false },
  death:  { row: 4, frames: 20, fps: 8,  loop: false },
};

export const MONSTERS_DB = {

  /* ═══════════════ TINY 극소 ═══════════════ */
  chick: {
    id:'chick', name:'병아리',
    src:'/images/Monsters/Chick 130x120 (Idle Run Attack Death).png',
    frameWidth:130, frameHeight:120, sheetCols:16, sheetRows:4,
    scale:0.42, flip:false, tier:'tiny', sizeOrder:1, animations:{...SA},
  },
  chicken: {
    id:'chicken', name:'닭',
    src:'/images/Monsters/Chicken 130x115 (Idle Run Attack Death).png',
    frameWidth:130, frameHeight:115, sheetCols:16, sheetRows:4,
    scale:0.43, flip:false, tier:'tiny', sizeOrder:1, animations:{...SA},
  },
  larva: {
    id:'larva', name:'유충',
    src:'/images/Monsters/Larva 164x160 (Idle Run Attack Death).png',
    frameWidth:164, frameHeight:160, sheetCols:16, sheetRows:4,
    scale:0.31, flip:false, tier:'tiny', sizeOrder:1, animations:{...SA},
  },

  /* ═══════════════ SMALL 소형 ═══════════════ */
  advancedHen: {
    id:'advancedHen', name:'강화 암탉',
    src:'/images/Monsters/AdvancedHen 171x196 (Idle Run Attack Death).png',
    frameWidth:171, frameHeight:196, sheetCols:16, sheetRows:4,
    scale:0.36, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  bat: {
    id:'bat', name:'박쥐',
    src:'/images/Monsters/Bat 257x260 (Idle Run Attack Death).png',
    frameWidth:257, frameHeight:260, sheetCols:16, sheetRows:4,
    scale:0.27, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  blackBoar: {
    id:'blackBoar', name:'흑멧돼지',
    src:'/images/Monsters/BlackBoar 257x205 (Idle Run Attack Death).png',
    frameWidth:257, frameHeight:205, sheetCols:16, sheetRows:4,
    scale:0.34, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  boar: {
    id:'boar', name:'멧돼지',
    src:'/images/Monsters/Boar 257x202 (Idle Run Attack Death).png',
    frameWidth:257, frameHeight:202, sheetCols:16, sheetRows:4,
    scale:0.35, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  boarMounted: {
    id:'boarMounted', name:'기마 멧돼지',
    src:'/images/Monsters/BoarMounted 257x200 (Idle Run Attack Death).png',
    frameWidth:257, frameHeight:200, sheetCols:16, sheetRows:4,
    scale:0.35, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  bullyRooster: {
    id:'bullyRooster', name:'싸움닭',
    src:'/images/Monsters/BullyRooster 183x206 (Idle Run Attack Death).png',
    frameWidth:183, frameHeight:206, sheetCols:16, sheetRows:4,
    scale:0.34, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  bunny: {
    id:'bunny', name:'토끼',
    src:'/images/Monsters/Bunny 204x165 (Idle Run Attack Death).png',
    frameWidth:204, frameHeight:165, sheetCols:16, sheetRows:4,
    scale:0.42, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  caterpillar: {
    id:'caterpillar', name:'애벌레',
    src:'/images/Monsters/Caterpillar 204x193 (Idle Run Attack Death).png',
    frameWidth:204, frameHeight:193, sheetCols:16, sheetRows:4,
    scale:0.36, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  caveCaterpillar: {
    id:'caveCaterpillar', name:'동굴 애벌레',
    src:'/images/Monsters/CaveCaterpillar 204x202 (Idle Run Attack Death).png',
    frameWidth:204, frameHeight:202, sheetCols:16, sheetRows:4,
    scale:0.35, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  caveRat: {
    id:'caveRat', name:'동굴 쥐',
    src:'/images/Monsters/CaveRat 246x221 (Idle Run Attack Death).png',
    frameWidth:246, frameHeight:221, sheetCols:16, sheetRows:4,
    scale:0.32, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  crawler: {
    id:'crawler', name:'크롤러',
    src:'/images/Monsters/Crawler 204x218 (Idle Run Attack Death).png',
    frameWidth:204, frameHeight:218, sheetCols:16, sheetRows:4,
    scale:0.32, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  crystalLizard: {
    id:'crystalLizard', name:'수정 도마뱀',
    src:'/images/Monsters/CrystalLizard 254x250 (Idle Run Attack Death).png',
    frameWidth:254, frameHeight:250, sheetCols:16, sheetRows:4,
    scale:0.28, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  darkBunny: {
    id:'darkBunny', name:'암흑 토끼',
    src:'/images/Monsters/DarkBunny 246x178 (Idle Run Attack Death).png',
    frameWidth:246, frameHeight:178, sheetCols:16, sheetRows:4,
    scale:0.39, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  drake: {
    id:'drake', name:'어린 용',
    src:'/images/Monsters/Drake 214x177 (Idle Run Attack Death).png',
    frameWidth:214, frameHeight:177, sheetCols:16, sheetRows:4,
    scale:0.40, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  dreadEye: {
    id:'dreadEye', name:'공포의 눈',
    src:'/images/Monsters/DreadEye 236x216 (Idle Run Attack Death).png',
    frameWidth:236, frameHeight:216, sheetCols:16, sheetRows:4,
    scale:0.32, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  duck: {
    id:'duck', name:'오리',
    src:'/images/Monsters/Duck 215x174 (Idle Run Attack Death).png',
    frameWidth:215, frameHeight:174, sheetCols:16, sheetRows:4,
    scale:0.40, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  evilEye: {
    id:'evilEye', name:'사악한 눈',
    src:'/images/Monsters/EvilEye 245x211 (Idle Run Attack Death).png',
    frameWidth:245, frameHeight:211, sheetCols:16, sheetRows:4,
    scale:0.33, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  forestTurkey: {
    id:'forestTurkey', name:'숲 칠면조',
    src:'/images/Monsters/ForestTurkey 266x245 (Idle Run Attack Death).png',
    frameWidth:266, frameHeight:245, sheetCols:16, sheetRows:4,
    scale:0.29, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  goose: {
    id:'goose', name:'거위',
    src:'/images/Monsters/Goose 201x156 (Idle Run Attack Death).png',
    frameWidth:201, frameHeight:156, sheetCols:16, sheetRows:4,
    scale:0.45, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  hen: {
    id:'hen', name:'암탉',
    src:'/images/Monsters/Hen 186x205 (Idle Run Attack Death).png',
    frameWidth:186, frameHeight:205, sheetCols:16, sheetRows:4,
    scale:0.34, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  hog: {
    id:'hog', name:'돼지',
    src:'/images/Monsters/Hog 279x216 (Idle Run Attack Death).png',
    frameWidth:279, frameHeight:216, sheetCols:16, sheetRows:4,
    scale:0.32, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  littleBunny: {
    id:'littleBunny', name:'작은 토끼',
    src:'/images/Monsters/LittleBunny 199x164 (Idle Run Attack Death).png',
    frameWidth:199, frameHeight:164, sheetCols:16, sheetRows:4,
    scale:0.43, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  meatBug: {
    id:'meatBug', name:'고기 벌레',
    src:'/images/Monsters/MeatBug 230x219 (Idle Run Attack Death).png',
    frameWidth:230, frameHeight:219, sheetCols:16, sheetRows:4,
    scale:0.32, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  mohawkBat: {
    id:'mohawkBat', name:'모히칸 박쥐',
    src:'/images/Monsters/MohawkBat 295x292 (Idle Run Attack Death).png',
    frameWidth:295, frameHeight:292, sheetCols:16, sheetRows:4,
    scale:0.24, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  monkey: {
    id:'monkey', name:'원숭이',
    src:'/images/Monsters/Monkey 238x154 (Idle Run Attack Death).png',
    frameWidth:238, frameHeight:154, sheetCols:16, sheetRows:4,
    scale:0.45, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  pig: {
    id:'pig', name:'돼지',
    src:'/images/Monsters/Pig 164x198 (Idle Run Attack Death).png',
    frameWidth:164, frameHeight:198, sheetCols:16, sheetRows:4,
    scale:0.35, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  piggy: {
    id:'piggy', name:'새끼 돼지',
    src:'/images/Monsters/Piggy 175x229 (Idle Run Attack Death).png',
    frameWidth:175, frameHeight:229, sheetCols:16, sheetRows:4,
    scale:0.31, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  porcupine: {
    id:'porcupine', name:'고슴도치',
    src:'/images/Monsters/Porcupine 246x224 (Idle Run Attack Death).png',
    frameWidth:246, frameHeight:224, sheetCols:16, sheetRows:4,
    scale:0.31, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  porky: {
    id:'porky', name:'뚱보 돼지',
    src:'/images/Monsters/Porky 186x222 (Idle Run Attack Death).png',
    frameWidth:186, frameHeight:222, sheetCols:16, sheetRows:4,
    scale:0.32, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  possessedBlackBoar: {
    id:'possessedBlackBoar', name:'빙의 흑멧돼지',
    src:'/images/Monsters/PossessedBlackBoar 265x213 (Idle Run Attack Death).png',
    frameWidth:265, frameHeight:213, sheetCols:16, sheetRows:4,
    scale:0.33, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  possessedRat: {
    id:'possessedRat', name:'빙의 쥐',
    src:'/images/Monsters/PossessedRat 246x219 (Idle Run Attack Death).png',
    frameWidth:246, frameHeight:219, sheetCols:16, sheetRows:4,
    scale:0.32, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  pug: {
    id:'pug', name:'퍼그',
    src:'/images/Monsters/Pug 191x156 (Idle Run Attack Death).png',
    frameWidth:191, frameHeight:156, sheetCols:16, sheetRows:4,
    scale:0.45, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  purpleScarab: {
    id:'purpleScarab', name:'보라 스카라브',
    src:'/images/Monsters/PurpleScarab 251x282 (Idle Run Attack Death).png',
    frameWidth:251, frameHeight:282, sheetCols:16, sheetRows:4,
    scale:0.25, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  rat: {
    id:'rat', name:'쥐',
    src:'/images/Monsters/Rat 246x222 (Idle Run Attack Death).png',
    frameWidth:246, frameHeight:222, sheetCols:16, sheetRows:4,
    scale:0.32, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  shardLizard: {
    id:'shardLizard', name:'파편 도마뱀',
    src:'/images/Monsters/ShardLizard 254x250 (Idle Run Attack Death).png',
    frameWidth:254, frameHeight:250, sheetCols:16, sheetRows:4,
    scale:0.28, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  slugQueen: {
    id:'slugQueen', name:'민달팽이 여왕',
    src:'/images/Monsters/SlugQueen 246x216 (Idle Run Attack Death).png',
    frameWidth:246, frameHeight:216, sheetCols:16, sheetRows:4,
    scale:0.32, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  swine: {
    id:'swine', name:'멧돼지',
    src:'/images/Monsters/Swine 268x204 (Idle Run Attack Death).png',
    frameWidth:268, frameHeight:204, sheetCols:16, sheetRows:4,
    scale:0.34, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  turkey: {
    id:'turkey', name:'칠면조',
    src:'/images/Monsters/Turkey 265x245 (Idle Run Attack Death).png',
    frameWidth:265, frameHeight:245, sheetCols:16, sheetRows:4,
    scale:0.29, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  wasp: {
    id:'wasp', name:'말벌',
    src:'/images/Monsters/Wasp 141x205 (Idle Run Attack Death).png',
    frameWidth:141, frameHeight:205, sheetCols:16, sheetRows:4,
    scale:0.34, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },
  wildRooster: {
    id:'wildRooster', name:'야생 수탉',
    src:'/images/Monsters/WildRooster 215x208 (Idle Run Attack Death).png',
    frameWidth:215, frameHeight:208, sheetCols:16, sheetRows:4,
    scale:0.34, flip:false, tier:'small', sizeOrder:2, animations:{...SA},
  },

  /* ═══════════════ MEDIUM 중형 ═══════════════ */
  bear: {
    id:'bear', name:'곰',
    src:'/images/Monsters/Bear 349x260 (Idle Run Attack Death).png',
    frameWidth:349, frameHeight:260, sheetCols:16, sheetRows:4,
    scale:0.38, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  bearMounted: {
    id:'bearMounted', name:'기마 곰',
    src:'/images/Monsters/BearMounted 350x256 (Idle Run Attack Death).png',
    frameWidth:350, frameHeight:256, sheetCols:16, sheetRows:4,
    scale:0.39, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  blackBear: {
    id:'blackBear', name:'흑곰',
    src:'/images/Monsters/BlackBear 349x269 (Idle Run Attack Death).png',
    frameWidth:349, frameHeight:269, sheetCols:16, sheetRows:4,
    scale:0.37, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  blackWolf: {
    id:'blackWolf', name:'흑늑대',
    src:'/images/Monsters/BlackWolf 409x252 (Idle Run Attack Death).png',
    frameWidth:409, frameHeight:252, sheetCols:16, sheetRows:4,
    scale:0.40, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  blueScorpion: {
    id:'blueScorpion', name:'파란 전갈',
    src:'/images/Monsters/BlueScorpion 369x336 (Idle Run Attack Death).png',
    frameWidth:369, frameHeight:336, sheetCols:16, sheetRows:4,
    scale:0.30, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  bull: {
    id:'bull', name:'황소',
    src:'/images/Monsters/Bull 311x234 (Idle Run Attack Death).png',
    frameWidth:311, frameHeight:234, sheetCols:16, sheetRows:4,
    scale:0.43, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  bullMounted: {
    id:'bullMounted', name:'기마 황소',
    src:'/images/Monsters/BullMounted 311x234 (Idle Run Attack Death).png',
    frameWidth:311, frameHeight:234, sheetCols:16, sheetRows:4,
    scale:0.43, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  burro: {
    id:'burro', name:'버로 당나귀',
    src:'/images/Monsters/Burro 326x257 (Idle Run Attack Death).png',
    frameWidth:326, frameHeight:257, sheetCols:16, sheetRows:4,
    scale:0.39, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  cow: {
    id:'cow', name:'소',
    src:'/images/Monsters/Cow 314x219 (Idle Run Attack Death).png',
    frameWidth:314, frameHeight:219, sheetCols:16, sheetRows:4,
    scale:0.46, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  donkey: {
    id:'donkey', name:'당나귀',
    src:'/images/Monsters/Donkey 302x232 (Idle Run Attack Death).png',
    frameWidth:302, frameHeight:232, sheetCols:16, sheetRows:4,
    scale:0.43, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  fancyParasite: {
    id:'fancyParasite', name:'화려한 기생충',
    src:'/images/Monsters/FancyParasite 339x251 (Idle Run Attack Death).png',
    frameWidth:339, frameHeight:251, sheetCols:16, sheetRows:4,
    scale:0.40, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  flyingDemon: {
    id:'flyingDemon', name:'날개 악마',
    src:'/images/Monsters/FlyingDemon 297x297 (Idle Run Attack Death).png',
    frameWidth:297, frameHeight:297, sheetCols:16, sheetRows:4,
    scale:0.34, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  ghost: {
    id:'ghost', name:'유령',
    src:'/images/Monsters/Ghost 286x285 (Idle Run Attack Death).png',
    frameWidth:286, frameHeight:285, sheetCols:16, sheetRows:4,
    scale:0.35, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  goat: {
    id:'goat', name:'염소',
    src:'/images/Monsters/Goat 301x222 (Idle Run Attack Death).png',
    frameWidth:301, frameHeight:222, sheetCols:16, sheetRows:4,
    scale:0.45, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  gobbler: {
    id:'gobbler', name:'왕 칠면조',
    src:'/images/Monsters/Gobbler 288x264 (Idle Run Attack Death).png',
    frameWidth:288, frameHeight:264, sheetCols:16, sheetRows:4,
    scale:0.38, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  greenParasite: {
    id:'greenParasite', name:'초록 기생충',
    src:'/images/Monsters/GreenParasite 339x270 (Idle Run Attack Death).png',
    frameWidth:339, frameHeight:270, sheetCols:16, sheetRows:4,
    scale:0.37, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  greenScorpion: {
    id:'greenScorpion', name:'초록 전갈',
    src:'/images/Monsters/GreenScorpion 377x351 (Idle Run Attack Death).png',
    frameWidth:377, frameHeight:351, sheetCols:16, sheetRows:4,
    scale:0.28, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  horse: {
    id:'horse', name:'말',
    src:'/images/Monsters/Horse 334x281 (Run Idle Run Attack Death).png',
    frameWidth:334, frameHeight:281, sheetCols:16, sheetRows:5,
    scale:0.36, flip:false, tier:'medium', sizeOrder:3, animations:{...SA5},
  },
  husky: {
    id:'husky', name:'허스키',
    src:'/images/Monsters/Husky 364x240 (Idle Run Attack Death).png',
    frameWidth:364, frameHeight:240, sheetCols:16, sheetRows:4,
    scale:0.42, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  iceParasite: {
    id:'iceParasite', name:'얼음 기생충',
    src:'/images/Monsters/IceParasite 344x281 (Idle Run Attack Death).png',
    frameWidth:344, frameHeight:281, sheetCols:16, sheetRows:4,
    scale:0.36, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  infectedRat: {
    id:'infectedRat', name:'감염된 쥐',
    src:'/images/Monsters/InfectedRat 294x266 (Idle Run Attack Death).png',
    frameWidth:294, frameHeight:266, sheetCols:16, sheetRows:4,
    scale:0.38, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  mechanicalParasiteA: {
    id:'mechanicalParasiteA', name:'기계 기생충 A',
    src:'/images/Monsters/MechanicalParasiteTypeA 339x289 (Idle Run Attack Death).png',
    frameWidth:339, frameHeight:289, sheetCols:16, sheetRows:4,
    scale:0.35, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  mechanicalParasiteB: {
    id:'mechanicalParasiteB', name:'기계 기생충 B',
    src:'/images/Monsters/MechanicalParasiteTypeB 349x282 (Idle Run Attack Death).png',
    frameWidth:349, frameHeight:282, sheetCols:16, sheetRows:4,
    scale:0.35, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  mimic: {
    id:'mimic', name:'미믹',
    src:'/images/Monsters/Mimic 356x292 (Idle Run Attack Death).png',
    frameWidth:356, frameHeight:292, sheetCols:16, sheetRows:4,
    scale:0.34, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  minerBoar: {
    id:'minerBoar', name:'광부 멧돼지',
    src:'/images/Monsters/MinerBoar 308x284 (Idle Run Attack Death).png',
    frameWidth:308, frameHeight:284, sheetCols:16, sheetRows:4,
    scale:0.35, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  mosquitoParasite: {
    id:'mosquitoParasite', name:'모기 기생충',
    src:'/images/Monsters/MosquitoParasite 339x241 (Idle Run Attack Death).png',
    frameWidth:339, frameHeight:241, sheetCols:16, sheetRows:4,
    scale:0.41, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  ox: {
    id:'ox', name:'황소',
    src:'/images/Monsters/Ox 336x217 (Idle Run Attack Death).png',
    frameWidth:336, frameHeight:217, sheetCols:16, sheetRows:4,
    scale:0.46, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  pirateBoar: {
    id:'pirateBoar', name:'해적 멧돼지',
    src:'/images/Monsters/PirateBoar 302x331 (Shot Idle Run Attack Death).png',
    frameWidth:302, frameHeight:331, sheetCols:16, sheetRows:5,
    scale:0.30, flip:false, tier:'medium', sizeOrder:3, animations:{...SA5},
  },
  pony: {
    id:'pony', name:'조랑말',
    src:'/images/Monsters/Pony 313x289 (Run Idle Run Attack Death).png',
    frameWidth:313, frameHeight:289, sheetCols:16, sheetRows:5,
    scale:0.35, flip:false, tier:'medium', sizeOrder:3, animations:{...SA5},
  },
  possessedBlackBear: {
    id:'possessedBlackBear', name:'빙의 흑곰',
    src:'/images/Monsters/PossessedBlackBear 349x267 (Idle Run Attack Death).png',
    frameWidth:349, frameHeight:267, sheetCols:16, sheetRows:4,
    scale:0.37, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  possessedWarg: {
    id:'possessedWarg', name:'빙의 와르그',
    src:'/images/Monsters/PossessedWarg 382x232 (Idle Run Attack Death).png',
    frameWidth:382, frameHeight:232, sheetCols:16, sheetRows:4,
    scale:0.43, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  possessedWatchdog: {
    id:'possessedWatchdog', name:'빙의 감시견',
    src:'/images/Monsters/PossessedWatchdog 344x233 (Idle Run Attack Death).png',
    frameWidth:344, frameHeight:233, sheetCols:16, sheetRows:4,
    scale:0.43, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  possessedWolf: {
    id:'possessedWolf', name:'빙의 늑대',
    src:'/images/Monsters/PossessedWolf 373x235 (Idle Run Attack Death).png',
    frameWidth:373, frameHeight:235, sheetCols:16, sheetRows:4,
    scale:0.43, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  ram: {
    id:'ram', name:'숫양',
    src:'/images/Monsters/Ram 303x223 (Idle Run Attack Death).png',
    frameWidth:303, frameHeight:223, sheetCols:16, sheetRows:4,
    scale:0.45, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  ratKing: {
    id:'ratKing', name:'쥐왕',
    src:'/images/Monsters/RatKing 344x332 (Idle Run Attack Death).png',
    frameWidth:344, frameHeight:332, sheetCols:16, sheetRows:4,
    scale:0.30, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  redScorpion: {
    id:'redScorpion', name:'붉은 전갈',
    src:'/images/Monsters/RedScorpion 363x344 (Idle Run Attack Death).png',
    frameWidth:363, frameHeight:344, sheetCols:16, sheetRows:4,
    scale:0.29, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  royalBoar: {
    id:'royalBoar', name:'왕실 멧돼지',
    src:'/images/Monsters/RoyalBoar 313x276 (Idle Run Attack Death).png',
    frameWidth:313, frameHeight:276, sheetCols:16, sheetRows:4,
    scale:0.36, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  sabretoothTiger: {
    id:'sabretoothTiger', name:'검치호',
    src:'/images/Monsters/SabretoothTiger 409x225 (Idle Run Attack Death).png',
    frameWidth:409, frameHeight:225, sheetCols:16, sheetRows:4,
    scale:0.44, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  scarabMounted: {
    id:'scarabMounted', name:'기마 스카라브',
    src:'/images/Monsters/ScarabMounted 249x299 (Idle Run Attack Death).png',
    frameWidth:249, frameHeight:299, sheetCols:16, sheetRows:4,
    scale:0.33, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  sheep: {
    id:'sheep', name:'양',
    src:'/images/Monsters/Sheep 286x212 (Idle Run Attack Death).png',
    frameWidth:286, frameHeight:212, sheetCols:16, sheetRows:4,
    scale:0.47, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  volcanoParasite: {
    id:'volcanoParasite', name:'화산 기생충',
    src:'/images/Monsters/VolcanoParasite 348x273 (Idle Run Attack Death).png',
    frameWidth:348, frameHeight:273, sheetCols:16, sheetRows:4,
    scale:0.37, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  warg: {
    id:'warg', name:'와르그',
    src:'/images/Monsters/Warg 420x244 (Idle Run Attack Death).png',
    frameWidth:420, frameHeight:244, sheetCols:16, sheetRows:4,
    scale:0.41, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  watchdog: {
    id:'watchdog', name:'감시견',
    src:'/images/Monsters/Watchdog 329x237 (Idle Run Attack Death).png',
    frameWidth:329, frameHeight:237, sheetCols:16, sheetRows:4,
    scale:0.42, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  whiteWolf: {
    id:'whiteWolf', name:'흰 늑대',
    src:'/images/Monsters/WhiteWolf 410x262 (Idle Run Attack Death).png',
    frameWidth:410, frameHeight:262, sheetCols:16, sheetRows:4,
    scale:0.38, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  wildGoat: {
    id:'wildGoat', name:'야생 염소',
    src:'/images/Monsters/WildGoat 290x220 (Idle Run Attack Death).png',
    frameWidth:290, frameHeight:220, sheetCols:16, sheetRows:4,
    scale:0.45, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  winterBear: {
    id:'winterBear', name:'겨울 곰',
    src:'/images/Monsters/WinterBear 352x274 (Idle Run Attack Death).png',
    frameWidth:352, frameHeight:274, sheetCols:16, sheetRows:4,
    scale:0.36, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  winterBoar: {
    id:'winterBoar', name:'겨울 멧돼지',
    src:'/images/Monsters/WinterBoar 280x227 (Idle Run Attack Death).png',
    frameWidth:280, frameHeight:227, sheetCols:16, sheetRows:4,
    scale:0.44, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  winterWarg: {
    id:'winterWarg', name:'겨울 와르그',
    src:'/images/Monsters/WinterWarg 422x264 (Idle Run Attack Death).png',
    frameWidth:422, frameHeight:264, sheetCols:16, sheetRows:4,
    scale:0.38, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  wolf: {
    id:'wolf', name:'늑대',
    src:'/images/Monsters/Wolf 375x239 (Idle Run Attack Death).png',
    frameWidth:375, frameHeight:239, sheetCols:16, sheetRows:4,
    scale:0.42, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  wolfHound: {
    id:'wolfHound', name:'울프하운드',
    src:'/images/Monsters/WolfHound 357x240 (Idle Run Attack Death).png',
    frameWidth:357, frameHeight:240, sheetCols:16, sheetRows:4,
    scale:0.42, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },
  wolfMounted: {
    id:'wolfMounted', name:'기마 늑대',
    src:'/images/Monsters/WolfMounfed 375x239 (Idle Run Attack Death).png',
    frameWidth:375, frameHeight:239, sheetCols:16, sheetRows:4,
    scale:0.42, flip:false, tier:'medium', sizeOrder:3, animations:{...SA},
  },

  /* ═══════════════ LARGE 대형 ═══════════════ */
  battlePanther: {
    id:'battlePanther', name:'전투 표범',
    src:'/images/Monsters/BattlePanther 441x232 (Idle Run Attack Death).png',
    frameWidth:441, frameHeight:232, sheetCols:16, sheetRows:4,
    scale:0.58, flip:false, tier:'large', sizeOrder:4, animations:{...SA},
  },
  bugQueen: {
    id:'bugQueen', name:'벌레 여왕',
    src:'/images/Monsters/BugQueen 483x352 (Idle Run Attack Death).png',
    frameWidth:483, frameHeight:352, sheetCols:16, sheetRows:4,
    scale:0.38, flip:false, tier:'large', sizeOrder:4, animations:{...SA},
  },
  cerberus: {
    id:'cerberus', name:'케르베로스',
    src:'/images/Monsters/Cerberus 483x372 (Idle Run Attack Death).png',
    frameWidth:483, frameHeight:372, sheetCols:16, sheetRows:4,
    scale:0.36, flip:false, tier:'large', sizeOrder:4, animations:{...SA},
  },
  lion: {
    id:'lion', name:'사자',
    src:'/images/Monsters/Lion 428x258 (Idle Run Attack Death).png',
    frameWidth:428, frameHeight:258, sheetCols:16, sheetRows:4,
    scale:0.52, flip:false, tier:'large', sizeOrder:4, animations:{...SA},
  },
  mossQueen: {
    id:'mossQueen', name:'이끼 여왕',
    src:'/images/Monsters/MossQueen 461x374 (Idle Run Attack Death).png',
    frameWidth:461, frameHeight:374, sheetCols:16, sheetRows:4,
    scale:0.36, flip:false, tier:'large', sizeOrder:4, animations:{...SA},
  },
  mossQueenMounted: {
    id:'mossQueenMounted', name:'기마 이끼 여왕',
    src:'/images/Monsters/MossQueenMounted 460x345 (Idle Run Attack Death).png',
    frameWidth:460, frameHeight:345, sheetCols:16, sheetRows:4,
    scale:0.39, flip:false, tier:'large', sizeOrder:4, animations:{...SA},
  },
  nightmare: {
    id:'nightmare', name:'악몽의 말',
    src:'/images/Monsters/Nightmare 425x380 (Idle Run Attack Death).png',
    frameWidth:425, frameHeight:380, sheetCols:16, sheetRows:4,
    scale:0.36, flip:false, tier:'large', sizeOrder:4, animations:{...SA},
  },
  panther: {
    id:'panther', name:'표범',
    src:'/images/Monsters/Panther 441x232 (Idle Run Attack Death).png',
    frameWidth:441, frameHeight:232, sheetCols:16, sheetRows:4,
    scale:0.58, flip:false, tier:'large', sizeOrder:4, animations:{...SA},
  },
  tiger: {
    id:'tiger', name:'호랑이',
    src:'/images/Monsters/Tiger 433x217 (Idle Run Attack Death).png',
    frameWidth:433, frameHeight:217, sheetCols:16, sheetRows:4,
    scale:0.62, flip:false, tier:'large', sizeOrder:4, animations:{...SA},
  },
  winterOgre: {
    id:'winterOgre', name:'겨울 오거',
    src:'/images/Monsters/WinterOgre 490x438 (Idle Run Attack Death).png',
    frameWidth:490, frameHeight:438, sheetCols:16, sheetRows:4,
    scale:0.31, flip:false, tier:'large', sizeOrder:4, animations:{...SA},
  },

  /* ═══════════════ LARGE 대형 (구 보스 등급) ═══════════════ */
  butcher: {
    id:'butcher', name:'도살자',
    src:'/images/Monsters/Butcher 698x574 (Idle Run Attack Death).png',
    frameWidth:698, frameHeight:574, sheetCols:16, sheetRows:4,
    scale:0.25, flip:false, tier:'large', sizeOrder:4, animations:{...SA},
  },
  cannibal: {
    id:'cannibal', name:'식인귀',
    src:'/images/Monsters/Cannibal 627x522 (Idle Run Attack Death).png',
    frameWidth:627, frameHeight:522, sheetCols:16, sheetRows:4,
    scale:0.28, flip:false, tier:'large', sizeOrder:4, animations:{...SA},
  },
  dreadnought: {
    id:'dreadnought', name:'드레드노트',
    src:'/images/Monsters/Dreadnought 625x525 (Idle Run Attack Death).png',
    frameWidth:625, frameHeight:525, sheetCols:16, sheetRows:4,
    scale:0.28, flip:false, tier:'large', sizeOrder:4, animations:{...SA},
  },
  juggernaut: {
    id:'juggernaut', name:'저거넛',
    src:'/images/Monsters/Juggernaut 614x527 (Idle Run Attack Death).png',
    frameWidth:614, frameHeight:527, sheetCols:16, sheetRows:4,
    scale:0.28, flip:false, tier:'large', sizeOrder:4, animations:{...SA},
  },
  maneater: {
    id:'maneater', name:'식인 괴물',
    src:'/images/Monsters/Maneater 653x528 (Idle Run Attack Death).png',
    frameWidth:653, frameHeight:528, sheetCols:16, sheetRows:4,
    scale:0.27, flip:false, tier:'large', sizeOrder:4, animations:{...SA},
  },
  ogre: {
    id:'ogre', name:'오거',
    src:'/images/Monsters/Ogre 601x519 (Idle Run Attack Death).png',
    frameWidth:601, frameHeight:519, sheetCols:16, sheetRows:4,
    scale:0.28, flip:false, tier:'large', sizeOrder:4, animations:{...SA},
  },
  punisher: {
    id:'punisher', name:'응징자',
    src:'/images/Monsters/Punisher 687x567 (Idle Run Attack Death).png',
    frameWidth:687, frameHeight:567, sheetCols:16, sheetRows:4,
    scale:0.26, flip:false, tier:'large', sizeOrder:4, animations:{...SA},
  },
  troll: {
    id:'troll', name:'트롤',
    src:'/images/Monsters/Troll 624x518 (Idle Run Attack Death).png',
    frameWidth:624, frameHeight:518, sheetCols:16, sheetRows:4,
    scale:0.28, flip:false, tier:'large', sizeOrder:4, animations:{...SA},
  },
  zombie: {
    id:'zombie', name:'좀비',
    src:'/images/Monsters/Zombie 627x520 (Idle Run Attack Death).png',
    frameWidth:627, frameHeight:520, sheetCols:16, sheetRows:4,
    scale:0.28, flip:false, tier:'large', sizeOrder:4, animations:{...SA},
  },

  /* ═══════════════ BOSS 보스 (Bosses/ 폴더) ═══════════════ */

  /* — 와이번 (16프레임 / Fire+Idle+Run+Attack+Death 5행) — */
  wyvernType1: {
    id:'wyvernType1', name:'와이번 1호',
    src:'/images/Monsters/Bosses/WyvernType1 999x782 (Fire Idle Run Attack Death).png',
    frameWidth:999, frameHeight:782, sheetCols:16, sheetRows:5,
    scale:0.19, flip:false, tier:'boss', sizeOrder:5, animations:{...SA5_16},
  },
  wyvernType2: {
    id:'wyvernType2', name:'와이번 2호',
    src:'/images/Monsters/Bosses/WyvernType2 1003x823 (Fire Idle Run Attack Death).png',
    frameWidth:1003, frameHeight:823, sheetCols:16, sheetRows:5,
    scale:0.18, flip:false, tier:'boss', sizeOrder:5, animations:{...SA5_16},
  },
  wyvernType3: {
    id:'wyvernType3', name:'와이번 3호',
    src:'/images/Monsters/Bosses/WyvernType3 1008x790 (Fire Idle Run Attack Death).png',
    frameWidth:1008, frameHeight:790, sheetCols:16, sheetRows:5,
    scale:0.18, flip:false, tier:'boss', sizeOrder:5, animations:{...SA5_16},
  },
  wyvernType4: {
    id:'wyvernType4', name:'와이번 4호',
    src:'/images/Monsters/Bosses/WyvernType4 1024x847 (Fire Idle Run Attack Death).png',
    frameWidth:1024, frameHeight:847, sheetCols:16, sheetRows:5,
    scale:0.17, flip:false, tier:'boss', sizeOrder:5, animations:{...SA5_16},
  },
  wyvernType5: {
    id:'wyvernType5', name:'와이번 5호',
    src:'/images/Monsters/Bosses/WyvernType5 1024x843 (Fire Idle Run Attack Death).png',
    frameWidth:1024, frameHeight:843, sheetCols:16, sheetRows:5,
    scale:0.17, flip:false, tier:'boss', sizeOrder:5, animations:{...SA5_16},
  },
  wyvernType6: {
    id:'wyvernType6', name:'와이번 6호',
    src:'/images/Monsters/Bosses/WyvernType6 954x808 (Fire Idle Run Attack Death).png',
    frameWidth:954, frameHeight:808, sheetCols:16, sheetRows:5,
    scale:0.18, flip:false, tier:'boss', sizeOrder:5, animations:{...SA5_16},
  },
  wyvernType7: {
    id:'wyvernType7', name:'와이번 7호',
    src:'/images/Monsters/Bosses/WyvernType7 971x815 (Fire Idle Run Attack Death).png',
    frameWidth:971, frameHeight:815, sheetCols:16, sheetRows:5,
    scale:0.18, flip:false, tier:'boss', sizeOrder:5, animations:{...SA5_16},
  },
  wyvernType8: {
    id:'wyvernType8', name:'와이번 8호',
    src:'/images/Monsters/Bosses/WyvernType8 957x812 (Fire Idle Run Attack Death).png',
    frameWidth:957, frameHeight:812, sheetCols:16, sheetRows:5,
    scale:0.18, flip:false, tier:'boss', sizeOrder:5, animations:{...SA5_16},
  },
  wyvernType9: {
    id:'wyvernType9', name:'와이번 9호',
    src:'/images/Monsters/Bosses/WyvernType9 1024x822 (Fire Idle Run Attack Death).png',
    frameWidth:1024, frameHeight:822, sheetCols:16, sheetRows:5,
    scale:0.18, flip:false, tier:'boss', sizeOrder:5, animations:{...SA5_16},
  },
  wyvernType10: {
    id:'wyvernType10', name:'와이번 10호',
    src:'/images/Monsters/Bosses/WyvernType10 1024x824 (Fire Idle Run Attack Death).png',
    frameWidth:1024, frameHeight:824, sheetCols:16, sheetRows:5,
    scale:0.18, flip:false, tier:'boss', sizeOrder:5, animations:{...SA5_16},
  },

  /* — 드래곤 (20프레임 / Fire+Idle+Run+Attack+Death 5행) — */
  blackDragon: {
    id:'blackDragon', name:'흑룡',
    src:'/images/Monsters/Bosses/BlackDragon 596x469 (Fire Idle Run Attack Death).png',
    frameWidth:596, frameHeight:469, sheetCols:20, sheetRows:5,
    scale:0.31, flip:false, tier:'boss', sizeOrder:5, animations:{...SA5_20},
  },
  emeraldDragon: {
    id:'emeraldDragon', name:'에메랄드 드래곤',
    src:'/images/Monsters/Bosses/EmeraldDragon 557x481 (Fire Idle Run Attack Death).png',
    frameWidth:557, frameHeight:481, sheetCols:20, sheetRows:5,
    scale:0.30, flip:false, tier:'boss', sizeOrder:5, animations:{...SA5_20},
  },
  goldenDragon: {
    id:'goldenDragon', name:'황금 드래곤',
    src:'/images/Monsters/Bosses/GoldenDragon 583x477 (Fire Idle Run Attack Death).png',
    frameWidth:583, frameHeight:477, sheetCols:20, sheetRows:5,
    scale:0.30, flip:false, tier:'boss', sizeOrder:5, animations:{...SA5_20},
  },
  greenDragon: {
    id:'greenDragon', name:'녹색 드래곤',
    src:'/images/Monsters/Bosses/GreenDragon 580x493 (Fire Idle Run Attack Death).png',
    frameWidth:580, frameHeight:493, sheetCols:20, sheetRows:5,
    scale:0.29, flip:false, tier:'boss', sizeOrder:5, animations:{...SA5_20},
  },
  greyDragon: {
    id:'greyDragon', name:'회색 드래곤',
    src:'/images/Monsters/Bosses/GreyDragon 563x433 (Fire Idle Run Attack Death).png',
    frameWidth:563, frameHeight:433, sheetCols:20, sheetRows:5,
    scale:0.33, flip:false, tier:'boss', sizeOrder:5, animations:{...SA5_20},
  },
  iceDragon: {
    id:'iceDragon', name:'얼음 드래곤',
    src:'/images/Monsters/Bosses/IceDragon 580x493 (Fire Idle Run Attack Death).png',
    frameWidth:580, frameHeight:493, sheetCols:20, sheetRows:5,
    scale:0.29, flip:false, tier:'boss', sizeOrder:5, animations:{...SA5_20},
  },
  mechanicalDragon: {
    id:'mechanicalDragon', name:'기계 드래곤',
    src:'/images/Monsters/Bosses/MechanicalDragon 565x466 (Fire Idle Run Attack Death).png',
    frameWidth:565, frameHeight:466, sheetCols:20, sheetRows:5,
    scale:0.31, flip:false, tier:'boss', sizeOrder:5, animations:{...SA5_20},
  },
  purpleDragon: {
    id:'purpleDragon', name:'보라 드래곤',
    src:'/images/Monsters/Bosses/PurpleDragon 564x481 (Fire Idle Run Attack Death).png',
    frameWidth:564, frameHeight:481, sheetCols:20, sheetRows:5,
    scale:0.30, flip:false, tier:'boss', sizeOrder:5, animations:{...SA5_20},
  },
  redDragon: {
    id:'redDragon', name:'붉은 드래곤',
    src:'/images/Monsters/Bosses/RedDragon 526x468 (Fire Idle Run Attack Death).png',
    frameWidth:526, frameHeight:468, sheetCols:20, sheetRows:5,
    scale:0.31, flip:false, tier:'boss', sizeOrder:5, animations:{...SA5_20},
  },

  /* — 도마뱀·악마 (16프레임 / AttackAlt+Idle+Run+Attack+Death 5행) — */
  lizard03: {
    id:'lizard03', name:'거대 도마뱀',
    src:'/images/Monsters/Bosses/Lizard03 816x729 (AttackAlt Idle Run Attack Death).png',
    frameWidth:816, frameHeight:729, sheetCols:16, sheetRows:5,
    scale:0.20, flip:false, tier:'boss', sizeOrder:5, animations:{...SA5_16},
  },
  demon03: {
    id:'demon03', name:'고위 악마',
    src:'/images/Monsters/Bosses/Demon03 817x691 (AttackAlt Idle Run Attack Death).png',
    frameWidth:817, frameHeight:691, sheetCols:16, sheetRows:5,
    scale:0.21, flip:false, tier:'boss', sizeOrder:5, animations:{...SA5_16},
  },

  /* — 악어·악마·거대곰·미노타우로스 (20프레임 / AttackAlt+Idle+Run+Attack+Death 5행) — */
  croc03: {
    id:'croc03', name:'거대 악어',
    src:'/images/Monsters/Bosses/Croc03 698x686 (AttackAlt Idle Run Attack Death).png',
    frameWidth:698, frameHeight:686, sheetCols:20, sheetRows:5,
    scale:0.21, flip:false, tier:'boss', sizeOrder:5, animations:{...SA5_20},
  },
  demon02: {
    id:'demon02', name:'강화 악마',
    src:'/images/Monsters/Bosses/Demon02 653x578 (AttackAlt Idle Run Attack Death).png',
    frameWidth:653, frameHeight:578, sheetCols:20, sheetRows:5,
    scale:0.25, flip:false, tier:'boss', sizeOrder:5, animations:{...SA5_20},
  },
  megabear01: {
    id:'megabear01', name:'거대곰 1호',
    src:'/images/Monsters/Bosses/Megabear01 650x578 (AttackAlt Idle Run Attack Death).png',
    frameWidth:650, frameHeight:578, sheetCols:20, sheetRows:5,
    scale:0.25, flip:false, tier:'boss', sizeOrder:5, animations:{...SA5_20},
  },
  megabear02: {
    id:'megabear02', name:'거대곰 2호',
    src:'/images/Monsters/Bosses/Megabear02 689x683 (AttackAlt Idle Run Attack Death).png',
    frameWidth:689, frameHeight:683, sheetCols:20, sheetRows:5,
    scale:0.21, flip:false, tier:'boss', sizeOrder:5, animations:{...SA5_20},
  },
  megabear03: {
    id:'megabear03', name:'거대곰 3호',
    src:'/images/Monsters/Bosses/Megabear03 652x588 (AttackAlt Idle Run Attack Death).png',
    frameWidth:652, frameHeight:588, sheetCols:20, sheetRows:5,
    scale:0.25, flip:false, tier:'boss', sizeOrder:5, animations:{...SA5_20},
  },
  minotaur02: {
    id:'minotaur02', name:'미노타우로스 2호',
    src:'/images/Monsters/Bosses/Minotaur02 649x578 (AttackAlt Idle Run Attack Death).png',
    frameWidth:649, frameHeight:578, sheetCols:20, sheetRows:5,
    scale:0.25, flip:false, tier:'boss', sizeOrder:5, animations:{...SA5_20},
  },
  minotaur03: {
    id:'minotaur03', name:'거대 미노타우로스',
    src:'/images/Monsters/Bosses/Minotaur03 714x711 (AttackAlt Idle Run Attack Death).png',
    frameWidth:714, frameHeight:711, sheetCols:20, sheetRows:5,
    scale:0.20, flip:false, tier:'boss', sizeOrder:5, animations:{...SA5_20},
  },

  /* — 골렘 (20프레임 / Idle+Run+Attack+Death 4행) — */
  iceGolem: {
    id:'iceGolem', name:'얼음 골렘',
    src:'/images/Monsters/Bosses/IceGolem 490x453 (Idle Run Attack Death).png',
    frameWidth:490, frameHeight:453, sheetCols:20, sheetRows:4,
    scale:0.32, flip:false, tier:'boss', sizeOrder:5, animations:{...SA_20},
  },
  mechanicalGolem: {
    id:'mechanicalGolem', name:'기계 골렘',
    src:'/images/Monsters/Bosses/MechanicalGolem 490x468 (Idle Run Attack Death).png',
    frameWidth:490, frameHeight:468, sheetCols:20, sheetRows:4,
    scale:0.31, flip:false, tier:'boss', sizeOrder:5, animations:{...SA_20},
  },
  rockGolem: {
    id:'rockGolem', name:'바위 골렘',
    src:'/images/Monsters/Bosses/RockGolem 490x478 (Idle Run Attack Death).png',
    frameWidth:490, frameHeight:478, sheetCols:20, sheetRows:4,
    scale:0.30, flip:false, tier:'boss', sizeOrder:5, animations:{...SA_20},
  },
  sandGolem: {
    id:'sandGolem', name:'모래 골렘',
    src:'/images/Monsters/Bosses/SandGolem 490x477 (Idle Run Attack Death).png',
    frameWidth:490, frameHeight:477, sheetCols:20, sheetRows:4,
    scale:0.30, flip:false, tier:'boss', sizeOrder:5, animations:{...SA_20},
  },
  stoneGolem: {
    id:'stoneGolem', name:'석재 골렘',
    src:'/images/Monsters/Bosses/StoneGolem 490x454 (Idle Run Attack Death).png',
    frameWidth:490, frameHeight:454, sheetCols:20, sheetRows:4,
    scale:0.32, flip:false, tier:'boss', sizeOrder:5, animations:{...SA_20},
  },
  volcanoGolem: {
    id:'volcanoGolem', name:'화산 골렘',
    src:'/images/Monsters/Bosses/VolcanoGolem 490x453 (Idle Run Attack Death).png',
    frameWidth:490, frameHeight:453, sheetCols:20, sheetRows:4,
    scale:0.32, flip:false, tier:'boss', sizeOrder:5, animations:{...SA_20},
  },

  /* — 거대 벌레 (20프레임 / Idle+Run+Attack+Death 4행) — */
  fancyWorm: {
    id:'fancyWorm', name:'화려한 거대벌레',
    src:'/images/Monsters/Bosses/FancyWorm 529x427 (Idle Run Attack Death).png',
    frameWidth:529, frameHeight:427, sheetCols:20, sheetRows:4,
    scale:0.34, flip:false, tier:'boss', sizeOrder:5, animations:{...SA_20},
  },
  greenWorm: {
    id:'greenWorm', name:'초록 거대벌레',
    src:'/images/Monsters/Bosses/GreenWorm 461x337 (Idle Run Attack Death).png',
    frameWidth:461, frameHeight:337, sheetCols:20, sheetRows:4,
    scale:0.43, flip:false, tier:'boss', sizeOrder:5, animations:{...SA_20},
  },
  iceWorm: {
    id:'iceWorm', name:'얼음 거대벌레',
    src:'/images/Monsters/Bosses/IceWorm 464x342 (Idle Run Attack Death).png',
    frameWidth:464, frameHeight:342, sheetCols:20, sheetRows:4,
    scale:0.42, flip:false, tier:'boss', sizeOrder:5, animations:{...SA_20},
  },
  mechanicalWormA: {
    id:'mechanicalWormA', name:'기계 벌레 A형',
    src:'/images/Monsters/Bosses/MechanicalWormTypeA 480x344 (Idle Run Attack Death).png',
    frameWidth:480, frameHeight:344, sheetCols:20, sheetRows:4,
    scale:0.42, flip:false, tier:'boss', sizeOrder:5, animations:{...SA_20},
  },
  mechanicalWormB: {
    id:'mechanicalWormB', name:'기계 벌레 B형',
    src:'/images/Monsters/Bosses/MechanicalWormTypeB 449x324 (Idle Run Attack Death).png',
    frameWidth:449, frameHeight:324, sheetCols:20, sheetRows:4,
    scale:0.45, flip:false, tier:'boss', sizeOrder:5, animations:{...SA_20},
  },
  mosquitoWorm: {
    id:'mosquitoWorm', name:'모기 거대벌레',
    src:'/images/Monsters/Bosses/MosquitoWorm 445x333 (Idle Run Attack Death).png',
    frameWidth:445, frameHeight:333, sheetCols:20, sheetRows:4,
    scale:0.44, flip:false, tier:'boss', sizeOrder:5, animations:{...SA_20},
  },
  volcanoWorm: {
    id:'volcanoWorm', name:'화산 거대벌레',
    src:'/images/Monsters/Bosses/VolcanoWorm 474x368 (Idle Run Attack Death).png',
    frameWidth:474, frameHeight:368, sheetCols:20, sheetRows:4,
    scale:0.39, flip:false, tier:'boss', sizeOrder:5, animations:{...SA_20},
  },
};

/** 던전 난이도 → 기본 몬스터 ID (dungeon.monsterId 없을 때 fallback) */
export const DIFF_MONSTER = {
  easy:   'rat',
  normal: 'wolf',
  hard:   'zombie',
};

export const TIER_LABEL = { tiny: '극소', small: '소형', medium: '중형', large: '대형', boss: '보스' };

/** 티어별 문제 소비량 (1마리당 몇 문제짜리 HP) */
export const TIER_COST = { tiny: 1, small: 1, medium: 3, large: 5, boss: 5 };

/** 던전 ID를 시드로 하는 간단한 XOR-shift RNG (모든 학생이 같은 랜덤 몬스터를 보도록) */
function seededRng(seed) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  }
  return () => {
    h ^= h << 13; h ^= h >>> 7; h ^= h << 17; h = h >>> 0;
    return h / 4294967295;
  };
}

/**
 * 총 문제 수 + 선택 몬스터 ID → 웨이브 배열 생성
 * @param {string|null} dungeonId — 랜덤 던전일 때 시드로 사용 (같은 ID면 항상 동일한 몬스터 배치)
 * @returns {Array<{monsterId:string, questionCount:number}>}
 */
export function generateWaves(totalQ, fixedMonsterIdOrIds, dungeonId = null) {
  const rng  = dungeonId ? seededRng(dungeonId) : Math.random;
  const rand = (arr) => arr[Math.floor(rng() * arr.length)];
  const allIds = Object.keys(MONSTERS_DB);
  const byTier = {};
  ['tiny', 'small', 'medium', 'large', 'boss'].forEach(t => {
    byTier[t] = allIds.filter(id => MONSTERS_DB[id].tier === t);
  });

  // 교사가 여러 몬스터 직접 선택 → 각 1마리씩, 크기에 따라 문제 수 배정
  if (Array.isArray(fixedMonsterIdOrIds) && fixedMonsterIdOrIds.length > 0) {
    const waves = fixedMonsterIdOrIds.map(id => {
      const m = MONSTERS_DB[id];
      return { monsterId: id, questionCount: m ? (TIER_COST[m.tier] || 1) : 1 };
    });
    const totalCost = waves.reduce((s, w) => s + w.questionCount, 0);
    const diff = totalQ - totalCost;
    if (diff > 0 && waves.length > 0) waves[waves.length - 1].questionCount += diff;
    return waves;
  }

  const fixedMonsterId = typeof fixedMonsterIdOrIds === 'string' ? fixedMonsterIdOrIds : null;

  // 교사가 특정 몬스터 선택 → 같은 종류로 N마리 (레거시 지원)
  if (fixedMonsterId && fixedMonsterId !== 'random') {
    const m = MONSTERS_DB[fixedMonsterId];
    if (!m) return [{ monsterId: fixedMonsterId, questionCount: totalQ }];
    const cost = TIER_COST[m.tier] || 1;
    const full = Math.floor(totalQ / cost);
    const rem  = totalQ % cost;
    const waves = Array.from({ length: full }, () => ({ monsterId: fixedMonsterId, questionCount: cost }));
    if (rem > 0) waves.push({ monsterId: fixedMonsterId, questionCount: rem });
    return waves.length ? waves : [{ monsterId: fixedMonsterId, questionCount: totalQ }];
  }

  // 랜덤: 문제 수를 소진할 때까지 무작위 티어 선택
  let rem = totalQ;
  const waves = [];
  while (rem > 0) {
    const candidates = rem >= 5 ? ['boss', 'large', 'medium', 'small', 'tiny']
      : rem >= 3              ? ['medium', 'small', 'tiny']
      :                         ['small', 'tiny'];
    const tier = candidates[Math.floor(rng() * candidates.length)];
    const cost = Math.min(TIER_COST[tier], rem);
    waves.push({ monsterId: rand(byTier[tier]), questionCount: cost });
    rem -= cost;
  }
  return waves;
}
