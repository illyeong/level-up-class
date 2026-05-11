// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCpOf86UP1nA2-MzvMxjglomdMG8y6xS9I",
  authDomain: "level-up-class.firebaseapp.com",
  projectId: "level-up-class",
  storageBucket: "level-up-class.firebasestorage.app",
  messagingSenderId: "1095450799104",
  appId: "1:1095450799104:web:650aea6a8afd352d257ce5",
  measurementId: "G-E5VF05T6NE"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const db = getFirestore(app);
export const auth = getAuth(app);