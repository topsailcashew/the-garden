import { useState, useEffect, useRef } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { Room, UserSession } from "./types";
import Onboarding from "./components/Onboarding";
import LoveNotes from "./components/LoveNotes";
import DailyQuest from "./components/DailyQuest";
import DatePlanner from "./components/DatePlanner";
import { useConfirm } from "./components/ConfirmDialog";
import { useToast } from "./components/Toast";
import { Heart, Mail, Sparkles, Calendar, LogOut, Copy, Check, Eye, EyeOff, ChevronDown, Pencil, X as XIcon } from "lucide-react";

const avatarOptions = ["🧑", "👩", "👨", "🧔", "👱‍♀️", "🤴", "👸", "🦊", "🐻", "🐰", "🌻", "🌙"];

export default function App() {
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [session, setSession] = useState<UserSession | null>(null);
  const [activeTab, setActiveTab] = useState<"notes" | "quest" | "dates">("notes");
  const [copied, setCopied] = useState<boolean>(false);
  const [roomMeta, setRoomMeta] = useState<Partial<Room> | null>(null);
  const [codeRevealed, setCodeRevealed] = useState<boolean>(false);
  const [showProfileMenu, setShowProfileMenu] = useState<boolean>(false);
  const [isEditingName, setIsEditingName] = useState<boolean>(false);
  const [nameInput, setNameInput] = useState<string>("");
  const [savingName, setSavingName] = useState<boolean>(false);

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
    const unsubscribe = onSnapshot(
      roomRef,
      (snap) => {
        if (snap.exists()) setRoomMeta(snap.data() as Partial<Room>);
      },
      (err) => console.error("Error syncing room metadata:", err)
    );
    return () => unsubscribe();
  }, [session]);

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
                        {avatarOptions.map((a) => (
                          <button
                            id={`avatar-option-${a}`}
                            key={a}
                            onClick={() => handleSetAvatar(a)}
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-sm transition-all cursor-pointer ${
                              myAvatar === a
                                ? "bg-natural-card-darker scale-110 border border-natural-border shadow-sm"
                                : "hover:bg-natural-card"
                            }`}
                            title={`Use ${a} as your avatar`}
                          >
                            {a}
                          </button>
                        ))}
                      </div>
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
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 md:p-6 space-y-6">
        
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
          {activeTab === "notes" && <LoveNotes session={session} avatars={{ boy: boyAvatar, girl: girlAvatar }} />}
          {activeTab === "quest" && <DailyQuest session={session} />}
          {activeTab === "dates" && <DatePlanner session={session} />}
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-8 flex justify-between items-center text-[10px] uppercase tracking-[0.3em] opacity-60 border-t border-natural-border pt-6 max-w-6xl w-full mx-auto px-6 pb-8 select-none">
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
    </div>
  );
}
