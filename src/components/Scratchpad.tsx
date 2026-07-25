import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { collection, query, orderBy, limit, onSnapshot, addDoc, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";
import { ScratchItem, UserSession } from "../types";
import { useToast } from "./Toast";
import { StickyNote, Plus, Trash2, Loader2, Check } from "lucide-react";

interface ScratchpadProps {
  session: UserSession;
  avatars?: { boy: string; girl: string };
}

export default function Scratchpad({ session, avatars }: ScratchpadProps) {
  const { showToast } = useToast();

  const [items, setItems] = useState<ScratchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "done">("all");

  useEffect(() => {
    const ref = collection(db, "rooms", session.roomId, "scratch");
    const q = query(ref, orderBy("createdAt", "desc"), limit(60));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ScratchItem)));
        setLoading(false);
      },
      (err) => {
        console.error("Error loading scratchpad:", err);
        showToast("Couldn't load the scratchpad. Please refresh.");
        setLoading(false);
      }
    );
    return () => unsub();
  }, [session.roomId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setAdding(true);
    try {
      await addDoc(collection(db, "rooms", session.roomId, "scratch"), {
        author: session.role,
        text: input.trim(),
        createdAt: new Date().toISOString(),
        done: false
      });
      setInput("");
    } catch (err) {
      console.error("Error adding item:", err);
      showToast("Failed to add. Please try again.");
    } finally {
      setAdding(false);
    }
  };

  const toggleDone = async (item: ScratchItem) => {
    try {
      await updateDoc(doc(db, "rooms", session.roomId, "scratch", item.id), { done: !item.done });
    } catch (err) {
      console.error("Error toggling item:", err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, "rooms", session.roomId, "scratch", id));
    } catch (err) {
      console.error("Error deleting item:", err);
      showToast("Failed to remove that. Please try again.");
    }
  };

  const activeCount = items.filter((i) => !i.done).length;
  const doneCount = items.length - activeCount;
  const visible = filter === "active" ? items.filter((i) => !i.done) : filter === "done" ? items.filter((i) => i.done) : items;

  return (
    <div id="scratchpad-root" className="space-y-6">
      {/* Header */}
      <div className="animate-fade-in">
        <h2 className="text-2xl font-serif font-light text-natural-text flex items-center gap-2">
          <StickyNote className="w-6 h-6 text-natural-terracotta" />
          The Scratchpad
        </h2>
        <p className="text-xs text-natural-text/60 mt-1">
          A shared spot for to-dos and passing thoughts. Tick things off, or just leave a note.
        </p>
      </div>

      {/* Add row */}
      <form onSubmit={handleAdd} className="flex items-center gap-2 animate-fade-in">
        <input
          id="scratch-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add a to-do or a thought..."
          maxLength={400}
          className="flex-1 min-w-0 bg-white border border-natural-border rounded-xl py-2.5 px-4 text-sm text-natural-text focus:ring-2 focus:ring-natural-olive/20 focus:outline-none placeholder:text-natural-text/40"
        />
        <button
          id="btn-add-scratch"
          type="submit"
          disabled={adding || !input.trim()}
          className="flex-shrink-0 w-11 h-11 rounded-xl bg-natural-olive hover:bg-natural-olive-hover disabled:bg-natural-card-darker disabled:text-natural-text/40 text-white flex items-center justify-center cursor-pointer transition-all"
          title="Add"
        >
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-5 h-5" />}
        </button>
      </form>

      {/* Filters */}
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {([
            { key: "all", label: `All (${items.length})` },
            { key: "active", label: `To-do (${activeCount})` },
            { key: "done", label: `Done (${doneCount})` }
          ] as const).map((f) => (
            <button
              id={`scratch-filter-${f.key}`}
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
      ) : items.length === 0 ? (
        <div className="bg-white border border-dashed border-natural-border rounded-[32px] p-12 text-center flex flex-col items-center justify-center min-h-[220px] card-shadow">
          <div className="w-12 h-12 bg-natural-card-darker rounded-full flex items-center justify-center shadow-inner text-lg mb-3">📝</div>
          <p className="text-sm font-serif font-light text-natural-text">Nothing on the scratchpad yet.</p>
          <p className="text-xs text-natural-text/50 mt-1 max-w-xs leading-relaxed">Jot down a shared to-do, a reminder, or a little thought for {session.partnerName}.</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white border border-dashed border-natural-border rounded-[32px] p-10 text-center card-shadow">
          <p className="text-sm font-serif font-light text-natural-text">{filter === "done" ? "Nothing completed yet." : "All done here!"}</p>
        </div>
      ) : (
        <div className="bg-white border border-natural-border rounded-[24px] card-shadow overflow-hidden divide-y divide-natural-border">
          <AnimatePresence initial={false}>
            {visible.map((item) => {
              const isOwn = item.author === session.role;
              const authorAvatar = item.author === "boy" ? avatars?.boy || "🧑" : avatars?.girl || "👩";
              return (
                <motion.div
                  id={`scratch-item-${item.id}`}
                  key={item.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="flex items-start gap-3 p-3.5 group"
                >
                  <button
                    id={`btn-toggle-scratch-${item.id}`}
                    onClick={() => toggleDone(item)}
                    className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 cursor-pointer transition-all ${
                      item.done ? "bg-natural-green border-natural-green text-white" : "border-natural-border hover:border-natural-olive bg-white"
                    }`}
                    title={item.done ? "Mark as to-do" : "Mark as done"}
                  >
                    {item.done && <Check className="w-3.5 h-3.5" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm break-words leading-relaxed ${item.done ? "line-through text-natural-text/40" : "text-natural-text"}`}>
                      {item.text}
                    </p>
                    <span className="text-[10px] text-natural-text/35 flex items-center gap-1 mt-0.5">
                      <span className="text-xs">{authorAvatar}</span> {isOwn ? "You" : session.partnerName}
                    </span>
                  </div>

                  <button
                    id={`btn-delete-scratch-${item.id}`}
                    onClick={() => handleDelete(item.id)}
                    className="mt-0.5 text-stone-300 hover:text-natural-terracotta transition-all cursor-pointer flex-shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
