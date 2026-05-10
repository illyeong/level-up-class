import React from 'react';

const StudentDashboard = () => {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8 text-gray-800">🏰 학생 대시보드</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* 캐릭터 정보 카드 */}
        <div className="bg-white p-6 rounded-3xl shadow-lg border border-gray-100 text-center">
          <div className="w-32 h-32 bg-indigo-100 rounded-full mx-auto flex items-center justify-center text-5xl mb-4 border-4 border-white shadow-inner">
            🧑‍🎓
          </div>
          <h2 className="text-2xl font-bold">용감한 용사</h2>
          <p className="text-indigo-600 font-bold mb-4">Lv. 5</p>
          
          <div className="w-full bg-gray-200 h-3 rounded-full mb-6">
            <div className="bg-indigo-500 h-3 rounded-full" style={{width: '45%'}}></div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 p-3 rounded-2xl">
              <p className="text-sm text-blue-500 font-bold">다이아</p>
              <p className="font-bold text-xl">💎 15</p>
            </div>
            <div className="bg-yellow-50 p-3 rounded-2xl">
              <p className="text-sm text-yellow-600 font-bold">골드</p>
              <p className="font-bold text-xl">🪙 3,000</p>
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