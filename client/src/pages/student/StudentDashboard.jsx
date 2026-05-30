import React, { useState, useEffect, useRef } from 'react';
import { doc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import SpriteMonster from '../../components/SpriteMonster';
import { MONSTERS_DB } from '../../data/monsterData';
import { formatStats } from './PetHouse';

const RARITY_BADGE = { common: '⚪', rare: '🔵', epic: '🟣', legendary: '🟡', mythic: '🌈' };
const RARITY_LABEL = { common: '일반', rare: '희귀', epic: '영웅', legendary: '전설', mythic: '신화' };
const STAT_LABELS  = { atk: '⚔️ 공격력', hp: '❤️ 체력', def: '🛡️ 방어력', crit: '💥 크리확률' };
const STAT_UNITS   = { crit: '%' };

// 레벨 기반 기본 스탯 (10레벨마다 10씩 증가)
const baseStats = (level) => ({
  atk: 10 + Math.floor(level / 5) * 5,
  hp:  50 + level * 5,
  def: 5  + Math.floor(level / 5) * 3,
  crit: 2 + Math.floor(level / 10),
});

// 대시보드 걷는 펫 — DOM 직접 조작으로 60fps 성능 보장
function WalkingPet({ monsterData }) {
  const wrapRef = useRef(null);
  const posRef  = useRef({ x: window.innerWidth * 0.3, goRight: true });
  const rafRef  = useRef(null);

  useEffect(() => {
    if (!monsterData) return;
    const SPEED  = 1.4;
    const PET_W  = Math.round((monsterData.frameWidth || 80) * monsterData.scale * 2);
    const BOTTOM = 72; // 네비게이션 바 위

    const loop = () => {
      const p = posRef.current;
      p.x += p.goRight ? SPEED : -SPEED;
      const maxX = window.innerWidth - PET_W - 16;
      if (p.x >= maxX) { p.x = maxX; p.goRight = false; }
      if (p.x <= 16)   { p.x = 16;   p.goRight = true;  }

      if (wrapRef.current) {
        wrapRef.current.style.left = p.x + 'px';
        wrapRef.current.style.transform = `scaleX(${p.goRight ? 1 : -1})`;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [monsterData]);

  if (!monsterData) return null;
  return (
    <div ref={wrapRef} style={{
      position: 'fixed', bottom: 72, zIndex: 20,
      pointerEvents: 'none', transformOrigin: 'left bottom',
    }}>
      <SpriteMonster data={monsterData} anim="run" scale={monsterData.scale * 2} />
    </div>
  );
}

const StudentDashboard = ({ studentCode }) => {
  const [student, setStudent] = useState(null);
  const [activePet, setActivePet] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        let stuData = null;
        if (studentCode) {
          const snap = await getDocs(query(collection(db, 'students'), where('studentCode', '==', studentCode)));
          if (!snap.empty) stuData = snap.docs[0].data();
        } else {
          const uid = localStorage.getItem('currentStudentUid');
          if (uid) { const snap = await getDoc(doc(db, 'students', uid)); if (snap.exists()) stuData = snap.data(); }
        }
        if (!stuData) return;
        setStudent(stuData);
        if (stuData.activePetId) {
          const petSnap = await getDoc(doc(db, 'studentPets', stuData.activePetId));
          if (petSnap.exists()) setActivePet(petSnap.data());
        }
      } catch (e) { console.error(e); }
    };
    load();
  }, [studentCode]);

  const name     = student?.name || student?.studentCode || '용감한 용사';
  const level    = student?.level || 1;
  const gold     = student?.gold || 0;
  const diamonds = student?.diamonds || 0;
  const image    = student?.characterImage;

  // 캐릭터 기본 스탯 + 펫 보너스 합산
  const base = baseStats(level);
  const petStats = activePet?.stats || {};
  const total = {
    atk:  base.atk  + (petStats.atk  || 0),
    hp:   base.hp   + (petStats.hp   || 0),
    def:  base.def  + (petStats.def  || 0),
    crit: base.crit + (petStats.crit || 0),
  };

  const petMd = activePet ? MONSTERS_DB[activePet.monsterId] : null;

  return (
    <>
      {/* 걷는 펫 */}
      {petMd && <WalkingPet monsterData={petMd} />}

      <div className="p-6 pb-24">
        <h1 className="text-2xl font-bold mb-6 text-gray-800">🏰 대시보드</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* 캐릭터 카드 */}
          <div className="bg-white p-5 rounded-3xl shadow-lg border border-gray-100">
            <div className="w-full h-52 bg-indigo-50 rounded-2xl flex items-center justify-center mb-3 border-2 border-indigo-100 overflow-hidden">
              {image
                ? <img src={image} alt="캐릭터" className="w-full h-full object-contain scale-[4]" />
                : <span className="text-5xl">🧑‍🎓</span>}
            </div>
            <h2 className="text-xl font-bold text-center">{name}</h2>
            <p className="text-indigo-600 font-bold text-center mb-3">Lv. {level}</p>

            {/* 능력치 */}
            <div className="bg-slate-50 rounded-2xl p-3 mb-3 space-y-1.5">
              <p className="text-xs font-extrabold text-slate-500 mb-2">⚔️ 캐릭터 능력치</p>
              {Object.entries(total).map(([stat, val]) => {
                const bonus = petStats[stat] || 0;
                return (
                  <div key={stat} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 font-bold">{STAT_LABELS[stat]}</span>
                    <span className="font-extrabold text-slate-800">
                      {val}{STAT_UNITS[stat] || ''}
                      {bonus > 0 && (
                        <span className="text-[10px] font-bold text-indigo-500 ml-1">
                          (+{bonus}{STAT_UNITS[stat] || ''})
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
              {petMd && (
                <p className="text-[9px] text-indigo-400 text-right mt-1">
                  🐾 {activePet.nickname || petMd.name} 보너스 포함
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-blue-50 p-3 rounded-2xl text-center">
                <p className="text-xs text-blue-500 font-bold">다이아</p>
                <p className="font-bold text-lg">💎 {diamonds.toLocaleString()}</p>
              </div>
              <div className="bg-yellow-50 p-3 rounded-2xl text-center">
                <p className="text-xs text-yellow-600 font-bold">골드</p>
                <p className="font-bold text-lg">🪙 {gold.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* 퀘스트 */}
          <div className="lg:col-span-2 bg-white p-5 rounded-3xl shadow-lg border border-gray-100">
            <h3 className="text-xl font-bold mb-4">📜 퀘스트 목록</h3>
            <div className="space-y-3">
              <div className="p-4 bg-green-50 rounded-xl border border-green-100 flex justify-between items-center">
                <div>
                  <span className="text-xs bg-green-200 text-green-700 px-2 py-1 rounded font-bold">일일</span>
                  <h4 className="font-bold mt-1">마음 일기 쓰기</h4>
                </div>
                <button className="bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-bold">완료하기</button>
              </div>
              <div className="p-4 bg-purple-50 rounded-xl border border-purple-100 flex justify-between items-center">
                <div>
                  <span className="text-xs bg-purple-200 text-purple-700 px-2 py-1 rounded font-bold">주간</span>
                  <h4 className="font-bold mt-1">1인 1역 완수하기</h4>
                </div>
                <button className="bg-purple-500 text-white px-4 py-2 rounded-lg text-sm font-bold">진행 중</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default StudentDashboard;
