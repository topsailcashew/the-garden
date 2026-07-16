import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { collection, query, orderBy, limit, onSnapshot, addDoc, doc, updateDoc, deleteDoc, writeBatch, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Note, MoodEntry, UserSession } from "../types";
import { useToast } from "./Toast";
import { useConfirm } from "./ConfirmDialog";
import ReactionPicker from "./ReactionPicker";
import { PenTool, SmilePlus, MessageSquareHeart, Trash2, Eye, Mail, Star, Sparkles, Smile, Flame, ImagePlus, X, Loader2, Search, Check } from "lucide-react";

const NOTES_PAGE_SIZE = 30;

const MAX_ORIGINAL_FILE_BYTES = 20 * 1024 * 1024; // 20MB, before compression
const MAX_DATA_URI_LENGTH = 900_000; // keep well under Firestore's 1MB document limit

// Resizes and compresses an image client-side into a small JPEG data URI,
// since photos are stored directly on the note document (no Cloud Storage).
const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const maxDimension = 1200;
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas not supported"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      let quality = 0.7;
      let dataUri = canvas.toDataURL("image/jpeg", quality);
      while (dataUri.length > MAX_DATA_URI_LENGTH && quality > 0.3) {
        quality -= 0.15;
        dataUri = canvas.toDataURL("image/jpeg", quality);
      }
      if (dataUri.length > MAX_DATA_URI_LENGTH) {
        reject(new Error("TOO_LARGE"));
        return;
      }
      resolve(dataUri);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("LOAD_FAILED"));
    };
    img.src = objectUrl;
  });
};

interface LoveNotesProps {
  session: UserSession;
  avatars?: { boy: string; girl: string };
  onSendHug?: () => void;
}

interface MoodOption {
  emoji: string;
  label: string;
  color: string;
  caption: string;
  suggestion: (name: string, pronoun: string) => string;
}

