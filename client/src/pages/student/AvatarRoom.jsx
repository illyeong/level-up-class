import React, { useState, useEffect } from 'react';

function AvatarRoom() {
  // 선생님의 DB 연동 전 임시 테스트용 초기 다이아
  const [myDiamonds, setMyDiamonds] = useState(9999);

  useEffect(() => {
    // 유니티(iframe)에서 날아오는 '우체부'를 기다리는 리스너입니다.
    const handleUnityMessage = (event) => {
      // 우리가 보낸 "UNITY_PURCHASE" 암호가 맞는지 확인
      if (event.data && event.data.type === "UNITY_PURCHASE") {
        const { cost, equipment } = event.data;
        
        console.log("🔥 유니티 결제 신호 도착! 비용:", cost, "장비:", equipment);

        // 다이아 차감!
        setMyDiamonds((prevDiamonds) => prevDiamonds - cost);
        
        alert(`저장 완료! ${cost} 다이아가 차감되었습니다.`);
        // TODO: 나중에 여기서 axios.post('/api/saveAvatar', { equipment }) 등으로 DB에 저장하면 됩니다.
      }
    };

    // 창에 리스너 부착
    window.addEventListener("message", handleUnityMessage);

    // 컴포넌트가 꺼질 때 리스너 제거 (메모리 누수 방지)
    return () => {
      window.removeEventListener("message", handleUnityMessage);
    };
  }, []);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 🌟 상단 다이아 UI */}
      <div className="flex justify-between items-center p-4 border-b">
        <h2 className="text-xl font-bold text-slate-800">👕 아바타 상점</h2>
        <div className="font-bold text-blue-600 bg-blue-50 px-4 py-2 rounded-full">
          💎 내 다이아: {myDiamonds.toLocaleString()}
        </div>
      </div>

      {/* 🌟 유니티 iframe 화면 */}
      <div className="flex-1 w-full relative">
        <iframe
          title="Avatar Game"
          src="/avatar_game/index.html" /* 선생님의 실제 index.html 경로 */
          style={{ width: "100%", height: "100%", border: "none" }}
        />
      </div>
    </div>
  );
}

export default AvatarRoom;