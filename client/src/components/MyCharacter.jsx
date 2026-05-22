import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { doc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { db } from '../firebase';

export default function MyCharacter({ studentCode }) {
  const { t } = useTranslation();
  const [studentData, setStudentData] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        if (studentCode) {
          const q = query(collection(db, 'students'), where('studentCode', '==', studentCode));
          const snap = await getDocs(q);
          if (!snap.empty) setStudentData(snap.docs[0].data());
        } else {
          const uid = localStorage.getItem('currentStudentUid');
          if (uid) {
            const snap = await getDoc(doc(db, 'students', uid));
            if (snap.exists()) setStudentData(snap.data());
          }
        }
      } catch (e) { console.error(e); }
    };
    load();
  }, [studentCode]);

  const name        = studentData?.name || studentData?.studentCode || '용사';
  const level       = studentData?.level || 1;
  const exp         = studentData?.exp || 0;
  const maxExp      = studentData?.maxExp || 100;
  const gold        = studentData?.gold || 0;
  const diamond     = studentData?.diamonds || 0;
  const image       = studentData?.characterImage;
  const skillPoints = studentData?.skillPoints || {};

  const expPercentage = Math.min(100, (exp / maxExp) * 100);

  // 레벨 기반 스탯 (자동 계산)
  const stats = {
    hp:          100 + Math.floor(level * 10),
    attack:      10  + Math.floor(level * 2),
    defense:     5   + Math.floor(level * 1.5),
    crit:        5   + Math.floor(level * 0.5),
    attackSpeed: 10  + Math.floor(level * 1),
  };

  const SKILL_META = [
    { key: '인성',    icon: '💜', color: 'bg-purple-100 text-purple-700 border-purple-200' },
    { key: '의사소통', icon: '💙', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    { key: '성실성',  icon: '💚', color: 'bg-green-100 text-green-700 border-green-200' },
    { key: '창의성',  icon: '💛', color: 'bg-amber-100 text-amber-700 border-amber-200' },
    { key: '협동심',  icon: '💙', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
    { key: '자기관리', icon: '🩶', color: 'bg-slate-100 text-slate-600 border-slate-200' },
  ];

  const STAT_META = [
    { key: 'hp',          label: '체력',       icon: '❤️' },
    { key: 'attack',      label: '공격력',     icon: '⚔️' },
    { key: 'defense',     label: '방어력',     icon: '🛡️' },
    { key: 'crit',        label: '크리티컬',   icon: '💥' },
    { key: 'attackSpeed', label: '공격속도',   icon: '💨' },
  ];

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto w-full">
      <h1 className="text-3xl font-bold text-slate-800 mb-6 drop-shadow-sm">
        {t('character.title')}
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* 왼쪽 패널: 캐릭터 정보 및 경험치 */}
        <div className="lg:col-span-1 bg-white rounded-3xl shadow-lg border border-slate-100 p-8 flex flex-col items-center justify-center transform transition-all hover:-translate-y-1 hover:shadow-xl">

          {/* 아바타 이미지 영역 */}
          <div className="relative w-48 h-56 mb-6">
            <div className="relative w-full h-full bg-indigo-50 border-2 border-indigo-200 rounded-2xl flex items-center justify-center shadow-inner overflow-hidden">
              {image
                ? <img src={image} alt="캐릭터" className="w-full h-full object-contain scale-[3]" />
                : <span className="text-6xl">🧑‍🎓</span>
              }
            </div>
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-400 to-orange-500 text-white px-4 py-1 rounded-full font-bold text-sm shadow-md border-2 border-white whitespace-nowrap">
              {t('character.level', { level })}
            </div>
          </div>

          <h2 className="text-2xl font-bold text-slate-800 mb-6">{name}</h2>

          {/* 경험치 바 */}
          <div className="w-full">
            <div className="flex justify-between text-sm font-bold text-slate-500 mb-2">
              <span>{t('character.exp')}</span>
              <span>{exp} / {maxExp}</span>
            </div>
            <div className="w-full h-5 bg-slate-100 rounded-full overflow-hidden shadow-inner border border-slate-200">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 to-green-500 rounded-full transition-all duration-1000 ease-out relative"
                style={{ width: `${expPercentage}%` }}
              >
                <div className="absolute top-0 left-0 right-0 h-1/2 bg-white/30 rounded-t-full"></div>
              </div>
            </div>
          </div>
        </div>

        {/* 오른쪽 패널: 재화 및 장비 */}
        <div className="lg:col-span-2 flex flex-col gap-6">

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-3xl shadow-md border border-slate-100 p-6 flex items-center justify-between hover:scale-[1.02] transition-transform cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center text-2xl shadow-sm">🪙</div>
                <span className="text-lg font-bold text-slate-600">{t('character.gold')}</span>
              </div>
              <span className="text-3xl font-extrabold text-amber-500">{gold.toLocaleString()}</span>
            </div>

            <div className="bg-white rounded-3xl shadow-md border border-slate-100 p-6 flex items-center justify-between hover:scale-[1.02] transition-transform cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-cyan-100 rounded-full flex items-center justify-center text-2xl shadow-sm">💎</div>
                <span className="text-lg font-bold text-slate-600">{t('character.diamond')}</span>
              </div>
              <span className="text-3xl font-extrabold text-cyan-500">{diamond.toLocaleString()}</span>
            </div>
          </div>

          {/* 레벨 기반 스탯 */}
          <div className="bg-white rounded-3xl shadow-lg border border-slate-100 p-6">
            <h3 className="text-base font-extrabold text-slate-800 mb-4 flex items-center gap-2">
              ⚔️ 전투 능력치 <span className="text-xs text-slate-400 font-medium">레벨에 따라 자동 상승</span>
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {STAT_META.map(s => (
                <div key={s.key} className="flex items-center justify-between bg-slate-50 rounded-2xl px-4 py-3 border border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{s.icon}</span>
                    <span className="text-sm font-bold text-slate-600">{s.label}</span>
                  </div>
                  <span className="text-lg font-extrabold text-indigo-600">{stats[s.key]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 스킬 포인트 */}
          <div className="bg-white rounded-3xl shadow-lg border border-slate-100 p-6">
            <h3 className="text-base font-extrabold text-slate-800 mb-4 flex items-center gap-2">
              ✨ 역량 포인트 <span className="text-xs text-slate-400 font-medium">퀘스트 완료 시 적립</span>
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {SKILL_META.map(s => {
                const pts = skillPoints[s.key] || 0;
                return (
                  <div key={s.key}
                    className={`flex flex-col items-center gap-1 rounded-2xl border px-3 py-3 ${s.color}`}>
                    <span className="text-xl">{s.icon}</span>
                    <span className="text-[11px] font-extrabold">{s.key}</span>
                    <span className="text-lg font-black">{pts}</span>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
