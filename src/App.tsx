import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import { UserSession } from "./types";
import Onboarding from "./components/Onboarding";
import LoveNotes from "./components/LoveNotes";
import DailyQuest from "./components/DailyQuest";
import DatePlanner from "./components/DatePlanner";
import Milestones from "./components/Milestones";
import { Heart, Mail, Sparkles, Calendar, HeartHandshake, LogOut, Copy, Check } from "lucide-react";

export default function App() {
  const [session, setSession] = useState<UserSession | null>(null);
  const [activeTab, setActiveTab] = useState<"notes" | "quest" | "dates" | "milestones">("notes");
  const [copied, setCopied] = useState<boolean>(false);
  const [roomCreatedAt, setRoomCreatedAt] = useState<string | null>(null);

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
    // Pull the room's real creation date so the footer's "Est." date always
    // matches what Milestones shows, instead of a hardcoded placeholder.
    if (!session) return;
    const fetchRoomMeta = async () => {
      try {
        const roomRef = doc(db, "rooms", session.roomId);
        const roomSnap = await getDoc(roomRef);
        if (roomSnap.exists()) {
          const data = roomSnap.data();
          if (typeof data.createdAt === "string") {
            setRoomCreatedAt(data.createdAt);
          }
        }
      } catch (err) {
        console.error("Error fetching room metadata:", err);
      }
    };
    fetchRoomMeta();
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

  const handleLogout = () => {
    if (window.confirm("Are you sure you want to exit your private courtyard? You'll be able to quickly switch back from the welcome screen.")) {
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

  if (!session) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  return (
    <div id="app-root" className="min-h-screen bg-natural-bg text-natural-text font-sans relative flex flex-col justify-between">
      {/* Top Header */}
      <header className="bg-natural-bg border-b border-natural-border pb-6 pt-5 px-6 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
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
          <div className="flex items-center gap-2 self-end sm:self-auto">
            {/* Copy Room ID Button */}
            <button
              id="btn-copy-room-id"
              onClick={handleCopyRoomId}
              className="text-[10px] font-mono bg-natural-card hover:bg-natural-card-darker border border-natural-border py-1.5 px-2.5 rounded-xl text-natural-text transition-all cursor-pointer flex items-center gap-1"
              title="Copy Room Code to share with your partner"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-natural-green animate-scale" /> Copied!
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 text-natural-text/70" /> Code: {session.roomId.slice(0, 12)}...
                </>
              )}
            </button>

            {/* Profile badge / role indicator */}
            <div className="flex items-center gap-1.5 bg-natural-card-darker border border-natural-border px-3 py-1.5 rounded-full text-xs font-semibold text-natural-text">
              <span className="text-sm">{session.role === "boy" ? "🧑" : "👩"}</span>
              <span className="hidden sm:inline">Hello, {session.name}</span>
            </div>

            {/* Logout/Exit Room */}
            <button
              id="btn-app-logout"
              onClick={handleLogout}
              className="p-2 text-natural-text/60 hover:text-natural-terracotta hover:bg-natural-card-darker rounded-full cursor-pointer transition-all"
              title="Exit shared room"
            >
              <LogOut className="w-4 h-4" />
            </button>
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

          <button
            id="nav-milestones"
            onClick={() => setActiveTab("milestones")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-medium font-serif italic transition-all cursor-pointer ${
              activeTab === "milestones"
                ? "bg-natural-olive text-white shadow-sm font-semibold"
                : "text-natural-text/60 hover:text-natural-text hover:bg-natural-card-darker/45"
            }`}
          >
            <HeartHandshake className="w-4 h-4" /> Milestones
          </button>
        </div>

        {/* Tab Content Panel */}
        <div className="min-h-[400px]">
          {activeTab === "notes" && <LoveNotes session={session} />}
          {activeTab === "quest" && <DailyQuest session={session} />}
          {activeTab === "dates" && <DatePlanner session={session} />}
          {activeTab === "milestones" && <Milestones session={session} />}
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
