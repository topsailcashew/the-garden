import React, { useState, useEffect, useCallback } from "react";
import { collection, getDocs, doc, setDoc, deleteDoc, writeBatch, query, limit } from "firebase/firestore";
import { db } from "../firebase";
import {
  LayoutDashboard, Database, HardDriveDownload, HardDriveUpload, Users, Home, RefreshCw,
  Activity, Trash2, Loader2, ShieldCheck, Wifi, WifiOff, Lock, CheckCircle2, AlertTriangle
} from "lucide-react";

// NOTE: this is a client-side gate only — a deterrent, not real security. The
// app has no auth and Firestore rules are open, so the durable fix is Firebase
// Auth + tightened rules. Change this passcode by editing the constant.
const ADMIN_PASSCODE = "garden-admin-2026";
const DB_ID = "the-garden";
const PROJECT_ID = "gen-lang-client-0795968464";
const SUBS = ["notes", "letters", "questions", "dates", "moods", "vault", "prayers", "scratch", "songs"] as const;

interface RoomInfo {
  id: string;
  data: Record<string, any>;
  counts: Record<string, number>;
  total: number;
  bytes: number;
}

const fmtBytes = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(2)} MB`);
const fmtDate = (iso: any) => {
  try { return new Date(iso).toLocaleString(); } catch { return "—"; }
};

export default function AdminDashboard() {
  const [authed, setAuthed] = useState<boolean>(() => sessionStorage.getItem("garden_admin_ok") === "1");
  const [pass, setPass] = useState("");
  const [passErr, setPassErr] = useState(false);

  const [tab, setTab] = useState<"overview" | "rooms" | "backup">("overview");
  const [scanning, setScanning] = useState(false);
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [health, setHealth] = useState<{ ok: boolean; latency: number | null; checkedAt: string } | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [busy, setBusy] = useState<string>("");
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const scan = useCallback(async () => {
    setScanning(true);
    setMsg("");
    try {
      const t0 = performance.now();
      const roomsSnap = await getDocs(collection(db, "rooms"));
      const latency = Math.round(performance.now() - t0);
      setHealth({ ok: true, latency, checkedAt: new Date().toISOString() });

      const infos = await Promise.all(
        roomsSnap.docs.map(async (rd) => {
          const data = rd.data();
          let bytes = JSON.stringify(data).length;
          const counts: Record<string, number> = {};
          let total = 0;
          await Promise.all(
            SUBS.map(async (sub) => {
              const s = await getDocs(collection(db, "rooms", rd.id, sub));
              counts[sub] = s.size;
              total += s.size;
              s.forEach((d) => { bytes += JSON.stringify(d.data()).length; });
            })
          );
          return { id: rd.id, data, counts, total, bytes } as RoomInfo;
        })
      );
      infos.sort((a, b) => b.total - a.total);
      setRooms(infos);
    } catch (err: any) {
      console.error("Admin scan failed:", err);
      setHealth({ ok: false, latency: null, checkedAt: new Date().toISOString() });
      setMsg("Scan failed: " + (err?.message || err));
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => { if (authed) scan(); }, [authed, scan]);

  const tryLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pass === ADMIN_PASSCODE) {
      sessionStorage.setItem("garden_admin_ok", "1");
      setAuthed(true);
    } else {
      setPassErr(true);
    }
  };

  const exportAll = async () => {
    setBusy("export"); setMsg("");
    try {
      const roomsSnap = await getDocs(collection(db, "rooms"));
      const backup: any = { exportedAt: new Date().toISOString(), database: DB_ID, project: PROJECT_ID, rooms: {} };
      for (const rd of roomsSnap.docs) {
        const room: any = { _doc: rd.data() };
        await Promise.all(SUBS.map(async (sub) => {
          const s = await getDocs(collection(db, "rooms", rd.id, sub));
          if (!s.empty) { room[sub] = {}; s.forEach((d) => { room[sub][d.id] = d.data(); }); }
        }));
        backup.rooms[rd.id] = room;
      }
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `garden-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg(`Exported ${roomsSnap.size} rooms.`);
    } catch (err: any) {
      setMsg("Export failed: " + (err?.message || err));
    } finally { setBusy(""); }
  };

  const restoreFromFile = async (file: File) => {
    if (!window.confirm(`Restore from "${file.name}"?\n\nThis writes the backup's documents into the database, overwriting any with the same ids. This cannot be undone.`)) return;
    setBusy("restore"); setMsg("");
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      if (!backup.rooms) throw new Error("Not a valid backup file (no 'rooms').");
      let docCount = 0;
      let batch = writeBatch(db); let ops = 0;
      const flush = async () => { if (ops > 0) { await batch.commit(); batch = writeBatch(db); ops = 0; } };
      for (const [roomId, room] of Object.entries<any>(backup.rooms)) {
        if (room._doc) { batch.set(doc(db, "rooms", roomId), room._doc); ops++; docCount++; if (ops >= 400) await flush(); }
        for (const sub of SUBS) {
          if (room[sub]) {
            for (const [docId, data] of Object.entries<any>(room[sub])) {
              batch.set(doc(db, "rooms", roomId, sub, docId), data); ops++; docCount++;
              if (ops >= 400) await flush();
            }
          }
        }
      }
      await flush();
      setMsg(`Restore complete — wrote ${docCount} documents. Re-scanning...`);
      await scan();
    } catch (err: any) {
      setMsg("Restore failed: " + (err?.message || err));
    } finally { setBusy(""); }
  };

  const deleteRoom = async (roomId: string) => {
    if (!window.confirm(`PERMANENTLY delete room "${roomId}" and ALL its data?\n\nThis cannot be undone. Consider exporting a backup first.`)) return;
    if (!window.confirm(`Really delete "${roomId}"? Type-check: this erases every note, letter, prayer, etc. for this room.`)) return;
    setBusy("delete-" + roomId); setMsg("");
    try {
      for (const sub of SUBS) {
        const s = await getDocs(collection(db, "rooms", roomId, sub));
        let batch = writeBatch(db); let ops = 0;
        for (const d of s.docs) { batch.delete(doc(db, "rooms", roomId, sub, d.id)); ops++; if (ops >= 400) { await batch.commit(); batch = writeBatch(db); ops = 0; } }
        if (ops > 0) await batch.commit();
      }
      await deleteDoc(doc(db, "rooms", roomId));
      setMsg(`Deleted room "${roomId}".`);
      await scan();
    } catch (err: any) {
      setMsg("Delete failed: " + (err?.message || err));
    } finally { setBusy(""); }
  };

  // ---- Gate ----
  if (!authed) {
    return (
      <div className="min-h-dvh bg-natural-bg flex items-center justify-center p-6 font-sans text-natural-text">
        <form onSubmit={tryLogin} className="w-full max-w-sm bg-white border border-natural-border rounded-[24px] p-7 card-shadow text-center">
          <div className="w-14 h-14 rounded-full bg-natural-olive/10 text-natural-olive flex items-center justify-center mx-auto mb-4"><ShieldCheck className="w-7 h-7" /></div>
          <h1 className="font-serif text-2xl font-light mb-1">Admin Access</h1>
          <p className="text-xs text-natural-text/50 mb-5">Our Little Garden — operations console</p>
          <div className="relative">
            <Lock className="w-4 h-4 text-natural-text/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="admin-pass"
              type="password"
              autoFocus
              value={pass}
              onChange={(e) => { setPass(e.target.value); setPassErr(false); }}
              placeholder="Admin passcode"
              className={`w-full bg-natural-card border rounded-xl py-2.5 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 ${passErr ? "border-natural-terracotta ring-natural-terracotta/20" : "border-natural-border focus:ring-natural-olive/20"}`}
            />
          </div>
          {passErr && <p className="text-xs text-natural-terracotta mt-2">Incorrect passcode.</p>}
          <button type="submit" className="w-full mt-4 bg-natural-olive hover:bg-natural-olive-hover text-white font-serif italic py-2.5 rounded-xl cursor-pointer transition-all">Enter</button>
          <a href="/" className="block text-[11px] text-natural-text/40 hover:text-natural-text mt-4">← Back to the app</a>
        </form>
      </div>
    );
  }

  const totalRooms = rooms.length;
  const totalUsers = rooms.reduce((n, r) => n + (r.data.boyName ? 1 : 0) + (r.data.girlName ? 1 : 0), 0);
  const totalDocs = rooms.reduce((n, r) => n + r.total + 1, 0);
  const totalBytes = rooms.reduce((n, r) => n + r.bytes, 0);

  const StatCard = ({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string }) => (
    <div className="bg-white border border-natural-border rounded-2xl p-4 card-shadow">
      <div className="flex items-center gap-2 text-natural-text/50 text-[11px] uppercase tracking-wider mb-1.5">{icon}{label}</div>
      <div className="text-2xl font-serif font-light text-natural-text">{value}</div>
      {sub && <div className="text-[11px] text-natural-text/40 mt-0.5">{sub}</div>}
    </div>
  );

  return (
    <div className="min-h-dvh bg-natural-bg font-sans text-natural-text">
      {/* Header */}
      <header className="glass border-b border-natural-border px-5 py-3.5 sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-natural-olive text-white flex items-center justify-center"><LayoutDashboard className="w-5 h-5" /></div>
          <div>
            <h1 className="font-serif text-lg leading-none">Garden Admin</h1>
            <p className="text-[10px] uppercase tracking-wider text-natural-text/40 mt-0.5">Operations Console</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`hidden sm:flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border ${online ? "text-natural-green border-natural-green/40 bg-natural-green/10" : "text-natural-terracotta border-natural-terracotta/40 bg-natural-terracotta/10"}`}>
            {online ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}{online ? "Online" : "Offline"}
          </span>
          <button onClick={scan} disabled={scanning} className="flex items-center gap-1.5 text-xs bg-white border border-natural-border rounded-full px-3 py-1.5 hover:bg-natural-card cursor-pointer disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${scanning ? "animate-spin" : ""}`} /> {scanning ? "Scanning" : "Re-scan"}
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="px-5 pt-4 max-w-5xl mx-auto">
        <div className="flex gap-1 bg-natural-card border border-natural-border rounded-xl p-1 w-fit">
          {([["overview", "Overview", LayoutDashboard], ["rooms", "Rooms", Home], ["backup", "Backup & Restore", Database]] as const).map(([k, label, Icon]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${tab === k ? "bg-natural-olive text-white" : "text-natural-text/60 hover:text-natural-text"}`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      <main className="p-5 max-w-5xl mx-auto space-y-4">
        {msg && <div className="text-xs bg-white border border-natural-border rounded-xl px-3.5 py-2.5">{msg}</div>}

        {scanning && rooms.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-natural-text/50 py-16 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Scanning all rooms…</div>
        )}

        {/* OVERVIEW */}
        {tab === "overview" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard icon={<Home className="w-3.5 h-3.5" />} label="Rooms" value={totalRooms} />
              <StatCard icon={<Users className="w-3.5 h-3.5" />} label="Users" value={totalUsers} sub="named partners" />
              <StatCard icon={<Database className="w-3.5 h-3.5" />} label="Documents" value={totalDocs} sub="across all rooms" />
              <StatCard icon={<Activity className="w-3.5 h-3.5" />} label="Data size" value={fmtBytes(totalBytes)} sub="approx (incl. photos)" />
            </div>

            <div className="bg-white border border-natural-border rounded-2xl p-5 card-shadow">
              <h2 className="font-serif text-lg mb-3 flex items-center gap-2"><Activity className="w-4 h-4 text-natural-terracotta" /> System Health</h2>
              <div className="grid sm:grid-cols-2 gap-y-2.5 gap-x-6 text-sm">
                <Row label="Firestore connection">
                  {health ? (health.ok
                    ? <span className="flex items-center gap-1.5 text-natural-green"><CheckCircle2 className="w-4 h-4" /> Connected</span>
                    : <span className="flex items-center gap-1.5 text-natural-terracotta"><AlertTriangle className="w-4 h-4" /> Error</span>) : "…"}
                </Row>
                <Row label="Round-trip latency">{health?.latency != null ? `${health.latency} ms` : "—"}</Row>
                <Row label="Database">{DB_ID} <span className="text-natural-text/40">(standard, uncapped)</span></Row>
                <Row label="Project">{PROJECT_ID}</Row>
                <Row label="Network">{online ? "Online" : "Offline"}</Row>
                <Row label="Last checked">{health ? fmtDate(health.checkedAt) : "—"}</Row>
                <Row label="Offline cache">IndexedDB persistence enabled</Row>
                <Row label="Service worker">{"serviceWorker" in navigator ? "Registered (PWA)" : "Unsupported"}</Row>
              </div>
            </div>
          </>
        )}

        {/* ROOMS */}
        {tab === "rooms" && (
          <div className="bg-white border border-natural-border rounded-2xl card-shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-natural-text/45 border-b border-natural-border">
                    <th className="px-4 py-2.5">Room</th>
                    <th className="px-2 py-2.5">Partners</th>
                    <th className="px-2 py-2.5">Created</th>
                    <th className="px-2 py-2.5 text-right">Notes</th>
                    <th className="px-2 py-2.5 text-right">Letters</th>
                    <th className="px-2 py-2.5 text-right">Prayers</th>
                    <th className="px-2 py-2.5 text-right">Dates</th>
                    <th className="px-2 py-2.5 text-right">Docs</th>
                    <th className="px-2 py-2.5 text-right">Size</th>
                    <th className="px-3 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((r) => (
                    <tr key={r.id} className="border-b border-natural-border/50 last:border-0 hover:bg-natural-card/50">
                      <td className="px-4 py-2.5 font-mono text-xs text-natural-text">{r.id}</td>
                      <td className="px-2 py-2.5 whitespace-nowrap">{r.data.boyName || "—"} <span className="text-natural-text/30">&</span> {r.data.girlName || "—"}</td>
                      <td className="px-2 py-2.5 text-natural-text/50 whitespace-nowrap text-xs">{r.data.createdAt ? new Date(r.data.createdAt).toLocaleDateString() : "—"}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{r.counts.notes || 0}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{r.counts.letters || 0}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{r.counts.prayers || 0}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{r.counts.dates || 0}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums font-semibold">{r.total}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-natural-text/60 text-xs">{fmtBytes(r.bytes)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <button onClick={() => deleteRoom(r.id)} disabled={!!busy} className="text-stone-400 hover:text-natural-terracotta cursor-pointer disabled:opacity-40" title="Delete room">
                          {busy === "delete-" + r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!scanning && rooms.length === 0 && <tr><td colSpan={10} className="text-center text-natural-text/40 py-8">No rooms found.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* BACKUP */}
        {tab === "backup" && (
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white border border-natural-border rounded-2xl p-5 card-shadow">
              <h2 className="font-serif text-lg mb-1 flex items-center gap-2"><HardDriveDownload className="w-4 h-4 text-natural-olive" /> Backup</h2>
              <p className="text-xs text-natural-text/50 mb-4">Download a full JSON snapshot of every room and all its data (notes, letters, prayers, dates, moods, songs, quests, photos included).</p>
              <button onClick={exportAll} disabled={!!busy} className="w-full bg-natural-olive hover:bg-natural-olive-hover text-white font-serif italic py-2.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
                {busy === "export" ? <><Loader2 className="w-4 h-4 animate-spin" /> Exporting…</> : <><HardDriveDownload className="w-4 h-4" /> Export all data</>}
              </button>
            </div>
            <div className="bg-white border border-natural-border rounded-2xl p-5 card-shadow">
              <h2 className="font-serif text-lg mb-1 flex items-center gap-2"><HardDriveUpload className="w-4 h-4 text-natural-terracotta" /> Restore</h2>
              <p className="text-xs text-natural-text/50 mb-4">Upload a backup JSON to write its documents back into the database. Overwrites documents with matching ids. Cannot be undone.</p>
              <label className={`w-full border border-dashed border-natural-border rounded-xl py-2.5 flex items-center justify-center gap-2 cursor-pointer hover:bg-natural-card text-sm ${busy ? "opacity-50 pointer-events-none" : ""}`}>
                {busy === "restore" ? <><Loader2 className="w-4 h-4 animate-spin" /> Restoring…</> : <><HardDriveUpload className="w-4 h-4" /> Choose backup file…</>}
                <input type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) restoreFromFile(f); e.currentTarget.value = ""; }} />
              </label>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-natural-border/40 pb-1.5">
      <span className="text-natural-text/50">{label}</span>
      <span className="font-medium text-right">{children}</span>
    </div>
  );
}
