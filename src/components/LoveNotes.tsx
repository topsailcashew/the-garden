import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { collection, query, orderBy, onSnapshot, addDoc, doc, updateDoc, writeBatch, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Note, MoodEntry, UserSession } from "../types";
import { useToast } from "./Toast";
import { PenTool, Heart, MessageSquareHeart, Trash2, Eye, Mail, Star, Sparkles, Smile, Flame } from "lucide-react";

interface LoveNotesProps {
  session: UserSession;
}

const moodOptions: { emoji: string; label: string }[] = [
  { emoji: "😊", label: "Happy" },
  { emoji: "😍", label: "In Love" },
  { emoji: "😴", label: "Sleepy" },
  { emoji: "😢", label: "Sad" },
  { emoji: "😡", label: "Angry" },
  { emoji: "😌", label: "Content" },
  { emoji: "🥳", label: "Celebrating" },
  { emoji: "😰", label: "Anxious" },
  { emoji: "🤒", label: "Sick" },
  { emoji: "😎", label: "Cool" }
];

export default function LoveNotes({ session }: LoveNotesProps) {
  const { showToast } = useToast();
  const [notes, setNotes] = useState<Note[]>([]);
  const [content, setContent] = useState<string>("");
  const [paperType, setPaperType] = useState<Note["paperType"]>("rose");
  const [emoji, setEmoji] = useState<string>("💌");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const [myMood, setMyMood] = useState<MoodEntry | null>(null);
  const [partnerMood, setPartnerMood] = useState<MoodEntry | null>(null);
  const [savingMood, setSavingMood] = useState<boolean>(false);
  const today = new Date().toISOString().slice(0, 10);
  const partnerRole = session.role === "boy" ? "girl" : "boy";
  const syncErrorShownRef = useRef(false);
  const notifySyncError = (context: string) => {
    if (syncErrorShownRef.current) return;
    syncErrorShownRef.current = true;
    showToast(`Couldn't sync ${context}. Check your connection or try reloading.`);
  };

  // Paper options with styling classes
  const paperStyles = {
    rose: {
      bg: "bg-[#FAF6F0] border-natural-border text-natural-text card-shadow font-serif italic",
      accent: "bg-natural-card-darker text-natural-text",
      seal: "bg-natural-terracotta text-white shadow-sm",
      badge: "border-natural-border text-natural-terracotta bg-natural-card-darker/50"
    },
    indigo: {
      bg: "bg-[#F5F5F0] border-natural-border text-natural-text card-shadow",
      accent: "bg-natural-card-darker text-natural-text",
      seal: "bg-natural-olive text-white shadow-sm",
      badge: "border-natural-border text-natural-olive bg-natural-card-darker/50"
    },
    sticky: {
      bg: "bg-[#FAF7E8] border-natural-border text-natural-text card-shadow",
      accent: "bg-natural-card-darker text-natural-text",
      seal: "bg-natural-green text-white shadow-sm",
      badge: "border-natural-border text-natural-green bg-natural-card-darker/50"
    },
    parchment: {
      bg: "bg-[#FAF3E8] border-natural-border text-natural-text card-shadow font-serif",
      accent: "bg-natural-card-darker text-natural-text",
      seal: "bg-natural-terracotta text-white shadow-sm",
      badge: "border-natural-border text-natural-terracotta bg-natural-card-darker/50"
    }
  };

  const emojiOptions = ["💌", "❤️", "🌹", "✨", "🥰", "🐣", "🍫", "🧸", "🕊️"];

  useEffect(() => {
    // Real-time subscription to notes in the current room
    const notesRef = collection(db, "rooms", session.roomId, "notes");
    const q = query(notesRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedNotes: Note[] = [];
        snapshot.forEach((docSnap) => {
          fetchedNotes.push({ id: docSnap.id, ...docSnap.data() } as Note);
        });
        setNotes(fetchedNotes);
      },
      (err) => {
        console.error("Error syncing notes:", err);
        notifySyncError("your love notes");
      }
    );

    return () => unsubscribe();
  }, [session.roomId]);

  useEffect(() => {
    // Real-time subscription to today's mood check-ins for both partners
    const myMoodRef = doc(db, "rooms", session.roomId, "moods", `${session.role}_${today}`);
    const partnerMoodRef = doc(db, "rooms", session.roomId, "moods", `${partnerRole}_${today}`);

    const unsubMine = onSnapshot(
      myMoodRef,
      (snap) => setMyMood(snap.exists() ? ({ id: snap.id, ...snap.data() } as MoodEntry) : null),
      (err) => {
        console.error("Error syncing your mood:", err);
        notifySyncError("today's mood");
      }
    );
    const unsubPartner = onSnapshot(
      partnerMoodRef,
      (snap) => setPartnerMood(snap.exists() ? ({ id: snap.id, ...snap.data() } as MoodEntry) : null),
      (err) => {
        console.error("Error syncing partner mood:", err);
        notifySyncError("today's mood");
      }
    );

    return () => {
      unsubMine();
      unsubPartner();
    };
  }, [session.roomId, session.role, partnerRole, today]);

  const handleSetMood = async (selectedEmoji: string) => {
    setSavingMood(true);
    try {
      const moodRef = doc(db, "rooms", session.roomId, "moods", `${session.role}_${today}`);
      const newMood: Omit<MoodEntry, "id"> = {
        role: session.role,
        date: today,
        emoji: selectedEmoji,
        updatedAt: new Date().toISOString()
      };
      await setDoc(moodRef, newMood, { merge: true });
    } catch (err) {
      console.error("Error setting mood:", err);
      showToast("Failed to set your mood. Please try again.");
    } finally {
      setSavingMood(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setIsSubmitting(true);
    setError("");

    try {
      const notesRef = collection(db, "rooms", session.roomId, "notes");
      const newNote: Omit<Note, "id"> = {
        sender: session.role,
        content: content.trim(),
        createdAt: new Date().toISOString(),
        read: false,
        paperType,
        emoji
      };
      await addDoc(notesRef, newNote);
      setContent("");
      setEmoji("💌");
    } catch (err: any) {
      console.error(err);
      setError("Failed to leave your note. Try again!");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenNote = async (note: Note) => {
    // Only mark as read if the current user is the recipient (sender !== current role)
    if (note.sender !== session.role && !note.read) {
      try {
        const noteRef = doc(db, "rooms", session.roomId, "notes", note.id);
        await updateDoc(noteRef, { read: true });
      } catch (err) {
        console.error("Error reading note:", err);
        showToast("Failed to open that note. Please try again.");
      }
    }
  };

  const handleReactToNote = async (noteId: string, newEmoji: string) => {
    try {
      const noteRef = doc(db, "rooms", session.roomId, "notes", noteId);
      await updateDoc(noteRef, { emoji: newEmoji });
    } catch (err) {
      console.error("Error reacting to note:", err);
      showToast("Failed to save your reaction. Please try again.");
    }
  };

  const handleMarkAllRead = async () => {
    const unreadNotes = notes.filter((n) => n.sender !== session.role && !n.read);
    if (unreadNotes.length === 0) return;

    try {
      const batch = writeBatch(db);
      unreadNotes.forEach((n) => {
        const ref = doc(db, "rooms", session.roomId, "notes", n.id);
        batch.update(ref, { read: true });
      });
      await batch.commit();
    } catch (err) {
      console.error("Error marking all read:", err);
      showToast("Failed to mark notes as read. Please try again.");
    }
  };

  // Helper to format date relative or short
  const formatNoteTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  return (
    <div id="love-notes-root" className="space-y-6">
      {/* Daily Mood Tracker */}
      <div id="mood-tracker" className="bg-white border border-natural-border rounded-[32px] p-5 card-shadow textured-bg animate-fade-in">
        <h3 className="font-serif text-sm text-natural-text mb-3 flex items-center gap-2 italic font-light">
          <Smile className="w-4 h-4 text-natural-terracotta" /> Today's Mood
        </h3>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <div className="flex flex-col items-center gap-1">
              <span className="text-2xl leading-none" title="Your mood today">{myMood?.emoji || "➖"}</span>
              <span className="text-[10px] font-bold text-natural-text/50 uppercase">You</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-2xl leading-none" title={`${session.partnerName}'s mood today`}>{partnerMood?.emoji || "➖"}</span>
              <span className="text-[10px] font-bold text-natural-text/50 uppercase">{session.partnerName}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {moodOptions.map(({ emoji: moodEmoji, label }) => (
              <button
                id={`mood-option-${moodEmoji}`}
                key={moodEmoji}
                type="button"
                disabled={savingMood}
                onClick={() => handleSetMood(moodEmoji)}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all cursor-pointer disabled:opacity-50 ${
                  myMood?.emoji === moodEmoji
                    ? "bg-natural-card-darker scale-110 shadow-sm border border-natural-border"
                    : "hover:bg-natural-card"
                }`}
                title={label}
              >
                {moodEmoji}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Header and Mark All Read */}
      <div className="flex flex-wrap justify-between items-center gap-4 animate-fade-in">
        <div>
          <h2 className="text-2xl font-serif font-light text-natural-text flex items-center gap-2">
            <MessageSquareHeart className="w-6 h-6 text-natural-terracotta" />
            Shared Love Notes
          </h2>
          <p className="text-xs text-natural-text/60 mt-1">Leave letters, post-its, and reminders on your private shared corkboard.</p>
        </div>
        
        {notes.some((n) => n.sender !== session.role && !n.read) && (
          <button
            id="btn-mark-all-read"
            onClick={handleMarkAllRead}
            className="text-xs bg-natural-card text-natural-text hover:bg-natural-card-darker border border-natural-border py-1.5 px-3 rounded-full flex items-center gap-1 cursor-pointer transition-all"
          >
            <Eye className="w-3.5 h-3.5" /> Mark All as Read
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Note Editor Sidepanel */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-natural-border rounded-[32px] p-6 card-shadow sticky top-6 textured-bg">
            <h3 className="font-serif text-lg text-natural-text mb-4 flex items-center gap-2 italic font-light">
              <PenTool className="w-4 h-4 text-natural-terracotta" />
              Write to {session.partnerName}
            </h3>

            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 text-xs rounded-xl text-center">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-natural-text/60 uppercase mb-1">Message</label>
                <textarea
                  id="note-textarea"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={`Write something beautiful, encouraging, or exciting for ${session.partnerName}...`}
                  maxLength={500}
                  rows={4}
                  className="w-full bg-natural-card border border-natural-border rounded-2xl p-4 text-sm text-natural-text focus:ring-2 focus:ring-natural-olive/20 focus:outline-none resize-none placeholder:text-natural-text/40"
                />
                <div className="flex justify-end text-[10px] text-natural-text/50 mt-1">
                  {content.length}/500 chars
                </div>
              </div>

              {/* Paper selector */}
              <div>
                <label className="block text-[10px] font-bold text-natural-text/60 uppercase mb-1.5">Paper Style</label>
                <div className="grid grid-cols-4 gap-2">
                  {(Object.keys(paperStyles) as Note["paperType"][]).map((type) => (
                    <button
                      id={`paper-style-${type}`}
                      key={type}
                      type="button"
                      onClick={() => setPaperType(type)}
                      className={`py-2 text-[11px] font-medium font-serif italic rounded-xl border capitalize transition-all cursor-pointer ${
                        paperType === type
                          ? "border-natural-olive bg-natural-card text-natural-olive font-bold"
                          : "border-natural-border bg-white text-natural-text hover:border-natural-text/30"
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Seal Selector */}
              <div>
                <label className="block text-[10px] font-bold text-natural-text/60 uppercase mb-1.5">Seal / Emoji</label>
                <div className="flex flex-wrap gap-1.5">
                  {emojiOptions.map((e) => (
                    <button
                      id={`seal-emoji-${e}`}
                      key={e}
                      type="button"
                      onClick={() => setEmoji(e)}
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all cursor-pointer ${
                        emoji === e
                          ? "bg-natural-card-darker scale-110 shadow-sm border border-natural-border"
                          : "hover:bg-natural-card"
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              <button
                id="btn-send-note"
                type="submit"
                disabled={isSubmitting || !content.trim()}
                className="w-full bg-natural-olive hover:bg-natural-olive-hover disabled:bg-natural-card-darker disabled:text-natural-text/40 text-white font-medium font-serif italic text-sm py-3 px-4 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all mt-4"
              >
                <Mail className="w-4 h-4" /> Seal & Leave Note
              </button>
            </form>
          </div>
        </div>

        {/* Notes Board */}
        <div className="lg:col-span-2">
          {notes.length === 0 ? (
            <div className="bg-white border border-dashed border-natural-border rounded-[32px] p-12 text-center flex flex-col items-center justify-center min-h-[300px] card-shadow">
              <div className="w-12 h-12 bg-natural-card-darker rounded-full flex items-center justify-center shadow-inner text-lg mb-3">✉️</div>
              <p className="text-sm font-serif font-light text-natural-text">The note board is currently quiet.</p>
              <p className="text-xs text-natural-text/50 mt-1 max-w-xs leading-relaxed">Be the first to leave a sweet note, a quick reminder, or an inside joke for {session.partnerName}!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              <AnimatePresence>
                {notes.map((note) => {
                  const style = paperStyles[note.paperType] || paperStyles.rose;
                  const isOwn = note.sender === session.role;
                  const isLocked = !isOwn && !note.read;

                  return (
                    <motion.div
                      id={`note-card-${note.id}`}
                      key={note.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      onClick={() => isLocked && handleOpenNote(note)}
                      className={`border rounded-2xl p-5 shadow-sm relative transition-all overflow-hidden flex flex-col justify-between min-h-[160px] ${
                        style.bg
                      } ${isLocked ? "cursor-pointer hover:shadow-md hover:scale-[1.01]" : ""}`}
                    >
                      {/* Note Header */}
                      <div className="flex justify-between items-start mb-3">
                        <span className={`text-[10px] font-bold py-0.5 px-2 rounded-full border ${style.badge}`}>
                          {isOwn ? "Left by You" : `From ${session.partnerName}`}
                        </span>
                        
                        <div className="flex items-center gap-1.5">
                          {/* Unread badge or Seal */}
                          {note.sender !== session.role && !note.read && (
                            <span className="bg-rose-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full animate-bounce">
                              New
                            </span>
                          )}
                          <span className="text-xs font-mono text-stone-400">{formatNoteTime(note.createdAt)}</span>
                        </div>
                      </div>

                      {/* Content / Envelope */}
                      {isLocked ? (
                        <div className="flex-1 flex flex-col items-center justify-center py-4 space-y-2">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${style.seal} animate-pulse`}>
                            {note.emoji || "✉️"}
                          </div>
                          <span className="text-xs font-serif font-semibold text-stone-700">Click to break wax seal</span>
                          <span className="text-[10px] text-stone-400">Locked with care by {session.partnerName}</span>
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col justify-between">
                          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words pr-2">
                            {note.content}
                          </p>

                          {/* Footer with Seal Emoji & Interactive Reactions */}
                          <div className="flex justify-between items-center mt-4 pt-3 border-t border-stone-200/10">
                            {/* Original Seal icon */}
                            <div className="flex items-center gap-1.5 text-xs text-stone-500">
                              <span className="text-base">{note.emoji || "💌"}</span>
                              <span className="text-[10px] font-medium text-stone-400">Wax Sealed</span>
                            </div>

                            {/* Easy Reaction Buttons */}
                            <div className="flex gap-1">
                              {["❤️", "🥰", "🌹", "✨"].map((reaction) => (
                                <button
                                  id={`react-${note.id}-${reaction}`}
                                  key={reaction}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleReactToNote(note.id, reaction);
                                  }}
                                  className={`w-6 h-6 rounded-full hover:bg-black/5 flex items-center justify-center text-xs transition-all active:scale-125 cursor-pointer ${
                                    note.emoji === reaction ? "bg-black/5 border border-stone-200/40" : "opacity-40 hover:opacity-100"
                                  }`}
                                  title={`React with ${reaction}`}
                                >
                                  {reaction}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Cute decorative paper pin for stickies */}
                      {note.paperType === "sticky" && (
                        <div className="absolute top-1 left-1/2 -translate-x-1/2 w-8 h-2.5 bg-amber-200/50 -rotate-3 rounded shadow-sm border-t border-amber-300" />
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
