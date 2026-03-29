/**
 * PARADOX - FIREBASE FOUNDATION
 */

// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDbU2GGI-w5T1p-NA3bJ7_ULjqq-P_k2Z8",
  authDomain: "paradox-489b5.firebaseapp.com",
  projectId: "paradox-489b5",
  storageBucket: "paradox-489b5.firebasestorage.app",
  messagingSenderId: "287620619857",
  appId: "1:287620619857:web:4824932c7e62d52cf22270",
  measurementId: "G-HEFXT0156D"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const provider = new GoogleAuthProvider();

// Export for other modules
export { app, auth, db, storage, provider };
