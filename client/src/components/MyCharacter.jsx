import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export default function MyCharacter() {
  const { t } = useTranslation();
  const [studentData, setStudentData] = useState(null);
  const studentUid = localStorage.getItem('currentStudentUid') || 'test_student_01';

  useEffect(() => {
    const load = async () => {
      const snap = await getDoc(doc(db, 'students', studentUid));
      if (snap.exists()) setStudentData(snap.data());
    };
    load();
  }, [studentUid]);

  const name    = studentData?.studentCode || '용사';
  const level   = studentData?.level || 1;
  const exp     = studentData?.exp || 0;
  const maxExp  = studentData?.maxExp || 1000;
  const gold    = studentData?.gold || 0;
  const diamond = studentData?.diamonds || 0;
  const image   = studentData?.characterImage;

  const expPercentage = (exp / maxExp) * 100;

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto w-full">
      <h1 className="text-3xl font-bold text-slate-800 mb-6 drop-shadow-sm">
        {t('character.title')}
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* 왼쪽 패널: 캐릭터 정보 및 경험치 */}
        <div className="lg:col-span-1 bg-white rounded-3xl shadow-lg border border-slate-100 p-8 flex flex-col items-center justify-center transform transition-all hover:-translate-y-1 hover:shadow-xl">

          {/* 아바타 이미지 영역 */}
          <div className="relative w-40 h-40 mb-6">
            <div className="absolute inset-0 bg-indigo-100 rounded-full animate-pulse opacity-50"></div>
            <div className="relative w-full h-full bg-indigo-50 border-4 border-indigo-300 rounded-full flex items-center justify-center shadow-inner overflow-hidden">
              {image
                ? <img src={image} alt="캐릭터" className="w-full h-full object-contain" />
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

          {/* 장착 중인 아이템 */}
          <div className="bg-white rounded-3xl shadow-lg border border-slate-100 p-8 flex-grow">
            <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
              🎒 {t('character.equipment')}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {['head', 'body', 'weapon', 'pet'].map((slotKey) => (
                <div key={slotKey} className="flex flex-col items-center gap-2">
                  <div className="w-full aspect-square bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl flex items-center justify-center text-4xl hover:border-indigo-400 hover:bg-indigo-50 transition-colors cursor-pointer">
                    <span className="text-slate-200 text-sm font-medium">{t('character.emptySlot')}</span>
                  </div>
                  <span className="text-slate-500 font-bold text-sm">{t(`character.slot.${slotKey}`)}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
