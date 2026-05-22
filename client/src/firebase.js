// src/firebase.js

// 👇 이 3줄이 맨 위에 반드시 있어야 합니다!

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore"; // 👈 이 녀석이 빠져서 난 에러입니다!
import { getAuth, GoogleAuthProvider } from "firebase/auth";

// 선생님의 실제 Firebase 설정값
const firebaseConfig = 
{
  apiKey: "AIzaSyCpOf86UP1nA2-MzvMxjglomdMG8y6xS9I",
  authDomain: "level-up-class.firebaseapp.com",
  projectId: "level-up-class",
  storageBucket: "level-up-class.firebasestorage.app",
  messagingSenderId: "1095450799104",
  appId: "1:1095450799104:web:650aea6a8afd352d257ce5",
  measurementId: "G-E5VF05T6NE"
};

// 초기화 및 내보내기
const app = initializeApp(firebaseConfig);
export const db           = getFirestore(app);
export const auth         = getAuth(app);
export const googleProvider = new GoogleAuthProvider();