const moodOptions: MoodOption[] = [
  {
    emoji: "😊",
    label: "Happy",
    color: "#F2B84B",
    caption: "feeling happy",
    suggestion: (name) => `${name} is feeling happy today — celebrate the good mood together!`
  },
  {
    emoji: "😍",
    label: "In Love",
    color: "#F0879A",
    caption: "feeling smitten",
    suggestion: (name, p) => `${name} is feeling smitten — shower ${p} with a little extra sweetness!`
  },
  {
    emoji: "😴",
    label: "Sleepy",
    color: "#A8A0D8",
    caption: "feeling sleepy",
    suggestion: (name, p) => `${name} is feeling sleepy — send ${p} something cozy to help them unwind...`
  },
  {
    emoji: "😢",
    label: "Sad",
    color: "#8FB8DE",
    caption: "feeling a little down",
    suggestion: (name, p) => `${name} is feeling a little down, offer ${p} some comfort and encouragement...`
  },
  {
    emoji: "😡",
    label: "Angry",
    color: "#E0755F",
    caption: "feeling frustrated",
    suggestion: (name, p) => `${name} is feeling frustrated, offer ${p} some comfort and encouragement...`
  },
  {
    emoji: "😌",
    label: "Content",
    color: "#9DBF8A",
    caption: "feeling at peace",
    suggestion: (name) => `${name} is feeling at peace — share something you're both grateful for...`
  },
  {
    emoji: "🥳",
    label: "Celebrating",
    color: "#F0A83E",
    caption: "in full celebration mode",
    suggestion: (name, p) => `${name} is in full celebration mode — join in and hype ${p} up!`
  },
  {
    emoji: "😰",
    label: "Anxious",
    color: "#B99CD6",
    caption: "feeling a bit anxious",
    suggestion: (name, p) => `${name} is feeling a bit anxious, remind ${p} that everything will be okay...`
  },
  {
    emoji: "🤒",
    label: "Sick",
    color: "#8EC28A",
    caption: "not feeling well",
    suggestion: (name, p) => `${name} isn't feeling well — send ${p} some get-well wishes and TLC...`
  },
  {
    emoji: "😎",
    label: "Cool",
    color: "#6FADC4",
    caption: "feeling cool as ever",
    suggestion: (name, p) => `${name} is feeling cool as ever — keep the good vibes going with ${p}!`
  },
  {
    emoji: "🤩",
    label: "Excited",
    color: "#F2A03D",
    caption: "buzzing with excitement",
    suggestion: (name, p) => `${name} is buzzing with excitement — match ${p}'s energy!`
  },
  {
    emoji: "🥰",
    label: "Loved",
    color: "#F08BA8",
    caption: "feeling loved",
    suggestion: (name, p) => `${name} is feeling loved — remind ${p} just how much you adore them.`
  },
  {
    emoji: "🙏",
    label: "Grateful",
    color: "#C9A66B",
    caption: "feeling grateful",
    suggestion: (name) => `${name} is feeling grateful — share something you appreciate about each other.`
  },
  {
    emoji: "🤪",
    label: "Silly",
    color: "#7FBF9E",
    caption: "in a silly mood",
    suggestion: (name, p) => `${name} is in a silly mood — send ${p} something goofy to make them laugh!`
  },
  {
    emoji: "😩",
    label: "Stressed",
    color: "#D98B6B",
    caption: "feeling stressed",
    suggestion: (name, p) => `${name} is feeling stressed — remind ${p} to breathe and that you've got their back.`
  },
  {
    emoji: "😐",
    label: "Meh",
    color: "#A9A99C",
    caption: "feeling kind of meh",
    suggestion: (name, p) => `${name} is feeling kind of meh — a little surprise might turn ${p}'s day around.`
  },
  {
    emoji: "🤞",
    label: "Hopeful",
    color: "#7BB0C7",
    caption: "feeling hopeful",
    suggestion: (name) => `${name} is feeling hopeful — dream a little about your future together.`
  },
  {
    emoji: "😭",
    label: "Emotional",
    color: "#8FB8DE",
    caption: "feeling emotional",
    suggestion: (name, p) => `${name} is feeling emotional — hold space for ${p} and let them know you're here.`
  },
  {
    emoji: "😜",
    label: "Playful",
    color: "#9DBF8A",
    caption: "feeling playful",
    suggestion: (name, p) => `${name} is feeling playful — start a little game or tease with ${p}!`
  }
];

const getMoodOption = (emoji?: string) => moodOptions.find((m) => m.emoji === emoji);

