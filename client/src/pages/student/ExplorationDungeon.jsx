import React, { useState, useEffect, useRef, useMemo } from 'react';
import { collection, query, where, getDocs, doc, updateDoc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { STAT_LABEL } from '../../constants/equipment';

const DUNGEON_URL = '/dungeon-wrapper.html';

// ── 던전 데이터 ───────────────────────────────────────────────
const DUNGEONS = [
  // 1~5 숲/초원 (슬라임 → 숲 몬스터)
  { id:  0, name: '슬라임 동굴',    desc: '풀숲 입구 동굴에 슬라임들이 가득하다. 모험의 시작.',       level:  1, pos:{ x:10, y:63 }, reward:'🪙 50G · ⭐ 30EXP' },
  { id:  1, name: '푸른 숲 길',     desc: '나뭇잎 사이로 고블린들이 숨어 기습을 노린다.',            level:  3, pos:{ x:14, y:51 }, reward:'🪙 80G · ⭐ 50EXP' },
  { id:  2, name: '독버섯 지대',    desc: '독성 포자를 뿜는 버섯들과 독충들의 서식지.',              level:  5, pos:{ x:13, y:40 }, reward:'🪙 110G · ⭐ 70EXP' },
  { id:  3, name: '고목 신전',      desc: '수백 년 된 거목 아래 봉인된 고대 신전. 나무 정령이 지킨다.',level:  7, pos:{ x:24, y:77 }, reward:'🪙 140G · ⭐ 90EXP' },
  { id:  4, name: '어둠의 숲 심부', desc: '빛이 닿지 않는 숲 깊은 곳. 타락한 정령왕이 기다린다.',   level:  9, pos:{ x:27, y:69 }, reward:'🪙 170G · ⭐ 110EXP' },
  // 6~8 얼음/눈
  { id:  5, name: '눈보라 입구',    desc: '갑자기 시작된 폭설. 길을 잃은 얼음 괴물들이 돌아다닌다.', level: 11, pos:{ x:30, y:63 }, reward:'🪙 200G · ⭐ 130EXP' },
  { id:  6, name: '서리 협곡',      desc: '뼈를 에는 칼바람이 부는 협곡. 냉기 정령이 지킨다.',      level: 13, pos:{ x:32, y:55 }, reward:'🪙 230G · ⭐ 150EXP' },
  { id:  7, name: '빙하 요새',      desc: '거대한 빙하 위에 세워진 요새. 얼음 기사단이 주둔한다.',   level: 15, pos:{ x:34, y:47 }, reward:'🪙 260G · ⭐ 170EXP' },
  // 9~14 늪지대
  { id:  8, name: '안개 늪',        desc: '짙은 안개로 가득한 늪. 독개구리와 늪 정령이 출몰한다.',   level: 17, pos:{ x:35, y:39 }, reward:'🪙 300G · ⭐ 190EXP' },
  { id:  9, name: '독늪 지대',      desc: '독성 늪물이 흐르는 위험 지역. 발을 잘못 디디면 끝이다.',  level: 19, pos:{ x:38, y:30 }, reward:'🪙 340G · 💎 1 · ⭐ 210EXP' },
  { id: 10, name: '늪의 신전',      desc: '늪 한가운데 솟아오른 고대 신전. 저주받은 사제가 봉인됐다.', level: 21, pos:{ x:41, y:22 }, reward:'🪙 380G · 💎 2 · ⭐ 230EXP' },
  { id: 11, name: '수렁 지하 통로', desc: '지하로 이어지는 늪의 통로. 거대 진흙 골렘이 지킨다.',     level: 23, pos:{ x:44, y:15 }, reward:'🪙 420G · 💎 2 · ⭐ 250EXP' },
  { id: 12, name: '독늪 왕의 영지', desc: '늪지대를 지배하는 거대 개구리 왕의 본거지.',              level: 25, pos:{ x:53, y:68 }, reward:'🪙 460G · 💎 3 · ⭐ 280EXP' },
  { id: 13, name: '어둠의 늪 심부', desc: '빛이 없는 늪의 가장 깊은 곳. 최강의 늪 괴물이 기다린다.',level: 27, pos:{ x:57, y:60 }, reward:'🪙 500G · 💎 3 · ⭐ 310EXP' },
  // 15~20 사막
  { id: 14, name: '뜨거운 모래밭',  desc: '뜨거운 열기가 가득한 사막 입구. 모래 도마뱀이 도사린다.', level: 29, pos:{ x:60, y:52 }, reward:'🪙 540G · 💎 4 · ⭐ 340EXP' },
  { id: 15, name: '모래 폭풍 지대', desc: '쉼없이 몰아치는 모래 폭풍. 방향 감각을 잃으면 끝이다.',   level: 31, pos:{ x:63, y:44 }, reward:'🪙 580G · 💎 4 · ⭐ 370EXP' },
  { id: 16, name: '선인장 미로',    desc: '독침을 쏘는 선인장 몬스터들의 미로 지대.',                level: 33, pos:{ x:67, y:37 }, reward:'🪙 620G · 💎 5 · ⭐ 400EXP' },
  { id: 17, name: '파라오 무덤',    desc: '저주받은 파라오가 영원히 잠든 거대 무덤.',                level: 35, pos:{ x:67, y:28 }, reward:'🪙 660G · 💎 5 · ⭐ 430EXP' },
  { id: 18, name: '사막 신전',      desc: '모래 속에 묻힌 고대 신전. 미라 군단이 봉인을 지킨다.',    level: 37, pos:{ x:71, y:53 }, reward:'🪙 700G · 💎 6 · ⭐ 460EXP' },
  { id: 19, name: '사막 왕의 능',   desc: '사막을 지배했던 왕의 거대한 능. 최강의 미라 왕이 기다린다.', level: 39, pos:{ x:75, y:46 }, reward:'🪙 740G · 💎 6 · ⭐ 490EXP' },
  // 21~25 불/화산/용암
  { id: 20, name: '불꽃 협곡',      desc: '화염이 치솟는 협곡. 불꽃 도마뱀 군단이 지킨다.',          level: 41, pos:{ x:77, y:40 }, reward:'🪙 780G · 💎 7 · ⭐ 520EXP' },
  { id: 21, name: '용암 동굴',      desc: '마그마가 흐르는 화산 내부. 용암 골렘들이 순찰한다.',       level: 43, pos:{ x:80, y:34 }, reward:'🪙 820G · 💎 7 · ⭐ 550EXP' },
  { id: 22, name: '화산 사원',      desc: '불의 신에게 바쳐진 고대 사원. 불꽃 사제들이 지킨다.',      level: 45, pos:{ x:78, y:28 }, reward:'🪙 860G · 💎 8 · ⭐ 580EXP' },
  { id: 23, name: '용의 둥지',      desc: '화산 정상에 둥지를 튼 고룡. 전설의 용이 기다린다.',        level: 48, pos:{ x:84, y:24 }, reward:'🪙 920G · 💎 9 · ⭐ 620EXP' },
  { id: 24, name: '마왕 성채',      desc: '세계를 지배하려는 마왕의 최후 요새. 모든 용사의 종착지.',   level: 52, pos:{ x:85, y:17 }, reward:'🪙 1200G · 💎 15 · ⭐ 800EXP' },
];

// ── 순차 해금: 앞 던전 클리어해야 다음 Current.png ────────────
// allDungeons = 전체 던전 목록 (active 관계없이 전부)
const getSequentialState = (dungeon, completedMap, allDungeons, isTeacher = false) => {
  if (dungeon.active === false) return 'locked';
  if (completedMap[dungeon.id] === 'completed') return 'completed';
  if (isTeacher) return 'current'; // 교사는 관리자가 활성화한(active) 던전 모두 입장 가능

  // 이 던전보다 id 작은 active 던전 중 미완료가 하나라도 있으면 locked
  const prevActive = allDungeons
    .filter(d => d.active !== false && d.id < dungeon.id);

  const allPrevCleared = prevActive.every(d => completedMap[d.id] === 'completed');
  return allPrevCleared ? 'current' : 'locked';
};

// ── 유틸 ──────────────────────────────────────────────────────
const getMaxExpForLevel = (lv) =>
  lv <= 10 ? 100 : lv <= 30 ? 300 : lv <= 60 ? 800 : 2000;

const calcLevelUp = (level, exp, maxExp, gained) => {
  let lv = level || 1, ex = (exp || 0) + gained;
  let mx = getMaxExpForLevel(lv), leveled = false;
  while (ex >= mx && lv < 99) { ex -= mx; lv++; mx = getMaxExpForLevel(lv); leveled = true; }
  return { level: lv, exp: ex, maxExp: mx, leveled };
};

const getLevelStats = (level = 1) => ({
  hp: 100 + Math.floor(level * 10),
  attack: 10 + Math.floor(level * 2),
  defense: 5 + Math.floor(level * 1.5),
  crit: 5 + Math.floor(level * 0.5),
  attackSpeed: 10 + Math.floor(level * 1),
});

const getDungeonStatsFromStudent = (studentData, equipmentItems = []) => {
  const level = studentData?.level ?? 1;
  const levelStats = getLevelStats(level);
  const equipped = studentData?.equipped || {};
  const inventory = studentData?.equipInventory || [];

  const getInvItem = (invId) => inventory.find((inv) => String(inv.id) === String(invId));
  const getItem = (itemId) => equipmentItems.find((item) => String(item.id) === String(itemId));

  const equipBonus = Object.keys(STAT_LABEL).reduce((acc, key) => {
    acc[key] = Object.values(equipped).reduce((sum, invId) => {
      const inv = getInvItem(invId);
      const item = inv ? getItem(inv.itemId) : null;
      if (!item?.stats?.[key]) return sum;
      return sum + (Number(item.stats[key]) || 0) + (Number(inv.stars) || 0) * 5;
    }, 0);
    return acc;
  }, {});

  const hp = (levelStats.hp || 0) + (equipBonus.hp || 0);
  return {
    level,
    exp: studentData?.exp ?? 0,
    maxExp: studentData?.maxExp ?? getMaxExpForLevel(level),
    gold: studentData?.gold ?? 0,
    diamonds: studentData?.diamonds ?? 0,
    hp,
    attack: (levelStats.attack || 0) + (equipBonus.attack || 0),
    defense: (levelStats.defense || 0) + (equipBonus.defense || 0),
    crit: (levelStats.crit || 0) + (equipBonus.crit || 0),
    attackSpeed: (levelStats.attackSpeed || 0) + (equipBonus.attackSpeed || 0),
    maxHealth: hp,
    currentHealth: hp,
  };
};

// 진행도: { 0:'completed', 1:'current', 2:'locked', ... }

// ── 던전 노드 (모든 스팟 클릭 가능) ─────────────────────────
function DungeonNode({ dungeon, state, isSelected, onClick }) {
  const isActive = dungeon.active !== false;

  const icon =
    !isActive || state === 'locked'       ? '/images/Locked.png'
    : state === 'completed' && isSelected ? '/images/CompletedSelected.png'
    : state === 'completed'               ? '/images/Completed.png'
    :                                       '/images/Current.png';

  return (
    <button
      onClick={() => onClick(dungeon)}
      style={{
        position:  'absolute',
        left:      `${dungeon.pos.x}%`,
        top:       `${dungeon.pos.y}%`,
        transform: 'translate(-50%, -50%)',
        zIndex:    10,
      }}
      className="flex flex-col items-center gap-0.5 transition-transform hover:scale-125 active:scale-95 cursor-pointer">
      <img
        src={icon}
        alt={dungeon.name}
        style={{
          width: 44, height: 44, objectFit: 'contain',
          filter: isSelected
            ? 'drop-shadow(0 0 6px #facc15) drop-shadow(0 0 14px #f59e0b)'
            : !isActive
            ? 'brightness(0.6) saturate(0.3)'
            : 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))',
        }}
      />
      <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full shadow-md whitespace-nowrap
        ${isSelected          ? 'bg-yellow-400 text-yellow-900'
        : !isActive           ? 'bg-slate-500 text-slate-200'
        : state==='completed' ? 'bg-emerald-500 text-white'
        : 'bg-amber-400 text-amber-900'}`}>
        {dungeon.name}
      </span>
    </button>
  );
}

// ── 던전 정보 팝업 ────────────────────────────────────────────
function DungeonPopup({ dungeon, state, onEnter, onClose, isBusy, dungeonTickets, prevDungeonName }) {
  const isActive  = dungeon.active !== false;
  const isLocked  = isActive && state === 'locked'; // 활성이지만 이전 단계 미클리어

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-black/50"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">

        {/* 헤더 */}
        <div className={`p-5 text-white bg-gradient-to-r ${isActive ? 'from-indigo-600 to-violet-600' : 'from-slate-600 to-slate-700'}`}>
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xl font-extrabold">{dungeon.name}</h2>
            <button onClick={onClose} className="text-white/70 hover:text-white text-xl">✕</button>
          </div>
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <span className="bg-white/20 px-2 py-0.5 rounded-full font-bold">권장 Lv.{dungeon.level}</span>
            {!isActive && <span className="bg-slate-400/50 px-2 py-0.5 rounded-full font-bold">🚧 준비 중</span>}
            {isActive && state === 'completed' && <span className="bg-emerald-400/80 px-2 py-0.5 rounded-full font-bold text-emerald-900">✅ 클리어</span>}
          </div>
        </div>

        <div className="p-5 space-y-3">
          {/* 몬스터 이미지 (최대 5개) */}
          {(dungeon.monsterImages||[]).length > 0 && (
            <div className={`flex justify-center gap-2 ${(dungeon.monsterImages||[]).length > 3 ? 'flex-wrap' : ''}`}>
              {(dungeon.monsterImages||[]).map((img, idx) => (
                <img key={idx} src={img} alt="출현 몬스터"
                  className="h-20 object-contain rounded-xl border border-slate-100 bg-slate-50 flex-1 max-w-[80px]" />
              ))}
            </div>
          )}

          <p className="text-slate-600 text-sm leading-relaxed">{dungeon.desc}</p>

          {/* 출현 몬스터 이름 */}
          {dungeon.monsters && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3 text-sm">
              <div className="font-bold text-rose-700 mb-1">👾 출현 몬스터</div>
              <div className="text-rose-600">{dungeon.monsters}</div>
            </div>
          )}

          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-sm">
            <div className="font-bold text-amber-700 mb-1">🎁 클리어 보상</div>
            <div className="text-amber-600 font-medium">{dungeon.reward}</div>
          </div>

          {isActive && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>🗡️ 던전 이용권</span>
              <span className={`font-extrabold ${dungeonTickets > 0 ? 'text-sky-600' : 'text-rose-500'}`}>
                {dungeonTickets}장 보유
              </span>
            </div>
          )}

          {/* 입장 버튼 */}
          {!isActive ? (
            <div className="w-full py-3 rounded-2xl bg-slate-100 text-slate-400 text-center font-extrabold text-sm">
              🚧 현재 구현 예정인 던전입니다
            </div>
          ) : isLocked ? (
            <div className="w-full py-3.5 rounded-2xl bg-slate-100 border border-slate-200 text-slate-500 text-center text-sm leading-relaxed">
              🔒 <span className="font-extrabold text-slate-700">「{prevDungeonName || '이전'}」</span> 던전을 먼저 클리어하세요.
            </div>
          ) : (
            <>
              <button onClick={onEnter} disabled={dungeonTickets <= 0 || isBusy}
                className={`w-full py-3 rounded-2xl font-extrabold text-base transition-all active:scale-95
                  ${dungeonTickets > 0 && !isBusy
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}>
                {isBusy ? '처리 중...'
                  : dungeonTickets <= 0 ? '이용권 없음'
                  : state === 'completed' ? '🔄 재도전하기 (이용권 1개)'
                  : '⚔️ 입장하기 (이용권 1개)'}
              </button>
              {dungeonTickets <= 0 && (
                <p className="text-center text-xs text-slate-400">
                  매주 <span className="font-bold text-indigo-400">월요일</span>에 이용권이 자동 지급됩니다
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 메인 ─────────────────────────────────────────────────────
function RewardParticleBurst() {
  const particles = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        id: i,
        left: `${8 + Math.random() * 84}%`,
        size: 6 + Math.random() * 10,
        delay: Math.random() * 0.45,
        dur: 0.9 + Math.random() * 0.9,
        color: ['#facc15', '#60a5fa', '#22d3ee', '#a78bfa', '#fb7185'][Math.floor(Math.random() * 5)],
      })),
    []
  );

  return (
    <>
      <style>{`
        @keyframes dungeonRewardBurst {
          0% { transform: translateY(18px) scale(0.6); opacity: 0; }
          25% { opacity: 1; }
          100% { transform: translateY(-140px) scale(1); opacity: 0; }
        }
      `}</style>
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
        {particles.map((p) => (
          <span
            key={p.id}
            className="absolute bottom-8 rounded-full"
            style={{
              left: p.left,
              width: `${p.size}px`,
              height: `${p.size}px`,
              background: p.color,
              boxShadow: `0 0 12px ${p.color}`,
              animation: `dungeonRewardBurst ${p.dur}s ease-out ${p.delay}s infinite`,
            }}
          />
        ))}
      </div>
    </>
  );
}

