import React from 'react';

export default function AvatarRoom() {
  return (
    <div className="flex flex-col w-full h-full bg-slate-50 p-6">
      
      {/* 상단 헤더 영역 (필요에 따라 수정하세요) */}
      <div className="flex justify-between items-center mb-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
        <h2 className="text-2xl font-bold text-slate-800">👕 아바타 상점</h2>
        <div className="flex items-center gap-2 bg-blue-50 px-4 py-2 rounded-full">
          <span>💎</span>
          <span className="font-bold text-blue-600">내 다이아: 9,999</span>
        </div>
      </div>

      {/* 🌟 유니티 WebGL iframe 영역 🌟 */}
      <div className="flex-grow w-full bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden relative">
        {/* public 폴더에 넣었기 때문에 src 속성에 '/avatar_game/index.html' 이라고만 적으면 
          리액트가 알아서 최상위 경로(public)에서 파일을 찾아옵니다!
        */}
        <iframe
          src="/avatar_game/index.html"
          title="Unity Avatar Maker"
          className="absolute top-0 left-0 w-full h-full border-none"
          allowFullScreen
          allow="autoplay"
        ></iframe>
        
      </div>

    </div>
  );
}