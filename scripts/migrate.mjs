// One-off migration: copy every room and all its subcollections from the old
// AI-Studio (capped) database into the new standard "the-garden" database.
// Uses the app's own Firebase client config; both databases have open rules.
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, writeBatch } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCs0W-A0IvOucRJgj-tue1JaUHNG_7Jsfo",
  authDomain: "gen-lang-client-0795968464.firebaseapp.com",
  projectId: "gen-lang-client-0795968464",
  storageBucket: "gen-lang-client-0795968464.firebasestorage.app",
  messagingSenderId: "1045127652739",
  appId: "1:1045127652739:web:0d69f56d2943e9f36c82b6"
};

const SRC_ID = "ai-studio-courtshipjournal-5c5f10ff-7592-4e25-a368-e6c026b00ec8";
const DST_ID = "the-garden";

// Every subcollection the app writes under rooms/{roomId}.
const SUBS = ["notes", "letters", "questions", "dates", "moods", "vault", "prayers", "scratch", "songs"];

const app = initializeApp(firebaseConfig);
const SRC = getFirestore(app, SRC_ID);
const DST = getFirestore(app, DST_ID);

async function copyCollection(srcColl, dstColl) {
  const snap = await getDocs(srcColl);
  let batch = writeBatch(DST);
  let ops = 0;
  for (const d of snap.docs) {
    batch.set(doc(dstColl, d.id), d.data());
    ops++;
    if (ops >= 400) { await batch.commit(); batch = writeBatch(DST); ops = 0; }
  }
  if (ops > 0) await batch.commit();
  return snap.size;
}

async function main() {
  const roomsSnap = await getDocs(collection(SRC, "rooms"));
  const summary = {};
  for (const roomDoc of roomsSnap.docs) {
    const rid = roomDoc.id;
    const b = writeBatch(DST);
    b.set(doc(DST, "rooms", rid), roomDoc.data());
    await b.commit();
    const counts = { _room: 1 };
    for (const sub of SUBS) {
      const n = await copyCollection(collection(SRC, "rooms", rid, sub), collection(DST, "rooms", rid, sub));
      if (n) counts[sub] = n;
    }
    summary[rid] = counts;
  }
  console.log("MIGRATION SUMMARY:\n" + JSON.stringify(summary, null, 2));
  console.log("ROOMS:", roomsSnap.size);
  process.exit(0);
}

main().catch((e) => { console.error("MIGRATION ERROR:", e); process.exit(1); });
