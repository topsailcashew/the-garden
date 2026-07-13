import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { collection, query, orderBy, onSnapshot, addDoc, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";
import { DatePlan, UserSession } from "../types";
import { useToast } from "./Toast";
import { useConfirm } from "./ConfirmDialog";
import { Calendar, Wallet, BaggageClaim, ShieldAlert, CheckCircle, Plus, Send, Clock, Sparkles, X, Trash2, ImagePlus, Loader2, Pencil } from "lucide-react";

const MAX_ORIGINAL_FILE_BYTES = 20 * 1024 * 1024; // 20MB, before compression
const MAX_PER_PHOTO_LENGTH = 500_000; // ~per-photo cap on the base64 data URI
const MAX_PHOTOS_BUDGET = 950_000; // keep the whole date doc under Firestore's 1MB limit
const MAX_PHOTOS = 8;

// Resizes and compresses an image client-side into a small JPEG data URI. Date
// photos are stored on the date document, so each is kept fairly small and the
// total across a date is budgeted to stay under Firestore's 1MB doc limit.
const compressDatePhoto = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const maxDimension = 1000;
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
      let quality = 0.6;
      let dataUri = canvas.toDataURL("image/jpeg", quality);
      while (dataUri.length > MAX_PER_PHOTO_LENGTH && quality > 0.3) {
        quality -= 0.12;
        dataUri = canvas.toDataURL("image/jpeg", quality);
      }
      if (dataUri.length > MAX_PER_PHOTO_LENGTH) {
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

const parseShortDate = (rawDateStr: string) => {
  try {
    // extract digits if it's formatted as q_YYYY_MM_DD or similar
    const cleanStr = rawDateStr.replace("q_", "").replace(/_/g, "-");
    const d = new Date(cleanStr);
    if (isNaN(d.getTime())) {
      // Try parsing direct raw date
      const d2 = new Date(rawDateStr);
      if (isNaN(d2.getTime())) return "Past";
      return d2.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    }
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "Past";
  }
};

interface DatePlannerProps {
  session: UserSession;
}

export default function DatePlanner({ session }: DatePlannerProps) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [dates, setDates] = useState<DatePlan[]>([]);
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [now, setNow] = useState<Date>(new Date());
  const formRef = useRef<HTMLDivElement>(null);

  // New Date form fields
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [dateStr, setDateStr] = useState<string>("");
  const [cost, setCost] = useState<string>("");
  const [prepare, setPrepare] = useState<string>("");

  // Editing a past date's memory (one-word summary + photos)
  const [editingMemory, setEditingMemory] = useState<DatePlan | null>(null);
  const [summaryInput, setSummaryInput] = useState<string>("");
  const [memoryPhotos, setMemoryPhotos] = useState<string[]>([]);
  const [isCompressing, setIsCompressing] = useState<boolean>(false);
  const [isSavingMemory, setIsSavingMemory] = useState<boolean>(false);
  const [memoryError, setMemoryError] = useState<string>("");
  const memoryFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Subscription to date plans in the current room
    const datesRef = collection(db, "rooms", session.roomId, "dates");
    const q = query(datesRef, orderBy("date", "asc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedDates: DatePlan[] = [];
        snapshot.forEach((docSnap) => {
          fetchedDates.push({ id: docSnap.id, ...docSnap.data() } as DatePlan);
        });
        setDates(fetchedDates);
      },
      (err) => {
        console.error("Error syncing date plans:", err);
        showToast("Couldn't sync date plans. Check your connection or try reloading.");
      }
    );

    return () => unsubscribe();
  }, [session.roomId]);

  useEffect(() => {
    // Tick every second so the countdown timer stays live
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Scroll the proposal form into view so opening it doesn't feel like
    // nothing happened when it renders below the fold.
    if (isFormOpen) {
      const timeout = setTimeout(() => {
        formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
      return () => clearTimeout(timeout);
    }
  }, [isFormOpen]);

  const handleProposeDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !dateStr || !cost.trim() || !prepare.trim()) {
      setError("Please fill in all required fields to propose a date.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const datesRef = collection(db, "rooms", session.roomId, "dates");
      const newDate: Omit<DatePlan, "id"> = {
        title: title.trim(),
        description: description.trim(),
        date: dateStr,
        cost: cost.trim(),
        prepare: prepare.trim(),
        status: "proposed",
        proposedBy: session.role,
        createdAt: new Date().toISOString()
      };
      await addDoc(datesRef, newDate);

      // Reset form
      setTitle("");
      setDescription("");
      setDateStr("");
      setCost("");
      setPrepare("");
      setIsFormOpen(false);
    } catch (err: any) {
      console.error(err);
      setError("Failed to propose date plan. Try again!");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (dateId: string, newStatus: DatePlan["status"]) => {
    try {
      const dateRef = doc(db, "rooms", session.roomId, "dates", dateId);
      const updates: Partial<DatePlan> = { status: newStatus };
      if (newStatus === "confirmed") {
        updates.acceptedBy = session.role;
      }
      await updateDoc(dateRef, updates);
    } catch (err) {
      console.error("Error updating date status:", err);
      showToast("Failed to update that date's status. Please try again.");
    }
  };

  const handleDeleteDate = async (dateId: string) => {
    const confirmed = await confirm({
      title: "Remove this date plan?",
      message: "This will permanently delete it for both of you. This can't be undone.",
      confirmLabel: "Remove Date",
      danger: true
    });
    if (!confirmed) return;
    try {
      const dateRef = doc(db, "rooms", session.roomId, "dates", dateId);
      await deleteDoc(dateRef);
    } catch (err) {
      console.error("Error deleting date:", err);
      showToast("Failed to remove that date plan. Please try again.");
    }
  };

  const openMemoryEditor = (d: DatePlan) => {
    setEditingMemory(d);
    setSummaryInput(d.summary || "");
    setMemoryPhotos(d.photos || []);
    setMemoryError("");
  };

  const handleAddMemoryPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    setMemoryError("");
    setIsCompressing(true);
    try {
      let running = [...memoryPhotos];
      for (const file of files) {
        if (running.length >= MAX_PHOTOS) {
          setMemoryError(`You can add up to ${MAX_PHOTOS} photos per date.`);
          break;
        }
        if (!file.type.startsWith("image/")) {
          setMemoryError("Please choose image files only.");
          continue;
        }
        if (file.size > MAX_ORIGINAL_FILE_BYTES) {
          setMemoryError("One of those photos is too large (over 20MB).");
          continue;
        }
        let dataUri: string;
        try {
          dataUri = await compressDatePhoto(file);
        } catch {
          setMemoryError("A photo couldn't be processed. Try a different one.");
          continue;
        }
        const currentTotal = running.reduce((sum, p) => sum + p.length, 0);
        if (currentTotal + dataUri.length > MAX_PHOTOS_BUDGET) {
          setMemoryError("These photos are too large to store together. Try fewer or smaller photos.");
          break;
        }
        running = [...running, dataUri];
      }
      setMemoryPhotos(running);
    } finally {
      setIsCompressing(false);
      if (memoryFileRef.current) memoryFileRef.current.value = "";
    }
  };

  const handleRemoveMemoryPhoto = (index: number) => {
    setMemoryPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveMemory = async () => {
    if (!editingMemory) return;
    setIsSavingMemory(true);
    setMemoryError("");
    try {
      const dateRef = doc(db, "rooms", session.roomId, "dates", editingMemory.id);
      // Keep only the first word of the summary (a one-word recap).
      const oneWord = summaryInput.trim().split(/\s+/)[0] || "";
      await updateDoc(dateRef, { summary: oneWord, photos: memoryPhotos });
      setEditingMemory(null);
      showToast("Memory saved!", "success");
    } catch (err) {
      console.error("Error saving memory:", err);
      setMemoryError("Failed to save. Please try again.");
    } finally {
      setIsSavingMemory(false);
    }
  };

  const formatPlanDate = (rawDateStr: string) => {
    try {
      const d = new Date(rawDateStr);
      // Format beautifully like "Tuesday, July 14, 2026 @ 7:00 PM"
      return d.toLocaleDateString(undefined, { 
        weekday: "short", 
        month: "short", 
        day: "numeric", 
        year: "numeric" 
      }) + " • " + d.toLocaleTimeString(undefined, { 
        hour: "2-digit", 
        minute: "2-digit" 
      });
    } catch {
      return rawDateStr;
    }
  };

  // Since there's no push-notification backend, nudge the proposer with an
  // escalating visual cue based on how long the invite has sat unanswered.
  const getDaysAwaitingRsvp = (createdAt: string) => {
    try {
      const created = new Date(createdAt).getTime();
      return Math.max(0, Math.floor((now.getTime() - created) / (1000 * 60 * 60 * 24)));
    } catch {
      return 0;
    }
  };

  // Parse a plan's date to a timestamp for reliable chronological sorting
  // (the stored string format can vary, so we sort by parsed time, not text).
  const dateTime = (d: DatePlan) => {
    const t = new Date(d.date).getTime();
    return isNaN(t) ? Infinity : t;
  };

  // Divide dates into Confirmed (Upcoming), Proposed (Awaiting RSVPs), and Past
  // (Completed). Upcoming lists are sorted nearest-first; memories most-recent-first.
  const confirmedDates = dates
    .filter((d) => d.status === "confirmed" && new Date(d.date) >= now)
    .sort((a, b) => dateTime(a) - dateTime(b));
  const proposedDates = dates
    .filter((d) => d.status === "proposed")
    .sort((a, b) => dateTime(a) - dateTime(b));
  const completedOrPastDates = dates
    .filter((d) => d.status === "completed" || (d.status === "confirmed" && new Date(d.date) < now))
    .sort((a, b) => dateTime(b) - dateTime(a));
  const declinedDates = dates.filter((d) => d.status === "declined");

  // Countdown to the closest upcoming confirmed date
  const nextDate = confirmedDates[0];
  let countdown: { days: number; hours: number; minutes: number; seconds: number } | null = null;
  if (nextDate) {
    const diff = Math.max(0, new Date(nextDate.date).getTime() - now.getTime());
    countdown = {
      days: Math.floor(diff / (1000 * 60 * 60 * 24)),
      hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
      minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
      seconds: Math.floor((diff % (1000 * 60)) / 1000)
    };
  }

  return (
    <div id="date-planner-root" className="space-y-6">
      {/* Countdown to Next Scheduled Date */}
      <div id="date-countdown-timer" className="bg-natural-olive text-white rounded-[32px] p-6 card-shadow textured-bg animate-fade-in">
        {countdown && nextDate ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/70">Counting down to</p>
              <h3 className="font-serif text-lg italic font-light mt-0.5">{nextDate.title}</h3>
            </div>
            <div className="flex items-center gap-3 sm:gap-5">
              {[
                { label: "Days", value: countdown.days },
                { label: "Hrs", value: countdown.hours },
                { label: "Min", value: countdown.minutes },
                { label: "Sec", value: countdown.seconds }
              ].map((unit) => (
                <div key={unit.label} className="flex flex-col items-center min-w-[44px]">
                  <span className="text-2xl sm:text-3xl font-serif font-semibold tabular-nums">
                    {String(unit.value).padStart(2, "0")}
                  </span>
                  <span className="text-[9px] uppercase tracking-wider text-white/70">{unit.label}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-white/80 flex-shrink-0" />
            <p className="text-sm font-serif italic font-light">
              No upcoming date locked in yet. Propose or accept an invitation to start the countdown!
            </p>
          </div>
        )}
      </div>

      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-4 animate-fade-in">
        <div>
          <h2 className="text-2xl font-serif font-light text-natural-text flex items-center gap-2">
            <Calendar className="w-6 h-6 text-natural-terracotta" />
            Date Planner
          </h2>
          <p className="text-xs text-natural-text/60 mt-1">
            Propose magical dates, sync budgets and preparations, and RSVP to your partner's invitations in real-time.
          </p>
        </div>

        <button
          id="btn-propose-date-toggle"
          onClick={() => setIsFormOpen(!isFormOpen)}
          className="bg-natural-olive hover:bg-natural-olive-hover text-white font-medium font-serif italic text-xs py-2 px-4 rounded-xl flex items-center gap-1.5 cursor-pointer transition-all shadow-sm"
        >
          {isFormOpen ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {isFormOpen ? "Close Form" : "Propose a Date"}
        </button>
      </div>

      {/* Date Proposing Form */}
      <AnimatePresence>
        {isFormOpen && (
          <motion.div
            ref={formRef}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <form onSubmit={handleProposeDate} className="bg-white border border-natural-border rounded-[32px] p-6 card-shadow space-y-4 textured-bg">
              <h3 className="font-serif text-lg text-natural-text border-b border-natural-border pb-2 font-light italic">Propose an Adventure</h3>
              
              {error && (
                <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl text-center">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-natural-text/60 uppercase mb-1">DATE TITLE *</label>
                    <input
                      id="date-title-input"
                      type="text"
                      placeholder="e.g. Picnic at the Botanical Gardens"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                      className="w-full bg-natural-card border border-natural-border rounded-xl py-2.5 px-3.5 text-xs text-natural-text focus:ring-2 focus:ring-natural-olive/20 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-natural-text/60 uppercase mb-1">DESCRIPTION & DETAILS</label>
                    <textarea
                      id="date-desc-textarea"
                      placeholder="Describe what we will do, the vibe, or any sweet ideas..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      className="w-full bg-natural-card border border-natural-border rounded-xl p-3.5 text-xs text-natural-text focus:ring-2 focus:ring-natural-olive/20 focus:outline-none resize-none placeholder:text-natural-text/40"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-natural-text/60 uppercase mb-1">WHEN IS IT PLANNED FOR? *</label>
                    <input
                      id="date-time-input"
                      type="datetime-local"
                      value={dateStr}
                      onChange={(e) => setDateStr(e.target.value)}
                      required
                      className="w-full bg-natural-card border border-natural-border rounded-xl py-2.5 px-3.5 text-xs text-natural-text focus:ring-2 focus:ring-natural-olive/20 focus:outline-none [color-scheme:light] [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:hover:opacity-100"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-natural-text/60 uppercase mb-1">COST / BUDGET *</label>
                      <input
                        id="date-cost-input"
                        type="text"
                        placeholder="e.g. 20,000 TZS or Free"
                        value={cost}
                        onChange={(e) => setCost(e.target.value)}
                        required
                        className="w-full bg-natural-card border border-natural-border rounded-xl py-2.5 px-3.5 text-xs text-natural-text focus:ring-2 focus:ring-natural-olive/20 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-natural-text/60 uppercase mb-1">WHAT TO PREPARE *</label>
                      <input
                        id="date-prepare-input"
                        type="text"
                        placeholder="e.g. Warm jacket & blanket"
                        value={prepare}
                        onChange={(e) => setPrepare(e.target.value)}
                        required
                        className="w-full bg-natural-card border border-natural-border rounded-xl py-2.5 px-3.5 text-xs text-natural-text focus:ring-2 focus:ring-natural-olive/20 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-natural-border">
                <button
                  id="btn-submit-proposal"
                  type="submit"
                  disabled={loading}
                  className="bg-natural-olive hover:bg-natural-olive-hover disabled:bg-natural-card-darker disabled:text-natural-text/40 text-white font-medium font-serif italic text-xs py-2 px-6 rounded-xl flex items-center gap-1.5 cursor-pointer transition-all shadow-sm"
                >
                  <Send className="w-3.5 h-3.5" /> Send Invitation
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-8">
        {/* Confirmed Upcoming Dates */}
        <div className="animate-fade-in">
          <h3 className="font-serif text-lg text-natural-text mb-4 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-natural-green" />
            Locked-In Adventures ({confirmedDates.length})
          </h3>

          {confirmedDates.length === 0 ? (
            <div className="bg-white border border-natural-border rounded-[32px] p-6 text-center text-natural-text/50 text-xs card-shadow">
              No locked-in dates yet. Propose an idea or accept a pending invite to seal your schedule!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {confirmedDates.map((d) => (
                <div id={`date-confirmed-${d.id}`} key={d.id} className="bg-white border border-natural-border rounded-2xl p-5 card-shadow relative overflow-hidden space-y-4">
                  {/* Confirmed Ribbon */}
                  <div className="absolute top-0 right-0 bg-natural-green text-white text-[9px] font-bold py-1 px-3.5 rounded-bl-xl uppercase tracking-wider flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Confirmed
                  </div>

                  <div>
                    <h4 className="text-base font-serif font-medium text-natural-text pr-16">{d.title}</h4>
                    {d.description && <p className="text-xs text-natural-text/60 mt-1 leading-relaxed">{d.description}</p>}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-natural-border text-xs text-natural-text/80">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Clock className="w-4 h-4 text-natural-terracotta flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[9px] font-bold text-natural-text/40 uppercase">When</div>
                        <div className="font-medium break-words leading-tight">{formatPlanDate(d.date)}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 min-w-0">
                      <Wallet className="w-4 h-4 text-natural-olive flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[9px] font-bold text-natural-text/40 uppercase">Budget</div>
                        <div className="font-semibold truncate" title={d.cost}>{d.cost}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 min-w-0">
                      <BaggageClaim className="w-4 h-4 text-natural-text/60 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[9px] font-bold text-natural-text/40 uppercase">Prepare</div>
                        <div className="font-medium truncate" title={d.prepare}>{d.prepare}</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t border-natural-border text-[10px] text-natural-text/50">
                    <span>Organized by {d.proposedBy === "boy" ? "🧑 Him" : "👩 Her"}</span>
                    <div className="flex gap-2">
                      <button
                        id={`btn-complete-date-${d.id}`}
                        onClick={() => handleUpdateStatus(d.id, "completed")}
                        className="text-xs bg-natural-card hover:bg-natural-card-darker border border-natural-border py-1 px-2.5 rounded-lg text-natural-text cursor-pointer font-serif italic transition-all"
                      >
                        ✓ Mark Completed
                      </button>
                      <button
                        id={`btn-delete-confirmed-${d.id}`}
                        onClick={() => handleDeleteDate(d.id)}
                        className="text-natural-text/40 hover:text-natural-terracotta transition-all cursor-pointer"
                        title="Cancel Date"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Proposed / Pending Invites */}
        <div className="animate-fade-in">
          <h3 className="font-serif text-lg text-natural-text mb-4 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-natural-terracotta" />
            Pending Invitations & Proposals ({proposedDates.length})
          </h3>

          {proposedDates.length === 0 ? (
            <div className="bg-white border border-natural-border rounded-[32px] p-6 text-center text-natural-text/50 text-xs card-shadow">
              No pending proposals at this time. Click "Propose a Date" to create an invitation!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {proposedDates.map((d) => {
                const isMyProposal = d.proposedBy === session.role;

                return (
                  <div id={`date-proposed-${d.id}`} key={d.id} className="bg-white border border-natural-border rounded-2xl p-5 card-shadow relative space-y-4">
                    <div className="absolute top-4 right-4 bg-natural-card-darker text-natural-terracotta text-[9px] font-bold py-0.5 px-2 rounded-full border border-natural-border uppercase tracking-wider">
                      Proposal
                    </div>

                    <div>
                      <h4 className="text-base font-serif font-medium text-natural-text pr-16">{d.title}</h4>
                      {d.description && <p className="text-xs text-natural-text/60 mt-1 leading-relaxed">{d.description}</p>}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-natural-border text-xs text-natural-text/80">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Clock className="w-4 h-4 text-natural-terracotta flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="text-[9px] font-bold text-natural-text/40 uppercase">Proposed Time</div>
                          <div className="font-medium break-words leading-tight">{formatPlanDate(d.date)}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 min-w-0">
                        <Wallet className="w-4 h-4 text-natural-olive flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="text-[9px] font-bold text-natural-text/40 uppercase">Cost</div>
                          <div className="font-semibold truncate" title={d.cost}>{d.cost}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 min-w-0">
                        <BaggageClaim className="w-4 h-4 text-natural-text/60 flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="text-[9px] font-bold text-natural-text/40 uppercase">To Prepare</div>
                          <div className="font-medium truncate" title={d.prepare}>{d.prepare}</div>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-3 border-t border-natural-border">
                      <span className="text-[10px] text-natural-text/50">
                        Proposed by {d.proposedBy === "boy" ? "🧑 Him" : "👩 Her"}
                      </span>

                      <div className="flex gap-2">
                        {isMyProposal ? (
                          <div className="flex items-center gap-2">
                            {(() => {
                              const daysWaiting = getDaysAwaitingRsvp(d.createdAt);
                              if (daysWaiting >= 2) {
                                return (
                                  <span className="text-[10px] text-natural-terracotta font-bold font-serif italic flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> Still awaiting RSVP · {daysWaiting}d
                                  </span>
                                );
                              }
                              return <span className="text-[10px] text-natural-text/50 italic font-serif">Awaiting partner RSVP...</span>;
                            })()}
                            <button
                              id={`btn-delete-proposed-my-${d.id}`}
                              onClick={() => handleDeleteDate(d.id)}
                              className="text-natural-text/40 hover:text-natural-terracotta transition-all cursor-pointer"
                              title="Withdraw invitation"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              id={`btn-rsvp-accept-${d.id}`}
                              onClick={() => handleUpdateStatus(d.id, "confirmed")}
                              className="bg-natural-olive hover:bg-natural-olive-hover text-white text-xs font-serif italic py-1 px-3 rounded-lg cursor-pointer transition-all"
                            >
                              Accept Invite
                            </button>
                            <button
                              id={`btn-rsvp-decline-${d.id}`}
                              onClick={() => handleUpdateStatus(d.id, "declined")}
                              className="bg-natural-card hover:bg-natural-card-darker border border-natural-border text-natural-text text-xs font-medium py-1 px-3 rounded-lg cursor-pointer transition-all"
                            >
                              Decline
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Completed Memories */}
        {completedOrPastDates.length > 0 && (
          <div className="animate-fade-in">
            <h3 className="font-serif text-lg text-natural-text mb-4 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-natural-text/40" />
              Beautiful Memories Completed ({completedOrPastDates.length})
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {completedOrPastDates.map((d) => (
                <div id={`date-memory-${d.id}`} key={d.id} className="bg-natural-card-darker border border-natural-border rounded-2xl p-4 shadow-sm relative space-y-2 opacity-95">
                  <div className="flex justify-between items-start gap-2">
                    <h4 className="text-xs font-medium font-serif italic text-natural-text">{d.title}</h4>
                    {d.summary ? (
                      <span className="text-[9px] bg-natural-green/15 text-natural-green px-2 py-0.5 border border-natural-green/30 rounded-full uppercase font-bold flex-shrink-0" title="Your one-word recap">
                        {d.summary}
                      </span>
                    ) : (
                      <span className="text-[8px] bg-natural-card text-natural-text/60 px-2 py-0.5 border border-natural-border rounded uppercase font-bold flex-shrink-0">Memory</span>
                    )}
                  </div>

                  {/* Photos from the date */}
                  {d.photos && d.photos.length > 0 && (
                    <div className="grid grid-cols-3 gap-1.5">
                      {d.photos.slice(0, 6).map((photo, i) => (
                        <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-natural-border">
                          <img src={photo} alt={`Memory ${i + 1}`} className="w-full h-full object-cover" />
                          {i === 5 && d.photos!.length > 6 && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-[11px] font-bold">
                              +{d.photos!.length - 6}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="text-[11px] text-natural-text/60 line-clamp-2">{d.description || "A beautiful date we shared."}</p>
                  <div className="text-[10px] text-natural-text/40 pt-1.5 border-t border-natural-border flex justify-between items-center">
                    <span>{parseShortDate(`q_${d.date.replace(/[^0-9]/g, "_")}`)}</span>
                    <div className="flex items-center gap-2">
                      <button
                        id={`btn-edit-memory-${d.id}`}
                        onClick={() => openMemoryEditor(d)}
                        className="text-natural-text/50 hover:text-natural-olive cursor-pointer transition-all flex items-center gap-1 font-semibold"
                        title="Add a recap word and photos from this date"
                      >
                        <Pencil className="w-3 h-3" /> {d.summary || (d.photos && d.photos.length) ? "Edit" : "Add memories"}
                      </button>
                      <button
                        id={`btn-delete-memory-${d.id}`}
                        onClick={() => handleDeleteDate(d.id)}
                        className="text-natural-text/40 hover:text-natural-terracotta cursor-pointer transition-all"
                        title="Delete this memory"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Memory editor: one-word recap + photos for a past date */}
      <AnimatePresence>
        {editingMemory && (
          <motion.div
            id="memory-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setEditingMemory(null)}
            className="fixed inset-0 z-[90] bg-black/40 flex items-center justify-center p-4"
          >
            <motion.div
              id="memory-panel"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white border border-natural-border rounded-[32px] p-6 card-shadow textured-bg w-full max-w-md max-h-[88vh] overflow-y-auto"
            >
              <div className="flex justify-between items-start mb-1">
                <div>
                  <h3 className="font-serif text-lg text-natural-text flex items-center gap-2 italic font-light">
                    <Sparkles className="w-4 h-4 text-natural-terracotta" />
                    Remember this date
                  </h3>
                  <p className="text-xs text-natural-text/60 mt-0.5">{editingMemory.title}</p>
                </div>
                <button
                  id="btn-close-memory"
                  onClick={() => setEditingMemory(null)}
                  className="p-1.5 text-natural-text/50 hover:text-natural-text hover:bg-natural-card rounded-full cursor-pointer transition-all"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {memoryError && (
                <div className="my-3 p-3 bg-red-50 text-red-700 text-xs rounded-xl text-center">{memoryError}</div>
              )}

              {/* One-word recap */}
              <div className="mt-4">
                <label className="block text-[10px] font-bold text-natural-text/60 uppercase mb-1.5">One-word recap</label>
                <input
                  id="memory-summary-input"
                  type="text"
                  value={summaryInput}
                  onChange={(e) => setSummaryInput(e.target.value.replace(/\s/g, ""))}
                  placeholder="e.g. Magical"
                  maxLength={24}
                  className="w-full bg-natural-card border border-natural-border rounded-xl py-2.5 px-3.5 text-sm text-natural-text focus:ring-2 focus:ring-natural-olive/20 focus:outline-none"
                />
                <p className="text-[10px] text-natural-text/40 mt-1">Sum up the date in a single word.</p>
              </div>

              {/* Photos */}
              <div className="mt-4">
                <label className="block text-[10px] font-bold text-natural-text/60 uppercase mb-1.5">
                  Photos ({memoryPhotos.length}/{MAX_PHOTOS})
                </label>
                <input
                  ref={memoryFileRef}
                  id="memory-photo-input"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleAddMemoryPhotos}
                  className="hidden"
                />
                {memoryPhotos.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {memoryPhotos.map((photo, i) => (
                      <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-natural-border group">
                        <img src={photo} alt={`Memory ${i + 1}`} className="w-full h-full object-cover" />
                        <button
                          id={`btn-remove-memory-photo-${i}`}
                          type="button"
                          onClick={() => handleRemoveMemoryPhoto(i)}
                          className="absolute top-1 right-1 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 cursor-pointer transition-all"
                          title="Remove photo"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {memoryPhotos.length < MAX_PHOTOS && (
                  <button
                    id="btn-add-memory-photos"
                    type="button"
                    disabled={isCompressing}
                    onClick={() => memoryFileRef.current?.click()}
                    className="w-full border border-dashed border-natural-border hover:border-natural-olive rounded-2xl py-4 flex flex-col items-center justify-center gap-1.5 text-natural-text/50 hover:text-natural-olive cursor-pointer transition-all disabled:opacity-50"
                  >
                    {isCompressing ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
                    <span className="text-[11px] font-medium">{isCompressing ? "Processing photos..." : "Add photos from the date"}</span>
                  </button>
                )}
              </div>

              <button
                id="btn-save-memory"
                onClick={handleSaveMemory}
                disabled={isSavingMemory || isCompressing}
                className="w-full mt-5 bg-natural-olive hover:bg-natural-olive-hover disabled:bg-natural-card-darker disabled:text-natural-text/40 text-white font-medium font-serif italic text-sm py-3 px-4 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                {isSavingMemory ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Save Memory</>}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
