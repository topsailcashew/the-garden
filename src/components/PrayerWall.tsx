import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { collection, query, orderBy, limit, onSnapshot, addDoc, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";
import { PrayerRequest, UserSession } from "../types";
import { useToast } from "./Toast";
import { useConfirm } from "./ConfirmDialog";
import { HandHeart, Send, Trash2, Loader2 } from "lucide-react";

interface PrayerWallProps {
  session: UserSession;
  avatars?: { boy: string; girl: string };
}

type Status = PrayerRequest["status"];

const STATUS_META: Record<Status, { emoji: string; label: string; active: string }> = {
  praying: { emoji: "🙏", label: "Praying", active: "bg-natural-olive text-white border-natural-olive" },
  prayed: { emoji: "🤲", label: "Prayed For", active: "bg-natural-green text-white border-natural-green" },
  answered: { emoji: "✨", label: "Answered", active: "bg-natural-terracotta text-white border-natural-terracotta" }
};
const STATUS_ORDER: Status[] = ["praying", "prayed", "answered"];

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
};

export default function PrayerWall({ session, avatars }: PrayerWallProps) {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [prayers, setPrayers] = useState<PrayerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [posting, setPosting] = useState(false);
  const [filter, setFilter] = useState<"all" | Status>("all");

  useEffect(() => {
    const ref = collection(db, "rooms", session.roomId, "prayers");
    const q = query(ref, orderBy("createdAt", "desc"), limit(50));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setPrayers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PrayerRequest)));
        setLoading(false);
      },
      (err) => {
        console.error("Error loading prayers:", err);
        showToast("Couldn't load the prayer wall. Please refresh.");
        setLoading(false);
      }
    );
    return () => unsub();
  }, [session.roomId]);

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setPosting(true);
    try {
      await addDoc(collection(db, "rooms", session.roomId, "prayers"), {
        author: session.role,
        text: input.trim(),
        createdAt: new Date().toISOString(),
        status: "praying"
      });
      setInput("");
    } catch (err) {
      console.error("Error posting prayer:", err);
      showToast("Failed to post your prayer. Please try again.");
    } finally {
      setPosting(false);
    }
  };

  const setStatus = async (id: string, status: Status) => {
    try {
      await updateDoc(doc(db, "rooms", session.roomId, "prayers", id), { status });
    } catch (err) {
      console.error("Error updating prayer status:", err);
      showToast("Failed to update. Please try again.");
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirm({
      title: "Remove this prayer?",
      message: "This will permanently remove it from your prayer wall for both of you.",
      confirmLabel: "Remove",
      danger: true
    });
    if (!confirmed) return;
    try {
      await deleteDoc(doc(db, "rooms", session.roomId, "prayers", id));
    } catch (err) {
      console.error("Error deleting prayer:", err);
      showToast("Failed to remove that prayer. Please try again.");
    }
  };

  const visible = filter === "all" ? prayers : prayers.filter((p) => p.status === filter);
  const counts = {
    praying: prayers.filter((p) => p.status === "praying").length,
    prayed: prayers.filter((p) => p.status === "prayed").length,
    answered: prayers.filter((p) => p.status === "answered").length
  };

  return (
    <div id="prayer-wall-root" className="space-y-6">
      {/* Header */}
      <div className="animate-fade-in">
        <h2 className="text-2xl font-serif font-light text-natural-text flex items-center gap-2">
          <HandHeart className="w-6 h-6 text-natural-terracotta" />
          Prayer Wall
        </h2>
        <p className="text-xs text-natural-text/60 mt-1">
          Lift up your requests together, and celebrate when they're answered. 🙏
        </p>
      </div>

      {/* Composer */}
      <form onSubmit={handlePost} className="bg-white border border-natural-border rounded-[24px] p-4 card-shadow space-y-3 animate-fade-in">
        <textarea
          id="prayer-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Share a prayer request — for you, for each other, or for someone you love..."
          rows={3}
          maxLength={600}
          className="w-full bg-natural-card border border-natural-border rounded-xl p-3.5 text-sm text-natural-text focus:ring-2 focus:ring-natural-olive/20 focus:outline-none placeholder:text-natural-text/40 resize-none"
        />
        <button
          id="btn-post-prayer"
          type="submit"
          disabled={posting || !input.trim()}
          className="w-full bg-natural-olive hover:bg-natural-olive-hover disabled:bg-natural-card-darker disabled:text-natural-text/40 text-white font-serif italic text-sm py-2.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all"
        >
          {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Add to the Wall
        </button>
      </form>

      {/* Filters */}
      {prayers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {([
            { key: "all", label: `All (${prayers.length})` },
            { key: "praying", label: `🙏 Praying (${counts.praying})` },
            { key: "prayed", label: `🤲 Prayed (${counts.prayed})` },
            { key: "answered", label: `✨ Answered (${counts.answered})` }
          ] as const).map((f) => (
            <button
              id={`prayer-filter-${f.key}`}
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
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-natural-text/30 animate-spin" />
        </div>
      ) : prayers.length === 0 ? (
        <div className="bg-white border border-dashed border-natural-border rounded-[32px] p-12 text-center flex flex-col items-center justify-center min-h-[240px] card-shadow">
          <div className="w-12 h-12 bg-natural-card-darker rounded-full flex items-center justify-center shadow-inner text-lg mb-3">🙏</div>
          <p className="text-sm font-serif font-light text-natural-text">The prayer wall is quiet.</p>
          <p className="text-xs text-natural-text/50 mt-1 max-w-xs leading-relaxed">Add your first request above — big or small, nothing is too little to pray about.</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white border border-dashed border-natural-border rounded-[32px] p-10 text-center card-shadow">
          <p className="text-sm font-serif font-light text-natural-text">Nothing here yet.</p>
          <p className="text-xs text-natural-text/50 mt-1">Try a different filter.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <AnimatePresence initial={false}>
            {visible.map((p) => {
              const isOwn = p.author === session.role;
              const authorAvatar = p.author === "boy" ? avatars?.boy || "🧑" : avatars?.girl || "👩";
              const meta = STATUS_META[p.status];
              return (
                <motion.div
                  id={`prayer-card-${p.id}`}
                  key={p.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className={`bg-white border rounded-[24px] p-5 card-shadow relative overflow-hidden ${
                    p.status === "answered" ? "border-natural-terracotta/40" : "border-natural-border"
                  }`}
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: p.status === "answered" ? "rgba(204,122,92,0.4)" : "rgba(138,154,91,0.35)" }} />

                  <div className="flex justify-between items-start gap-3 mb-2">
                    <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-natural-text/45">
                      <span className="text-base leading-none">{authorAvatar}</span>
                      {isOwn ? "You" : session.partnerName}
                    </span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${meta.active}`}>
                        {meta.emoji} {meta.label}
                      </span>
                      {isOwn && (
                        <button
                          id={`btn-delete-prayer-${p.id}`}
                          onClick={() => handleDelete(p.id)}
                          className="text-stone-400 hover:text-natural-terracotta transition-all cursor-pointer"
                          title="Remove this prayer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-sm text-natural-text leading-relaxed font-serif italic whitespace-pre-wrap break-words">
                    {p.text}
                  </p>

                  <div className="flex items-center gap-3 mt-4 pt-3 border-t border-natural-border/60">
                    <span className="text-[10px] uppercase tracking-wider text-natural-text/40 mr-auto">{formatDate(p.createdAt)}</span>
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      {STATUS_ORDER.map((s) => {
                        const active = p.status === s;
                        return (
                          <button
                            id={`btn-prayer-${s}-${p.id}`}
                            key={s}
                            onClick={() => setStatus(p.id, s)}
                            className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all cursor-pointer ${
                              active ? STATUS_META[s].active : "bg-white text-natural-text/55 border-natural-border hover:bg-natural-card"
                            }`}
                          >
                            {STATUS_META[s].emoji} {STATUS_META[s].label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
