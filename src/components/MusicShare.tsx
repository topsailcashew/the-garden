import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { collection, query, orderBy, limit, onSnapshot, addDoc, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";
import { SongShare, UserSession } from "../types";
import { useToast } from "./Toast";
import { Music, X, Send, Trash2, Loader2, Check, Headphones } from "lucide-react";

interface MusicShareProps {
  session: UserSession;
  avatars?: { boy: string; girl: string };
  open: boolean;
  onClose: () => void;
}

// Build pre-filled search links from a title + artist. No API needed — these
// open the song in each service's own search, which lands on the track.
export function songLinks(title: string, artist: string) {
  const q = `${title} ${artist}`.trim();
  const enc = encodeURIComponent(q);
  return {
    spotify: `https://open.spotify.com/search/${enc}`,
    ytMusic: `https://music.youtube.com/search?q=${enc}`
  };
}

// Small Spotify + YT Music button pair used in the list and the alert.
function ListenLinks({ title, artist, size = "sm" }: { title: string; artist: string; size?: "sm" | "xs" }) {
  const links = songLinks(title, artist);
  const base =
    size === "xs"
      ? "text-[10px] px-2 py-0.5 gap-1"
      : "text-[11px] px-2.5 py-1 gap-1.5";
  return (
    <div className="flex flex-wrap gap-1.5">
      <a
        href={links.spotify}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={`inline-flex items-center rounded-full font-bold bg-[#1DB954]/15 text-[#1a8f43] border border-[#1DB954]/30 hover:bg-[#1DB954]/25 transition-all cursor-pointer ${base}`}
      >
        ▶ Spotify
      </a>
      <a
        href={links.ytMusic}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={`inline-flex items-center rounded-full font-bold bg-[#FF0000]/10 text-[#c40000] border border-[#FF0000]/25 hover:bg-[#FF0000]/20 transition-all cursor-pointer ${base}`}
      >
        ▶ YT Music
      </a>
    </div>
  );
}

export default function MusicShare({ session, avatars, open, onClose }: MusicShareProps) {
  const { showToast } = useToast();

  const [songs, setSongs] = useState<SongShare[]>([]);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  // The song to surface as an "on next open" alert, chosen once per session.
  const [alertSong, setAlertSong] = useState<SongShare | null>(null);
  const evaluatedAlert = useRef(false);

  const seenKey = `courtship_songs_seen_${session.roomId}_${session.role}`;

  useEffect(() => {
    const ref = collection(db, "rooms", session.roomId, "songs");
    const q = query(ref, orderBy("createdAt", "desc"), limit(50));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SongShare));
        setSongs(list);

        // On the first snapshot this session, alert about the newest song from
        // the partner that we haven't been shown before.
        if (!evaluatedAlert.current) {
          evaluatedAlert.current = true;
          const newestFromPartner = list.find((s) => s.sender !== session.role);
          let lastSeen = "";
          try {
            lastSeen = localStorage.getItem(seenKey) || "";
          } catch {
            /* ignore */
          }
          if (newestFromPartner && newestFromPartner.createdAt > lastSeen) {
            setAlertSong(newestFromPartner);
          }
        }
      },
      (err) => {
        console.error("Error loading songs:", err);
      }
    );
    return () => unsub();
  }, [session.roomId, session.role, seenKey]);

  const dismissAlert = () => {
    if (alertSong) {
      try {
        localStorage.setItem(seenKey, alertSong.createdAt);
      } catch {
        /* ignore */
      }
    }
    setAlertSong(null);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !artist.trim()) return;
    setSending(true);
    setError("");
    try {
      await addDoc(collection(db, "rooms", session.roomId, "songs"), {
        sender: session.role,
        title: title.trim(),
        artist: artist.trim(),
        ...(note.trim() ? { note: note.trim() } : {}),
        createdAt: new Date().toISOString(),
        listened: false
      });
      setTitle("");
      setArtist("");
      setNote("");
      showToast(`Song sent to ${session.partnerName} 🎵`, "success");
    } catch (err) {
      console.error("Error sending song:", err);
      setError("Failed to send the song. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const markListened = async (song: SongShare) => {
    try {
      await updateDoc(doc(db, "rooms", session.roomId, "songs", song.id), { listened: !song.listened });
    } catch (err) {
      console.error("Error updating song:", err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, "rooms", session.roomId, "songs", id));
    } catch (err) {
      console.error("Error deleting song:", err);
      showToast("Failed to remove that song. Please try again.");
    }
  };

  const preview = title.trim() && artist.trim();

  return (
    <>
      {/* "On next open" alert banner for a fresh song from the partner */}
      <AnimatePresence>
        {alertSong && (
          <motion.div
            id="song-alert-banner"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-gradient-to-r from-natural-terracotta/12 to-natural-olive/12 border border-natural-terracotta/30 rounded-[20px] p-4 flex items-center gap-3 mb-2"
          >
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-lg flex-shrink-0 shadow-sm">🎵</div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-natural-text">
                {session.partnerName} sent you a song
              </p>
              <p className="text-sm font-serif italic text-natural-text/80 truncate">
                {alertSong.title} — {alertSong.artist}
              </p>
              {alertSong.note && <p className="text-[11px] text-natural-text/50 italic mt-0.5 truncate">“{alertSong.note}”</p>}
              <div className="mt-1.5">
                <ListenLinks title={alertSong.title} artist={alertSong.artist} size="xs" />
              </div>
            </div>
            <button
              id="btn-dismiss-song-alert"
              onClick={dismissAlert}
              className="p-1 text-natural-text/40 hover:text-natural-text hover:bg-white/60 rounded-full cursor-pointer transition-all flex-shrink-0"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Composer + shared list modal */}
      <AnimatePresence>
        {open && (
          <motion.div
            id="music-share-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm flex items-start md:items-center justify-center p-3 md:p-6 overflow-y-auto"
          >
            <motion.div
              id="music-share-panel"
              initial={{ opacity: 0, scale: 0.97, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 16 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#FAF6F0] border border-natural-border rounded-[28px] shadow-2xl w-full max-w-lg my-4"
            >
              <div className="p-5 md:p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-serif text-lg text-natural-text flex items-center gap-2">
                    <Music className="w-4 h-4 text-natural-terracotta" /> Send {session.partnerName} a Song
                  </h3>
                  <button
                    id="btn-close-music-share"
                    onClick={onClose}
                    className="p-1 text-natural-text/50 hover:text-natural-text hover:bg-natural-card rounded-full cursor-pointer transition-all"
                    title="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Composer */}
                <form onSubmit={handleSend} className="space-y-2.5">
                  <input
                    id="song-title-input"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Song title"
                    maxLength={160}
                    className="w-full bg-white border border-natural-border rounded-xl py-2.5 px-4 text-sm text-natural-text focus:ring-2 focus:ring-natural-olive/20 focus:outline-none placeholder:text-natural-text/40"
                  />
                  <input
                    id="song-artist-input"
                    value={artist}
                    onChange={(e) => setArtist(e.target.value)}
                    placeholder="Artist / singer"
                    maxLength={160}
                    className="w-full bg-white border border-natural-border rounded-xl py-2.5 px-4 text-sm text-natural-text focus:ring-2 focus:ring-natural-olive/20 focus:outline-none placeholder:text-natural-text/40"
                  />
                  <input
                    id="song-note-input"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add a note (optional) — why this song?"
                    maxLength={200}
                    className="w-full bg-white border border-natural-border rounded-xl py-2.5 px-4 text-sm text-natural-text focus:ring-2 focus:ring-natural-olive/20 focus:outline-none placeholder:text-natural-text/40"
                  />

                  {/* Live link preview as you type */}
                  {preview && (
                    <div className="bg-white/70 border border-natural-border rounded-xl p-3 flex items-center justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-wider text-natural-text/40 flex-shrink-0">Preview</span>
                      <ListenLinks title={title} artist={artist} size="xs" />
                    </div>
                  )}

                  {error && <p className="text-xs text-natural-terracotta">{error}</p>}

                  <button
                    id="btn-send-song"
                    type="submit"
                    disabled={sending || !title.trim() || !artist.trim()}
                    className="w-full bg-natural-olive hover:bg-natural-olive-hover disabled:bg-natural-card-darker disabled:text-natural-text/40 text-white font-serif italic text-sm py-2.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all"
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send Song
                  </button>
                </form>

                {/* Shared list */}
                <div className="mt-6">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-natural-text/40 mb-2 flex items-center gap-1.5">
                    <Headphones className="w-3.5 h-3.5" /> Shared Songs
                  </p>
                  {songs.length === 0 ? (
                    <p className="text-xs text-natural-text/50 italic py-6 text-center">No songs shared yet — send the first one above. 🎶</p>
                  ) : (
                    <div className="space-y-2 max-h-[38vh] overflow-y-auto pr-1">
                      {songs.map((s) => {
                        const isOwn = s.sender === session.role;
                        const senderAvatar = s.sender === "boy" ? avatars?.boy || "🧑" : avatars?.girl || "👩";
                        return (
                          <div
                            id={`song-item-${s.id}`}
                            key={s.id}
                            className="bg-white border border-natural-border rounded-xl p-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-serif text-natural-text leading-snug break-words">
                                  {s.title} <span className="text-natural-text/50">— {s.artist}</span>
                                </p>
                                <p className="text-[10px] text-natural-text/40 flex items-center gap-1 mt-0.5">
                                  <span className="text-xs">{senderAvatar}</span>
                                  {isOwn ? "You sent" : `${session.partnerName} sent`}
                                  {s.listened && <span className="text-natural-green font-bold ml-1">· ✓ Listened</span>}
                                </p>
                                {s.note && <p className="text-[11px] text-natural-text/55 italic mt-1 break-words">“{s.note}”</p>}
                              </div>
                              {isOwn && (
                                <button
                                  id={`btn-delete-song-${s.id}`}
                                  onClick={() => handleDelete(s.id)}
                                  className="text-stone-300 hover:text-natural-terracotta transition-all cursor-pointer flex-shrink-0"
                                  title="Remove"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-2">
                              <ListenLinks title={s.title} artist={s.artist} size="xs" />
                              {!isOwn && (
                                <button
                                  id={`btn-listened-song-${s.id}`}
                                  onClick={() => markListened(s)}
                                  className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border cursor-pointer transition-all flex-shrink-0 ${
                                    s.listened
                                      ? "bg-natural-green text-white border-natural-green"
                                      : "bg-white text-natural-text/55 border-natural-border hover:bg-natural-card"
                                  }`}
                                >
                                  <Check className="w-3 h-3" /> {s.listened ? "Listened" : "Mark listened"}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
