
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getMessaging, isSupported } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyCSDdPaACXeTpupdbitnoNTfe0tbr67Qf8",
  authDomain: "heartly-d5ea0.firebaseapp.com",
  projectId: "heartly-d5ea0",
  storageBucket: "heartly-d5ea0.firebasestorage.app",
  messagingSenderId: "971471751446",
  appId: "1:971471751446:web:255cad0aa011ddc8252837"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Initialize Messaging conditionally (supported in browser environments)
export const messaging = async () => {
  try {
    const isSupportedBrowser = await isSupported();
    if (isSupportedBrowser) {
      return getMessaging(app);
    }
    return null;
  } catch (err) {
    console.error("Firebase Messaging not supported", err);
    return null;
  }
};
