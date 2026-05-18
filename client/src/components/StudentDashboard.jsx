import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';

const StudentDashboard = ({ studentCode }) => {
  const [studentData, setStudentData] = useState(null);
  const [isLoading, setIsLoading]     = useState(false);

  useEffect(() => {
    if (!studentCode) return;
    const load = async () => {
      setIsLoading(true);
      try {
        const q    = query(collection(db, 'students'), where('studentCode', '==', studentCode));
        const snap = await getDocs(q);
        if (!snap.empty) {
          setStudentData({ id: snap.docs[0].id, ...snap.docs[0].data() });
        }
      } catch (err) {
        console.error('학생 데이터 로딩 에러:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [studentCode]);

  const name     = studentData?.name     || studentData?.studentCode || '용감한 용사';
  const level    = studentData?.level    || 5;
  const exp      = studentData?.exp      || 0;
  const maxExp   = studentData?.maxExp   || 1000;
  const diamonds = studentData?.diamonds ?? 0;
  const gold     = studentData?.gold     ?? 0;
  const expPct   = Math.min(100, Math.round((exp / maxExp) * 100));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-400 font-bold">불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8 text-gray-800">🏰 학생 대시보드</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* 캐릭터 카드 */}
        <div className="bg-white p-6 rounded-3xl shadow-lg border border-gray-100 text-center">
          <div className="w-full h-52 mx-auto flex items-center justify-center mb-4 relative bg-indigo-50 rounded-2xl overflow-hidden border border-indigo-100">
            {studentData?.characterImage ? (
              <img
                src={studentData.characterImage}
                alt="내 캐릭터"
                className="w-full h-full object-contain scale-[3.5] drop-shadow-md"
                onError={e => { e.target.style.display = 'none'; }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-6xl">
                {studentData?.parts ? '🦸‍♂️' : '🧑‍🎓'}
              </div>
            )}
            {/* 레벨 뱃지 */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-400 to-orange-500 text-white px-3 py-0.5 rounded-full font-bold text-xs shadow-md border-2 border-white whitespace-nowrap">
              Lv. {level}
            </div>
          </div>

          <h2 className="text-xl font-bold mt-3 text-slate-800">{name}</h2>

          {/* EXP 바 */}
          <div className="mt-4 mb-5">
            <div className="flex justify-between text-xs text-slate-400 font-medium mb-1">
              <span>EXP</span>
              <span>{exp} / {maxExp}</span>
            </div>
            <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden">
              <div className="bg-indigo-500 h-3 rounded-full transition-all" style={{ width: `${expPct}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 p-3 rounded-2xl border border-blue-100">
              <p className="text-xs text-blue-500 font-bold mb-0.5">다이아</p>
              <p className="font-extrabold text-lg text-blue-700">💎 {diamonds.toLocaleString()}</p>
            </div>
            <div className="bg-yellow-50 p-3 rounded-2xl border border-yellow-100">
              <p className="text-xs text-yellow-600 font-bold mb-0.5">골드</p>
              <p className="font-extrabold text-lg text-amber-600">🪙 {gold.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* 퀘스트 요약 (우측) */}
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl shadow-lg border border-gray-100">
          <h3 className="text-xl font-bold mb-5 text-slate-800">📜 오늘의 퀘스트</h3>
          <div className="flex flex-col items-center justify-center h-40 text-slate-400">
            <span className="text-4xl mb-2">⚔️</span>
            <p className="font-bold">퀘스트 탭에서 확인하세요</p>
            <p className="text-sm mt-1">일일 퀘스트와 주간 퀘스트를 완료해 보상을 받아요!</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;
