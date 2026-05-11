import React, { useState, useEffect, useRef } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase'; // ⚠️ 실제 firebase.js 경로 확인!

function AvatarRoom() {
  const [myDiamonds, setMyDiamonds] = useState(0);
  const iframeRef = useRef(null);
  
  // 🌟 핵심 해결책: 이벤트 리스너 안에서 최신 다이아 값을 안전하게 읽기 위한 Ref
  const diamondsRef = useRef(0); 

  // 학생 UID (임시)
  const studentUid = localStorage.getItem('currentStudentUid') || "test_student_01";

  // 화면의 다이아가 바뀔 때마다 Ref 값도 조용히 최신 상태로 맞춰줍니다.
  useEffect(() => {
    diamondsRef.current = myDiamonds;
  }, [myDiamonds]);

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

          if (iframeRef.current && data.parts) {
            iframeRef.current.contentWindow.postMessage({
              type: "REACT_LOAD_AVATAR",
              parts: data.parts
            }, "*");
          }
        } else {
          console.log("학생 데이터가 없습니다. (새 계정)");
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
    const handleUnityMessage = async (event) => {
      if (event.data && event.data.type === "UNITY_PURCHASE") {
        const { cost, equipment } = event.data;
        console.log("🔥 유니티 결제 신호 도착! 비용:", cost, "장비:", equipment);

        // 1. Ref를 사용해 아주 안전하게 '현재 최신 다이아몬드'를 가져와 계산합니다.
        const currentDiamonds = diamondsRef.current;
        const newDiamonds = currentDiamonds - cost;

        // 2. 화면의 다이아를 깎아줍니다. (단순 계산만 수행!)
        setMyDiamonds(newDiamonds);

        // 3. DB 영구 저장은 상태 업데이트와 완전히 분리하여 독립적으로 실행합니다.
        try {
          const docRef = doc(db, "students", studentUid);
          await updateDoc(docRef, {
            diamonds: newDiamonds,    
            parts: equipment          
          });
          
          console.log(`💾 DB 영구 저장 완료! 남은 다이아: ${newDiamonds}`);
          alert(`저장 완료! ${cost} 다이아가 차감되었습니다.`);
        } catch (error) {
          console.error("DB 저장 에러:", error);
          alert("데이터 저장에 실패했습니다. 인터넷 연결을 확인해주세요.");
        }
      }
    };

    // 이벤트 리스너 부착
    window.addEventListener("message", handleUnityMessage);
    
    // 클린업 함수 (컴포넌트 종료 시 리스너 제거)
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
          ref={iframeRef}
          title="Avatar Game"
          src="/avatar_game/index.html" 
          style={{ width: "100%", height: "100%", border: "none" }}
        />
      </div>
    </div>
  );
}

export default AvatarRoom;