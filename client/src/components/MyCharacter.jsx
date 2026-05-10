import React from 'react';
import { useTranslation } from 'react-i18next';

export default function MyCharacter() {
  const { t } = useTranslation();

  // 테스트용 학생 더미 데이터 (추후 API 연동 시 상태로 관리)
  const studentData = {
    name: '김학생',
    level: 12,
    exp: 450,
    maxExp: 1000,
    gold: 9999,
    diamond: 9999,
    equipped: {
      head: { id: 1, name: '초보자 모자', icon: '🧢' },
      body: { id: 2, name: '튼튼한 교복', icon: '👕' },
      weapon: { id: 3, name: '나무 지팡이', icon: '🪄' },
      pet: null, // 장착하지 않은 슬롯
    }
  };

  const expPercentage = (studentData.exp / studentData.maxExp) * 100;

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto w-full">
      {/* 페이지 타이틀 */}
      <h1 className="text-3xl font-bold text-slate-800 mb-6 drop-shadow-sm">
        {t('character.title')}
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* 왼쪽 패널: 캐릭터 정보 및 경험치 */}
        <div className="lg:col-span-1 bg-white rounded-3xl shadow-lg border border-slate-100 p-8 flex flex-col items-center justify-center transform transition-all hover:-translate-y-1 hover:shadow-xl">
          
          {/* 아바타 이미지 영역 */}
          <div className="relative w-40 h-40 mb-6">
            <div className="absolute inset-0 bg-indigo-100 rounded-full animate-pulse opacity-50"></div>
            {/* 임시 아바타 플레이스홀더 (추후 준비하신 PNG 파일로 교체하세요) */}
            <div className="relative w-full h-full bg-indigo-50 border-4 border-indigo-300 rounded-full flex items-center justify-center text-6xl shadow-inner">
              🧑‍🎓
            </div>
            {/* 레벨 뱃지 */}
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-400 to-orange-500 text-white px-4 py-1 rounded-full font-bold text-sm shadow-md border-2 border-white whitespace-nowrap">
              {t('character.level', { level: studentData.level })}
            </div>
          </div>

          <h2 className="text-2xl font-bold text-slate-800 mb-6">{studentData.name}</h2>

          {/* 경험치 바 (EXP) */}
          <div className="w-full">
            <div className="flex justify-between text-sm font-bold text-slate-500 mb-2">
              <span>{t('character.exp')}</span>
              <span>{studentData.exp} / {studentData.maxExp}</span>
            </div>
            <div className="w-full h-5 bg-slate-100 rounded-full overflow-hidden shadow-inner border border-slate-200">
              <div 
                className="h-full bg-gradient-to-r from-emerald-400 to-green-500 rounded-full transition-all duration-1000 ease-out relative"
                style={{ width: `${expPercentage}%` }}
              >
                {/* 경험치 바 반짝임 효과 */}
                <div className="absolute top-0 left-0 right-0 h-1/2 bg-white/30 rounded-t-full"></div>
              </div>
            </div>
          </div>
        </div>

        {/* 오른쪽 패널: 재화 및 장비/인벤토리 */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          
          {/* 재화 (골드, 다이아) 카드 영역 */}
          <div className="grid grid-cols-2 gap-4">
            {/* 골드 카드 */}
            <div className="bg-white rounded-3xl shadow-md border border-slate-100 p-6 flex items-center justify-between hover:scale-[1.02] transition-transform cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center text-2xl shadow-sm">
                  🪙
                </div>
                <span className="text-lg font-bold text-slate-600">{t('character.gold')}</span>
              </div>
              <span className="text-3xl font-extrabold text-amber-500">
                {studentData.gold.toLocaleString()}
              </span>
            </div>

            {/* 다이아 카드 */}
            <div className="bg-white rounded-3xl shadow-md border border-slate-100 p-6 flex items-center justify-between hover:scale-[1.02] transition-transform cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-cyan-100 rounded-full flex items-center justify-center text-2xl shadow-sm">
                  💎
                </div>
                <span className="text-lg font-bold text-slate-600">{t('character.diamond')}</span>
              </div>
              <span className="text-3xl font-extrabold text-cyan-500">
                {studentData.diamond.toLocaleString()}
              </span>
            </div>
          </div>

          {/* 장착 중인 아이템 영역 */}
          <div className="bg-white rounded-3xl shadow-lg border border-slate-100 p-8 flex-grow">
            <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
              🎒 {t('character.equipment')}
            </h3>
            
            {/* 아이템 슬롯 그리드 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {['head', 'body', 'weapon', 'pet'].map((slotKey) => {
                const item = studentData.equipped[slotKey];
                
                return (
                  <div key={slotKey} className="flex flex-col items-center gap-2">
                    {/* 슬롯 박스 */}
                    <div className="w-full aspect-square bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl flex items-center justify-center text-4xl hover:border-indigo-400 hover:bg-indigo-50 transition-colors cursor-pointer relative group">
                      {item ? (
                        <div className="animate-bounce-short">{item.icon}</div>
                      ) : (
                        <span className="text-slate-200 text-sm font-medium">
                          {t('character.emptySlot')}
                        </span>
                      )}
                      
                      {/* 아이템 툴팁 (마우스 오버 시 표시) */}
                      {item && (
                        <div className="absolute -top-10 bg-slate-800 text-white text-xs px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                          {item.name}
                        </div>
                      )}
                    </div>
                    {/* 슬롯 이름 */}
                    <span className="text-slate-500 font-bold text-sm">
                      {t(`character.slot.${slotKey}`)}
                    </span>
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