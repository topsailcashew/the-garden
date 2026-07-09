import React, { useState } from "react";
import { motion } from "motion/react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { UserSession, Room } from "../types";
import { Heart, Key, User, ArrowRight, Loader2, Sparkles } from "lucide-react";

interface OnboardingProps {
  onComplete: (session: UserSession) => void;
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [isJoinMode, setIsJoinMode] = useState<boolean>(false);
  const [boyName, setBoyName] = useState<string>("");
  const [girlName, setGirlName] = useState<string>("");
  const [passcode, setPasscode] = useState<string>("");
  const [roomIdInput, setRoomIdInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  // After room is joined/created, select who you are
  const [createdRoom, setCreatedRoom] = useState<Room | null>(null);
  const [step, setStep] = useState<1 | 2>(1); // 1 = Room Setup, 2 = Character Select

  const generateRoomId = (boy: string, girl: string, pass: string) => {
    const cleanBoy = boy.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    const cleanGirl = girl.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    const cleanPass = pass.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    return `room_${cleanBoy}_${cleanGirl}_${cleanPass}`;
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!boyName.trim() || !girlName.trim() || !passcode.trim()) {
      setError("Please fill in all fields to create your private garden.");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const generatedId = generateRoomId(boyName, girlName, passcode);
      const roomRef = doc(db, "rooms", generatedId);
      const roomSnap = await getDoc(roomRef);

      if (roomSnap.exists()) {
        // Room already exists, just join it!
        const existingData = roomSnap.data() as Room;
        setCreatedRoom({ ...existingData, id: generatedId });
        setStep(2);
      } else {
        // Create new room
        const newRoom: Omit<Room, "id"> = {
          boyName: boyName.trim(),
          girlName: girlName.trim(),
          passcode: passcode.trim(),
          createdAt: new Date().toISOString()
        };
        await setDoc(roomRef, newRoom);
        setCreatedRoom({ ...newRoom, id: generatedId });
        setStep(2);
      }
    } catch (err: any) {
      console.error(err);
      setError("Failed to create room: " + (err.message || err.toString()));
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoomDirect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomIdInput.trim()) {
      setError("Please enter your Room Code to continue.");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const formattedId = roomIdInput.trim();
      const roomRef = doc(db, "rooms", formattedId);
      const roomSnap = await getDoc(roomRef);

      if (!roomSnap.exists()) {
        setError("This Room Code doesn't exist. Please check your typing or create a new room!");
        setLoading(false);
        return;
      }

      const existingData = roomSnap.data() as Room;
      setCreatedRoom({ ...existingData, id: formattedId });
      setStep(2);
    } catch (err: any) {
      console.error(err);
      setError("Failed to join room: " + (err.message || err.toString()));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRole = (role: "boy" | "girl") => {
    if (!createdRoom) return;
    const session: UserSession = {
      role,
      name: role === "boy" ? createdRoom.boyName : createdRoom.girlName,
      partnerName: role === "boy" ? createdRoom.girlName : createdRoom.boyName,
      roomId: createdRoom.id
    };
    onComplete(session);
  };

  return (
    <div id="onboarding-root" className="min-h-screen flex items-center justify-center bg-natural-bg p-4 font-sans relative overflow-hidden select-none">
      {/* Decorative ambient elements */}
      <div className="absolute top-10 left-10 w-64 h-64 bg-natural-card-darker rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-72 h-72 bg-natural-border/30 rounded-full blur-3xl pointer-events-none" />
      
      <motion.div 
        initial={{ opacity: 0, y: 15 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.6 }}
        className="w-full max-w-md bg-white border border-natural-border rounded-[40px] card-shadow overflow-hidden p-8 relative z-10 textured-bg"
      >
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 bg-natural-card-darker rounded-full flex items-center justify-center mb-4">
            <Heart className="w-8 h-8 text-natural-terracotta fill-natural-terracotta/20 animate-pulse" />
          </div>
          <h1 className="text-3xl font-serif font-light italic text-natural-text tracking-tight">Our Courtship Garden</h1>
          <p className="text-natural-text/70 text-xs mt-2 max-w-xs leading-relaxed">
            {step === 1 
              ? "A shared, private space to leave sweet notes, answer daily questions, and coordinate beautiful date plans."
              : "Welcome to your garden! Select who you are to begin your journey together."
            }
          </p>
        </div>

        {step === 1 ? (
          <div>
            {/* Toggle Mode Tab */}
            <div className="flex bg-natural-bg border border-natural-border p-1 rounded-xl mb-6">
              <button 
                id="tab-create"
                onClick={() => { setIsJoinMode(false); setError(""); }}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${!isJoinMode ? "bg-white text-natural-olive shadow-sm font-bold" : "text-natural-text/60 hover:text-natural-text"}`}
              >
                Create Room
              </button>
              <button 
                id="tab-join"
                onClick={() => { setIsJoinMode(true); setError(""); }}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${isJoinMode ? "bg-white text-natural-olive shadow-sm font-bold" : "text-natural-text/60 hover:text-natural-text"}`}
              >
                Join with Code
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-700 text-xs rounded-xl text-center">
                {error}
              </div>
            )}

            {!isJoinMode ? (
              <form onSubmit={handleCreateRoom} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-natural-text/80 tracking-wider mb-1">BOY'S NAME</label>
                  <div className="relative">
                    <User className="absolute left-3 top-3.5 w-4 h-4 text-natural-text/40" />
                    <input 
                      id="boy-name-input"
                      type="text" 
                      placeholder="e.g. Jack"
                      value={boyName}
                      onChange={(e) => setBoyName(e.target.value)}
                      className="w-full bg-natural-card border border-natural-border rounded-xl py-3 pl-10 pr-4 text-sm text-natural-text focus:ring-2 focus:ring-natural-olive/20 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-natural-text/80 tracking-wider mb-1">GIRL'S NAME</label>
                  <div className="relative">
                    <User className="absolute left-3 top-3.5 w-4 h-4 text-natural-text/40" />
                    <input 
                      id="girl-name-input"
                      type="text" 
                      placeholder="e.g. Jill"
                      value={girlName}
                      onChange={(e) => setGirlName(e.target.value)}
                      className="w-full bg-natural-card border border-natural-border rounded-xl py-3 pl-10 pr-4 text-sm text-natural-text focus:ring-2 focus:ring-natural-olive/20 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-natural-text/80 tracking-wider mb-1">SHARED PASSCODE (4+ letters/numbers)</label>
                  <div className="relative">
                    <Key className="absolute left-3 top-3.5 w-4 h-4 text-natural-text/40" />
                    <input 
                      id="passcode-input"
                      type="text" 
                      placeholder="e.g. sweet"
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value)}
                      className="w-full bg-natural-card border border-natural-border rounded-xl py-3 pl-10 pr-4 text-sm text-natural-text focus:ring-2 focus:ring-natural-olive/20 focus:outline-none"
                    />
                  </div>
                  <p className="text-[10px] text-natural-text/50 mt-1">Make this passcode unique. You'll both use this same passcode to sync.</p>
                </div>

                <button 
                  id="btn-create-room"
                  type="submit" 
                  disabled={loading}
                  className="w-full bg-natural-olive hover:bg-natural-olive-hover disabled:bg-natural-card-darker text-white font-medium font-serif italic text-sm py-3 px-4 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all mt-6 shadow-sm hover:shadow"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Enter Our Garden <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handleJoinRoomDirect} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-natural-text/80 tracking-wider mb-1">ROOM CODE</label>
                  <div className="relative">
                    <Key className="absolute left-3 top-3.5 w-4 h-4 text-natural-text/40" />
                    <input 
                      id="room-code-input"
                      type="text" 
                      placeholder="e.g. room_jack_jill_sweet"
                      value={roomIdInput}
                      onChange={(e) => setRoomIdInput(e.target.value)}
                      className="w-full bg-natural-card border border-natural-border rounded-xl py-3 pl-10 pr-4 text-sm text-natural-text focus:ring-2 focus:ring-natural-olive/20 focus:outline-none"
                    />
                  </div>
                  <p className="text-[10px] text-natural-text/50 mt-1">Ask your partner for the complete room code generated on their screen.</p>
                </div>

                <button 
                  id="btn-join-room"
                  type="submit" 
                  disabled={loading}
                  className="w-full bg-natural-olive hover:bg-natural-olive-hover disabled:bg-natural-card-darker text-white font-medium font-serif italic text-sm py-3 px-4 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all mt-6 shadow-sm hover:shadow"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Connect to Room <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="p-4 bg-natural-card border border-natural-border rounded-2xl flex flex-col items-center">
              <span className="text-[10px] font-bold text-natural-text/60 tracking-wider">YOUR SECURE ROOM CODE</span>
              <span className="text-xs font-serif italic font-semibold text-natural-terracotta select-all mt-1 bg-white px-3 py-1 border border-natural-border rounded-lg shadow-inner">
                {createdRoom?.id}
              </span>
              <p className="text-[10px] text-natural-text/50 mt-2 text-center">Share this code with your partner to let them join this private room!</p>
            </div>

            <div className="space-y-3">
              <button 
                id="role-boy"
                onClick={() => handleSelectRole("boy")}
                className="w-full border border-natural-border hover:border-natural-green hover:bg-natural-card rounded-2xl p-4 flex items-center justify-between text-left transition-all group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-natural-card-darker rounded-full flex items-center justify-center text-lg shadow-inner">🧑</div>
                  <div>
                    <h3 className="font-semibold text-natural-text group-hover:text-natural-olive text-sm">I am {createdRoom?.boyName}</h3>
                    <p className="text-[11px] text-natural-text/50">Log in as the boy</p>
                  </div>
                </div>
                <Sparkles className="w-5 h-5 text-natural-text/30 group-hover:text-natural-green opacity-0 group-hover:opacity-100 transition-all" />
              </button>

              <button 
                id="role-girl"
                onClick={() => handleSelectRole("girl")}
                className="w-full border border-natural-border hover:border-natural-green hover:bg-natural-card rounded-2xl p-4 flex items-center justify-between text-left transition-all group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-natural-card-darker rounded-full flex items-center justify-center text-lg shadow-inner">👩</div>
                  <div>
                    <h3 className="font-semibold text-natural-text group-hover:text-natural-olive text-sm">I am {createdRoom?.girlName}</h3>
                    <p className="text-[11px] text-natural-text/50">Log in as the girl</p>
                  </div>
                </div>
                <Sparkles className="w-5 h-5 text-natural-text/30 group-hover:text-natural-green opacity-0 group-hover:opacity-100 transition-all" />
              </button>
            </div>

            <button 
              id="btn-back-setup"
              onClick={() => setStep(1)}
              className="w-full text-natural-text/60 hover:text-natural-text text-xs text-center block pt-2 transition-all font-serif italic"
            >
              ← Back to Room Setup
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
