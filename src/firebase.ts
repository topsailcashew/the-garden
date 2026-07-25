import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCs0W-A0IvOucRJgj-tue1JaUHNG_7Jsfo",
  authDomain: "gen-lang-client-0795968464.firebaseapp.com",
  projectId: "gen-lang-client-0795968464",
  storageBucket: "gen-lang-client-0795968464.firebasestorage.app",
  messagingSenderId: "1045127652739",
  appId: "1:1045127652739:web:0d69f56d2943e9f36c82b6"
};

const app = initializeApp(firebaseConfig);

// Persistent IndexedDB cache: subsequent loads render instantly from cache
// while the network revalidates in the background, so the app feels snappy.
const db = initializeFirestore(
  app,
  { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) },
  "the-garden"
);

export { db };
