import { motion } from "motion/react";

// Full-screen holding page shown while the database migration runs. Renders
// instead of <App/>, so no Firestore listeners mount and no reads are used.

// Dirt clumps tossed out of the hole on each dig.
const CLUMPS = [
  { x: -30, size: 10, delay: 0 },
  { x: 26, size: 8, delay: 0.28 },
  { x: -12, size: 7, delay: 0.52 },
  { x: 16, size: 9, delay: 0.7 }
];

function DiggingScene() {
  return (
    <div className="relative w-60 h-44 mx-auto mb-2 select-none" aria-hidden="true">
      {/* little sprout, hopeful on the side */}
      <motion.div
        className="absolute left-8 bottom-[52px] text-2xl origin-bottom"
        animate={{ rotate: [-6, 6, -6] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      >
        🌱
      </motion.div>

      {/* shovel — pivots down into the mound and back up */}
      <div className="absolute left-1/2 top-1 -translate-x-1/2">
        <motion.div
          className="origin-bottom"
          style={{ transformOrigin: "50% 90%" }}
          animate={{ rotate: [-26, 8, -26], y: [0, 10, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        >
          <svg width="52" height="82" viewBox="0 0 52 82" fill="none">
            {/* grip */}
            <rect x="15" y="4" width="22" height="7" rx="3.5" fill="#b98f5a" />
            <rect x="24" y="8" width="4" height="6" fill="#b98f5a" />
            {/* shaft */}
            <rect x="22" y="10" width="8" height="42" rx="4" fill="#a9814f" />
            {/* blade */}
            <path d="M14 50 H38 L35 64 Q26 78 17 64 Z" fill="#c9ccd1" stroke="#9aa0a6" strokeWidth="1.5" />
          </svg>
        </motion.div>
      </div>

      {/* soil mound (in front, so the blade digs "into" it) */}
      <div className="absolute bottom-7 left-1/2 -translate-x-1/2 w-44 h-14 bg-gradient-to-b from-[#a07d58] to-[#7c5f42] rounded-[50%] shadow-inner" />
      <div className="absolute bottom-[46px] left-1/2 -translate-x-1/2 w-10 h-4 bg-[#5f4830]/70 rounded-[50%]" />

      {/* dirt clumps flying out of the hole */}
      <div className="absolute bottom-[54px] left-1/2 -translate-x-1/2">
        {CLUMPS.map((c, i) => (
          <motion.span
            key={i}
            className="absolute rounded-full bg-[#8a6b4a]"
            style={{ width: c.size, height: c.size, left: -c.size / 2 }}
            animate={{ x: [0, c.x], y: [0, -32, 10], opacity: [0, 1, 0], scale: [0.5, 1, 0.6] }}
            transition={{ duration: 1.5, delay: c.delay, repeat: Infinity, ease: "easeOut" }}
          />
        ))}
      </div>

      {/* ground line */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-52 h-1.5 bg-[#7c5f42]/50 rounded-full" />
    </div>
  );
}

export default function Maintenance() {
  return (
    <div className="min-h-screen bg-natural-bg text-natural-text font-sans flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full">
        <p className="text-[11px] uppercase tracking-[0.35em] text-natural-text/40 mb-3">A private space for</p>
        <h1 className="text-4xl font-serif font-light text-natural-text mb-6">
          Nate <span className="text-natural-terracotta">❤</span> Kez
        </h1>

        <DiggingScene />

        <div className="bg-white border border-natural-border rounded-[28px] p-7 card-shadow">
          <h2 className="text-xl font-serif font-light text-natural-text mb-2">Just a little housekeeping</h2>
          <p className="text-sm text-natural-text/70 leading-relaxed">
            Hey babe — I'm moving the garden to a cozier space so it can grow without limits. Everything is safe,
            nothing is lost. We'll be back in the garden very soon. 💛
          </p>
        </div>

        <p className="text-[11px] uppercase tracking-[0.25em] text-natural-text/30 mt-6">Back very soon</p>
      </div>
    </div>
  );
}
