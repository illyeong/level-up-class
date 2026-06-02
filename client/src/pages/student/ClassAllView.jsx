import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { getEffectiveCosmeticStyles, getHallOfFameBadgeText } from '../../data/avatarCosmetics';

export default function ClassAllView({ studentCode, themeMode = 'dark' }) {
  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        let teacherUid = null;
        if (studentCode) {
          const meSnap = await getDocs(query(collection(db, 'students'), where('studentCode', '==', studentCode)));
          if (!meSnap.empty) teacherUid = meSnap.docs[0].data().teacherUid || null;
        }

        const q = teacherUid
          ? query(collection(db, 'students'), where('teacherUid', '==', teacherUid))
          : collection(db, 'students');
        const snap = await getDocs(q);
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.studentCode || '').localeCompare(b.studentCode || ''));
        setStudents(list);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [studentCode]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-64 gap-3">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
        <div className="text-slate-400 font-bold text-sm">불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className={`text-2xl font-bold mb-6 ${themeMode === 'dark' ? 'text-white' : 'text-slate-800'}`}>
        우리 반 전체 보기
      </h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {students.map((s) => {
          const cosmeticStyles = getEffectiveCosmeticStyles(s);
          const hallBadgeText = getHallOfFameBadgeText(s);
          return (
          <div key={s.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col items-center relative">
            {/* 프레임 오버레이 — 카드 전체를 감싸서 rounded corner 일치 */}
            {cosmeticStyles.frame?.id && cosmeticStyles.frame.id !== 'basic' && (
              <div
                className="absolute inset-0 rounded-2xl pointer-events-none z-30"
                style={cosmeticStyles.frame.style}
              />
            )}
            <div
              className="relative w-full h-56 bg-indigo-50 flex items-center justify-center overflow-hidden"
              style={cosmeticStyles.background.style}
            >
              {hallBadgeText && (
                <div className="absolute top-2 right-2 z-20 rounded-full bg-gradient-to-r from-amber-400 via-yellow-300 to-orange-400 px-2.5 py-1 text-[10px] font-black text-amber-950 shadow-lg ring-2 ring-white/90">
                  {hallBadgeText}
                </div>
              )}
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2 w-28 h-28 rounded-full bg-indigo-300/25 blur-2xl" />
              </div>
              {cosmeticStyles.background.floorStyle && (
                <div
                  className="pointer-events-none absolute left-1/2 bottom-8 -translate-x-1/2 w-32 h-7 rounded-full"
                  style={cosmeticStyles.background.floorStyle}
                />
              )}
              {s.characterImage ? (
                <img src={s.characterImage} alt="캐릭터" className="relative z-10 w-full h-full object-contain scale-[2.5]" />
              ) : (
                <span className="relative z-10 text-7xl opacity-40">👤</span>
              )}
            </div>
            <div className="p-3 text-center w-full">
              <div className="text-xs font-bold text-amber-500 bg-amber-50 rounded-full px-2 py-0.5 inline-block mb-1">
                Lv.{s.level || 1}
              </div>
              <div className="text-sm font-bold text-slate-700 truncate w-full">
                {s.name || s.studentCode || '-'}
              </div>
              {s.name && <div className="text-xs text-slate-400 truncate w-full">{s.studentCode}</div>}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
