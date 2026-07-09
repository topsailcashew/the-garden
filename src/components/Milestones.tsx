import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { collection, onSnapshot, doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { UserSession } from "../types";
import { useToast } from "./Toast";
import { Calendar, Award, Star, Flame, Heart, HeartHandshake, Gift, Hourglass, Edit2, Check } from "lucide-react";

interface MilestonesProps {
  session: UserSession;
}

export default function Milestones({ session }: MilestonesProps) {
  const { showToast } = useToast();
  const [totalNotes, setTotalNotes] = useState<number>(0);
  const [totalQuestions, setTotalQuestions] = useState<number>(0);
  const [totalDates, setTotalDates] = useState<number>(0);
  const [startDateStr, setStartDateStr] = useState<string>("");
  const [isEditingDate, setIsEditingDate] = useState<boolean>(false);
  const [dateInput, setDateInput] = useState<string>("");
  
  // Live ticking counter
  const [timeElapsed, setTimeElapsed] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null>(null);

  useEffect(() => {
    // Live subscriptions so stats update in real-time as either partner acts,
    // instead of only refreshing when this tab remounts.
    const notesRef = collection(db, "rooms", session.roomId, "notes");
    const unsubNotes = onSnapshot(
      notesRef,
      (snap) => setTotalNotes(snap.size),
      (err) => console.error("Error loading notes stat:", err)
    );

    const questionsRef = collection(db, "rooms", session.roomId, "questions");
    const unsubQuestions = onSnapshot(
      questionsRef,
      (snap) => {
        // Only count questions where BOTH boy and girl answered
        let completeCount = 0;
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.boyAnswer?.trim() && data.girlAnswer?.trim()) {
            completeCount++;
          }
        });
        setTotalQuestions(completeCount);
      },
      (err) => console.error("Error loading questions stat:", err)
    );

    const datesRef = collection(db, "rooms", session.roomId, "dates");
    const unsubDates = onSnapshot(
      datesRef,
      (snap) => setTotalDates(snap.size),
      (err) => console.error("Error loading dates stat:", err)
    );

    // Fetch Custom Start Date
    const fetchStartDate = async () => {
      try {
        const roomRef = doc(db, "rooms", session.roomId);
        const roomSnap = await getDoc(roomRef);
        if (roomSnap.exists()) {
          const data = roomSnap.data();
          if (data.courtshipStartDate) {
            setStartDateStr(data.courtshipStartDate);
            setDateInput(data.courtshipStartDate);
          } else {
            // Default to the room's actual creation date, only falling back
            // to today if that's somehow missing too.
            const fallback =
              typeof data.createdAt === "string"
                ? data.createdAt.split("T")[0]
                : new Date().toISOString().split("T")[0];
            setStartDateStr(fallback);
            setDateInput(fallback);
          }
        }
      } catch (err) {
        console.error("Error fetching start date:", err);
      }
    };

    fetchStartDate();

    return () => {
      unsubNotes();
      unsubQuestions();
      unsubDates();
    };
  }, [session.roomId]);

  // Handle saving customized courtship start date
  const handleSaveStartDate = async () => {
    if (!dateInput) return;
    try {
      const roomRef = doc(db, "rooms", session.roomId);
      await setDoc(roomRef, { courtshipStartDate: dateInput }, { merge: true });
      setStartDateStr(dateInput);
      setIsEditingDate(false);
    } catch (err) {
      console.error("Error saving start date:", err);
      showToast("Failed to save your custom start date. Please try again.");
    }
  };

  // Ticking calculation
  useEffect(() => {
    if (!startDateStr) return;

    const interval = setInterval(() => {
      const start = new Date(startDateStr);
      const now = new Date();
      const difference = now.getTime() - start.getTime();

      if (difference <= 0) {
        setTimeElapsed({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      setTimeElapsed({ days, hours, minutes, seconds });
    }, 1000);

    return () => clearInterval(interval);
  }, [startDateStr]);

  // List of sweet relationship badges
  const achievements = [
    {
      title: "First Planting 🏠",
      desc: "Created your private courtyard space.",
      isUnlocked: true,
      hint: "Welcome aboard!"
    },
    {
      title: "Sealed with Love 💌",
      desc: "Swapped at least 5 private letters.",
      isUnlocked: totalNotes >= 5,
      hint: `Currently: ${totalNotes}/5 notes`
    },
    {
      title: "Deep Connection 🎯",
      desc: "Completed at least 3 Daily Quests together.",
      isUnlocked: totalQuestions >= 3,
      hint: `Currently: ${totalQuestions}/3 completed quests`
    },
    {
      title: "Locking It In 📅",
      desc: "Proposed or confirmed at least 2 date plans.",
      isUnlocked: totalDates >= 2,
      hint: `Currently: ${totalDates}/2 dates`
    },
    {
      title: "In Full Bloom 🌹",
      desc: "Spent over 30 days together in your courtship room.",
      isUnlocked: (timeElapsed?.days || 0) >= 30,
      hint: `Currently: ${timeElapsed?.days || 0}/30 days`
    }
  ];

  return (
    <div id="milestones-root" className="space-y-6">
      {/* Header */}
      <div className="animate-fade-in">
        <h2 className="text-2xl font-serif font-light text-natural-text flex items-center gap-2">
          <HeartHandshake className="w-6 h-6 text-natural-terracotta" />
          Our Courting Milestones
        </h2>
        <p className="text-xs text-natural-text/60 mt-1">
          Track the live duration of your courtship, view statistics, and unlock sweet relational achievements together.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Live Anniversary Counter & Stats */}
        <div className="lg:col-span-8 space-y-6">
          {/* Live ticking counter */}
          <div className="bg-white border border-natural-border rounded-[32px] p-6 md:p-8 card-shadow relative overflow-hidden textured-bg">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-natural-terracotta via-amber-300 to-natural-olive" />
            
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2">
                <Hourglass className="w-4 h-4 text-natural-terracotta" />
                <span className="text-xs font-bold text-natural-text/60 uppercase tracking-widest">COURTSHIP DURATION</span>
              </div>
              
              <div>
                {isEditingDate ? (
                  <div className="flex items-center gap-2">
                    <input
                      id="courtship-start-input"
                      type="date"
                      value={dateInput}
                      onChange={(e) => setDateInput(e.target.value)}
                      className="bg-natural-card text-xs px-2.5 py-1.5 border border-natural-border rounded-lg focus:outline-none"
                    />
                    <button
                      id="btn-save-start-date"
                      onClick={handleSaveStartDate}
                      className="p-1.5 bg-natural-olive hover:bg-natural-olive-hover text-white rounded-lg transition-all cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    id="btn-edit-start-date"
                    onClick={() => setIsEditingDate(true)}
                    className="text-[10px] text-natural-text/40 hover:text-natural-terracotta flex items-center gap-1 cursor-pointer"
                  >
                    <Edit2 className="w-3 h-3" /> Customize Start Date
                  </button>
                )}
              </div>
            </div>

            {timeElapsed ? (
              <div className="grid grid-cols-4 gap-2 text-center md:px-6">
                <div className="bg-natural-card rounded-2xl p-3 md:p-4 border border-natural-border">
                  <span className="block text-2xl md:text-4xl font-serif font-light text-natural-olive">{timeElapsed.days}</span>
                  <span className="block text-[10px] md:text-xs text-natural-text/50 uppercase font-medium mt-1">Days</span>
                </div>
                <div className="bg-natural-card rounded-2xl p-3 md:p-4 border border-natural-border">
                  <span className="block text-2xl md:text-4xl font-serif font-light text-natural-olive">{timeElapsed.hours}</span>
                  <span className="block text-[10px] md:text-xs text-natural-text/50 uppercase font-medium mt-1">Hours</span>
                </div>
                <div className="bg-natural-card rounded-2xl p-3 md:p-4 border border-natural-border">
                  <span className="block text-2xl md:text-4xl font-serif font-light text-natural-olive">{timeElapsed.minutes}</span>
                  <span className="block text-[10px] md:text-xs text-natural-text/50 uppercase font-medium mt-1">Mins</span>
                </div>
                <div className="bg-natural-card rounded-2xl p-3 md:p-4 border border-natural-border">
                  <span className="block text-2xl md:text-4xl font-serif font-light text-natural-olive">{timeElapsed.seconds}</span>
                  <span className="block text-[10px] md:text-xs text-natural-text/50 uppercase font-medium mt-1">Secs</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-natural-text/40 text-xs font-serif italic">
                Calculating courtship timeline...
              </div>
            )}

            <p className="text-[11px] text-natural-text/50 text-center mt-6">
              Planted the seeds of this private garden on: <strong className="text-natural-text/70 font-semibold">{new Date(startDateStr || new Date()).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</strong>
            </p>
          </div>

          {/* Quick numbers */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-natural-border rounded-2xl p-5 card-shadow flex items-center gap-4">
              <div className="w-10 h-10 bg-natural-card border border-natural-border rounded-full flex items-center justify-center text-rose-600 font-bold">
                💌
              </div>
              <div>
                <span className="block text-xl font-serif text-natural-text">{totalNotes}</span>
                <span className="block text-[10px] text-natural-text/50 uppercase font-bold tracking-wider">Letters Swapped</span>
              </div>
            </div>

            <div className="bg-white border border-natural-border rounded-2xl p-5 card-shadow flex items-center gap-4">
              <div className="w-10 h-10 bg-natural-card border border-natural-border rounded-full flex items-center justify-center text-amber-600 font-bold">
                🎯
              </div>
              <div>
                <span className="block text-xl font-serif text-natural-text">{totalQuestions}</span>
                <span className="block text-[10px] text-natural-text/50 uppercase font-bold tracking-wider">Quests Completed</span>
              </div>
            </div>

            <div className="bg-white border border-natural-border rounded-2xl p-5 card-shadow flex items-center gap-4">
              <div className="w-10 h-10 bg-natural-card border border-natural-border rounded-full flex items-center justify-center text-indigo-600 font-bold">
                📅
              </div>
              <div>
                <span className="block text-xl font-serif text-natural-text">{totalDates}</span>
                <span className="block text-[10px] text-natural-text/50 uppercase font-bold tracking-wider">Adventures Planned</span>
              </div>
            </div>
          </div>
        </div>

        {/* Garden Milestones / Achievements Sidepanel */}
        <div className="lg:col-span-4">
          <div className="bg-white border border-natural-border rounded-[32px] p-6 card-shadow sticky top-6 space-y-4 textured-bg">
            <h3 className="font-serif text-base font-light italic text-natural-text flex items-center gap-2 border-b border-natural-border pb-3">
              <Award className="w-4 h-4 text-natural-terracotta" />
              Garden Achievements
            </h3>

            <div className="space-y-4 pt-1">
              {achievements.map((ach) => (
                <div id={`achievement-${ach.title}`} key={ach.title} className="flex gap-3.5 items-start">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs flex-shrink-0 border ${
                    ach.isUnlocked 
                      ? "bg-natural-card-darker border-natural-border text-natural-olive shadow-inner" 
                      : "bg-natural-card border-natural-border text-natural-text/20 opacity-60"
                  }`}>
                    {ach.isUnlocked ? "★" : "☆"}
                  </div>

                  <div>
                    <h4 className={`text-xs font-semibold leading-none ${ach.isUnlocked ? "text-natural-text" : "text-natural-text/40"}`}>
                      {ach.title}
                    </h4>
                    <p className="text-[10px] text-natural-text/60 mt-1 leading-normal">
                      {ach.desc}
                    </p>
                    <span className="block text-[9px] text-natural-text/40 font-semibold mt-1">
                      {ach.hint}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
