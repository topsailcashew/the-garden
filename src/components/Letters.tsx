import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { collection, query, orderBy, limit, onSnapshot, addDoc, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Letter, UserSession } from "../types";
import { useToast } from "./Toast";
import { useConfirm } from "./ConfirmDialog";
import { Feather, X, Trash2, Loader2, Search, Star, BookOpen, Clock, Send, ChevronDown } from "lucide-react";

const LETTERS_PAGE_SIZE = 12;
// Generous ceiling — roughly 20k characters is a very long letter and keeps the
// Firestore document comfortably under the 1MB limit.
const MAX_LETTER_LENGTH = 20000;
const WORDS_PER_MINUTE = 200;

interface LettersProps {
  session: UserSession;
  avatars?: { boy: string; girl: string };
}

const wordCount = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

const readingTime = (text: string) => {
  const mins = Math.ceil(wordCount(text) / WORDS_PER_MINUTE);
  return mins <= 1 ? "1 min read" : `${mins} min read`;
};

const formatLetterDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric"
    });
  } catch {
    return "";
  }
};

const formatShortDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
};

export default function Letters({ session, avatars }: LettersProps) {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [letters, setLetters] = useState<Letter[]>([]);
  const [letterLimit, setLetterLimit] = useState<number>(LETTERS_PAGE_SIZE);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filter, setFilter] = useState<"all" | "mine" | "partner" | "starred">("all");

  const [isComposerOpen, setIsComposerOpen] = useState<boolean>(false);
  const [title, setTitle] = useState<string>("");
  const [body, setBody] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const [readingId, setReadingId] = useState<string | null>(null);

  const partnerRole = session.role === "boy" ? "girl" : "boy";
  const myAvatar = session.role === "boy" ? avatars?.boy || "🧑" : avatars?.girl || "👩";
  const partnerAvatar = partnerRole === "boy" ? avatars?.boy || "🧑" : avatars?.girl || "👩";

  // Long letters are easy to lose, so the composer keeps a local draft per
  // room + person until the letter is actually sent.
  const draftKey = `garden_letter_draft_${session.roomId}_${session.role}`;

  useEffect(() => {
    const lettersRef = collection(db, "rooms", session.roomId, "letters");
    const q = query(lettersRef, orderBy("createdAt", "desc"), limit(letterLimit));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setLetters(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Letter)));
        setLoading(false);
      },
      (err) => {
        console.error("Error loading letters:", err);
        showToast("Couldn't load your letters. Please refresh.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [session.roomId, letterLimit]);

  const openComposer = () => {
    setError("");
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const d = JSON.parse(saved);
        setTitle(d.title || "");
        setBody(d.body || "");
      }
    } catch {
      /* ignore malformed drafts */
    }
    setIsComposerOpen(true);
  };

  // Persist the draft as it's typed so a refresh never eats a long letter.
  useEffect(() => {
    if (!isComposerOpen) return;
    if (!title && !body) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ title, body }));
    } catch {
      /* storage full — drafting still works, it just isn't persisted */
    }
  }, [title, body, isComposerOpen, draftKey]);

  const clearDraft = () => {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;

    setIsSubmitting(true);
    setError("");

    try {
      const lettersRef = collection(db, "rooms", session.roomId, "letters");
      const newLetter: Omit<Letter, "id"> = {
        sender: session.role,
        title: title.trim() || "Untitled Letter",
        content: body.trim(),
        createdAt: new Date().toISOString(),
        read: false
      };
      await addDoc(lettersRef, newLetter);
      clearDraft();
      setTitle("");
      setBody("");
      setIsComposerOpen(false);
      showToast(`Your letter is on its way to ${session.partnerName} 🕊️`, "success");
    } catch (err) {
      console.error("Error sending letter:", err);
      setError("Failed to send your letter. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenLetter = async (letter: Letter) => {
    setReadingId(letter.id);
    if (letter.sender !== session.role && !letter.read) {
      try {
        await updateDoc(doc(db, "rooms", session.roomId, "letters", letter.id), { read: true });
      } catch (err) {
        console.error("Error marking letter read:", err);
      }
    }
  };

  const handleToggleStar = async (letterId: string, current?: boolean) => {
    try {
      await updateDoc(doc(db, "rooms", session.roomId, "letters", letterId), { starred: !current });
    } catch (err) {
      console.error("Error starring letter:", err);
      showToast("Failed to update favorite. Please try again.");
    }
  };

  const handleDelete = async (letterId: string) => {
    const confirmed = await confirm({
      title: "Delete this letter?",
      message: "This will permanently remove it from your writing desk for both of you. This can't be undone.",
      confirmLabel: "Delete Letter",
      danger: true
    });
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "rooms", session.roomId, "letters", letterId));
      setReadingId(null);
    } catch (err) {
      console.error("Error deleting letter:", err);
      showToast("Failed to delete that letter. Please try again.");
    }
  };

  const q = searchQuery.trim().toLowerCase();
  const visibleLetters = letters.filter((l) => {
    if (q && !(l.title.toLowerCase().includes(q) || l.content.toLowerCase().includes(q))) return false;
    if (filter === "mine" && l.sender !== session.role) return false;
    if (filter === "partner" && l.sender === session.role) return false;
    if (filter === "starred" && !l.starred) return false;
    return true;
  });
  const starredCount = letters.filter((l) => l.starred).length;
  const unreadCount = letters.filter((l) => l.sender !== session.role && !l.read).length;

  const readingLetter = letters.find((l) => l.id === readingId) || null;

  return (
    <div id="letters-root" className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-4 animate-fade-in">
        <div>
          <h2 className="text-2xl font-serif font-light text-natural-text flex items-center gap-2">
            <Feather className="w-6 h-6 text-natural-terracotta" />
            The Writing Desk
          </h2>
          <p className="text-xs text-natural-text/60 mt-1">
            For the long letters — the ones that don't fit on a note. Take your time, {session.name}.
          </p>
        </div>
        {unreadCount > 0 && (
          <span className="text-[11px] font-medium bg-natural-terracotta/10 border border-natural-terracotta/30 text-natural-terracotta px-3 py-1.5 rounded-full">
            {unreadCount} unread {unreadCount === 1 ? "letter" : "letters"} from {session.partnerName}
          </span>
        )}
      </div>

      {/* Search + filters */}
      {letters.length > 0 && (
        <div className="space-y-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-natural-text/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="letters-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search letters by title or words within..."
              className="w-full bg-white border border-natural-border rounded-xl py-2 pl-9 pr-3.5 text-xs text-natural-text focus:ring-2 focus:ring-natural-olive/20 focus:outline-none placeholder:text-natural-text/40"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {([
              { key: "all", label: "All" },
              { key: "mine", label: "Yours" },
              { key: "partner", label: `${session.partnerName}'s` },
              { key: "starred", label: `★ Starred${starredCount ? ` (${starredCount})` : ""}` }
            ] as const).map((f) => (
              <button
                id={`letters-filter-${f.key}`}
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`text-[11px] font-medium px-3 py-1 rounded-full border transition-all cursor-pointer ${
                  filter === f.key
                    ? "bg-natural-olive text-white border-natural-olive"
                    : "bg-white text-natural-text/60 border-natural-border hover:bg-natural-card"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Letter list */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-natural-text/30 animate-spin" />
        </div>
      ) : letters.length === 0 ? (
        <div className="bg-white border border-dashed border-natural-border rounded-[32px] p-12 text-center flex flex-col items-center justify-center min-h-[300px] card-shadow">
          <div className="w-12 h-12 bg-natural-card-darker rounded-full flex items-center justify-center shadow-inner text-lg mb-3">🕊️</div>
          <p className="text-sm font-serif font-light text-natural-text">The writing desk is empty.</p>
          <p className="text-xs text-natural-text/50 mt-1 max-w-xs leading-relaxed">
            Pour out a proper letter for {session.partnerName} — no character limit, no hurry.
          </p>
        </div>
      ) : visibleLetters.length === 0 ? (
        <div className="bg-white border border-dashed border-natural-border rounded-[32px] p-12 text-center flex flex-col items-center justify-center min-h-[200px] card-shadow">
          <p className="text-sm font-serif font-light text-natural-text">
            {searchQuery.trim() ? `No letters match "${searchQuery}".` : filter === "starred" ? "No starred letters yet." : "No letters here yet."}
          </p>
          <p className="text-xs text-natural-text/50 mt-1">
            {filter === "starred" ? "Tap the star on any letter to keep it here." : "Try a different search term or filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleLetters.map((letter) => {
            const isOwn = letter.sender === session.role;
            const isUnread = !isOwn && !letter.read;
            return (
              <motion.div
                id={`letter-card-${letter.id}`}
                key={letter.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                onClick={() => handleOpenLetter(letter)}
                className={`group bg-[#FAF6F0] border rounded-[24px] p-5 md:p-6 card-shadow cursor-pointer transition-all hover:-translate-y-0.5 relative overflow-hidden ${
                  isUnread ? "border-natural-terracotta/40" : "border-natural-border"
                }`}
              >
                {/* Ruled-paper flourish down the left edge */}
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-natural-terracotta/20" />

                <div className="flex justify-between items-start gap-3 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base leading-none">{isOwn ? myAvatar : partnerAvatar}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-natural-text/45">
                      {isOwn ? "You wrote" : `${session.partnerName} wrote`}
                    </span>
                    {isUnread && (
                      <span className="bg-natural-terracotta text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
                        Unopened
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      id={`btn-star-letter-${letter.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleStar(letter.id, letter.starred);
                      }}
                      className={`transition-all cursor-pointer ${letter.starred ? "text-amber-400 hover:text-amber-500" : "text-stone-400 hover:text-amber-400"}`}
                      title={letter.starred ? "Remove from favorites" : "Add to favorites"}
                    >
                      <Star className="w-3.5 h-3.5" fill={letter.starred ? "currentColor" : "none"} />
                    </button>
                    {isOwn && (
                      <button
                        id={`btn-delete-letter-${letter.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(letter.id);
                        }}
                        className="text-stone-400 hover:text-natural-terracotta transition-all cursor-pointer"
                        title="Delete this letter"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <h3 className="font-serif text-lg md:text-xl text-natural-text leading-snug mb-1.5">
                  {letter.title}
                </h3>

                <p className="text-sm text-natural-text/70 font-serif italic leading-relaxed line-clamp-2">
                  {letter.content}
                </p>

                <div className="flex items-center gap-3 mt-4 pt-3 border-t border-natural-border/60 text-[10px] uppercase tracking-wider text-natural-text/40">
                  <span>{formatShortDate(letter.createdAt)}</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {readingTime(letter.content)}
                  </span>
                  <span className="ml-auto flex items-center gap-1 text-natural-olive font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                    <BookOpen className="w-3 h-3" /> Read
                  </span>
                </div>
              </motion.div>
            );
          })}

          {letters.length >= letterLimit && (
            <button
              id="btn-load-more-letters"
              onClick={() => setLetterLimit((n) => n + LETTERS_PAGE_SIZE)}
              className="w-full text-xs text-natural-text/60 hover:text-natural-text bg-white border border-natural-border rounded-xl py-2.5 flex items-center justify-center gap-1.5 cursor-pointer transition-all"
            >
              <ChevronDown className="w-3.5 h-3.5" /> Load Older Letters
            </button>
          )}
        </div>
      )}

      {/* Floating compose button */}
      <motion.button
        id="btn-open-letter-composer"
        onClick={openComposer}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.85 }}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-natural-olive hover:bg-natural-olive-hover text-white shadow-lg flex items-center justify-center cursor-pointer"
        title="Write a letter"
      >
        <Feather className="w-5 h-5" />
      </motion.button>

      {/* Composer */}
      <AnimatePresence>
        {isComposerOpen && (
          <motion.div
            id="letter-composer-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm flex items-start md:items-center justify-center p-3 md:p-6 overflow-y-auto"
            onClick={() => setIsComposerOpen(false)}
          >
            <motion.div
              id="letter-composer-panel"
              initial={{ opacity: 0, scale: 0.97, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 16 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#FAF6F0] border border-natural-border rounded-[28px] shadow-2xl w-full max-w-2xl my-4"
            >
              <form onSubmit={handleSend} className="p-5 md:p-7">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-serif text-lg text-natural-text flex items-center gap-2">
                    <Feather className="w-4 h-4 text-natural-terracotta" /> A Letter for {session.partnerName}
                  </h3>
                  <button
                    id="btn-close-letter-composer"
                    type="button"
                    onClick={() => setIsComposerOpen(false)}
                    className="p-1 text-natural-text/50 hover:text-natural-text hover:bg-natural-card rounded-full cursor-pointer transition-all"
                    title="Close (your draft is saved)"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <input
                  id="letter-title-input"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Give your letter a title..."
                  maxLength={120}
                  className="w-full bg-transparent border-b border-natural-border pb-2 mb-4 font-serif text-xl text-natural-text focus:outline-none focus:border-natural-olive placeholder:text-natural-text/30 transition-colors"
                />

                <textarea
                  id="letter-body-input"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={`My dearest ${session.partnerName},\n\nWrite as much as your heart needs — there's no limit here...`}
                  rows={14}
                  maxLength={MAX_LETTER_LENGTH}
                  className="w-full bg-white/60 border border-natural-border rounded-2xl p-4 font-serif text-[15px] text-natural-text leading-loose focus:ring-2 focus:ring-natural-olive/20 focus:outline-none placeholder:text-natural-text/30 resize-y min-h-[240px]"
                />

                <div className="flex flex-wrap items-center justify-between gap-3 mt-3 text-[10px] uppercase tracking-wider text-natural-text/40">
                  <span>
                    {wordCount(body)} {wordCount(body) === 1 ? "word" : "words"} · {body.length.toLocaleString()}/{MAX_LETTER_LENGTH.toLocaleString()} characters
                  </span>
                  <span className="normal-case tracking-normal text-[11px] italic font-serif">Draft saves as you write</span>
                </div>

                {error && <p className="text-xs text-natural-terracotta mt-3">{error}</p>}

                <button
                  id="btn-send-letter"
                  type="submit"
                  disabled={isSubmitting || !body.trim()}
                  className="w-full mt-5 bg-natural-olive hover:bg-natural-olive-hover disabled:bg-natural-card-darker disabled:text-natural-text/40 text-white font-serif italic py-3 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" /> Seal & Send Letter
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reader */}
      <AnimatePresence>
        {readingLetter && (
          <motion.div
            id="letter-reader-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm flex items-start justify-center p-3 md:p-6 overflow-y-auto"
            onClick={() => setReadingId(null)}
          >
            <motion.div
              id="letter-reader-panel"
              initial={{ opacity: 0, scale: 0.97, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 16 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#FAF6F0] border border-natural-border rounded-[28px] shadow-2xl w-full max-w-2xl my-4 relative"
            >
              <button
                id="btn-close-letter-reader"
                onClick={() => setReadingId(null)}
                className="absolute top-4 right-4 p-1.5 text-natural-text/50 hover:text-natural-text hover:bg-natural-card rounded-full cursor-pointer transition-all z-10"
                title="Close letter"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="p-6 md:p-10">
                <div className="text-center border-b border-natural-border pb-5 mb-6">
                  <div className="text-2xl mb-2">
                    {readingLetter.sender === session.role ? myAvatar : partnerAvatar}
                  </div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-natural-text/40 mb-2">
                    {readingLetter.sender === session.role ? "You wrote" : `From ${session.partnerName}`}
                  </p>
                  <h2 className="font-serif text-2xl md:text-3xl font-light text-natural-text leading-snug">
                    {readingLetter.title}
                  </h2>
                  <p className="text-[11px] font-serif italic text-natural-text/50 mt-2">
                    {formatLetterDate(readingLetter.createdAt)} · {readingTime(readingLetter.content)}
                  </p>
                </div>

                <div
                  id="letter-reader-body"
                  className="font-serif text-[16px] md:text-[17px] text-natural-text leading-loose whitespace-pre-wrap break-words"
                >
                  {readingLetter.content}
                </div>

                <div className="flex items-center justify-between gap-3 mt-8 pt-5 border-t border-natural-border">
                  <button
                    id={`btn-reader-star-${readingLetter.id}`}
                    onClick={() => handleToggleStar(readingLetter.id, readingLetter.starred)}
                    className={`flex items-center gap-1.5 text-xs rounded-full border px-3 py-1.5 cursor-pointer transition-all ${
                      readingLetter.starred
                        ? "text-amber-500 border-amber-300 bg-amber-50"
                        : "text-natural-text/60 border-natural-border bg-white hover:bg-natural-card"
                    }`}
                  >
                    <Star className="w-3.5 h-3.5" fill={readingLetter.starred ? "currentColor" : "none"} />
                    {readingLetter.starred ? "Starred" : "Star this letter"}
                  </button>

                  {readingLetter.sender === session.role && (
                    <button
                      id={`btn-reader-delete-${readingLetter.id}`}
                      onClick={() => handleDelete(readingLetter.id)}
                      className="flex items-center gap-1.5 text-xs text-natural-text/50 hover:text-natural-terracotta cursor-pointer transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
