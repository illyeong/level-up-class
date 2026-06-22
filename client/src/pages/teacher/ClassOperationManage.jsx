import { useEffect, useMemo, useState } from 'react';
import {
  addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where,
} from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { MONSTERS_DB, resolveBossBg } from '../../data/monsterData';
import SpriteMonster from '../../components/SpriteMonster';
import ClassOperation from '../student/ClassOperation';
import {
  calculateClassOperationMaxHP, DEFAULT_CLASS_OPERATION_BOSS_ID, DEFAULT_CLASS_OPERATION_DAYS,
  getRemainingDays,
} from '../../utils/classOperation';

const BOSSES = Object.values(MONSTERS_DB).filter(monster => monster.tier === 'boss');
const DURATION_OPTIONS = [14, 30, 60, 90];
const GOAL_EXAMPLES = [
  '학기말 과자 파티',
  '피구 한 판',
  '자유 체육 시간',
  '영화 감상 시간',
  '보드게임 데이',
  '교실 음악 시간',
  '우리반 테마 데이',
];
const formatNumber = value => Math.max(0, Number(value) || 0).toLocaleString('ko-KR');

export default function ClassOperationManage({ selectedClass }) {
  const [operations, setOperations] = useState([]);
  const [students, setStudents] = useState([]);
  const [equipmentItems, setEquipmentItems] = useState([]);
  const [attacks, setAttacks] = useState([]);
  const [goal, setGoal] = useState('');
  const [duration, setDuration] = useState(String(DEFAULT_CLASS_OPERATION_DAYS));
  const [bossId, setBossId] = useState(DEFAULT_CLASS_OPERATION_BOSS_ID);
  const [isCreating, setIsCreating] = useState(false);
  const [isStudentsLoading, setIsStudentsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [showStudentView, setShowStudentView] = useState(false);
  const classId = selectedClass?.id || selectedClass?.classId || null;
  const teacherUid = selectedClass?.teacherUid || auth.currentUser?.uid || null;

  useEffect(() => {
    if (!classId && !teacherUid) return () => {};
    const operationQuery = classId
      ? query(collection(db, 'classOperations'), where('classId', '==', classId))
      : query(collection(db, 'classOperations'), where('teacherUid', '==', teacherUid));
    const unsubscribe = onSnapshot(
      operationQuery,
      snapshot => setOperations(snapshot.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))),
    );
    const loadStudents = async () => {
      setIsStudentsLoading(true);
      try {
        const equipmentPromise = getDocs(collection(db, 'equipmentItems'));
        let studentSnap = classId
          ? await getDocs(query(collection(db, 'students'), where('classId', '==', classId)))
          : null;
        if ((!studentSnap || studentSnap.empty) && teacherUid) {
          studentSnap = await getDocs(query(collection(db, 'students'), where('teacherUid', '==', teacherUid)));
        }
        const equipmentSnap = await equipmentPromise;
        let studentRows = studentSnap?.docs.map(item => ({ id: item.id, ...item.data() })) || [];
        const configuredCount = Math.max(0, Number(selectedClass?.studentCount) || 0);
        if (configuredCount > 0 && studentRows.length > configuredCount) {
          studentRows = studentRows.slice(0, configuredCount);
        }
        if (studentRows.length === 0 && configuredCount > 0) {
          studentRows = Array.from({ length: configuredCount }, (_, index) => ({ id: `preview_${index}`, level: 5 }));
        }
        setStudents(studentRows);
        setEquipmentItems(equipmentSnap.docs.map(item => ({ id: item.id, ...item.data() })));
      } catch (error) {
        console.error('우리반 대작전 설정 로딩 실패:', error);
      } finally {
        setIsStudentsLoading(false);
      }
    };
    loadStudents();
    return unsubscribe;
  }, [classId, teacherUid, selectedClass?.studentCount]);

  const activeOperation = operations.find(operation => operation.status === 'active') || null;
  const selectedBoss = MONSTERS_DB[bossId] || MONSTERS_DB[DEFAULT_CLASS_OPERATION_BOSS_ID];
  const parsedDuration = Number.parseInt(duration, 10);
  const isDurationValid = Number.isInteger(parsedDuration) && parsedDuration >= 1 && parsedDuration <= 365;
  const hpPreview = useMemo(
    () => calculateClassOperationMaxHP(students, equipmentItems, isDurationValid ? parsedDuration : 1),
    [students, equipmentItems, isDurationValid, parsedDuration],
  );
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

  useEffect(() => {
    if (!activeOperation?.id) {
      return () => {};
    }
    return onSnapshot(
      collection(db, 'classOperations', activeOperation.id, 'attacks'),
      snapshot => setAttacks(snapshot.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => (b.attackedAt?.seconds || 0) - (a.attackedAt?.seconds || 0))),
    );
  }, [activeOperation?.id]);

  const createOperation = async () => {
    if (!teacherUid || !goal.trim() || !isDurationValid || activeOperation || isCreating) {
      setMessage(!teacherUid ? '교사 정보를 확인할 수 없습니다.' : !goal.trim() ? '공동 목표를 입력해주세요.' : !isDurationValid ? '진행 기간을 1~365일로 입력해주세요.' : '현재 진행 중인 대작전이 있습니다.');
      return;
    }
    setIsCreating(true);
    setMessage('');
    try {
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + parsedDuration);
      await addDoc(collection(db, 'classOperations'), {
        title: goal.trim(),
        goalDescription: goal.trim(),
        bossId: selectedBoss.id,
        bossName: selectedBoss.name,
        bossBg: resolveBossBg(selectedBoss.id),
        maxHP: hpPreview.maxHP,
        currentHP: hpPreview.maxHP,
        expectedDailyDamage: hpPreview.expectedDailyDamage,
        assumedParticipationRate: 1,
        durationDays: parsedDuration,
        studentCountAtCreation: students.length,
        totalAttackCount: 0,
        status: 'active',
        classId: classId || null,
        teacherUid,
        startDate: serverTimestamp(),
        endDate,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setMessage('우리반 대작전이 시작되었습니다. 학생 메뉴에서 바로 공격할 수 있습니다.');
    } catch (error) {
      console.error('우리반 대작전 생성 실패:', error);
      setMessage('대작전 생성 중 오류가 발생했습니다.');
    } finally {
      setIsCreating(false);
    }
  };

  const finishOperation = async operation => {
    await updateDoc(doc(db, 'classOperations', operation.id), { status: 'ended', endedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  };

  const removeOperation = async operation => {
    if (!window.confirm(`"${operation.title}" 기록을 삭제할까요?`)) return;
    await deleteDoc(doc(db, 'classOperations', operation.id));
  };

  if (showStudentView) {
    return (
      <ClassOperation
        isTeacher
        selectedClass={selectedClass}
        onExit={() => setShowStudentView(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-5 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-3xl bg-gradient-to-r from-indigo-950 via-violet-900 to-rose-900 p-6 text-white shadow-xl">
          <p className="text-xs font-extrabold tracking-[0.25em] text-amber-300">CLASS MISSION</p>
          <h1 className="mt-2 text-3xl font-black">🏰 우리반 대작전</h1>
          <p className="mt-2 text-sm text-white/70">학생들이 매일 자기 능력치로 한 번씩 공격해 학급의 공동 목표를 달성합니다.</p>
        </header>

        <section className="rounded-3xl border border-indigo-100 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-extrabold text-slate-900">진행 구조</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            {[
              ['1', '목표 정하기', '과자파티, 피구, 자유시간처럼 함께 원하는 목표를 정합니다.'],
              ['2', '자동 난이도 계산', '학생 수와 실제 공격력을 기준으로 알맞은 보스 HP를 계산합니다.'],
              ['3', '하루 한 번 공격', '학생은 매일 자신의 레벨과 장비 공격력만큼 피해를 보탭니다.'],
              ['4', '모두 함께 달성', '기간 안에 HP를 모두 줄이면 공동 목표가 성공합니다. 개인 순위는 없습니다.'],
            ].map(([step, title, description]) => (
              <div key={step} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="grid h-8 w-8 place-items-center rounded-full bg-indigo-600 text-sm font-black text-white">{step}</div>
                <h3 className="mt-3 font-extrabold text-slate-800">{title}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
              </div>
            ))}
          </div>
        </section>

        {activeOperation ? (
          <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 text-white shadow-xl">
            <div className="absolute inset-0 bg-cover bg-center opacity-35" style={{ backgroundImage: `url('${resolveBossBg(activeOperation)}')` }} />
            <div className="relative grid gap-5 p-6 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <div className="text-xs font-extrabold tracking-widest text-emerald-300">진행 중</div>
                <h2 className="mt-2 text-2xl font-black">{activeOperation.title}</h2>
                <p className="mt-1 text-sm text-white/60">{activeOperation.bossName} · 남은 기간 {getRemainingDays(activeOperation.endDate)}일</p>
                <div className="mt-5 h-6 overflow-hidden rounded-full border border-white/20 bg-black/50 p-1">
                  <div className="h-full rounded-full bg-gradient-to-r from-rose-600 to-amber-400" style={{ width: `${Math.max(0, Math.min(100, ((activeOperation.maxHP - activeOperation.currentHP) / activeOperation.maxHP) * 100))}%` }} />
                </div>
                <div className="mt-2 flex justify-between text-xs font-bold text-white/65"><span>누적 공격 {formatNumber(activeOperation.totalAttackCount)}회</span><span>{formatNumber(activeOperation.currentHP)} / {formatNumber(activeOperation.maxHP)} HP</span></div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button onClick={() => setShowStudentView(true)} className="rounded-xl bg-amber-400 px-4 py-2 text-xs font-extrabold text-slate-950 hover:bg-amber-300">👁 학생 화면으로 진행상황 보기</button>
                  <button onClick={() => finishOperation(activeOperation)} className="rounded-xl border border-white/20 bg-black/30 px-4 py-2 text-xs font-bold text-white/70 hover:bg-white/10">대작전 종료</button>
                </div>
              </div>
              <SpriteMonster data={MONSTERS_DB[activeOperation.bossId]} anim="idle" scale={(MONSTERS_DB[activeOperation.bossId]?.scale || 0.4) * 1.45} />
            </div>
          </section>
        ) : (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><h2 className="text-xl font-extrabold text-slate-900">새 대작전 시작</h2><p className="mt-1 text-xs text-slate-500">세 가지만 고르면 HP와 시작일은 자동으로 설정됩니다.</p></div>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <label className="text-xs font-extrabold text-slate-500">공동 목표
                <input value={goal} onChange={event => setGoal(event.target.value)} className="mt-2 w-full rounded-xl border-2 border-slate-200 px-3 py-3 text-sm font-bold text-slate-800 outline-none focus:border-indigo-500" placeholder="예: 학기말 과자파티" />
                <span className="mt-2 block text-[11px] font-bold text-slate-400">목표 예시를 눌러 바로 입력할 수 있습니다.</span>
              </label>
              <label className="text-xs font-extrabold text-slate-500">진행 기간
                <input type="number" min="1" max="365" value={duration} onChange={event => setDuration(event.target.value)}
                  className={`mt-2 w-full rounded-xl border-2 px-3 py-3 text-sm font-bold text-slate-800 outline-none ${isDurationValid ? 'border-slate-200 focus:border-indigo-500' : 'border-rose-400 focus:border-rose-500'}`} placeholder="1~365일 직접 입력" />
                <span className={`mt-2 block text-[11px] font-bold ${isDurationValid ? 'text-slate-400' : 'text-rose-500'}`}>{isDurationValid ? '아래 빠른 선택 또는 직접 입력' : '1~365일 사이로 입력해주세요.'}</span>
              </label>
              <label className="text-xs font-extrabold text-slate-500">보스
                <select value={bossId} onChange={event => setBossId(event.target.value)} className="mt-2 w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-800 outline-none focus:border-indigo-500">
                  {BOSSES.map(boss => <option key={boss.id} value={boss.id}>{boss.name}</option>)}
                </select>
              </label>
            </div>
            <div className="mt-4">
              <div className="mb-2 text-xs font-extrabold text-slate-500">기간 빠른 선택</div>
              <div className="flex flex-wrap gap-2">
                {DURATION_OPTIONS.map(days => (
                  <button key={days} type="button" onClick={() => setDuration(String(days))}
                    className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${parsedDuration === days ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-violet-300 hover:bg-violet-50'}`}>
                    {days}일
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4">
              <div className="mb-2 text-xs font-extrabold text-slate-500">공동 목표 예시</div>
              <div className="flex flex-wrap gap-2">
                {GOAL_EXAMPLES.map(example => (
                  <button key={example} type="button" onClick={() => setGoal(example)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${goal === example ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50'}`}>
                    {example}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-slate-950 p-4 text-white">
              <div className="flex items-center gap-4"><SpriteMonster data={selectedBoss} anim="idle" scale={(selectedBoss?.scale || 0.4) * 0.8} /><div><div className="text-xs text-white/50">자동 계산 결과</div><div className="font-extrabold">{isStudentsLoading ? '학생 정보를 불러오는 중...' : isDurationValid ? `학생 ${students.length}명 × ${parsedDuration}일 · ${formatNumber(hpPreview.maxHP)} HP` : '기간을 입력하면 HP가 계산됩니다.'}</div></div></div>
              <button onClick={createOperation} disabled={isCreating || isStudentsLoading || !teacherUid || !isDurationValid || !goal.trim()} className="rounded-2xl bg-amber-400 px-6 py-3 text-sm font-black text-slate-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50">{isCreating ? '시작 중...' : '🚩 바로 시작하기'}</button>
            </div>
            {message && <p className="mt-3 text-center text-sm font-bold text-emerald-600">{message}</p>}
          </section>
        )}

        {activeOperation && (
          <section className="grid gap-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
            <div>
              <h2 className="font-extrabold text-slate-800">학생별 누적 데미지</h2>
              <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
                {contributionRows.length === 0 ? <p className="text-xs text-slate-400">아직 공격한 학생이 없습니다.</p> : contributionRows.map(row => (
                  <div key={row.name} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm"><span className="font-bold text-slate-700">{row.name} <small className="font-normal text-slate-400">{row.count}회</small></span><strong className="text-indigo-600">{formatNumber(row.damage)} 데미지</strong></div>
                ))}
              </div>
            </div>
            <div>
              <h2 className="font-extrabold text-slate-800">최근 공격 기록</h2>
              <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
                {attacks.length === 0 ? <p className="text-xs text-slate-400">공격 기록이 없습니다.</p> : attacks.slice(0, 20).map(attackItem => (
                  <div key={attackItem.id} className="flex items-center justify-between rounded-xl bg-rose-50 px-4 py-3 text-sm"><span className="font-bold text-slate-700">{attackItem.studentName || attackItem.studentCode}</span><strong className="text-rose-600">-{formatNumber(attackItem.damage)} HP</strong></div>
                ))}
              </div>
            </div>
          </section>
        )}

        {operations.filter(operation => operation.status !== 'active').length > 0 && (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="font-extrabold text-slate-800">지난 대작전</h2><div className="mt-3 space-y-2">{operations.filter(operation => operation.status !== 'active').map(operation => <div key={operation.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"><div><strong className="text-sm text-slate-700">{operation.title}</strong><span className="ml-2 text-xs text-slate-400">{operation.status === 'cleared' ? '목표 달성' : '종료'}</span></div><button onClick={() => removeOperation(operation)} className="text-xs font-bold text-rose-500">삭제</button></div>)}</div></section>
        )}
      </div>
    </div>
  );
}
