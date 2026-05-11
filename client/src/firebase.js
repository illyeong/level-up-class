// src/firebase.js

// 👇 이 3줄이 맨 위에 반드시 있어야 합니다!
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore"; // 👈 이 녀석이 빠져서 난 에러입니다!
import { getAuth } from "firebase/auth";

// 선생님의 실제 Firebase 설정값
const firebaseConfig = {
  apiKey: "선생님의_API_KEY",
  authDomain: "level-up-class.firebaseapp.com",
  projectId: "level-up-class",
  storageBucket: "level-up-class.appspot.com",
  messagingSenderId: "선생님의_SENDER_ID",
  appId: "선생님의_APP_ID"
};

// 초기화 및 내보내기
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);