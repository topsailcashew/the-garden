import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { Room, UserSession } from "./types";
import Onboarding from "./components/Onboarding";
import LoveNotes from "./components/LoveNotes";
import DailyQuest from "./components/DailyQuest";
import DatePlanner from "./components/DatePlanner";
import Letters from "./components/Letters";
import { useConfirm } from "./components/ConfirmDialog";
import { useToast } from "./components/Toast";
import { Heart, Mail, Sparkles, Calendar, Feather, LogOut, Copy, Check, Eye, EyeOff, ChevronDown, Pencil, X as XIcon } from "lucide-react";
import { SKIN_TONES, withTone, stripTone, loadSkinToneMod, saveSkinToneKey } from "./skinTone";

const avatarOptions = ["🧑", "👩", "👨", "🧔", "👱‍♀️", "🤴", "👸", "🦊", "🐻", "🐰", "🌻", "🌙"];

export default function App() {
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [session, setSession] = useState<UserSession | null>(null);
  const [activeTab, setActiveTab] = useState<"notes" | "letters" | "quest" | "dates">("notes");
  const [copied, setCopied] = useState<boolean>(false);
  const [roomMeta, setRoomMeta] = useState<Partial<Room> | null>(null);
  const [codeRevealed, setCodeRevealed] = useState<boolean>(false);
  const [showProfileMenu, setShowProfileMenu] = useState<boolean>(false);
  const [isEditingName, setIsEditingName] = useState<boolean>(false);
  const [nameInput, setNameInput] = useState<string>("");
  const [savingName, setSavingName] = useState<boolean>(false);
  const [activeHug, setActiveHug] = useState<{ from: string } | null>(null);
  const [skinToneMod, setSkinToneMod] = useState<string>(() => loadSkinToneMod());

  useEffect(() => {
    // Check if user session exists in local storage
    const cached = localStorage.getItem("courtship_session");
    if (cached) {
      try {
        setSession(JSON.parse(cached));
      } catch (err) {
        console.error("Failed to parse cached session:", err);
      }
    }
  }, []);

  useEffect(() => {
    // Live subscription to the room doc so avatars, display names, and the
    // footer's "Est." date stay in sync when either partner changes them.
    if (!session) return;
    const roomRef = doc(db, "rooms", session.roomId);
    // A virtual hug is only revealed the *next time the recipient opens the app*
    // — not live while they're already in it. So we check for an unseen hug from
    // the partner on the first snapshot only, and remember it as seen so it
    // never replays. Hugs that arrive while the app is open are intentionally
    // left unseen, and will surface on the next open.
    let isInitialSnapshot = true;
    const seenKey = `courtship_hug_seen_${session.roomId}_${session.role}`;
    const unsubscribe = onSnapshot(
      roomRef,
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as Partial<Room>;
        setRoomMeta(data);

        if (isInitialSnapshot) {
          isInitialSnapshot = false;
          const hug = data.lastHug;
          if (hug?.nonce && hug.sender !== session.role && hug.nonce !== localStorage.getItem(seenKey)) {
            setActiveHug({ from: session.partnerName });
            localStorage.setItem(seenKey, hug.nonce);
          }
        }
      },
      (err) => console.error("Error syncing room metadata:", err)
    );
    return () => unsubscribe();
  }, [session]);

  useEffect(() => {
    // A virtual hug lingers on screen for 3 seconds, then fades away.
    if (!activeHug) return;
    const timeout = setTimeout(() => setActiveHug(null), 3000);
    return () => clearTimeout(timeout);
  }, [activeHug]);

  const handleOnboardingComplete = (newSession: UserSession) => {
    localStorage.setItem("courtship_session", JSON.stringify(newSession));
    // Remember the room (not the passcode) so switching users on this device
    // doesn't require retyping the room code every time.
    const boyName = newSession.role === "boy" ? newSession.name : newSession.partnerName;
    const girlName = newSession.role === "girl" ? newSession.name : newSession.partnerName;
    localStorage.setItem(
      "courtship_last_room",
      JSON.stringify({ roomId: newSession.roomId, boyName, girlName })
    );
    setSession(newSession);
  };

  const handleLogout = async () => {
    const confirmed = await confirm({
      title: "Exit your private courtyard?",
      message: "You'll be able to quickly switch back from the welcome screen without retyping your room code.",
      confirmLabel: "Exit Room",
      danger: true
    });
    if (confirmed) {
      localStorage.removeItem("courtship_session");
      setSession(null);
    }
  };

  const handleCopyRoomId = () => {
    if (!session) return;
    navigator.clipboard.writeText(session.roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenProfileMenu = () => {
    if (!session) return;
    setNameInput(session.name);
    setIsEditingName(false);
    setCodeRevealed(false);
    setShowProfileMenu((v) => !v);
  };

  const handleSaveName = async () => {
    if (!session || !nameInput.trim()) return;
    setSavingName(true);
    try {
      const roomRef = doc(db, "rooms", session.roomId);
      const field = session.role === "boy" ? "boyName" : "girlName";
      await setDoc(roomRef, { [field]: nameInput.trim() }, { merge: true });

      const updatedSession: UserSession = { ...session, name: nameInput.trim() };
      localStorage.setItem("courtship_session", JSON.stringify(updatedSession));
      setSession(updatedSession);
      setIsEditingName(false);
      showToast("Display name updated!", "success");
    } catch (err) {
      console.error("Error updating display name:", err);
      showToast("Failed to update your name. Please try again.");
    } finally {
      setSavingName(false);
    }
  };

  const handleSetAvatar = async (avatar: string) => {
    if (!session) return;
    try {
      const roomRef = doc(db, "rooms", session.roomId);
      const field = session.role === "boy" ? "boyAvatar" : "girlAvatar";
      await setDoc(roomRef, { [field]: avatar }, { merge: true });
      showToast("Avatar updated!", "success");
    } catch (err) {
      console.error("Error updating avatar:", err);
      showToast("Failed to update your avatar. Please try again.");
    }
  };

  const handleSetSkinTone = async (key: string, mod: string) => {
    saveSkinToneKey(key);
    setSkinToneMod(mod);
    // Re-tone the current avatar so the change is reflected immediately for
    // people avatars (animals/objects are left untouched by withTone).
    if (session) {
      const current = session.role === "boy" ? boyAvatar : girlAvatar;
      const retoned = withTone(current, mod);
      if (retoned !== current) handleSetAvatar(retoned);
    }
  };

  const handleSendHug = async () => {
    if (!session) return;
    try {
      const roomRef = doc(db, "rooms", session.roomId);
      await setDoc(
        roomRef,
        {
          lastHug: {
            sender: session.role,
            sentAt: new Date().toISOString(),
            nonce: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
          }
        },
        { merge: true }
      );
      // The recipient sees the hug the next time they open the app, so the
      // sender just gets a small confirmation here.
      showToast(`Hug sent to ${session.partnerName} 🤗`, "success");
    } catch (err) {
      console.error("Error sending hug:", err);
      showToast("Failed to send your hug. Please try again.");
    }
  };

  if (!session) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  const boyAvatar = roomMeta?.boyAvatar || "🧑";
  const girlAvatar = roomMeta?.girlAvatar || "👩";
  const myAvatar = session.role === "boy" ? boyAvatar : girlAvatar;
  const roomCreatedAt = typeof roomMeta?.createdAt === "string" ? roomMeta.createdAt : null;

  return (
    <div id="app-root" className="min-h-screen bg-natural-bg text-natural-text font-sans relative flex flex-col justify-between">
      {/* Top Header */}
      <header className="bg-natural-bg border-b border-natural-border py-4 px-6 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto flex flex-row justify-between items-center gap-4">
          {/* Logo & Names */}
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-[0.2em] text-natural-text/60 mb-1">
              A Private Space For
            </span>
            <h1 className="font-serif text-3xl font-light italic text-natural-text leading-none flex items-center gap-2">
              {session.role === "boy" ? session.name : session.partnerName}
              <span className="text-rose-500/85 animate-pulse text-xl">❤</span>
              {session.role === "girl" ? session.name : session.partnerName}
            </h1>
          </div>

          {/* User actions and room sharing */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Profile menu */}
            <div className="relative">
              <button
                id="btn-profile-menu"
                onClick={handleOpenProfileMenu}
                className="flex items-center gap-1.5 bg-natural-card-darker hover:bg-natural-border/60 border border-natural-border px-3 py-1.5 rounded-full text-xs font-semibold text-natural-text transition-all cursor-pointer"
              >
                <span className="text-sm">{myAvatar}</span>
                <span className="hidden sm:inline">Hello, {session.name}</span>
                <ChevronDown className={`w-3 h-3 text-natural-text/50 transition-transform ${showProfileMenu ? "rotate-180" : ""}`} />
              </button>

              {showProfileMenu && (
                <>
                  <div id="profile-menu-overlay" className="fixed inset-0 z-40" onClick={() => setShowProfileMenu(false)} />
                  <div
                    id="profile-menu-dropdown"
                    className="absolute right-0 top-full mt-2 w-64 bg-white border border-natural-border rounded-2xl card-shadow z-50 p-4 textured-bg"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wider text-natural-text/40 mb-3">Your Profile</p>

                    {isEditingName ? (
                      <div className="space-y-2 mb-3">
                        <input
                          id="profile-name-input"
                          type="text"
                          value={nameInput}
                          onChange={(e) => setNameInput(e.target.value)}
                          className="w-full bg-natural-card border border-natural-border rounded-lg py-1.5 px-2.5 text-xs text-natural-text focus:ring-2 focus:ring-natural-olive/20 focus:outline-none"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            id="btn-save-name"
                            onClick={handleSaveName}
                            disabled={savingName || !nameInput.trim()}
                            className="flex-1 bg-natural-olive hover:bg-natural-olive-hover disabled:bg-natural-card-darker text-white text-[11px] font-medium py-1.5 rounded-lg cursor-pointer transition-all"
                          >
                            Save
                          </button>
                          <button
                            id="btn-cancel-name"
                            onClick={() => setIsEditingName(false)}
                            className="flex-1 bg-natural-card hover:bg-natural-card-darker border border-natural-border text-natural-text text-[11px] font-medium py-1.5 rounded-lg cursor-pointer transition-all"
                          >
                            <XIcon className="w-3 h-3 inline" /> Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        id="btn-edit-name"
                        onClick={() => setIsEditingName(true)}
                        className="w-full flex items-center justify-between text-xs text-natural-text hover:bg-natural-card rounded-lg py-2 px-2 -mx-2 mb-1 cursor-pointer transition-all"
                      >
                        <span>Display Name: <strong>{session.name}</strong></span>
                        <Pencil className="w-3 h-3 text-natural-text/40" />
                      </button>
                    )}

                    <p className="text-[11px] text-natural-text/50 py-1.5">
                      Sharing this garden with <strong className="text-natural-text/70">{session.partnerName}</strong>
                    </p>

                    <div className="border-t border-natural-border mt-2 pt-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-natural-text/40 mb-1.5">Your Avatar</p>
                      <div className="flex flex-wrap gap-1 mb-1">
                        {avatarOptions.map((a) => {
                          const toned = withTone(a, skinToneMod);
                          return (
                            <button
                              id={`avatar-option-${a}`}
                              key={a}
                              onClick={() => handleSetAvatar(toned)}
                              className={`w-7 h-7 rounded-full flex items-center justify-center text-sm transition-all cursor-pointer ${
                                stripTone(myAvatar) === a
                                  ? "bg-natural-card-darker scale-110 border border-natural-border shadow-sm"
                                  : "hover:bg-natural-card"
                              }`}
                              title={`Use ${toned} as your avatar`}
                            >
                              {toned}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="border-t border-natural-border mt-2 pt-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-natural-text/40 mb-1.5">Skin Tone</p>
                      <div className="flex flex-wrap gap-1">
                        {SKIN_TONES.map((t) => (
                          <button
                            id={`skin-tone-${t.key}`}
                            key={t.key}
                            onClick={() => handleSetSkinTone(t.key, t.mod)}
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-sm transition-all cursor-pointer ${
                              skinToneMod === t.mod
                                ? "bg-natural-card-darker scale-110 border border-natural-border shadow-sm"
                                : "hover:bg-natural-card"
                            }`}
                            title={t.label}
                          >
                            {t.swatch}
                          </button>
                        ))}
                      </div>
                      <p className="text-[9px] text-natural-text/40 mt-1.5 leading-relaxed">Applies to avatars, reactions & hand emojis that support skin tone.</p>
                    </div>

                    <div className="border-t border-natural-border mt-2 pt-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-natural-text/40 mb-1.5">Room Code</p>
                      <div className="flex items-center bg-natural-card border border-natural-border rounded-lg overflow-hidden">
                        <button
                          id="btn-reveal-room-code"
                          onClick={() => setCodeRevealed((v) => !v)}
                          className="p-1.5 pl-2 text-natural-text/60 hover:text-natural-text cursor-pointer transition-all flex-shrink-0"
                          title={codeRevealed ? "Hide room code" : "Reveal room code"}
                        >
                          {codeRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <span className="flex-1 text-[11px] text-natural-text px-1 select-none truncate">
                          {codeRevealed ? session.roomId : "•".repeat(Math.min(session.roomId.length, 14))}
                        </span>
                        <button
                          id="btn-copy-room-id"
                          onClick={handleCopyRoomId}
                          className="p-1.5 pr-2 text-natural-text/60 hover:text-natural-text cursor-pointer transition-all flex-shrink-0"
                          title="Copy room code to share with your partner"
                        >
                          {copied ? <Check className="w-3.5 h-3.5 text-natural-green animate-scale" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-natural-border mt-3 pt-2">
                      <button
                        id="btn-app-logout"
                        onClick={() => {
                          setShowProfileMenu(false);
                          handleLogout();
                        }}
                        className="w-full flex items-center gap-2 text-xs text-natural-terracotta hover:bg-natural-card rounded-lg py-2 px-2 -mx-2 cursor-pointer transition-all"
                      >
                        <LogOut className="w-3.5 h-3.5" /> Exit Shared Room
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 md:p-6 pb-28 space-y-6">
        
        {/* Navigation Tabs Bar */}
        <div className="flex bg-natural-card p-1 rounded-2xl border border-natural-border shadow-sm overflow-x-auto whitespace-nowrap scrollbar-none">
          <button
            id="nav-notes"
            onClick={() => setActiveTab("notes")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-medium font-serif italic transition-all cursor-pointer ${
              activeTab === "notes"
                ? "bg-natural-olive text-white shadow-sm font-semibold"
                : "text-natural-text/60 hover:text-natural-text hover:bg-natural-card-darker/45"
            }`}
          >
            <Mail className="w-4 h-4" /> Notes Board
          </button>

          <button
            id="nav-letters"
            onClick={() => setActiveTab("letters")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-medium font-serif italic transition-all cursor-pointer ${
              activeTab === "letters"
                ? "bg-natural-olive text-white shadow-sm font-semibold"
                : "text-natural-text/60 hover:text-natural-text hover:bg-natural-card-darker/45"
            }`}
          >
            <Feather className="w-4 h-4" /> Writing Desk
          </button>

          <button
            id="nav-quest"
            onClick={() => setActiveTab("quest")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-medium font-serif italic transition-all cursor-pointer ${
              activeTab === "quest"
                ? "bg-natural-olive text-white shadow-sm font-semibold"
                : "text-natural-text/60 hover:text-natural-text hover:bg-natural-card-darker/45"
            }`}
          >
            <Sparkles className="w-4 h-4" /> Daily Quest
          </button>

          <button
            id="nav-dates"
            onClick={() => setActiveTab("dates")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-medium font-serif italic transition-all cursor-pointer ${
              activeTab === "dates"
                ? "bg-natural-olive text-white shadow-sm font-semibold"
                : "text-natural-text/60 hover:text-natural-text hover:bg-natural-card-darker/45"
            }`}
          >
            <Calendar className="w-4 h-4" /> Date Planner
          </button>

        </div>

        {/* Tab Content Panel */}
        <div className="min-h-[400px]">
          {activeTab === "notes" && <LoveNotes session={session} avatars={{ boy: boyAvatar, girl: girlAvatar }} onSendHug={handleSendHug} skinToneMod={skinToneMod} />}
          {activeTab === "letters" && <Letters session={session} avatars={{ boy: boyAvatar, girl: girlAvatar }} />}
          {activeTab === "quest" && <DailyQuest session={session} skinToneMod={skinToneMod} />}
          {activeTab === "dates" && <DatePlanner session={session} />}
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-8 flex justify-between items-center text-[10px] uppercase tracking-[0.3em] opacity-60 border-t border-natural-border pt-6 max-w-6xl w-full mx-auto px-6 pb-28 select-none">
        <span>
          {roomCreatedAt
            ? `Est. ${new Date(roomCreatedAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}`
            : "Est. —"}
        </span>
        <div className="flex gap-4 items-center">
          <div className="w-2.5 h-2.5 rounded-full bg-natural-green"></div>
          <span>Both partners connected</span>
        </div>
      </footer>

      {/* Virtual hug overlay — plays for 3 seconds on both partners' screens */}
      <AnimatePresence>
        {activeHug && (
          <motion.div
            id="hug-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex flex-col items-center justify-center pointer-events-none"
          >
            <div className="absolute inset-0 bg-natural-terracotta/[0.07] backdrop-blur-[1px]" />

            {/* Floating hearts drifting up around the hug */}
            {[...Array(6)].map((_, i) => (
              <motion.span
                key={i}
                className="absolute text-2xl"
                style={{ left: `${30 + i * 8}%`, bottom: "38%" }}
                initial={{ opacity: 0, y: 0, scale: 0.5 }}
                animate={{ opacity: [0, 1, 0], y: -160 - i * 20, scale: 1 }}
                transition={{ duration: 2.4, delay: 0.2 + i * 0.15, ease: "easeOut" }}
              >
                {i % 2 === 0 ? "❤️" : "🤍"}
              </motion.span>
            ))}

            <motion.div
              initial={{ scale: 0, rotate: -25 }}
              animate={{ scale: [0, 1.35, 1, 1.08, 1], rotate: [-25, 8, -4, 2, 0] }}
              transition={{ duration: 0.9, times: [0, 0.4, 0.6, 0.8, 1] }}
              className="text-[130px] leading-none drop-shadow-xl relative"
            >
              🤗
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="mt-4 font-serif italic text-xl text-natural-text bg-white/80 border border-natural-border rounded-full px-6 py-2 card-shadow relative"
            >
              {activeHug.from === "You"
                ? `You sent ${session.partnerName} a warm hug`
                : `${activeHug.from} sent you a warm hug`}
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