export default function ExplorationDungeon({ studentCode, tickets, onUseTicket, isTeacher = false, teacherUid = null }) {
  const [phase, setPhase]             = useState('map');
  const [dungeonLaunchIndex, setDungeonLaunchIndex] = useState(1);
  const [dungeonList, setDungeonList] = useState(DUNGEONS);
  const [isBusy, setIsBusy]           = useState(false);
  const [student, setStudent]         = useState(null);
  const [equipmentItems, setEquipmentItems] = useState([]);
  const [progress, setProgress]       = useState({});
  const [selectedDungeon, setSelectedDungeon] = useState(null);
  const selectedDungeonRef = useRef(null);
  const [dungeonReward, setDungeonReward]     = useState(null);

  const iframeRef        = useRef(null);
  const characterDataRef = useRef(null);
  const studentDocIdRef  = useRef(null);
  const dungeonTickets   = isTeacher ? Infinity : (tickets?.dungeon ?? 0);

  // 던전 목록 Firebase 로드 (없으면 기본값 저장)
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'systemConfig', 'dungeons'));
        if (snap.exists() && snap.data().list?.length > 0) {
          const saved = snap.data().list;
          // 이름이 바뀌었으면 위치/active/이미지는 유지하되 이름·설명은 업데이트
          const needsUpdate = saved[0]?.name !== DUNGEONS[0].name;
          if (needsUpdate) {
            const merged = DUNGEONS.map(d => {
              const s = saved.find(x => x.id === d.id);
              return s ? { ...d, pos: s.pos, active: s.active, monsterImages: s.monsterImages||[], monsters: s.monsters } : d;
            });
            await setDoc(doc(db, 'systemConfig', 'dungeons'), { list: merged });
            setDungeonList(merged);
          } else {
            setDungeonList(saved);
          }
        } else {
          await setDoc(doc(db, 'systemConfig', 'dungeons'), { list: DUNGEONS });
        }
      } catch (e) { console.error(e); }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const itemsSnap = await getDocs(
          query(collection(db, 'equipmentItems'), where('active', '==', true))
        );
        setEquipmentItems(itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  // 학생 데이터 로드
  useEffect(() => {
    if (!studentCode) return;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'students'), where('studentCode', '==', studentCode)));
        if (!snap.empty) {
          const d = snap.docs[0];
          const data = d.data();
          studentDocIdRef.current = d.id;
          setStudent({ id: d.id, ...data });
          // 완료된 던전만 저장 { id: 'completed' } 형태
          setProgress(data.dungeonProgress || {});
          const mergedStats = getDungeonStatsFromStudent(data, equipmentItems);
          characterDataRef.current = {
            parts: data.parts ?? null,
            colors: data.colors ?? null,
            stats: mergedStats,
          };
        }
      } catch (e) { console.error(e); }
    })();
  }, [studentCode, equipmentItems]);

  useEffect(() => {
    if (isTeacher || !student) return;
    characterDataRef.current = {
      parts: student.parts ?? null,
      colors: student.colors ?? null,
      stats: getDungeonStatsFromStudent(student, equipmentItems),
    };
  }, [isTeacher, student, equipmentItems]);

  // 교사 캐릭터 데이터 로드 (isTeacher 모드)
  useEffect(() => {
    if (!isTeacher || !teacherUid) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'teacherProfiles', teacherUid));
        if (snap.exists()) {
          const data = snap.data();
          const lv = Number(data.level ?? 50) || 50;
          const levelStats = getLevelStats(lv);
          characterDataRef.current = {
            parts:          data.parts ?? null,
            colors:         data.colors ?? null,
            characterImage: data.characterImage ?? '',
            stats: {
              level:         lv,
              exp:           0,
              maxExp:        getMaxExpForLevel(lv),
              gold:          0,
              diamonds:      0,
              hp:            levelStats.hp,
              attack:        levelStats.attack,
              defense:       levelStats.defense,
              crit:          levelStats.crit,
              attackSpeed:   levelStats.attackSpeed,
              maxHealth:     levelStats.hp,
              currentHealth: levelStats.hp,
            },
          };
        }
      } catch (e) { console.error(e); }
    })();
  }, [isTeacher, teacherUid]);

  // Unity 메시지 수신
  useEffect(() => {
    if (phase !== 'playing') return;
    const handler = (e) => {
      if (!e.data?.type) return;
      if (e.data.type === 'UNITY_READY' || e.data.type === 'DUNGEON_READY') sendCharacterData();

      if (e.data.type === 'DUNGEON_RESULT') {
        const { gold = 0, exp = 0, diamond = 0 } = e.data;
        // Firebase 저장 완료 후 EXIT 처리하도록 pendingExit 플래그 설정
        const clearedDungeonId = selectedDungeonRef.current?.id;
        const isCleared = e.data?.cleared === true || (e.data?.cleared == null && Number(exp) > 0);
        applyReward({ gold, exp, diamond }).then(() => {
          if (isCleared && clearedDungeonId !== null && clearedDungeonId !== undefined) {
            markCompleted(clearedDungeonId);
          }
        });
      }

      // DUNGEON_EXIT: 약간의 딜레이 후 맵으로 전환 (보상 저장 시간 확보)
      if (e.data.type === 'DUNGEON_EXIT') {
        setTimeout(() => setPhase('map'), 500);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [phase]);

  // 플레이 시작 시 한 번만 전송 (gold/exp/diamonds 변경 시 재전송 금지 — RouteToSelectedDungeon 재호출 방지)
  useEffect(() => {
    if (phase !== 'playing') return;
    const cd = characterDataRef.current;
    if (!cd?.stats) return;
    sendCharacterData();
    const t = setTimeout(sendCharacterData, 400);
    return () => clearTimeout(t);
  }, [
    phase,          // playing 진입 시에만
    student?.id,    // 학생 변경 시 (로그인/전환)
    equipmentItems.length, // 장비 로드 완료 시
    dungeonLaunchIndex,    // 던전 선택 변경 시
    // ※ student.exp / gold / diamonds 제거 — 플레이 중 변경 시 RouteToSelectedDungeon 재호출 방지
  ]);

  const sendCharacterData = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    if (studentCode) win.postMessage({ type: 'REACT_STUDENT_CODE', studentCode }, '*');
    const cd = characterDataRef.current;
    if (!cd) return;
    const selectedIdRaw = selectedDungeonRef.current?.id;
    const selectedIdNum = Number(selectedIdRaw);

    // 던전 id가 0기반/1기반/문자열로 섞여도 항상 "선택한 던전 번호(1부터)"를 계산
    const numericIds = dungeonList
      .map((d) => Number(d.id))
      .filter((n) => Number.isFinite(n));
    const hasZeroBasedId = numericIds.length > 0 && numericIds.some((n) => n === 0);
    const orderBasedIndex = dungeonList.findIndex((d) => String(d.id) === String(selectedIdRaw)) + 1;

    let dungeonIndex = 1;
    if (orderBasedIndex > 0) {
      dungeonIndex = orderBasedIndex;
    } else if (Number.isFinite(selectedIdNum)) {
      dungeonIndex = hasZeroBasedId ? selectedIdNum + 1 : selectedIdNum;
    }
    dungeonIndex = Math.max(1, dungeonIndex);

    win.postMessage({
      type: 'REACT_LOAD_AVATAR',
      ...cd,
      stats: { ...cd.stats, classLevel: cd.stats?.level ?? 1, dungeonIndex },
      dungeonIndex,
    }, '*');
  };

  const handleIframeLoad = () => {
    // Unity 초기화/씬 로드 타이밍 차이를 고려해 여러 번 전송
    sendCharacterData();
    [500, 1000, 2000, 3000, 5000, 7000, 9000].forEach((ms) => {
      setTimeout(sendCharacterData, ms);
    });
  };

  const applyReward = async ({ gold, exp, diamond }) => {
    const docId = studentDocIdRef.current;
    const s = student;
    if (!docId || !s) return;
    const { level, exp: newExp, maxExp } = calcLevelUp(s.level, s.exp, s.maxExp, exp);
    try {
      await updateDoc(doc(db, 'students', docId), {
        gold:     (s.gold     || 0) + gold,
        diamonds: (s.diamonds || 0) + diamond,
        exp: newExp, level, maxExp,
      });
      setStudent(prev => ({ ...prev, gold: (prev.gold||0)+gold, diamonds: (prev.diamonds||0)+diamond, exp: newExp, level, maxExp }));
      if (gold || exp || diamond) setDungeonReward({ gold, exp, diamond });
    } catch (e) { console.error(e); }
  };

  const markCompleted = async (stageId) => {
    const docId = studentDocIdRef.current;
    if (!docId) return;
    const newProgress = { ...progress, [stageId]: 'completed' };
    try {
      await updateDoc(doc(db, 'students', docId), { dungeonProgress: newProgress });
      setProgress(newProgress);
    } catch (e) { console.error(e); }
  };

  const handleEnter = async () => {
    if (!selectedDungeon || (!isTeacher && dungeonTickets <= 0) || isBusy) return;
    selectedDungeonRef.current = selectedDungeon; // Unity 전달용 저장
    setIsBusy(true);
    try {
      setIsBusy(true);
      const selectedOrder = dungeonList.findIndex((d) => String(d.id) === String(selectedDungeon.id)) + 1;
      const selectedNumeric = Number(selectedDungeon.id);
      const launchIndex = selectedOrder > 0
        ? selectedOrder
        : (Number.isFinite(selectedNumeric) ? Math.max(1, selectedNumeric) : 1);
      setDungeonLaunchIndex(launchIndex);
      console.log('[ExplorationDungeon] enter', {
        selectedDungeonId: selectedDungeon.id,
        selectedOrder,
        selectedNumeric,
        launchIndex,
      });
      if (!isTeacher) await onUseTicket('dungeon');
      setPhase('playing');
      setSelectedDungeon(null);
      setDungeonReward(null);
    } catch (e) { console.error(e); }
    finally { setIsBusy(false); }
  };

  // ── Unity 플레이 화면 ──────────────────────────────────────
  if (phase === 'playing') {
    const unityUrl = `${DUNGEON_URL}?dungeonIndex=${encodeURIComponent(dungeonLaunchIndex)}&t=${Date.now()}`;
    console.log('[ExplorationDungeon] unityUrl', unityUrl);
    return (
      <div className="relative w-full" style={{ height: 'calc(100vh - 88px)', touchAction: 'none' }}>
        <iframe ref={iframeRef} id="dungeon-iframe" src={unityUrl}
          onLoad={handleIframeLoad} className="w-full h-full border-0"
          allow="fullscreen" title="탐험던전"
          style={{ touchAction: 'none', display: 'block' }} />
        <button onClick={() => setPhase('map')}
          className="absolute top-3 right-3 z-10 bg-slate-900/70 hover:bg-slate-900 text-white text-xs font-bold px-3 py-1.5 rounded-xl backdrop-blur-sm">
          ✕ 나가기
        </button>
        {false && dungeonReward && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
            <div className="bg-slate-900/80 backdrop-blur-sm rounded-3xl px-8 py-6 text-center shadow-2xl border border-white/20 animate-bounce">
              <p className="text-white font-extrabold text-lg mb-3">🎁 던전 보상!</p>
              <div className="flex gap-5 justify-center">
                {dungeonReward.gold    > 0 && <div className="flex flex-col items-center"><span className="text-2xl">🪙</span><span className="text-yellow-300 font-extrabold text-sm">+{dungeonReward.gold}G</span></div>}
                {dungeonReward.exp     > 0 && <div className="flex flex-col items-center"><span className="text-2xl">⭐</span><span className="text-indigo-300 font-extrabold text-sm">+{dungeonReward.exp}</span></div>}
                {dungeonReward.diamond > 0 && <div className="flex flex-col items-center"><span className="text-2xl">💎</span><span className="text-cyan-300 font-extrabold text-sm">+{dungeonReward.diamond}</span></div>}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── 맵 선택 화면 ──────────────────────────────────────────
  const completedCount = Object.values(progress).filter(s => s === 'completed').length;
  const activeDungeons = dungeonList;

  return (
    <div className="bg-slate-900 flex flex-col" style={{ height: 'calc(100vh - 88px)' }}>
      {dungeonReward && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative w-full max-w-sm rounded-3xl border border-white/20 bg-slate-900/95 shadow-2xl px-6 py-6 text-center overflow-hidden">
            <p className="text-white font-extrabold text-xl mb-4">🎁 던전 보상 획득</p>
            <RewardParticleBurst />
            <div className="flex justify-center gap-5 mb-5">
              {dungeonReward.gold > 0 && (
                <div className="flex flex-col items-center">
                  <span className="text-3xl">🪙</span>
                  <span className="text-yellow-300 font-extrabold text-sm">+{dungeonReward.gold}G</span>
                </div>
              )}
              {dungeonReward.exp > 0 && (
                <div className="flex flex-col items-center">
                  <span className="text-3xl">⭐</span>
                  <span className="text-indigo-300 font-extrabold text-sm">+{dungeonReward.exp} EXP</span>
                </div>
              )}
              {dungeonReward.diamond > 0 && (
                <div className="flex flex-col items-center">
                  <span className="text-3xl">💎</span>
                  <span className="text-cyan-300 font-extrabold text-sm">+{dungeonReward.diamond}</span>
                </div>
              )}
            </div>
            <button
              onClick={() => setDungeonReward(null)}
              className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-sm"
            >
              확인
            </button>
          </div>
        </div>
      )}
      {/* 상단 바 */}
      <div className="bg-slate-800 border-b border-slate-700 px-5 py-2.5 flex items-center gap-4 shrink-0">
        <h1 className="font-extrabold text-white text-base">🗺️ 탐험던전</h1>
        <span className="text-slate-400 text-xs">클리어: {completedCount}/{DUNGEONS.length}</span>
        {!isTeacher && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-400">🗡️ 이용권</span>
            <span className={`font-extrabold text-sm ${dungeonTickets > 0 ? 'text-sky-400' : 'text-rose-400'}`}>
              {dungeonTickets}장
            </span>
          </div>
        )}
      </div>

      {/* 맵 영역 - 남은 공간 전체 채움 */}
      <div className="flex-1 min-h-0 flex items-center justify-center p-2">
        <div className="relative" style={{ aspectRatio: '2236/1080', maxHeight: '100%', maxWidth: '100%', width: '100%' }}>
          {/* 배경 맵 */}
          <img
            src="/images/FantasyGameMap.png"
            alt="던전 맵"
            className="w-full h-full object-cover rounded-2xl"
            onError={e => { e.target.style.background = 'linear-gradient(135deg,#1e3a5f,#2d1b69)'; e.target.style.borderRadius = '16px'; }}
          />

          {/* 던전 노드들 */}
          {activeDungeons.map(dungeon => (
            <DungeonNode
              key={dungeon.id}
              dungeon={dungeon}
              state={getSequentialState(dungeon, progress, dungeonList, isTeacher)}
              isSelected={selectedDungeon?.id === dungeon.id}
              onClick={d => setSelectedDungeon(prev => prev?.id === d.id ? null : d)}
            />
          ))}

          {/* 던전 정보 팝업 */}
          {selectedDungeon && (() => {
            // 이전 active 던전 이름 계산
            const prevDungeon = dungeonList
              .filter(d => d.active !== false && d.id < selectedDungeon.id)
              .sort((a, b) => b.id - a.id)[0];
            return (
            <DungeonPopup
              dungeon={selectedDungeon}
              state={getSequentialState(selectedDungeon, progress, dungeonList, isTeacher)}
              prevDungeonName={prevDungeon?.name}
              onEnter={handleEnter}
              onClose={() => setSelectedDungeon(null)}
              isBusy={isBusy}
              dungeonTickets={dungeonTickets}
            />
            );
          })()}
        </div>
      </div>
    </div>
  );
}
