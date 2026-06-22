import { useEffect, useMemo, useState } from 'react';
import {
  collection, doc, getDocs, onSnapshot, query, runTransaction, serverTimestamp, where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { MONSTERS_DB, resolveBossBg } from '../../data/monsterData';
import SpriteMonster from '../../components/SpriteMonster';
import { getClassOperationAttack, getLocalDateKey, getRemainingDays } from '../../utils/classOperation';

const formatNumber = value => Math.max(0, Number(value) || 0).toLocaleString('ko-KR');

export default function ClassOperation({ studentCode, isTeacher = false, selectedClass = null, onExit }) {
  const [student, setStudent] = useState(null);
  const [operation, setOperation] = useState(null);
  const [equipmentItems, setEquipmentItems] = useState([]);
  const [attacks, setAttacks] = useState([]);
  const [hasAttackedToday, setHasAttackedToday] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAttacking, setIsAttacking] = useState(false);
  const [bossAnim, setBossAnim] = useState('idle');
  const [flash, setFlash] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let unsubscribeOperation = () => {};
    let unsubscribeAttack = () => {};
    let unsubscribeAttackList = () => {};
    let mounted = true;

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
            unsubscribeAttackList();
            if (current) {
              unsubscribeAttackList = onSnapshot(
                collection(db, 'classOperations', current.id, 'attacks'),
                attackListSnap => setAttacks(attackListSnap.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => (b.attackedAt?.seconds || 0) - (a.attackedAt?.seconds || 0))),
              );
            } else {
              setAttacks([]);
            }
            setIsLoading(false);
          },
          () => setIsLoading(false),
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
          unsubscribeAttack();
          unsubscribeAttackList();
          if (current) {
            const attackId = `${studentDoc.id}_${getLocalDateKey()}`;
            unsubscribeAttack = onSnapshot(
              doc(db, 'classOperations', current.id, 'attacks', attackId),
              attackSnap => setHasAttackedToday(attackSnap.exists()),
            );
            unsubscribeAttackList = onSnapshot(
              collection(db, 'classOperations', current.id, 'attacks'),
              attackListSnap => setAttacks(attackListSnap.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => (b.attackedAt?.seconds || 0) - (a.attackedAt?.seconds || 0))),
            );
          } else {
            setHasAttackedToday(false);
            setAttacks([]);
          }
          setIsLoading(false);
        },
        () => setIsLoading(false),
      );
    };

    load().catch(error => {
      console.error('우리반 대작전 로딩 실패:', error);
      if (mounted) setIsLoading(false);
    });
    return () => {
      mounted = false;
      unsubscribeOperation();
      unsubscribeAttack();
      unsubscribeAttackList();
    };
  }, [studentCode, isTeacher, selectedClass?.id, selectedClass?.classId, selectedClass?.teacherUid]);

  const attackStats = useMemo(
    () => getClassOperationAttack(student || {}, equipmentItems),
    [student, equipmentItems],
  );
  const maxHP = Number(operation?.maxHP) || 1;
  const currentHP = Math.max(0, Number(operation?.currentHP) || 0);
  const progress = Math.min(100, Math.max(0, ((maxHP - currentHP) / maxHP) * 100));
  const boss = MONSTERS_DB[operation?.bossId] || MONSTERS_DB.redDragon;
  const background = operation ? resolveBossBg(operation) : '';
  const canAttack = !isTeacher && operation?.status === 'active' && getRemainingDays(operation.endDate) > 0 && !hasAttackedToday && currentHP > 0;
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

  const attack = async () => {
    if (!canAttack || !student?.id || isAttacking) return;
    setIsAttacking(true);
    setMessage('');
    try {
      const operationRef = doc(db, 'classOperations', operation.id);
      const attackId = `${student.id}_${getLocalDateKey()}`;
      const attackRef = doc(db, 'classOperations', operation.id, 'attacks', attackId);
      await runTransaction(db, async transaction => {
        const [operationSnap, attackSnap] = await Promise.all([
          transaction.get(operationRef),
          transaction.get(attackRef),
        ]);
        if (!operationSnap.exists() || operationSnap.data().status !== 'active') {
          throw new Error('진행 중인 대작전이 아닙니다.');
        }
        const endDate = operationSnap.data().endDate?.toDate?.();
        if (endDate && endDate.getTime() < Date.now()) throw new Error('대작전 기간이 종료되었습니다.');
        if (attackSnap.exists()) throw new Error('오늘은 이미 공격했습니다.');
        const operationData = operationSnap.data();
        const beforeHP = Math.max(0, Number(operationData.currentHP) || 0);
        const appliedDamage = Math.min(beforeHP, attackStats.damage);
        const nextHP = Math.max(0, beforeHP - appliedDamage);
        transaction.set(attackRef, {
          studentId: student.id,
          studentCode: student.studentCode || studentCode,
          studentName: student.name || student.studentCode || '학생',
          damage: appliedDamage,
          statSnapshot: attackStats,
          dateKey: getLocalDateKey(),
          attackedAt: serverTimestamp(),
        });
        transaction.update(operationRef, {
          currentHP: nextHP,
          totalAttackCount: (Number(operationData.totalAttackCount) || 0) + 1,
          status: nextHP === 0 ? 'cleared' : 'active',
          clearedAt: nextHP === 0 ? serverTimestamp() : null,
          updatedAt: serverTimestamp(),
        });
      });
      setBossAnim('attack');
      setFlash(true);
      setTimeout(() => setFlash(false), 250);
      setMessage(`오늘의 공격 성공! ${formatNumber(attackStats.damage)} 피해를 함께 보탰습니다.`);
    } catch (error) {
      setMessage(error.message || '공격 중 오류가 발생했습니다.');
    } finally {
      setIsAttacking(false);
    }
  };

  if (isLoading) return <div className="min-h-screen grid place-items-center bg-slate-950 text-slate-300 font-bold">우리반 대작전을 불러오는 중...</div>;
  if (!operation) return <div className="min-h-screen grid place-items-center bg-slate-950 text-center text-slate-300"><div><div className="text-6xl mb-4">🏰</div><h1 className="text-2xl font-extrabold text-white">아직 시작된 우리반 대작전이 없습니다</h1><p className="mt-2 text-sm">선생님이 공동 목표를 열면 이곳에서 함께 공격할 수 있어요.</p></div></div>;

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${background}')` }} />
      <div className="absolute inset-0 bg-slate-950/65" />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-7 md:px-8">
        {isTeacher && onExit && (
          <button onClick={onExit} className="mb-3 self-start rounded-xl border border-white/20 bg-black/45 px-4 py-2 text-xs font-extrabold text-white hover:bg-white/15">← 관리 화면으로 돌아가기</button>
        )}
        <header className="rounded-3xl border border-white/15 bg-black/35 p-5 text-center backdrop-blur-md">
          <p className="text-xs font-extrabold tracking-[0.28em] text-amber-300">우리반 대작전</p>
          <h1 className="mt-2 text-2xl font-black md:text-4xl">{operation.title}</h1>
          <p className="mt-2 text-sm text-white/70">{isTeacher ? '학생들이 보는 화면과 동일한 실시간 진행상황입니다.' : '하루 한 번, 우리 반 모두의 힘으로 공동 목표를 완성하세요.'}</p>
        </header>

        <main className="mt-5 grid flex-1 gap-5 md:grid-cols-[1.2fr_0.8fr]">
          <section className="flex min-h-[430px] flex-col rounded-3xl border border-white/15 bg-black/35 p-5 backdrop-blur-sm">
            <div className="flex items-center justify-between text-sm font-bold">
              <span>{operation.bossName || boss?.name}</span>
              <span className="text-amber-300">남은 기간 {getRemainingDays(operation.endDate)}일</span>
            </div>
            <div className="mt-3 h-7 overflow-hidden rounded-full border-2 border-white/20 bg-black/50 p-1">
              <div className="h-full rounded-full bg-gradient-to-r from-rose-700 to-red-400 transition-all" style={{ width: `${100 - progress}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-xs font-extrabold text-white/65">
              <span>달성도 {progress.toFixed(1)}%</span>
              <span>{formatNumber(currentHP)} / {formatNumber(maxHP)} HP</span>
            </div>
            <div className="flex flex-1 items-center justify-center py-5 drop-shadow-[0_15px_25px_rgba(0,0,0,0.65)]">
              <SpriteMonster data={boss} anim={operation.status === 'cleared' ? 'death' : bossAnim} flash={flash} scale={(boss?.scale || 0.4) * 2.1} onAnimEnd={() => setBossAnim('idle')} />
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
                    <div className="rounded-2xl bg-white/10 p-4"><div className="text-xs text-white/50">참여 학생</div><div className="mt-1 text-xl font-black">{contributionRows.length}명</div></div>
                  </div>
                </div>
                <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs leading-6 text-white/55">공격 기록과 HP는 학생이 공격하는 즉시 이 화면에도 반영됩니다.</div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-extrabold">오늘의 내 공격</h2>
                <div className="mt-4 rounded-2xl border border-indigo-400/30 bg-indigo-500/10 p-4">
                  <div className="text-xs text-indigo-200">예상 피해량</div>
                  <div className="mt-1 text-4xl font-black text-amber-300">{formatNumber(attackStats.damage)}</div>
                  <div className="mt-3 space-y-1 text-xs text-white/60">
                    <div className="flex justify-between"><span>레벨</span><strong>Lv.{attackStats.level}</strong></div>
                    <div className="flex justify-between"><span>기본 공격력</span><strong>{attackStats.baseAttack}</strong></div>
                    <div className="flex justify-between"><span>성장·장비 보너스</span><strong>+{attackStats.upgradeBonus + attackStats.equipmentBonus}</strong></div>
                  </div>
                </div>
                <button onClick={attack} disabled={!canAttack || isAttacking}
                  className="mt-5 w-full rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 py-4 text-lg font-black text-slate-950 shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:grayscale disabled:opacity-60">
                  {operation.status === 'cleared' ? '🎉 공동 목표 달성!' : hasAttackedToday ? '✅ 오늘 공격 완료' : isAttacking ? '공격 중...' : '⚔️ 오늘의 공격하기'}
                </button>
                {message && <p className="mt-3 rounded-xl bg-white/10 p-3 text-center text-xs font-bold text-amber-100">{message}</p>}
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
            <h2 className="font-extrabold">⚔️ 학생별 누적 기여</h2>
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
            <h2 className="font-extrabold">🔥 최근 공격</h2>
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
              {attacks.length === 0 ? <p className="text-xs text-white/45">첫 번째 공격을 기다리고 있습니다.</p> : attacks.slice(0, 12).map(attackItem => (
                <div key={attackItem.id} className="flex items-center justify-between rounded-xl bg-white/10 px-3 py-2 text-sm">
                  <span className="font-bold">{attackItem.studentName || attackItem.studentCode}</span>
                  <strong className="text-rose-300">-{formatNumber(attackItem.damage)} HP</strong>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
