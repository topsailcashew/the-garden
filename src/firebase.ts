import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";

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

const auth = getAuth(app);

// Invisible anonymous sign-in: gives every device a stable auth identity so we
// can later tighten Firestore rules to require authentication. Best-effort —
// if the Anonymous provider isn't enabled yet, we log and carry on (current
// open rules mean the app keeps working either way, so this can't break it).
export const authReady: Promise<string | null> = new Promise((resolve) => {
  const unsub = onAuthStateChanged(auth, (user) => {
    if (user) {
      unsub();
      resolve(user.uid);
    }
  });
  signInAnonymously(auth).catch((err) => {
    console.warn("[auth] anonymous sign-in unavailable:", err?.code || err);
    resolve(null);
  });
});

export { db, auth };
