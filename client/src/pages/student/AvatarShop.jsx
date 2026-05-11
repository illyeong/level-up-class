import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase'; // ⚠️ 실제 firebase.js 경로 확인!

function AvatarRoom() {
  const [myDiamonds, setMyDiamonds] = useState(0);
  const studentUid = localStorage.getItem('currentStudentUid') || "test_student_01";

  // =====================================================================
  // [목표 2] 접속 시 DB에서 데이터 불러오기 및 유니티로 전송
  // =====================================================================
  useEffect(() => {
    const loadUserData = async () => {
      try {
        const docRef = doc(db, "students", studentUid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          setMyDiamonds(data.diamonds); 
          console.log("📥 DB 데이터 불러오기 성공:", data);

          // 🌟 해결책 1: useRef 대신 확실한 ID 값으로 iframe 찾기
          const iframe = document.getElementById("avatar-iframe");
          if (iframe && data.parts) {
            iframe.contentWindow.postMessage({
              type: "REACT_LOAD_AVATAR",
              parts: data.parts
            }, "*");
          }
        } else {
          setMyDiamonds(9999);
        }
      } catch (error) {
        console.error("데이터 불러오기 에러:", error);
      }
    };

    loadUserData();
  }, [studentUid]);


  // =====================================================================
  // [목표 1] 유니티 결제 신호 수신 시 -> 다이아 차감 및 DB 영구 저장
  // =====================================================================
  useEffect(() => {
    const handleUnityMessage = (event) => {
      if (event.data && event.data.type === "UNITY_PURCHASE") {
        const { cost, equipment } = event.data;
        
        // 🌟 해결책 2: useRef 없이 React의 기본 기능(prev)으로 최신 다이아 안전하게 계산
        setMyDiamonds((prevDiamonds) => {
          const newDiamonds = prevDiamonds - cost;

          // 비동기 DB 저장을 State 업데이트 로직과 분리하여 뒤에서 조용히 실행
          updateDoc(doc(db, "students", studentUid), {
            diamonds: newDiamonds,    
            parts: equipment          
          }).then(() => {
            console.log(`💾 DB 영구 저장 완료! 남은 다이아: ${newDiamonds}`);
            alert(`저장 완료! ${cost} 다이아가 차감되었습니다.`);
          }).catch((error) => {
            console.error("DB 저장 에러:", error);
          });
          
          return newDiamonds; // 화면의 다이아 즉시 깎임
        });
      }
    };

    window.addEventListener("message", handleUnityMessage);
    return () => {
      window.removeEventListener("message", handleUnityMessage);
    };
  }, [studentUid]); 

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 🌟 상단 다이아 UI */}
      <div className="flex justify-between items-center p-4 border-b">
        <h2 className="text-xl font-bold text-slate-800">👕 아바타 상점</h2>
        <div className="font-bold text-blue-600 bg-blue-50 px-4 py-2 rounded-full shadow-sm">
          💎 내 다이아: {myDiamonds.toLocaleString()}
        </div>
      </div>

      {/* 🌟 유니티 iframe 화면 */}
      <div className="flex-1 w-full relative bg-slate-100">
        <iframe
          id="avatar-iframe" /* 👈 useRef를 없애고 ID를 달아주었습니다! */
          title="Avatar Game"
          src="/avatar_game/index.html" 
          style={{ width: "100%", height: "100%", border: "none" }}
        />
      </div>
    </div>
  );
}

export default AvatarRoom;