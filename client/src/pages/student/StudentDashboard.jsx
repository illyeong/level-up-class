import React, { useState, useEffect } from 'react';
import { doc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import SpriteMonster from '../../components/SpriteMonster';
import { MONSTERS_DB } from '../../data/monsterData';
import { STATS_META, formatStats } from './PetHouse';

const RARITY_BADGE = { common: '⚪', rare: '🔵', epic: '🟣', legendary: '🟡' };
const RARITY_LABEL = { common: '일반', rare: '희귀', epic: '영웅', legendary: '전설' };

const StudentDashboard = ({ studentCode }) => {
  const [student, setStudent] = useState(null);
  const [activePet, setActivePet]     = useState(null); // 대표 펫 데이터
  const [activePetAnim, setActivePetAnim] = useState('idle');

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

        // 대표 펫 로드
        if (stuData.activePetId) {
          const petSnap = await getDoc(doc(db, 'studentPets', stuData.activePetId));
          if (petSnap.exists()) setActivePet(petSnap.data());
        }
      } catch (e) { console.error(e); }
    };
    load();
  }, [studentCode]);

  const name     = student?.studentCode || '용감한 용사';
  const level    = student?.level || 1;
  const gold     = student?.gold || 0;
  const diamonds = student?.diamonds || 0;
  const image    = student?.characterImage;

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8 text-gray-800">🏰 학생 대시보드</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* 캐릭터 정보 카드 */}
        <div className="bg-white p-6 rounded-3xl shadow-lg border border-gray-100 text-center">
          <div className="w-full h-64 bg-indigo-50 rounded-2xl mx-auto flex items-center justify-center mb-4 border-2 border-indigo-100 shadow-inner overflow-hidden">
            {image
              ? <img src={image} alt="캐릭터" className="w-full h-full object-contain scale-[4]" />
              : <span className="text-5xl">🧑‍🎓</span>
            }
          </div>
          <h2 className="text-2xl font-bold">{name}</h2>
          <p className="text-indigo-600 font-bold mb-2">Lv. {level}</p>

          {/* 대표 펫 */}
          {activePet && MONSTERS_DB[activePet.monsterId] && (() => {
            const md = MONSTERS_DB[activePet.monsterId];
            return (
              <div className="flex items-center justify-center gap-3 mb-3 bg-indigo-50 rounded-2xl px-3 py-2 border border-indigo-100">
                <div className="cursor-pointer" onClick={() => setActivePetAnim(a => a === 'idle' ? 'attack' : 'idle')}>
                  <SpriteMonster data={md} anim={activePetAnim} scale={md.scale * 1.6} onAnimEnd={() => setActivePetAnim('idle')} />
                </div>
                <div className="text-left min-w-0">
                  <p className="text-xs font-extrabold text-slate-700 truncate">{activePet.nickname || md.name}</p>
                  <p className="text-[10px] text-indigo-500 font-bold">{RARITY_BADGE[activePet.rarity]} {RARITY_LABEL[activePet.rarity] || '일반'}</p>
                  {formatStats(activePet.stats || {}).slice(0, 2).map((line, i) => (
                    <p key={i} className="text-[9px] text-slate-500">{line}</p>
                  ))}
                </div>
              </div>
            );
          })()}

          <div className="w-full bg-gray-200 h-3 rounded-full mb-6">
            <div className="bg-indigo-500 h-3 rounded-full" style={{width: '45%'}}></div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 p-3 rounded-2xl">
              <p className="text-sm text-blue-500 font-bold">다이아</p>
              <p className="font-bold text-xl">💎 {diamonds.toLocaleString()}</p>
            </div>
            <div className="bg-yellow-50 p-3 rounded-2xl">
              <p className="text-sm text-yellow-600 font-bold">골드</p>
              <p className="font-bold text-xl">🪙 {gold.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* 퀘스트 목록 */}
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl shadow-lg border border-gray-100">
          <h3 className="text-xl font-bold mb-6">📜 퀘스트 목록</h3>
          <div className="space-y-4">
            <div className="p-4 bg-green-50 rounded-xl border border-green-100 flex justify-between items-center">
              <div>
                <span className="text-xs bg-green-200 text-green-700 px-2 py-1 rounded font-bold">일일</span>
                <h4 className="font-bold mt-1">마음 일기 쓰기</h4>
              </div>
              <button className="bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-bold shadow">완료하기</button>
            </div>
            <div className="p-4 bg-purple-50 rounded-xl border border-purple-100 flex justify-between items-center">
              <div>
                <span className="text-xs bg-purple-200 text-purple-700 px-2 py-1 rounded font-bold">주간</span>
                <h4 className="font-bold mt-1">1인 1역 완수하기</h4>
              </div>
              <button className="bg-purple-500 text-white px-4 py-2 rounded-lg text-sm font-bold shadow">진행 중</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;
