import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCs0W-A0IvOucRJgj-tue1JaUHNG_7Jsfo",
  authDomain: "gen-lang-client-0795968464.firebaseapp.com",
  projectId: "gen-lang-client-0795968464",
  storageBucket: "gen-lang-client-0795968464.firebasestorage.app",
  messagingSenderId: "1045127652739",
  appId: "1:1045127652739:web:0d69f56d2943e9f36c82b6"
};

const app = initializeApp(firebaseConfig);

// Initialize with the custom Firestore database ID using getFirestore
const db = getFirestore(app, "ai-studio-courtshipjournal-5c5f10ff-7592-4e25-a368-e6c026b00ec8");

export { db };
