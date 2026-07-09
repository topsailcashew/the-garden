import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query, limit, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { Question, UserSession } from "../types";
import { getQuestionOfToday } from "../data/questions";
import { Lock, Unlock, Send, Sparkles, AlertCircle, HelpCircle, History, Calendar, MessageSquareHeart } from "lucide-react";

interface DailyQuestProps {
  session: UserSession;
}

export default function DailyQuest({ session }: DailyQuestProps) {
  const [todayQuestion, setTodayQuestion] = useState<Question | null>(null);
  const [answerInput, setAnswerInput] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isCustomMode, setIsCustomMode] = useState<boolean>(false);
  const [customQuestionInput, setCustomQuestionInput] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"today" | "history">("today");
  const [historyList, setHistoryList] = useState<Question[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  // Get a stable, unique ID for today (e.g. q_2026_07_08)
  const getTodayId = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    return `q_${yyyy}_${mm}_${dd}`;
  };

  const todayId = getTodayId();

  useEffect(() => {
    // Real-time listener for today's question
    const qRef = doc(db, "rooms", session.roomId, "questions", todayId);
    
    const unsubscribe = onSnapshot(qRef, async (docSnap) => {
      if (docSnap.exists()) {
        setTodayQuestion({ id: docSnap.id, ...docSnap.data() } as Question);
      } else {
        // Automatically initialize today's question in Firestore if it doesn't exist
        const defaultQ = getQuestionOfToday();
        const initialQuestion: Question = {
          id: todayId,
          questionText: defaultQ.text
        };
        try {
          await setDoc(qRef, initialQuestion);
          setTodayQuestion(initialQuestion);
        } catch (err) {
          console.error("Failed to initialize today's question:", err);
        }
      }
    });

    return () => unsubscribe();
  }, [session.roomId, todayId]);

  // Load history when the history tab is active
  useEffect(() => {
    if (activeTab !== "history") return;

    setLoadingHistory(true);
    const fetchHistory = async () => {
      try {
        const qCollection = collection(db, "rooms", session.roomId, "questions");
        const querySnapshot = await getDocs(qCollection);
        const list: Question[] = [];
        querySnapshot.forEach((docSnap) => {
          if (docSnap.id !== todayId) {
            list.push({ id: docSnap.id, ...docSnap.data() } as Question);
          }
        });
        // Sort history by ID descending (which acts as date desc)
        list.sort((a, b) => b.id.localeCompare(a.id));
        setHistoryList(list);
      } catch (err) {
        console.error("Error fetching question history:", err);
      } finally {
        setLoadingHistory(false);
      }
    };

    fetchHistory();
  }, [activeTab, session.roomId, todayId]);

  if (!todayQuestion) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center h-64 bg-white border border-stone-200/50 rounded-3xl shadow-sm">
        <Sparkles className="w-8 h-8 text-rose-400 animate-spin mb-3" />
        <p className="text-sm font-serif text-stone-600">Preparing today's courtship quest...</p>
      </div>
    );
  }

  // Check state of responses
  const hasBoyAnswered = !!todayQuestion.boyAnswer?.trim();
  const hasGirlAnswered = !!todayQuestion.girlAnswer?.trim();
  
  const hasIAnswered = session.role === "boy" ? hasBoyAnswered : hasGirlAnswered;
  const hasPartnerAnswered = session.role === "boy" ? hasGirlAnswered : hasBoyAnswered;
  
  const myAnswer = session.role === "boy" ? todayQuestion.boyAnswer : todayQuestion.girlAnswer;
  const partnerAnswer = session.role === "boy" ? todayQuestion.girlAnswer : todayQuestion.boyAnswer;

  const handleSendAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answerInput.trim()) return;

    setIsSubmitting(true);
    setError("");

    try {
      const qRef = doc(db, "rooms", session.roomId, "questions", todayId);
      const updates: any = {};
      if (session.role === "boy") {
        updates.boyAnswer = answerInput.trim();
        updates.boyAnsweredAt = new Date().toISOString();
      } else {
        updates.girlAnswer = answerInput.trim();
        updates.girlAnsweredAt = new Date().toISOString();
      }
      await updateDoc(qRef, updates);
      setAnswerInput("");
    } catch (err: any) {
      console.error(err);
      setError("Failed to save answer. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetCustomQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customQuestionInput.trim()) return;

    setLoadingHistory(true);
    setError("");

    try {
      const qRef = doc(db, "rooms", session.roomId, "questions", todayId);
      // We overwrite or reset answers for today since we're writing a custom question!
      await setDoc(qRef, {
        id: todayId,
        questionText: customQuestionInput.trim(),
        boyAnswer: "",
        girlAnswer: "",
        boyAnsweredAt: null,
        girlAnsweredAt: null
      });
      setCustomQuestionInput("");
      setIsCustomMode(false);
    } catch (err: any) {
      console.error(err);
      setError("Failed to customize today's question. Try again.");
    } finally {
      setLoadingHistory(false);
    }
  };

  const parseQuestionDate = (qid: string) => {
    // Format: q_YYYY_MM_DD
    try {
      const parts = qid.split("_");
      if (parts.length === 4) {
        const d = new Date(`${parts[1]}-${parts[2]}-${parts[3]}`);
        return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
      }
    } catch {}
    return "Archive Question";
  };

  const parseShortDate = (qid: string) => {
    try {
      const parts = qid.split("_");
      if (parts.length === 4) {
        const d = new Date(`${parts[1]}-${parts[2]}-${parts[3]}`);
        return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      }
    } catch {}
    return "Past";
  };

  return (
    <div id="daily-quest-root" className="space-y-6">
      {/* Header and Toggle Mode */}
      <div className="flex flex-wrap justify-between items-center gap-4 animate-fade-in">
        <div>
          <h2 className="text-2xl font-serif font-light text-natural-text flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-natural-terracotta" />
            Daily Courtship Quest
          </h2>
          <p className="text-xs text-natural-text/60 mt-1">
            Answer today's question first to unlock {session.partnerName}'s hidden response. Discover something beautiful!
          </p>
        </div>

        <div className="flex bg-natural-bg border border-natural-border p-1 rounded-xl">
          <button
            id="tab-quest-today"
            onClick={() => setActiveTab("today")}
            className={`flex items-center gap-1.5 py-1.5 px-3.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === "today" ? "bg-white text-natural-olive shadow-sm font-bold" : "text-natural-text/60 hover:text-natural-text"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" /> Today
          </button>
          <button
            id="tab-quest-history"
            onClick={() => setActiveTab("history")}
            className={`flex items-center gap-1.5 py-1.5 px-3.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === "history" ? "bg-white text-natural-olive shadow-sm font-bold" : "text-natural-text/60 hover:text-natural-text"
            }`}
          >
            <History className="w-3.5 h-3.5" /> Past Quests
          </button>
        </div>
      </div>

      {activeTab === "today" ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Quest Box */}
          <div className="lg:col-span-8 space-y-6">
            {error && (
              <div className="p-3 bg-red-50 border border-red-100 text-red-700 text-xs rounded-xl text-center">
                {error}
              </div>
            )}

            {/* The Question Card */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white border border-natural-border rounded-[32px] p-6 md:p-8 card-shadow relative overflow-hidden textured-bg"
            >
              {/* Decorative top ribbon */}
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-natural-terracotta via-amber-300 to-natural-olive" />
              
              <div className="flex items-center gap-2 text-[10px] font-bold text-natural-terracotta tracking-widest uppercase mb-3">
                <HelpCircle className="w-3.5 h-3.5" />
                TODAY'S DISCOVERY QUEST
              </div>

              <h3 className="text-xl md:text-2xl font-serif font-light text-natural-text leading-snug">
                "{todayQuestion.questionText}"
              </h3>

              <div className="mt-6 flex items-center justify-between text-xs border-t border-natural-border pt-4 text-natural-text/50">
                <span>{parseQuestionDate(todayQuestion.id)}</span>
                <span className="flex items-center gap-1 bg-natural-card text-natural-olive font-serif font-medium px-2.5 py-0.5 rounded-full text-[10px] border border-natural-border">
                  {hasBoyAnswered && hasGirlAnswered ? "✨ Quest Complete" : "⏳ Active Quest"}
                </span>
              </div>
            </motion.div>

            {/* Answer Board */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* My Answer Slot */}
              <div className="bg-white border border-natural-border rounded-[24px] p-5 card-shadow relative flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-bold text-natural-text/70 uppercase flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-natural-terracotta animate-pulse" /> Your Answer
                    </span>
                    {hasIAnswered && (
                      <span className="text-[10px] bg-natural-card border border-natural-border text-natural-olive font-bold px-2.5 py-0.5 rounded-full">
                        ✓ Answered
                      </span>
                    )}
                  </div>

                  {hasIAnswered ? (
                    <div className="bg-natural-card rounded-xl p-4 text-sm text-natural-text leading-relaxed font-serif italic min-h-[100px] border border-natural-border relative">
                      <span className="text-3xl font-serif absolute top-1 right-2 text-natural-text/10">”</span>
                      "{myAnswer}"
                    </div>
                  ) : (
                    <form onSubmit={handleSendAnswer} className="space-y-3">
                      <textarea
                        id="answer-textarea"
                        value={answerInput}
                        onChange={(e) => setAnswerInput(e.target.value)}
                        placeholder={`Write your get-to-know-me answer for ${session.partnerName}...`}
                        rows={4}
                        maxLength={800}
                        className="w-full bg-natural-card border border-natural-border rounded-xl p-4 text-sm text-natural-text focus:ring-2 focus:ring-natural-olive/20 focus:outline-none placeholder:text-natural-text/40 resize-none animate-fade-in"
                      />
                      <button
                        id="btn-submit-answer"
                        type="submit"
                        disabled={isSubmitting || !answerInput.trim()}
                        className="w-full bg-natural-olive hover:bg-natural-olive-hover disabled:bg-natural-card-darker disabled:text-natural-text/40 text-white font-medium font-serif italic text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                      >
                        <Send className="w-3.5 h-3.5" /> Submit Answer
                      </button>
                    </form>
                  )}
                </div>
              </div>

              {/* Partner's Answer Slot */}
              <div className="bg-white border border-natural-border rounded-[24px] p-5 card-shadow relative flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-bold text-natural-text/70 uppercase">
                      {session.partnerName}'s Answer
                    </span>
                    {hasPartnerAnswered ? (
                      <span className="text-[10px] bg-natural-card border border-natural-border text-natural-olive font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                        <Unlock className="w-3 h-3" /> Answered
                      </span>
                    ) : (
                      <span className="text-[10px] bg-natural-card-darker border border-natural-border text-natural-text/50 font-bold px-2.5 py-0.5 rounded-full">
                        ⏳ Pending
                      </span>
                    )}
                  </div>

                  {!hasIAnswered ? (
                    // Locked state: I haven't answered
                    <div className="flex-1 flex flex-col items-center justify-center py-6 text-center bg-natural-card border border-natural-border rounded-xl p-4 space-y-2 min-h-[140px]">
                      <div className="w-10 h-10 bg-natural-card-darker text-natural-terracotta rounded-full flex items-center justify-center">
                        <Lock className="w-5 h-5" />
                      </div>
                      <h4 className="text-xs font-semibold text-natural-text font-serif italic">Response Locked</h4>
                      <p className="text-[10px] text-natural-text/50 max-w-xs leading-normal">
                        Submit your own answer to unlock {session.partnerName}'s thoughts!
                      </p>
                    </div>
                  ) : !hasPartnerAnswered ? (
                    // Waiting state: I answered but partner hasn't
                    <div className="flex-1 flex flex-col items-center justify-center py-6 text-center bg-natural-card-darker/50 rounded-xl border border-natural-border p-4 space-y-2 min-h-[140px]">
                      <div className="w-10 h-10 bg-natural-card border border-natural-border text-natural-olive rounded-full flex items-center justify-center text-lg animate-bounce shadow-inner">
                        🔒
                      </div>
                      <h4 className="text-xs font-semibold text-natural-text">Waiting for {session.partnerName}...</h4>
                      <p className="text-[10px] text-natural-text/50 max-w-xs leading-normal">
                        Your response is saved! Once {session.partnerName} answers, their response will automatically reveal.
                      </p>
                    </div>
                  ) : (
                    // Revealed state: Both answered
                    <div className="bg-natural-card-darker rounded-xl p-4 text-sm text-natural-text leading-relaxed font-serif italic min-h-[100px] border border-natural-border relative">
                      <span className="text-3xl font-serif absolute top-1 right-2 text-natural-text/10">”</span>
                      "{partnerAnswer}"
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Side Panel: Create Custom Quest */}
          <div className="lg:col-span-4 animate-fade-in">
            <div className="bg-white border border-natural-border rounded-[32px] p-6 card-shadow sticky top-6 space-y-5 textured-bg">
              <div className="flex items-center gap-2 mb-1">
                <div className="p-2.5 bg-natural-card-darker text-natural-terracotta border border-natural-border rounded-xl">
                  <MessageSquareHeart className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-serif text-sm font-medium italic text-natural-text">Quest Options</h4>
                  <p className="text-[10px] text-natural-text/50">Ask something else today?</p>
                </div>
              </div>

              {!isCustomMode ? (
                <div className="space-y-3 pt-1">
                  <p className="text-xs text-natural-text/75 leading-relaxed">
                    Don't feel today's default question? You can overwrite it and ask {session.partnerName} a custom, highly personal question instead!
                  </p>
                  <button
                    id="btn-custom-quest"
                    onClick={() => setIsCustomMode(true)}
                    className="w-full text-center text-xs bg-natural-card text-natural-text hover:bg-natural-card-darker font-serif italic border border-natural-border py-2 px-4 rounded-xl cursor-pointer transition-all"
                  >
                    ✏️ Overwrite with Custom Question
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSetCustomQuestion} className="space-y-3 pt-1">
                  <div>
                    <label className="block text-[10px] font-bold text-natural-text/60 uppercase mb-1">Write your question</label>
                    <input
                      id="custom-quest-input"
                      type="text"
                      value={customQuestionInput}
                      onChange={(e) => setCustomQuestionInput(e.target.value)}
                      placeholder="e.g. What is one habit of mine that makes you laugh?"
                      maxLength={150}
                      className="w-full bg-natural-card border border-natural-border rounded-xl py-2.5 px-3 text-xs text-natural-text focus:ring-2 focus:ring-natural-olive/20 focus:outline-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      id="btn-submit-custom-quest"
                      type="submit"
                      disabled={!customQuestionInput.trim()}
                      className="flex-1 bg-natural-olive hover:bg-natural-olive-hover text-white font-medium font-serif italic text-xs py-2 rounded-xl cursor-pointer transition-all disabled:bg-natural-card-darker"
                    >
                      Save Quest
                    </button>
                    <button
                      id="btn-cancel-custom-quest"
                      type="button"
                      onClick={() => { setIsCustomMode(false); setCustomQuestionInput(""); }}
                      className="flex-1 bg-natural-card hover:bg-natural-card-darker border border-natural-border text-natural-text font-medium text-xs py-2 rounded-xl cursor-pointer transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* History View */
        <div className="bg-white border border-natural-border rounded-[32px] p-6 card-shadow textured-bg">
          <h3 className="font-serif text-lg font-light italic text-natural-text mb-6 flex items-center gap-2">
            <History className="w-5 h-5 text-natural-text/60" />
            Completed Courtship Discoveries
          </h3>

          {loadingHistory ? (
            <div className="text-center py-12 flex flex-col items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-natural-terracotta" />
              <p className="text-xs text-natural-text/50 mt-2">Loading past answers...</p>
            </div>
          ) : historyList.length === 0 ? (
            <div className="text-center py-12 bg-natural-card border border-dashed border-natural-border rounded-2xl">
              <p className="text-sm font-serif font-light italic text-natural-text">No past discoveries recorded yet.</p>
              <p className="text-xs text-natural-text/50 mt-1">When you both complete a Daily Quest, they will show up in this archive to look back on!</p>
            </div>
          ) : (
            <div className="space-y-6">
              {historyList.map((hist) => {
                const histBoyAnswered = !!hist.boyAnswer?.trim();
                const histGirlAnswered = !!hist.girlAnswer?.trim();

                return (
                  <div id={`history-item-${hist.id}`} key={hist.id} className="border-b border-natural-border pb-6 last:border-b-0 last:pb-0">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-natural-terracotta uppercase tracking-wider mb-2">
                      <Calendar className="w-3.5 h-3.5" />
                      {parseShortDate(hist.id)}
                    </div>

                    <h4 className="text-sm font-serif font-medium text-natural-text mb-3">
                      "{hist.questionText}"
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Boy Answer */}
                      <div className="bg-natural-card p-3.5 rounded-xl border border-natural-border">
                        <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-bold text-natural-text/50 uppercase">
                          <span>🧑 {session.role === "boy" ? "Your Answer" : `${session.partnerName}'s Answer`}</span>
                        </div>
                        <p className="text-xs text-natural-text leading-relaxed font-serif italic">
                          {histBoyAnswered ? `"${hist.boyAnswer}"` : "Not answered"}
                        </p>
                      </div>

                      {/* Girl Answer */}
                      <div className="bg-[#F5F5F0] p-3.5 rounded-xl border border-natural-border">
                        <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-bold text-natural-text/50 uppercase">
                          <span>👩 {session.role === "girl" ? "Your Answer" : `${session.partnerName}'s Answer`}</span>
                        </div>
                        <p className="text-xs text-natural-text leading-relaxed font-serif italic">
                          {histGirlAnswered ? `"${hist.girlAnswer}"` : "Not answered"}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Add tiny helper Loader icon since we use Loader2 inside
function Loader2({ className }: { className?: string }) {
  return <Sparkles className={`${className}`} />;
}
