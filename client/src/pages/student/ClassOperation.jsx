import { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection, doc, getDocs, onSnapshot, query, runTransaction, serverTimestamp, where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { MONSTERS_DB, resolveBossBg } from '../../data/monsterData';
import SpriteMonster from '../../components/SpriteMonster';
import { getClassOperationAttack, getLocalDateKey, getRemainingDays } from '../../utils/classOperation';
import { fireProjectile } from '../../utils/projectile';
import { getClassOperationErrorMessage, playOptionalClassOperationEffect } from '../../utils/classOperationFeedback';

const formatNumber = value => Math.max(0, Number(value) || 0).toLocaleString('ko-KR');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const CLASS_OPERATION_PROJECTILE_TYPES = ['magic', 'fire', 'ice', 'arrow', 'energy'];
const EMPTY_ATTACKS = [];

const getRandomClassOperationProjectileType = () =>
  CLASS_OPERATION_PROJECTILE_TYPES[Math.floor(Math.random() * CLASS_OPERATION_PROJECTILE_TYPES.length)];

const playBattleTone = (kind = 'charge') => {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const settings = {
      charge: [220, 440, 0.18],
      hit: [140, 70, 0.16],
      critical: [520, 980, 0.32],
      clear: [392, 784, 0.55],
    }[kind] || [220, 440, 0.18];
    oscillator.type = kind === 'hit' ? 'square' : 'sine';
    oscillator.frequency.setValueAtTime(settings[0], context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(settings[1], context.currentTime + settings[2]);
    gain.gain.setValueAtTime(0.12, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + settings[2]);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + settings[2]);
    setTimeout(() => context.close(), (settings[2] + 0.1) * 1000);
  } catch {
    // Audio is optional; animation still runs when the browser blocks it.
  }
};