export default function LoveNotes({ session, avatars, onSendHug }: LoveNotesProps) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteLimit, setNoteLimit] = useState<number>(NOTES_PAGE_SIZE);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [reactionPickerNoteId, setReactionPickerNoteId] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");
  const [paperType, setPaperType] = useState<Note["paperType"]>("rose");
  const [emoji, setEmoji] = useState<string>("💌");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [isComposerOpen, setIsComposerOpen] = useState<boolean>(false);
  const [columnCount, setColumnCount] = useState<number>(1);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Paper options with styling classes. Each style pairs a paper color with a
  // distinct typeface so the picker/preview shows exactly how the note reads:
  // rose = elegant love-letter serif, indigo = clean modern sans,
  // sticky = casual handwriting, parchment = vintage typewriter.
  const paperStyles = {
    rose: {
      bg: "bg-[#FAF6F0] border-natural-border text-natural-text card-shadow font-serif italic",
      accent: "bg-natural-card-darker text-natural-text",
      seal: "bg-natural-terracotta text-white shadow-sm",
      badge: "border-natural-border text-natural-terracotta bg-natural-card-darker/50"
    },
    indigo: {
      bg: "bg-[#F5F5F0] border-natural-border text-natural-text card-shadow font-sans",
      accent: "bg-natural-card-darker text-natural-text",
      seal: "bg-natural-olive text-white shadow-sm",
      badge: "border-natural-border text-natural-olive bg-natural-card-darker/50"
    },
    sticky: {
      bg: "bg-[#FAF7E8] border-natural-border text-natural-text card-shadow font-hand",
      accent: "bg-natural-card-darker text-natural-text",
      seal: "bg-natural-green text-white shadow-sm",
      badge: "border-natural-border text-natural-green bg-natural-card-darker/50"
    },
    parchment: {
      bg: "bg-[#FAF3E8] border-natural-border text-natural-text card-shadow font-type",
      accent: "bg-natural-card-darker text-natural-text",
      seal: "bg-natural-terracotta text-white shadow-sm",
      badge: "border-natural-border text-natural-terracotta bg-natural-card-darker/50"
    }
  };

  const emojiOptions = ["💌", "❤️", "🌹", "✨", "🥰", "🐣", "🍫", "🧸", "🕊️"];

  useEffect(() => {
    // Real-time subscription to notes in the current room, capped so the
    // board stays fast as the archive grows; "Load More" raises the cap.
    const notesRef = collection(db, "rooms", session.roomId, "notes");
    const q = query(notesRef, orderBy("createdAt", "desc"), limit(noteLimit));

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
  }, [session.roomId, noteLimit]);

  useEffect(() => {
    // Track how many masonry columns fit, matching the Tailwind breakpoints
    // (1 / 2 / 3 / 4). We distribute notes across columns ourselves so the
    // newest sits top-left and stays tightly packed (true masonry).
    const computeColumns = () => {
      const w = window.innerWidth;
      setColumnCount(w >= 1280 ? 4 : w >= 1024 ? 3 : w >= 640 ? 2 : 1);
    };
    computeColumns();
    window.addEventListener("resize", computeColumns);
    return () => window.removeEventListener("resize", computeColumns);
  }, []);

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

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_ORIGINAL_FILE_BYTES) {
      setError("That photo is too large. Please choose one under 20MB.");
      return;
    }

    setError("");
    setIsCompressing(true);
    try {
      const dataUri = await compressImage(file);
      setImagePreview(dataUri);
    } catch (err) {
      console.error("Error compressing image:", err);
      setError("That photo couldn't be processed. Try a smaller or different photo.");
    } finally {
      setIsCompressing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveImage = () => {
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() && !imagePreview) return;

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
        emoji,
        ...(imagePreview ? { imageUrl: imagePreview } : {})
      };
      await addDoc(notesRef, newNote);
      setContent("");
      setEmoji("💌");
      handleRemoveImage();
      setIsComposerOpen(false);
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

  const handleReactToNote = async (noteId: string, newEmoji: string, currentReaction?: string) => {
    try {
      const noteRef = doc(db, "rooms", session.roomId, "notes", noteId);
      // Tapping the already-active reaction again removes it; the original
      // sender's seal is never touched, so both stay stacked independently.
      await updateDoc(noteRef, { reactionEmoji: currentReaction === newEmoji ? "" : newEmoji });
    } catch (err) {
      console.error("Error reacting to note:", err);
      showToast("Failed to save your reaction. Please try again.");
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    const confirmed = await confirm({
      title: "Delete this note?",
      message: "This will permanently remove it from your shared board for both of you. This can't be undone.",
      confirmLabel: "Delete Note",
      danger: true
    });
    if (!confirmed) return;

    try {
      const noteRef = doc(db, "rooms", session.roomId, "notes", noteId);
      await deleteDoc(noteRef);
    } catch (err) {
      console.error("Error deleting note:", err);
      showToast("Failed to delete that note. Please try again.");
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

  const filteredNotes = searchQuery.trim()
    ? notes.filter((n) => n.content.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : notes;

  // Nudge the composer's placeholder based on the partner's mood today, so
  // the note you write is more likely to actually meet them where they're at.
  const partnerPronoun = partnerRole === "girl" ? "her" : "him";
  const partnerMoodOption = getMoodOption(partnerMood?.emoji);
  const composerPlaceholder = partnerMoodOption
    ? partnerMoodOption.suggestion(session.partnerName, partnerPronoun)
    : `Write something beautiful, encouraging, or exciting for ${session.partnerName}...`;

  const myAvatar = session.role === "boy" ? avatars?.boy || "🧑" : avatars?.girl || "👩";
  const partnerAvatar = partnerRole === "boy" ? avatars?.boy || "🧑" : avatars?.girl || "👩";

  // Distribute the (newest-first) notes round-robin across the masonry columns.
  // Item 0 (newest) → column 0 top, item 1 → column 1 top, ... so the top row
  // reads newest-first left-to-right, and a new note pushes the rest rightward
  // while each column stays tightly packed vertically.
  const noteColumns: Note[][] = Array.from({ length: columnCount }, () => []);
  filteredNotes.forEach((note, i) => noteColumns[i % columnCount].push(note));

  // The note whose full reaction picker is open (kept fresh from live notes).
  const reactionPickerNote = reactionPickerNoteId ? notes.find((n) => n.id === reactionPickerNoteId) : null;

  // Renders a single note card (shared by the masonry columns).
  const renderNoteCard = (note: Note) => {
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
        {/* Note Header: avatar + name badge, color-coded per sender so
            it's obvious at a glance who left each note */}
        <div className="flex justify-between items-start mb-3">
          <span
            className={`text-[10px] font-bold py-0.5 pl-1 pr-2 rounded-full border flex items-center gap-1 not-italic ${
              isOwn
                ? "bg-natural-olive/10 border-natural-olive/40 text-natural-olive"
                : "bg-natural-terracotta/10 border-natural-terracotta/40 text-natural-terracotta"
            }`}
            title={isOwn ? "You wrote this note" : `${session.partnerName} wrote this note`}
          >
            <span className="text-sm leading-none">{isOwn ? myAvatar : partnerAvatar}</span>
            {isOwn ? "You" : session.partnerName}
          </span>

          <div className="flex items-center gap-2">
            {/* Unread badge or Seal */}
            {note.sender !== session.role && !note.read && (
              <span className="bg-rose-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full animate-bounce not-italic">
                New
              </span>
            )}
            <span className="text-xs font-serif italic text-stone-400">{formatNoteTime(note.createdAt)}</span>
            {isOwn && (
              <button
                id={`btn-delete-note-${note.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteNote(note.id);
                }}
                className="text-stone-400 hover:text-natural-terracotta transition-all cursor-pointer"
                title="Delete this note"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Content / Envelope */}
        {isLocked ? (
          <div className="flex-1 flex flex-col items-center justify-center py-4 space-y-2">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${style.seal} animate-pulse not-italic`}>
              {note.emoji || "✉️"}
            </div>
            <span className="text-xs font-serif font-semibold text-stone-700">Click to break wax seal</span>
            <span className="text-[10px] text-stone-400">Locked with care by {session.partnerName}</span>
          </div>
        ) : (
          <div className="flex-1 flex flex-col justify-between">
            {note.imageUrl && (
              <img
                id={`note-image-${note.id}`}
                src={note.imageUrl}
                alt="Attached photo"
                className="w-full rounded-xl mb-3 object-cover"
              />
            )}
            {note.content && (
              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words pr-2">
                {note.content}
              </p>
            )}

            {/* Footer with Seal Emoji & Interactive Reactions */}
            <div className="flex justify-between items-center gap-2 mt-4 pt-3 border-t border-stone-200/10">
              {/* Seal stack: the sender's original seal + recipient's reaction.
                  Tap it to open the full reaction picker. */}
              <button
                id={`seal-stack-${note.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setReactionPickerNoteId(note.id);
                }}
                className="flex items-center gap-1.5 text-xs text-stone-600 bg-black/[0.03] hover:bg-black/[0.07] rounded-full pl-1.5 pr-2.5 py-1 not-italic cursor-pointer transition-all flex-shrink-0"
                title="Tap to pick a reaction"
              >
                <div className="flex items-center">
                  <span className="text-sm">{note.emoji || "💌"}</span>
                  {note.reactionEmoji && (
                    <span className="text-sm -ml-1.5 drop-shadow-sm" title="Reaction seal">{note.reactionEmoji}</span>
                  )}
                </div>
                <span className="text-[9px] font-bold uppercase tracking-wide text-stone-400">
                  {note.reactionEmoji ? "Seals" : "Seal"}
                </span>
              </button>

              {/* React trigger — opens the full reaction picker */}
              <button
                id={`react-trigger-${note.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setReactionPickerNoteId(note.id);
                }}
                className="flex items-center gap-1 text-xs text-stone-600 bg-white/70 hover:bg-white border border-stone-200/60 rounded-full px-2.5 py-1 not-italic cursor-pointer transition-all flex-shrink-0"
                title="React to this note"
              >
                <SmilePlus className="w-3.5 h-3.5" /> React
              </button>
            </div>
          </div>
        )}

        {/* Cute decorative paper pin for stickies */}
        {note.paperType === "sticky" && (
          <div className="absolute top-1 left-1/2 -translate-x-1/2 w-8 h-2.5 bg-amber-200/50 -rotate-3 rounded shadow-sm border-t border-amber-300" />
        )}
      </motion.div>
    );
  };

  return (
    <div id="love-notes-root" className="space-y-6">
      {/* Daily Mood Tracker */}
      <div id="mood-tracker" className="relative bg-white border border-natural-border rounded-[32px] p-5 card-shadow textured-bg animate-fade-in overflow-hidden">
        {/* Big faint decorative emoji in the corner, echoing whatever mood is winning today */}
        <div className="absolute -top-8 -right-5 text-9xl opacity-[0.05] rotate-12 pointer-events-none select-none">
          {myMood?.emoji || partnerMood?.emoji || "🌱"}
        </div>

        <h3 className="font-serif text-sm text-natural-text mb-4 flex items-center gap-2 italic font-light relative">
          <Smile className="w-4 h-4 text-natural-terracotta" /> Today's Mood
        </h3>

        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-5 relative">
          {/* Current moods, front & center and larger */}
          <div className="flex items-center justify-center gap-5 flex-shrink-0 sm:pr-5 sm:border-r sm:border-natural-border">
            {[
              { label: "You", mood: myMood },
              { label: session.partnerName, mood: partnerMood }
            ].map(({ label, mood }) => {
              const option = getMoodOption(mood?.emoji);
              return (
                <div key={label} className="flex flex-col items-center gap-1.5">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={mood?.emoji || "none"}
                      initial={{ scale: 0.5, opacity: 0, rotate: -15 }}
                      animate={{ scale: 1, opacity: 1, rotate: 0 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 400, damping: 15 }}
                      className="w-16 h-16 rounded-full flex items-center justify-center text-4xl shadow-inner"
                      style={{ backgroundColor: option ? `${option.color}30` : "var(--color-natural-card)" }}
                      title={mood?.emoji ? option?.label : "No mood set yet"}
                    >
                      {mood?.emoji || "➖"}
                    </motion.div>
                  </AnimatePresence>
                  <span className="text-[10px] font-bold text-natural-text/50 uppercase">{label}</span>
                </div>
              );
            })}
          </div>

          {/* Caption / prompt — always present so the row never feels empty */}
          <div className="flex-1 min-w-0 flex items-center">
            <AnimatePresence mode="wait">
              <motion.p
                key={`${myMood?.emoji || "_"}-${partnerMood?.emoji || "_"}`}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`w-full text-sm font-serif italic rounded-2xl px-4 py-3 leading-relaxed ${
                  myMood?.emoji && partnerMood?.emoji && myMood.emoji === partnerMood.emoji
                    ? "bg-natural-green/15 text-natural-green font-semibold"
                    : "bg-natural-card text-natural-text/70"
                }`}
              >
                {myMood?.emoji && partnerMood?.emoji
                  ? myMood.emoji === partnerMood.emoji
                    ? `✨ You're mood twins today — both ${getMoodOption(myMood.emoji)?.caption}!`
                    : `You're ${getMoodOption(myMood.emoji)?.caption}, ${session.partnerName} is ${getMoodOption(partnerMood.emoji)?.caption}.`
                  : myMood?.emoji
                    ? `You're ${getMoodOption(myMood.emoji)?.caption}. See how ${session.partnerName} feels when they check in...`
                    : partnerMood?.emoji
                      ? `${session.partnerName} is ${getMoodOption(partnerMood.emoji)?.caption}. How are you feeling today?`
                      : "How are you both feeling today? Tap a mood below to check in. 🌱"}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>

        {/* Mood picker — spread evenly across the full width */}
        <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 justify-items-center relative">
          {moodOptions.map(({ emoji: moodEmoji, label, color }) => {
            const isSelected = myMood?.emoji === moodEmoji;
            return (
              <motion.button
                id={`mood-option-${moodEmoji}`}
                key={moodEmoji}
                type="button"
                disabled={savingMood}
                onClick={() => handleSetMood(moodEmoji)}
                whileHover={{ scale: 1.15, rotate: 8 }}
                whileTap={{ scale: 0.85, rotate: -8 }}
                className="w-11 h-11 rounded-full flex items-center justify-center text-xl transition-colors cursor-pointer disabled:opacity-50 border-2"
                style={{
                  backgroundColor: isSelected ? `${color}30` : "transparent",
                  borderColor: isSelected ? color : "transparent"
                }}
                title={label}
              >
                {moodEmoji}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Header and Mark All Read */}
      <div className="flex flex-wrap justify-between items-center gap-4 animate-fade-in">
        <div>
          <h2 className="text-2xl font-serif font-light text-natural-text flex items-center gap-2">
            <MessageSquareHeart className="w-6 h-6 text-natural-terracotta" />
            Shared Love Notes
          </h2>
          <p className="text-xs text-natural-text/60 mt-1">Leave letters, photos, post-its, and reminders on your private shared corkboard.</p>
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

      {/* Floating action cluster, bottom-right: send a hug + write a note */}
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3">
        {onSendHug && (
          <motion.button
            id="btn-send-hug"
            onClick={onSendHug}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.85 }}
            className="w-14 h-14 rounded-full bg-white border border-natural-border shadow-lg flex items-center justify-center text-2xl cursor-pointer"
            title={`Send ${session.partnerName} a virtual hug`}
          >
            🤗
          </motion.button>
        )}

        <motion.button
          id="btn-open-composer"
          onClick={() => {
            setError("");
            setIsComposerOpen(true);
          }}
          animate={{
            y: [0, -5, 0],
            boxShadow: [
              "0 8px 20px -4px rgba(90,90,64,0.35)",
              "0 14px 28px -4px rgba(204,122,92,0.55)",
              "0 8px 20px -4px rgba(90,90,64,0.35)"
            ]
          }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          whileHover={{ scale: 1.06, y: 0 }}
          whileTap={{ scale: 0.92 }}
          className="bg-natural-olive hover:bg-natural-olive-hover text-white rounded-full py-3.5 px-5 flex items-center gap-2 font-serif italic text-sm cursor-pointer"
        >
          <PenTool className="w-4 h-4" /> Write a Note
        </motion.button>
      </div>

      {/* Composer modal */}
      <AnimatePresence>
        {isComposerOpen && (
          <motion.div
            id="composer-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsComposerOpen(false)}
            className="fixed inset-0 z-[90] bg-black/40 flex items-center justify-center p-4"
          >
            <motion.div
              id="composer-panel"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white border border-natural-border rounded-[32px] p-6 card-shadow textured-bg w-full max-w-md max-h-[88vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-serif text-lg text-natural-text flex items-center gap-2 italic font-light">
                  <PenTool className="w-4 h-4 text-natural-terracotta" />
                  Write to {session.partnerName}
                </h3>
                <button
                  id="btn-close-composer"
                  onClick={() => setIsComposerOpen(false)}
                  className="p-1.5 text-natural-text/50 hover:text-natural-text hover:bg-natural-card rounded-full cursor-pointer transition-all"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 text-red-700 text-xs rounded-xl text-center">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-natural-text/60 uppercase mb-1">
                  Message{imagePreview ? " (optional caption)" : ""}
                </label>
                <textarea
                  id="note-textarea"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={composerPlaceholder}
                  maxLength={500}
                  rows={4}
                  className="w-full bg-natural-card border border-natural-border rounded-2xl p-4 text-sm text-natural-text focus:ring-2 focus:ring-natural-olive/20 focus:outline-none resize-none placeholder:text-natural-text/40"
                />
                <div className="flex justify-end text-[10px] text-natural-text/50 mt-1">
                  {content.length}/500 chars
                </div>
              </div>

              {/* Photo attachment */}
              <div>
                <label className="block text-[10px] font-bold text-natural-text/60 uppercase mb-1.5">Photo (optional)</label>
                <input
                  ref={fileInputRef}
                  id="note-image-input"
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                />
                {imagePreview ? (
                  <div className="relative rounded-2xl overflow-hidden border border-natural-border">
                    <img id="note-image-preview" src={imagePreview} alt="Attached preview" className="w-full h-40 object-cover" />
                    <button
                      id="btn-remove-image"
                      type="button"
                      onClick={handleRemoveImage}
                      className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 cursor-pointer transition-all"
                      title="Remove photo"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    id="btn-attach-image"
                    type="button"
                    disabled={isCompressing}
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border border-dashed border-natural-border hover:border-natural-olive rounded-2xl py-4 flex flex-col items-center justify-center gap-1.5 text-natural-text/50 hover:text-natural-olive cursor-pointer transition-all disabled:opacity-50"
                  >
                    {isCompressing ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <ImagePlus className="w-5 h-5" />
                    )}
                    <span className="text-[11px] font-medium">{isCompressing ? "Processing photo..." : "Attach a photo"}</span>
                  </button>
                )}
              </div>

              {/* Paper selector: each swatch renders in the actual paper
                  background and typeface the finished note will use */}
              <div>
                <label className="block text-[10px] font-bold text-natural-text/60 uppercase mb-1.5">Paper Style</label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(paperStyles) as Note["paperType"][]).map((type) => (
                    <button
                      id={`paper-style-${type}`}
                      key={type}
                      type="button"
                      onClick={() => setPaperType(type)}
                      className={`relative rounded-xl border-2 px-3 pt-2 pb-1.5 text-left transition-all cursor-pointer overflow-hidden ${paperStyles[type].bg} ${
                        paperType === type
                          ? "border-natural-olive shadow-sm"
                          : "border-natural-border/60 hover:border-natural-text/30 opacity-80 hover:opacity-100"
                      }`}
                    >
                      <span className="block text-sm leading-snug">Sweet nothings...</span>
                      <span className="block text-[9px] font-sans not-italic font-bold uppercase tracking-wider text-natural-text/40 mt-1">{type}</span>
                      {paperType === type && (
                        <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-natural-olive text-white rounded-full flex items-center justify-center">
                          <Check className="w-2.5 h-2.5" />
                        </span>
                      )}
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

              {/* Live preview of how the note will actually look */}
              <div>
                <label className="block text-[10px] font-bold text-natural-text/60 uppercase mb-1.5">Preview</label>
                <div className={`border rounded-2xl p-4 min-h-[100px] ${paperStyles[paperType].bg}`}>
                  <div className="flex items-center gap-1.5 mb-2 text-xs text-stone-500">
                    <span className="text-base">{emoji}</span>
                    <span className="text-[9px] font-bold uppercase tracking-wide text-stone-400">Seal</span>
                  </div>
                  {imagePreview && (
                    <img id="preview-image" src={imagePreview} alt="Preview" className="w-full max-h-32 object-cover rounded-xl mb-2" />
                  )}
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                    {content.trim() || <span className="text-natural-text/30 italic">Your message will appear here...</span>}
                  </p>
                </div>
              </div>

              <button
                id="btn-send-note"
                type="submit"
                disabled={isSubmitting || isCompressing || (!content.trim() && !imagePreview)}
                className="w-full bg-natural-olive hover:bg-natural-olive-hover disabled:bg-natural-card-darker disabled:text-natural-text/40 text-white font-medium font-serif italic text-sm py-3 px-4 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all mt-4"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Mail className="w-4 h-4" /> Seal & Leave Note
                  </>
                )}
              </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notes Board */}
      <div>
          {notes.length > 0 && (
            <div className="relative mb-4">
              <Search className="w-3.5 h-3.5 text-natural-text/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="notes-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search loaded notes..."
                className="w-full bg-white border border-natural-border rounded-xl py-2 pl-9 pr-3.5 text-xs text-natural-text focus:ring-2 focus:ring-natural-olive/20 focus:outline-none placeholder:text-natural-text/40"
              />
            </div>
          )}

          {notes.length === 0 ? (
            <div className="bg-white border border-dashed border-natural-border rounded-[32px] p-12 text-center flex flex-col items-center justify-center min-h-[300px] card-shadow">
              <div className="w-12 h-12 bg-natural-card-darker rounded-full flex items-center justify-center shadow-inner text-lg mb-3">✉️</div>
              <p className="text-sm font-serif font-light text-natural-text">The note board is currently quiet.</p>
              <p className="text-xs text-natural-text/50 mt-1 max-w-xs leading-relaxed">Be the first to leave a sweet note, a photo, or an inside joke for {session.partnerName}!</p>
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="bg-white border border-dashed border-natural-border rounded-[32px] p-12 text-center flex flex-col items-center justify-center min-h-[200px] card-shadow">
              <p className="text-sm font-serif font-light text-natural-text">No notes match "{searchQuery}".</p>
              <p className="text-xs text-natural-text/50 mt-1">
                {notes.length >= noteLimit ? "Try loading more notes below, or a different search term." : "Try a different search term."}
              </p>
            </div>
          ) : (
            <div className="flex gap-4 items-start">
              {noteColumns.map((col, ci) => (
                <div key={ci} className="flex-1 min-w-0 flex flex-col gap-4">
                  {col.map(renderNoteCard)}
                </div>
              ))}
            </div>
          )}

          {notes.length >= noteLimit && (
            <div className="flex justify-center mt-4">
              <button
                id="btn-load-more-notes"
                onClick={() => setNoteLimit((l) => l + NOTES_PAGE_SIZE)}
                className="text-xs bg-white hover:bg-natural-card border border-natural-border text-natural-text py-2 px-4 rounded-full cursor-pointer transition-all"
              >
                Load Older Notes
              </button>
            </div>
          )}
      </div>

      {/* Full reaction picker — opens when the seal stack / React button is tapped */}
      <ReactionPicker
        open={!!reactionPickerNote}
        currentReaction={reactionPickerNote?.reactionEmoji}
        onSelect={(emoji) => {
          if (reactionPickerNote) handleReactToNote(reactionPickerNote.id, emoji, reactionPickerNote.reactionEmoji);
          setReactionPickerNoteId(null);
        }}
        onClose={() => setReactionPickerNoteId(null)}
        onClear={() => {
          if (reactionPickerNote?.reactionEmoji) handleReactToNote(reactionPickerNote.id, reactionPickerNote.reactionEmoji, reactionPickerNote.reactionEmoji);
          setReactionPickerNoteId(null);
        }}
      />
    </div>
  );
}
