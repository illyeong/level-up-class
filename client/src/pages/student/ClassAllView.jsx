import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';

export default function ClassAllView({ studentCode }) {
  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        // 내 teacherUid 먼저 조회 → 같은 반 학생만 표시
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
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.studentCode || '').localeCompare(b.studentCode || ''));
        setStudents(list);
      } catch (e) { console.error(e); }
      finally { setIsLoading(false); }
    };
    load();
  }, [studentCode]);

  if (isLoading) return (
    <div className="flex items-center justify-center h-full text-slate-400 font-bold">
      불러오는 중...
    </div>
  );

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-slate-800 mb-6">👥 우리 반 전체 보기</h1>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-4">
        {students.map(s => (
          <div key={s.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col items-center">
            {/* 캐릭터 이미지 */}
            <div className="w-full h-28 bg-indigo-50 flex items-center justify-center overflow-hidden">
              {s.characterImage
                ? <img src={s.characterImage} alt="캐릭터" className="w-full h-full object-contain scale-[2.5]" />
                : <span className="text-4xl opacity-40">🧍</span>
              }
            </div>
            {/* 정보 */}
            <div className="p-2 text-center w-full">
              <div className="text-[10px] font-bold text-amber-500 bg-amber-50 rounded-full px-2 py-0.5 inline-block mb-1">
                Lv.{s.level || 1}
              </div>
              <div className="text-xs font-bold text-slate-700 truncate w-full">
                {s.name || s.studentCode || '?'}
              </div>
              {s.name && (
                <div className="text-[9px] text-slate-400 truncate w-full">{s.studentCode}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