export default function ClassOperation({ studentCode, isTeacher = false, selectedClass = null, onExit }) {
  const [student, setStudent] = useState(null);
  const [operation, setOperation] = useState(null);
  const [equipmentItems, setEquipmentItems] = useState([]);
  const [attackHistory, setAttackHistory] = useState({ operationId: null, items: EMPTY_ATTACKS });
  const [showAllAttacks, setShowAllAttacks] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [todayAttack, setTodayAttack] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAttacking, setIsAttacking] = useState(false);
  const [bossAnim, setBossAnim] = useState('idle');
  const [flash, setFlash] = useState(false);
  const [message, setMessage] = useState('');
  const [hitEffect, setHitEffect] = useState(null);
  const [attackPhase, setAttackPhase] = useState('idle');
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return typeof window === 'undefined' || localStorage.getItem('classOperationSound') !== 'off'; }
    catch { return true; }
  });
  const [dateKey, setDateKey] = useState(getLocalDateKey);
  const attacks = attackHistory.operationId === operation?.id ? attackHistory.items : EMPTY_ATTACKS;
  const historyLoading = attackHistory.operationId !== operation?.id || attackHistory.dateKey !== dateKey
    || attackHistory.all !== showAllAttacks || attackHistory.reloadKey !== reloadKey;
  const reconnect = () => { setIsLoading(true); setMessage(''); setReloadKey(key => key + 1); };
  const hasAttackedToday = todayAttack?.operationId === operation?.id
    && todayAttack?.studentId === student?.id && todayAttack?.dateKey === dateKey && todayAttack?.exists;
  const characterCardRef = useRef(null);
  const bossTargetRef = useRef(null);

  useEffect(() => {
    const refreshDay = () => setDateKey(getLocalDateKey());
    const timer = setInterval(refreshDay, 60_000);
    window.addEventListener('focus', refreshDay);
    return () => { clearInterval(timer); window.removeEventListener('focus', refreshDay); };
  }, []);

  useEffect(() => {
    let unsubscribeOperation = () => {};
    let mounted = true;
    const handleLoadError = error => {
      console.error('우리반 대작전 로딩 실패:', error);
      if (mounted) { setMessage(getClassOperationErrorMessage(error)); setIsLoading(false); }
    };

    const load = async () => {
      if (isTeacher) {
        const classId = selectedClass?.id || selectedClass?.classId || null;
        const teacherUid = selectedClass?.teacherUid || null;
        if (!classId && !teacherUid) {
          setIsLoading(false);
          return;
        }
        const teacherOperationQuery = classId
          ? query(collection(db, 'classOperations'), where('classId', '==', classId))
          : query(collection(db, 'classOperations'), where('teacherUid', '==', teacherUid));
        unsubscribeOperation = onSnapshot(
          teacherOperationQuery,
          snapshot => {
            const operations = snapshot.docs
              .map(item => ({ id: item.id, ...item.data() }))
              .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            const current = operations.find(item => item.status === 'active') || operations[0] || null;
            setOperation(current);
            setIsLoading(false);
          },
          handleLoadError,
        );
        return;
      }
      if (!studentCode) {
        setIsLoading(false);
        return;
      }
      const [studentSnap, equipmentSnap] = await Promise.all([
        getDocs(query(collection(db, 'students'), where('studentCode', '==', studentCode))),
        getDocs(collection(db, 'equipmentItems')),
      ]);
      if (!mounted) return;
      const studentDoc = studentSnap.docs[0];
      if (!studentDoc) {
        setIsLoading(false);
        return;
      }
      const studentData = { id: studentDoc.id, ...studentDoc.data() };
      setStudent(studentData);
      setEquipmentItems(equipmentSnap.docs.map(item => ({ id: item.id, ...item.data() })));

      const classId = studentData.classId;
      const teacherUid = studentData.teacherUid;
      if (!classId && !teacherUid) {
        setIsLoading(false);
        return;
      }
      const operationQuery = classId
        ? query(collection(db, 'classOperations'), where('classId', '==', classId))
        : query(collection(db, 'classOperations'), where('teacherUid', '==', teacherUid));
      unsubscribeOperation = onSnapshot(
        operationQuery,
        snapshot => {
          const operations = snapshot.docs
            .map(item => ({ id: item.id, ...item.data() }))
            .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
          const current = operations.find(item => item.status === 'active') || operations[0] || null;
          setOperation(current);
          setIsLoading(false);
        },
        handleLoadError,
      );
    };

    load().catch(handleLoadError);
    return () => {
      mounted = false;
      unsubscribeOperation();
    };
  }, [studentCode, isTeacher, selectedClass?.id, selectedClass?.classId, selectedClass?.teacherUid, reloadKey]);

  // By default read only today's attacks, not months of history on every student's device.
  // Full cumulative history is still available on explicit request.
  useEffect(() => {
    if (!operation?.id) return;
    return onSnapshot(
      showAllAttacks ? collection(db, 'classOperations', operation.id, 'attacks')
        : query(collection(db, 'classOperations', operation.id, 'attacks'), where('dateKey', '==', dateKey)),
      snapshot => {
        setAttackHistory({ operationId: operation.id, dateKey, all: showAllAttacks, reloadKey, items: snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
          .sort((a, b) => (b.attackedAt?.seconds || 0) - (a.attackedAt?.seconds || 0)) });
      },
      error => { console.error('대작전 공격 기록 조회 실패:', error); setMessage(getClassOperationErrorMessage(error)); },
    );
  }, [operation?.id, dateKey, showAllAttacks, reloadKey]);

  useEffect(() => {
    if (isTeacher || !student?.id || !operation?.id) return;
    return onSnapshot(
      doc(db, 'classOperations', operation.id, 'attacks', `${student.id}_${dateKey}`),
      snapshot => setTodayAttack({ operationId: operation.id, studentId: student.id, dateKey, exists: snapshot.exists() }),
      error => { console.error('대작전 오늘 공격 조회 실패:', error); setMessage(getClassOperationErrorMessage(error)); },
    );
  }, [operation?.id, student?.id, isTeacher, dateKey, reloadKey]);

  const attackStats = useMemo(
    () => getClassOperationAttack(student || {}, equipmentItems),
    [student, equipmentItems],
  );
  const maxHP = Number(operation?.maxHP) || 1;
  const currentHP = Math.max(0, Number(operation?.currentHP) || 0);
  const progress = Math.min(100, Math.max(0, ((maxHP - currentHP) / maxHP) * 100));
  const boss = MONSTERS_DB[operation?.bossId] || MONSTERS_DB.redDragon;
  const background = operation ? resolveBossBg(operation) : '';
  const estimatedDaysLeft = getRemainingDays(operation?.estimatedEndDate || operation?.endDate);
  const estimatedScheduleLabel = estimatedDaysLeft > 0
    ? `예상 완료까지 ${estimatedDaysLeft}일`
    : '예상 완료일 경과 · HP가 0이 될 때까지 계속';
  const canAttack = !isTeacher && !historyLoading && operation?.status === 'active' && !hasAttackedToday && currentHP > 0;
  const contributionRows = useMemo(() => {
    const rows = new Map();
    attacks.forEach(attackItem => {
      const key = attackItem.studentId || attackItem.studentCode;
      const current = rows.get(key) || { name: attackItem.studentName || attackItem.studentCode || '학생', damage: 0, count: 0 };
      current.damage += Number(attackItem.damage) || 0;
      current.count += 1;
      rows.set(key, current);
    });
    return [...rows.values()].sort((a, b) => b.damage - a.damage);
  }, [attacks]);
  const todayAttacks = useMemo(
    () => attacks.filter(attackItem => attackItem.dateKey === dateKey),
    [attacks, dateKey],
  );
  const comboBonusPercent = Math.min(20, Math.floor(todayAttacks.length / 5) * 5);
  const todayParticipantCount = new Set(todayAttacks.map(attackItem => attackItem.studentId || attackItem.studentCode)).size;
  const fullParticipation = Number(operation?.studentCountAtCreation) > 0 && todayParticipantCount >= Number(operation.studentCountAtCreation);
  const hpPercent = Math.max(0, Math.min(100, (currentHP / maxHP) * 100));
  const bossPhase = hpPercent <= 25 ? 3 : hpPercent <= 50 ? 2 : hpPercent <= 75 ? 1 : 0;

  const attack = async () => {
    if (!canAttack || !student?.id || isAttacking) return;
    setIsAttacking(true);
    setMessage('');
    const attackDateKey = getLocalDateKey();
    const critical = Math.random() * 100 < attackStats.criticalChance;
    const criticalDamage = critical
      ? Math.floor(attackStats.damage * attackStats.criticalMultiplier)
      : attackStats.damage;
    const rolledDamage = Math.floor(criticalDamage * (1 + comboBonusPercent / 100));
    setAttackPhase(critical ? 'critical-charge' : 'charging');
    if (soundEnabled) playBattleTone(critical ? 'critical' : 'charge');

    const commitAttack = async () => {
      const operationRef = doc(db, 'classOperations', operation.id);
      const attackId = `${student.id}_${attackDateKey}`;
      const attackRef = doc(db, 'classOperations', operation.id, 'attacks', attackId);
      return runTransaction(db, async transaction => {
        const [operationSnap, attackSnap] = await Promise.all([
          transaction.get(operationRef),
          transaction.get(attackRef),
        ]);
        if (!operationSnap.exists() || operationSnap.data().status !== 'active') {
          throw new Error('진행 중인 대작전이 아닙니다.');
        }
        if (attackSnap.exists()) throw new Error('오늘은 이미 공격했습니다.');
        const operationData = operationSnap.data();
        const beforeHP = Math.max(0, Number(operationData.currentHP) || 0);
        const appliedDamage = Math.min(beforeHP, rolledDamage);
        const nextHP = Math.max(0, beforeHP - appliedDamage);
        transaction.set(attackRef, {
          studentId: student.id,
          studentCode: student.studentCode || studentCode,
          studentName: student.name || student.studentCode || '학생',
          baseDamage: attackStats.damage,
          damage: appliedDamage,
          critical,
          criticalChance: attackStats.criticalChance,
          criticalMultiplier: attackStats.criticalMultiplier,
          comboBonusPercent,
          characterImage: student.characterImage || '',
          statSnapshot: attackStats,
          dateKey: attackDateKey,
          attackedAt: serverTimestamp(),
        });
        transaction.update(operationRef, {
          currentHP: nextHP,
          totalAttackCount: (Number(operationData.totalAttackCount) || 0) + 1,
          status: nextHP === 0 ? 'cleared' : 'active',
          clearedAt: nextHP === 0 ? serverTimestamp() : null,
          updatedAt: serverTimestamp(),
        });
        return { appliedDamage, critical, cleared: nextHP === 0 };
      });
    };

    try {
      // Commit independently of the optional canvas effect. The transaction
      // still atomically prevents duplicate daily attacks and reduces HP.
      const result = await commitAttack();
      setTodayAttack({ operationId: operation.id, studentId: student.id, dateKey: attackDateKey, exists: true });
      await wait(critical ? 520 : 340);
      const characterRect = characterCardRef.current?.getBoundingClientRect();
      const bossRect = bossTargetRef.current?.getBoundingClientRect();
      setAttackPhase('projectile');
      await playOptionalClassOperationEffect(finish => {
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (!characterRect || !bossRect) {
          finish();
          return;
        }
        fireProjectile({
          from: { x: characterRect.left + characterRect.width / 2, y: characterRect.top + characterRect.height / 2 },
          to: { x: bossRect.left + bossRect.width / 2, y: bossRect.top + bossRect.height / 2 },
          type: getRandomClassOperationProjectileType(),
          power: critical ? 2 : 1.6,
          reducedMotion: reduceMotion,
          onHit: finish,
          onComplete: finish,
        });
      });
      setAttackPhase(result.cleared ? 'final' : result.critical ? 'critical-impact' : 'impact');
      if (soundEnabled) playBattleTone(result.cleared ? 'clear' : result.critical ? 'critical' : 'hit');
      setFlash(true);
      setHitEffect({ damage: result.appliedDamage, critical: result.critical, key: Date.now() });
      setTimeout(() => setFlash(false), result.critical ? 500 : 280);
      setTimeout(() => setHitEffect(null), result.cleared ? 2200 : 1300);
      setTimeout(() => setAttackPhase('idle'), result.cleared ? 2400 : 850);
      setMessage(`${result.cleared ? '🏆 최후의 일격! ' : result.critical ? '💥 크리티컬! ' : ''}오늘의 공격 성공! ${formatNumber(result.appliedDamage)} 피해를 함께 보탰습니다.${comboBonusPercent > 0 ? ` 협동 콤보 +${comboBonusPercent}%` : ''}`);
    } catch (error) {
      console.error('우리반 대작전 공격 실패:', { code: error.code, name: error.name, message: error.message });
      setAttackPhase('idle');
      setMessage(getClassOperationErrorMessage(error));
    } finally {
      setIsAttacking(false);
    }
  };

  if (isLoading) return <div className="min-h-screen grid place-items-center bg-slate-950 text-slate-300 font-bold">우리반 대작전을 불러오는 중...</div>;
  if (!operation) return <div className="min-h-screen grid place-items-center bg-slate-950 text-center text-slate-300"><div><div className="text-6xl mb-4">🏰</div><h1 className="text-2xl font-extrabold text-white">{message ? '대작전을 불러오지 못했습니다' : '아직 시작된 우리반 대작전이 없습니다'}</h1><p className="mt-2 text-sm">{message || '선생님이 공동 목표를 열면 이곳에서 함께 공격할 수 있어요.'}</p><button className="mt-4 underline" onClick={() => setReloadKey(key => key + 1)}>다시 불러오기</button></div></div>;

  return (
    <div className={`class-operation-page relative min-h-screen overflow-hidden bg-slate-950 text-white ${['impact', 'critical-impact', 'final'].includes(attackPhase) ? `class-operation-${attackPhase}` : ''}`}>
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${background}')` }} />
      <div className="absolute inset-0 bg-slate-950/65" />
      <div className={`class-operation-rage absolute inset-0 class-operation-rage-${bossPhase}`} />
      {attackPhase === 'critical-impact' && <div className="class-operation-critical-flash pointer-events-none fixed inset-0 z-40" />}
      {attackPhase === 'final' && <div className="class-operation-final-blast pointer-events-none fixed inset-0 z-40 grid place-items-center"><div className="text-center"><div className="text-6xl">🏆</div><div className="mt-3 text-3xl font-black text-amber-200">최후의 일격!</div></div></div>}
      <div className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-7 md:px-8">
        {isTeacher && onExit && (
          <button onClick={onExit} className="mb-3 self-start rounded-xl border border-white/20 bg-black/45 px-4 py-2 text-xs font-extrabold text-white hover:bg-white/15">← 관리 화면으로 돌아가기</button>
        )}
        <header className="rounded-3xl border border-white/15 bg-black/35 p-5 text-center backdrop-blur-md">
          <button onClick={() => setSoundEnabled(current => {
            const next = !current;
            try { localStorage.setItem('classOperationSound', next ? 'on' : 'off'); } catch { /* Optional preference. */ }
            return next;
          })} className="absolute right-4 top-4 rounded-xl border border-white/15 bg-black/35 px-3 py-2 text-xs font-bold text-white/65 hover:bg-white/10" title="효과음 켜기/끄기">{soundEnabled ? '🔊' : '🔇'}</button>
          <p className="text-xs font-extrabold tracking-[0.28em] text-amber-300">우리반 대작전</p>
          <h1 className="mt-2 text-2xl font-black md:text-4xl">{operation.title}</h1>
          <p className="mt-2 text-sm text-white/70">{isTeacher ? '학생들이 보는 화면과 동일한 실시간 진행상황입니다.' : '하루 한 번, 우리 반 모두의 힘으로 공동 목표를 완성하세요.'}</p>
        </header>
        {message && <p role="status" className="mt-3 rounded-xl bg-white/10 p-3 text-center text-xs font-bold text-amber-100">{message}
          {!isAttacking && <button className="ml-3 underline" onClick={reconnect}>연결 다시 확인</button>}
        </p>}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/35 px-4 py-3 backdrop-blur-md">
          <div><div className="text-[10px] font-bold text-white/45">오늘의 협동 콤보</div><div className="text-lg font-black text-amber-300">{todayAttacks.length} HIT {comboBonusPercent > 0 && <span className="ml-1 text-xs text-emerald-300">공격 +{comboBonusPercent}%</span>} {fullParticipation && <span className="ml-1 text-xs text-sky-300">✨ 전원 참여!</span>}</div></div>
          <div className="flex -space-x-2">
            {todayAttacks.slice(0, 10).map(attackItem => (
              <div key={attackItem.id} title={attackItem.studentName || attackItem.studentCode} className="grid h-9 w-9 place-items-center overflow-hidden rounded-full border-2 border-slate-800 bg-indigo-900 text-xs font-black shadow-lg">
                {attackItem.characterImage ? <img src={attackItem.characterImage} alt="" className="h-full w-full object-contain" /> : (attackItem.studentName || attackItem.studentCode || '?').slice(0, 1)}
              </div>
            ))}
            {todayAttacks.length === 0 && <span className="text-xs font-bold text-white/40">첫 공격을 기다리는 중</span>}
          </div>
        </div>

        <main className="mt-5 grid flex-1 gap-5 md:grid-cols-[1.2fr_0.8fr]">
          <section className="flex min-h-[430px] flex-col rounded-3xl border border-white/15 bg-black/35 p-5 backdrop-blur-sm">
            <div className="flex items-center justify-between text-sm font-bold">
              <span>{operation.bossName || boss?.name}</span>
              <span className="text-amber-300">{estimatedScheduleLabel}</span>
            </div>
            <div className="mt-3 h-7 overflow-hidden rounded-full border-2 border-white/20 bg-black/50 p-1">
              <div className="h-full rounded-full bg-gradient-to-r from-rose-700 to-red-400 transition-[width] duration-1000 ease-out" style={{ width: `${100 - progress}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-xs font-extrabold text-white/65">
              <span>달성도 {progress.toFixed(1)}%</span>
              <span>{formatNumber(currentHP)} / {formatNumber(maxHP)} HP</span>
            </div>
            <div ref={bossTargetRef} className={`class-operation-boss class-operation-boss-phase-${bossPhase} ${['impact', 'critical-impact', 'final'].includes(attackPhase) ? 'class-operation-boss-hit' : ''} relative isolate flex flex-1 items-center justify-center py-5 drop-shadow-[0_15px_25px_rgba(0,0,0,0.65)]`}>
              {bossPhase > 0 && <div className="absolute right-1 top-3 rounded-full border border-rose-400/30 bg-rose-950/65 px-3 py-1 text-[10px] font-black tracking-widest text-rose-200">{bossPhase === 3 ? '최종 분노' : `분노 ${bossPhase}단계`}</div>}
              <SpriteMonster data={boss} anim={operation.status === 'cleared' ? 'death' : bossAnim} flash={flash} scale={(boss?.scale || 0.4) * 2.1} onAnimEnd={() => setBossAnim('idle')} />
              {hitEffect && (
                <div key={hitEffect.key} className={`pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 animate-bounce font-black drop-shadow-[0_3px_8px_rgba(0,0,0,0.9)] ${hitEffect.critical ? 'text-3xl text-yellow-300' : 'text-2xl text-rose-300'}`}>
                  {hitEffect.critical ? '💥 CRITICAL! ' : ''}-{formatNumber(hitEffect.damage)}
                </div>
              )}
            </div>
            <div className="rounded-2xl bg-black/45 px-4 py-3 text-center">
              <div className="text-xs text-white/55">공동 목표</div>
              <div className="mt-1 text-lg font-extrabold text-amber-200">🎁 {operation.goalDescription || operation.title}</div>
            </div>
          </section>

          <aside className="rounded-3xl border border-white/15 bg-slate-950/75 p-5 backdrop-blur-md">
            {isTeacher ? (
              <>
                <h2 className="text-lg font-extrabold">교사 진행 현황</h2>
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4"><div className="text-xs text-amber-100/70">남은 보스 HP</div><div className="mt-1 text-3xl font-black text-amber-300">{formatNumber(currentHP)}</div></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-white/10 p-4"><div className="text-xs text-white/50">누적 공격</div><div className="mt-1 text-xl font-black">{formatNumber(operation.totalAttackCount || attacks.length)}회</div></div>
                    <div className="rounded-2xl bg-white/10 p-4"><div className="text-xs text-white/50">{showAllAttacks ? '누적 참여 학생' : '오늘 참여 학생'}</div><div className="mt-1 text-xl font-black">{contributionRows.length}명</div></div>
                  </div>
                </div>
                <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs leading-6 text-white/55">공격 기록과 HP는 학생이 공격하는 즉시 이 화면에도 반영됩니다.</div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-extrabold">오늘의 내 공격</h2>
                <div className={`class-operation-character-card class-operation-character-${attackPhase} relative mt-4 flex flex-col items-center overflow-hidden rounded-2xl border border-white/15 bg-white/10 p-4 text-center`}>
                  <div className="pointer-events-none absolute inset-x-8 bottom-14 h-14 rounded-full bg-indigo-400/15 blur-xl" />
                  <div ref={characterCardRef} className="relative grid h-36 w-36 shrink-0 place-items-center overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 shadow-2xl md:h-44 md:w-44">
                    {student?.characterImage
                      ? <img src={student.characterImage} alt={`${student.name || student.studentCode || '학생'} 캐릭터`} className="h-full w-full scale-110 object-contain drop-shadow-[0_12px_16px_rgba(0,0,0,0.55)]" />
                      : <span className="text-7xl">🧙</span>}
                  </div>
                  <div className="relative mt-3 min-w-0">
                    <div className="truncate text-base font-extrabold text-white md:text-lg">{student?.name || student?.studentCode || '나의 캐릭터'}</div>
                    <div className="mt-1 text-xs text-white/50">Lv.{attackStats.level} · 공격 준비 완료</div>
                    <div className="mt-2 flex justify-center gap-2 text-[10px] font-extrabold">
                      <span className="rounded-full bg-rose-500/20 px-2.5 py-1 text-rose-200">⚔️ ATK {attackStats.totalAttack}</span>
                      <span className="rounded-full bg-amber-400/20 px-2.5 py-1 text-amber-200">💥 CRIT {attackStats.criticalChance}%</span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 rounded-2xl border border-indigo-400/30 bg-indigo-500/10 p-4">
                  <div className="text-xs text-indigo-200">예상 피해량</div>
                  <div className="mt-1 text-4xl font-black text-amber-300">{formatNumber(attackStats.damage)}</div>
                  <div className="mt-3 space-y-1 text-xs text-white/60">
                    <div className="flex justify-between"><span>레벨</span><strong>Lv.{attackStats.level}</strong></div>
                    <div className="flex justify-between"><span>기본 공격력</span><strong>{attackStats.baseAttack}</strong></div>
                    <div className="flex justify-between"><span>성장·장비 보너스</span><strong>+{attackStats.upgradeBonus + attackStats.equipmentBonus}</strong></div>
                    <div className="flex justify-between"><span>크리티컬 확률</span><strong className="text-yellow-300">{attackStats.criticalChance}%</strong></div>
                    <div className="flex justify-between"><span>오늘의 협동 보너스</span><strong className="text-emerald-300">+{comboBonusPercent}%</strong></div>
                  </div>
                </div>
                <button onClick={attack} disabled={!canAttack || isAttacking}
                  className="mt-5 w-full rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 py-4 text-lg font-black text-slate-950 shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:grayscale disabled:opacity-60">
                  {operation.status === 'cleared' ? '🎉 공동 목표 달성!' : hasAttackedToday ? '✅ 오늘 공격 완료' : isAttacking ? attackPhase.includes('charge') ? '✨ 힘을 모으는 중...' : '⚡ 공격 중...' : '⚔️ 오늘의 공격하기'}
                </button>
                <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs leading-6 text-white/55">
                  <strong className="block text-sm text-white">함께하는 규칙</strong>
                  매일 1번 공격할 수 있습니다.<br />내 레벨과 장비 공격력이 피해량에 반영됩니다.<br />개인 순위 없이 모든 피해가 우리 반 목표에 합쳐집니다.
                </div>
              </>
            )}
          </aside>
        </main>

        <section className="mt-5 grid gap-5 rounded-3xl border border-white/15 bg-black/45 p-5 backdrop-blur-md md:grid-cols-2">
          <div>
            <h2 className="font-extrabold">⚔️ 학생별 {showAllAttacks ? '누적' : '오늘'} 기여</h2>
            <button disabled={historyLoading} className="mt-2 text-xs text-amber-200 underline" onClick={() => setShowAllAttacks(value => !value)}>
              {historyLoading ? '기록 불러오는 중...' : showAllAttacks ? '오늘 기록만 보기' : '전체 누적 기록 보기'}
            </button>
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
              {contributionRows.length === 0 ? <p className="text-xs text-white/45">아직 공격 기록이 없습니다.</p> : contributionRows.map(row => (
                <div key={row.name} className="flex items-center justify-between rounded-xl bg-white/10 px-3 py-2 text-sm">
                  <span className="font-bold">{row.name} <small className="font-normal text-white/45">{row.count}회</small></span>
                  <strong className="text-amber-300">{formatNumber(row.damage)} 피해</strong>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="font-extrabold">🔥 {showAllAttacks ? '최근' : '오늘'} 공격</h2>
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
              {attacks.length === 0 ? <p className="text-xs text-white/45">첫 번째 공격을 기다리고 있습니다.</p> : attacks.slice(0, 12).map(attackItem => (
                <div key={attackItem.id} className="flex items-center justify-between rounded-xl bg-white/10 px-3 py-2 text-sm">
                  <span className="font-bold">{attackItem.studentName || attackItem.studentCode}</span>
                  <strong className={attackItem.critical ? 'text-yellow-300' : 'text-rose-300'}>{attackItem.critical ? '💥 ' : ''}-{formatNumber(attackItem.damage)} HP</strong>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
