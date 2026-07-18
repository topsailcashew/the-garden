import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc, onSnapshot, collection, query, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { Question, VaultQuestion, UserSession } from "../types";
import { getQuestionOfToday } from "../data/questions";
import { useConfirm } from "./ConfirmDialog";
import ReactionPicker from "./ReactionPicker";
import { Lock, Eye, Send, Sparkles, AlertCircle, HelpCircle, History, Calendar, MessageSquareHeart, Archive, X, Trash2, Plus, SmilePlus } from "lucide-react";

interface DailyQuestProps {
  session: UserSession;
  skinToneMod?: string;
}

// Compact relative time ("just now", "2 hours ago") from an ISO timestamp.
function timeAgo(iso?: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "";
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min${mins > 1 ? "s" : ""} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

export default function DailyQuest({ session, skinToneMod = "" }: DailyQuestProps) {
  const confirm = useConfirm();
  const [todayQuestion, setTodayQuestion] = useState<Question | null>(null);
  const [answerInput, setAnswerInput] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isCustomMode, setIsCustomMode] = useState<boolean>(false);
  const [customQuestionInput, setCustomQuestionInput] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"today" | "history">("today");
  const [historyList, setHistoryList] = useState<Question[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [answerReactionOpen, setAnswerReactionOpen] = useState<boolean>(false);

  const [vaultQuestions, setVaultQuestions] = useState<VaultQuestion[]>([]);
  const [showVault, setShowVault] = useState<boolean>(false);
  const [vaultInput, setVaultInput] = useState<string>("");
  const [submittingVault, setSubmittingVault] = useState<boolean>(false);

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
    // Local guard so the missing-doc branch only initializes once per mount/day
    // (the snapshot can fire repeatedly before the write lands).
    let didInit = false;

    const unsubscribe = onSnapshot(qRef, async (docSnap) => {
      if (docSnap.exists()) {
        setTodayQuestion({ id: docSnap.id, ...docSnap.data() } as Question);
      } else {
        if (didInit) return;
        didInit = true;
        try {
          // Prefer the oldest question queued in the Vault; otherwise fall back
          // to the curated default. A used Vault question is removed from the
          // queue and lives on as today's quest (and later, history).
          const vaultRef = collection(db, "rooms", session.roomId, "vault");
          const vaultSnap = await getDocs(query(vaultRef, orderBy("createdAt", "asc"), limit(1)));

          let questionText: string;
          let usedVaultId: string | null = null;
          if (!vaultSnap.empty) {
            const v = vaultSnap.docs[0];
            questionText = (v.data() as VaultQuestion).questionText;
            usedVaultId = v.id;
          } else {
            questionText = getQuestionOfToday().text;
          }

          const initialQuestion: Question = { id: todayId, questionText };
          await setDoc(qRef, initialQuestion);
          if (usedVaultId) {
            await deleteDoc(doc(db, "rooms", session.roomId, "vault", usedVaultId));
          }
          setTodayQuestion(initialQuestion);
        } catch (err) {
          console.error("Failed to initialize today's question:", err);
          didInit = false; // allow a retry on the next snapshot
        }
      }
    });

    return () => unsubscribe();
  }, [session.roomId, todayId]);

  useEffect(() => {
    // Live subscription to the shared Questions Vault (FIFO by creation time).
    const vaultRef = collection(db, "rooms", session.roomId, "vault");
    const unsubscribe = onSnapshot(
      query(vaultRef, orderBy("createdAt", "asc")),
      (snap) => {
        const list: VaultQuestion[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() } as VaultQuestion));
        setVaultQuestions(list);
      },
      (err) => console.error("Error syncing questions vault:", err)
    );
    return () => unsubscribe();
  }, [session.roomId]);

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
  const partnerAnsweredAt = session.role === "boy" ? todayQuestion.girlAnsweredAt : todayQuestion.boyAnsweredAt;

  // Reactions live on the answers, not the question. The reaction on MY answer
  // was left by my partner (read-only to me); the reaction I give lands on my
  // partner's answer.
  const reactionOnMyAnswer = session.role === "boy" ? todayQuestion.boyAnswerReaction : todayQuestion.girlAnswerReaction;
  const myReactionToPartner = session.role === "boy" ? todayQuestion.girlAnswerReaction : todayQuestion.boyAnswerReaction;

  const handleReactToAnswer = async (reaction: string) => {
    try {
      const qRef = doc(db, "rooms", session.roomId, "questions", todayId);
      // My reaction is stored on my partner's answer field.
      const field = session.role === "boy" ? "girlAnswerReaction" : "boyAnswerReaction";
      // Tapping your active reaction again clears it
      await updateDoc(qRef, { [field]: myReactionToPartner === reaction ? "" : reaction });
    } catch (err) {
      console.error("Error reacting to answer:", err);
      setError("Failed to save your reaction. Please try again.");
    }
  };

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

    const hasExistingAnswers = hasBoyAnswered || hasGirlAnswered;
    const bothAnswered = hasBoyAnswered && hasGirlAnswered;
    const confirmed = await confirm({
      title: "Replace today's question?",
      message: hasExistingAnswers
        ? `${bothAnswered ? "Both of you have" : "One of you has"} already answered today's question. Overwriting it will permanently erase ${
            bothAnswered ? "both answers" : "that answer"
          } so you can start fresh.`
        : "This will replace today's question for both of you.",
      confirmLabel: "Replace Question",
      danger: hasExistingAnswers
    });
    if (!confirmed) return;

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

  const handleAddVaultQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vaultInput.trim()) return;
    setSubmittingVault(true);
    try {
      await addDoc(collection(db, "rooms", session.roomId, "vault"), {
        questionText: vaultInput.trim(),
        createdBy: session.role,
        createdAt: new Date().toISOString()
      });
      setVaultInput("");
    } catch (err) {
      console.error("Error adding vault question:", err);
      setError("Failed to add your question. Please try again.");
    } finally {
      setSubmittingVault(false);
    }
  };

  const handleDeleteVaultQuestion = async (id: string) => {
    const confirmed = await confirm({
      title: "Remove this question?",
      message: "It'll be taken out of the queue and won't be asked as a Daily Quest.",
      confirmLabel: "Remove",
      danger: true
    });
    if (!confirmed) return;
    try {
      await deleteDoc(doc(db, "rooms", session.roomId, "vault", id));
    } catch (err) {
      console.error("Error deleting vault question:", err);
      setError("Failed to remove that question. Please try again.");
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
            Daily Quest
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
          {/* Main Quest Box — grows to full width once the quest options panel
              disappears (i.e. after either partner has answered). */}
          <div className={`${hasBoyAnswered || hasGirlAnswered ? "lg:col-span-12" : "lg:col-span-8"} space-y-6`}>
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
                    <div>
                      <div className="bg-natural-card rounded-xl p-4 text-sm text-natural-text leading-relaxed font-serif italic min-h-[100px] border border-natural-border relative">
                        <span className="text-3xl font-serif absolute top-1 right-2 text-natural-text/10">”</span>
                        "{myAnswer}"
                      </div>
                      {reactionOnMyAnswer && (
                        <div id="my-answer-reaction" className="mt-2 flex items-center gap-1.5 text-[10px] text-natural-text/60 font-serif italic">
                          <span className="text-base not-italic">{reactionOnMyAnswer}</span>
                          {session.partnerName} reacted to your answer
                        </div>
                      )}
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
                    {!hasIAnswered && hasPartnerAnswered ? (
                      <span className="text-[10px] bg-natural-terracotta/15 border border-natural-terracotta/30 text-natural-terracotta font-bold px-2.5 py-0.5 rounded-full">
                        ✨ Ready to unlock
                      </span>
                    ) : hasPartnerAnswered ? (
                      <span className="text-[10px] bg-natural-card border border-natural-border text-natural-olive font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                        <Eye className="w-3 h-3" /> Revealed
                      </span>
                    ) : (
                      <span className="text-[10px] bg-natural-card-darker border border-natural-border text-natural-text/50 font-bold px-2.5 py-0.5 rounded-full">
                        ⏳ Pending
                      </span>
                    )}
                  </div>

                  {!hasIAnswered ? (
                    // Locked state: I haven't answered
                    <div className={`flex-1 flex flex-col items-center justify-center py-6 text-center border rounded-xl p-4 space-y-2 min-h-[140px] ${
                      hasPartnerAnswered ? "bg-natural-terracotta/[0.06] border-natural-terracotta/25" : "bg-natural-card border-natural-border"
                    }`}>
                      <div className="w-10 h-10 bg-natural-card-darker text-natural-terracotta rounded-full flex items-center justify-center">
                        <Lock className="w-5 h-5" />
                      </div>
                      {hasPartnerAnswered ? (
                        <>
                          <h4 className="text-xs font-semibold text-natural-terracotta font-serif italic">{session.partnerName} answered {timeAgo(partnerAnsweredAt)} — your turn!</h4>
                          <p className="text-[10px] text-natural-text/50 max-w-xs leading-normal">
                            {session.partnerName}'s response is waiting behind this lock. Submit yours to reveal it.
                          </p>
                        </>
                      ) : (
                        <>
                          <h4 className="text-xs font-semibold text-natural-text font-serif italic">Response Locked</h4>
                          <p className="text-[10px] text-natural-text/50 max-w-xs leading-normal">
                            Be the first to answer today — {session.partnerName} hasn't checked in yet. You'll both reveal together.
                          </p>
                        </>
                      )}
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
                    <div>
                      <div className="bg-natural-card-darker rounded-xl p-4 text-sm text-natural-text leading-relaxed font-serif italic min-h-[100px] border border-natural-border relative">
                        <span className="text-3xl font-serif absolute top-1 right-2 text-natural-text/10">”</span>
                        "{partnerAnswer}"
                      </div>

                      {/* React to your partner's answer — opens the full picker */}
                      <button
                        id="btn-answer-react-trigger"
                        type="button"
                        onClick={() => setAnswerReactionOpen(true)}
                        className="mt-2.5 flex items-center gap-1.5 text-xs text-natural-text/70 bg-natural-card hover:bg-natural-card-darker border border-natural-border rounded-full px-2.5 py-1.5 cursor-pointer transition-all"
                        title={`React to ${session.partnerName}'s answer`}
                      >
                        {myReactionToPartner ? (
                          <>
                            <span className="text-base leading-none">{myReactionToPartner}</span> You reacted
                          </>
                        ) : (
                          <>
                            <SmilePlus className="w-3.5 h-3.5" /> React
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Side Panel: Create Custom Quest — only available until someone
              answers, after which it disappears entirely. */}
          {!(hasBoyAnswered || hasGirlAnswered) && (
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
          )}
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
                        {hist.boyAnswerReaction && (
                          <div className="mt-2 inline-flex items-center gap-1 bg-white border border-natural-border rounded-full pl-1 pr-2 py-0.5">
                            <span className="text-sm">{hist.boyAnswerReaction}</span>
                            <span className="text-[9px] font-bold text-natural-text/40 uppercase tracking-wide">Reacted</span>
                          </div>
                        )}
                      </div>

                      {/* Girl Answer */}
                      <div className="bg-[#F5F5F0] p-3.5 rounded-xl border border-natural-border">
                        <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-bold text-natural-text/50 uppercase">
                          <span>👩 {session.role === "girl" ? "Your Answer" : `${session.partnerName}'s Answer`}</span>
                        </div>
                        <p className="text-xs text-natural-text leading-relaxed font-serif italic">
                          {histGirlAnswered ? `"${hist.girlAnswer}"` : "Not answered"}
                        </p>
                        {hist.girlAnswerReaction && (
                          <div className="mt-2 inline-flex items-center gap-1 bg-white border border-natural-border rounded-full pl-1 pr-2 py-0.5">
                            <span className="text-sm">{hist.girlAnswerReaction}</span>
                            <span className="text-[9px] font-bold text-natural-text/40 uppercase tracking-wide">Reacted</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Floating Questions Vault button */}
      <motion.button
        id="btn-open-vault"
        onClick={() => { setError(""); setShowVault(true); }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.92 }}
        className="fixed bottom-6 right-6 z-50 bg-natural-olive hover:bg-natural-olive-hover text-white rounded-full shadow-lg py-3.5 px-5 flex items-center gap-2 font-serif italic text-sm cursor-pointer"
        title="Queue up questions for future Daily Quests"
      >
        <Archive className="w-4 h-4" /> Questions Vault
        {vaultQuestions.length > 0 && (
          <span className="bg-white text-natural-olive text-[10px] font-bold rounded-full px-1.5 py-0.5 not-italic leading-none">
            {vaultQuestions.length}
          </span>
        )}
      </motion.button>

      {/* Questions Vault modal */}
      <AnimatePresence>
        {showVault && (
          <motion.div
            id="vault-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowVault(false)}
            className="fixed inset-0 z-[90] bg-black/40 flex items-center justify-center p-4"
          >
            <motion.div
              id="vault-panel"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white border border-natural-border rounded-[32px] p-6 card-shadow textured-bg w-full max-w-md max-h-[88vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-1">
                <h3 className="font-serif text-lg text-natural-text flex items-center gap-2 italic font-light">
                  <Archive className="w-4 h-4 text-natural-terracotta" />
                  Questions Vault
                </h3>
                <button
                  id="btn-close-vault"
                  onClick={() => setShowVault(false)}
                  className="p-1.5 text-natural-text/50 hover:text-natural-text hover:bg-natural-card rounded-full cursor-pointer transition-all"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-natural-text/60 mb-4 leading-relaxed">
                Queue up your own questions. Each becomes a Daily Quest — one per day, in the order added — for both of you to answer.
              </p>

              {error && (
                <div className="mb-4 p-3 bg-red-50 text-red-700 text-xs rounded-xl text-center">
                  {error}
                </div>
              )}

              <form onSubmit={handleAddVaultQuestion} className="flex gap-2 mb-5">
                <input
                  id="vault-input"
                  type="text"
                  value={vaultInput}
                  onChange={(e) => setVaultInput(e.target.value)}
                  placeholder="Write a question to ask each other..."
                  maxLength={150}
                  className="flex-1 bg-natural-card border border-natural-border rounded-xl py-2.5 px-3 text-xs text-natural-text focus:ring-2 focus:ring-natural-olive/20 focus:outline-none placeholder:text-natural-text/40"
                />
                <button
                  id="btn-add-vault"
                  type="submit"
                  disabled={submittingVault || !vaultInput.trim()}
                  className="bg-natural-olive hover:bg-natural-olive-hover disabled:bg-natural-card-darker disabled:text-natural-text/40 text-white rounded-xl px-3.5 flex items-center justify-center cursor-pointer transition-all flex-shrink-0"
                  title="Add to queue"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </form>

              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-natural-text/40">
                  In the Queue ({vaultQuestions.length})
                </span>
              </div>

              {vaultQuestions.length === 0 ? (
                <div className="text-center py-8 bg-natural-card border border-dashed border-natural-border rounded-2xl">
                  <p className="text-xs font-serif font-light italic text-natural-text">The vault is empty.</p>
                  <p className="text-[11px] text-natural-text/50 mt-1">Add a question above and it'll be your next Daily Quest.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {vaultQuestions.map((v, index) => (
                    <div
                      id={`vault-item-${v.id}`}
                      key={v.id}
                      className="flex items-start gap-2.5 bg-natural-card border border-natural-border rounded-xl p-3"
                    >
                      <div className="flex-1">
                        <p className="text-xs text-natural-text leading-relaxed font-serif italic">"{v.questionText}"</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          {index === 0 && (
                            <span className="text-[9px] font-bold uppercase tracking-wide text-natural-olive bg-natural-olive/10 border border-natural-olive/30 rounded-full px-1.5 py-0.5">
                              Up next
                            </span>
                          )}
                          <span className="text-[10px] text-natural-text/45">
                            Added by {v.createdBy === session.role ? "you" : session.partnerName}
                          </span>
                        </div>
                      </div>
                      <button
                        id={`btn-delete-vault-${v.id}`}
                        onClick={() => handleDeleteVaultQuestion(v.id)}
                        className="text-natural-text/40 hover:text-natural-terracotta transition-all cursor-pointer flex-shrink-0 mt-0.5"
                        title="Remove from queue"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reaction picker for your partner's answer */}
      <ReactionPicker
        open={answerReactionOpen}
        skinToneMod={skinToneMod}
        currentReaction={myReactionToPartner}
        onSelect={(emoji) => {
          handleReactToAnswer(emoji);
          setAnswerReactionOpen(false);
        }}
        onClose={() => setAnswerReactionOpen(false)}
        onClear={() => {
          if (myReactionToPartner) handleReactToAnswer(myReactionToPartner);
          setAnswerReactionOpen(false);
        }}
      />
    </div>
  );
}

// Add tiny helper Loader icon since we use Loader2 inside
function Loader2({ className }: { className?: string }) {
  return <Sparkles className={`${className}`} />;
}
