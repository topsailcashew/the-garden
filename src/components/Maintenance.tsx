import { Heart } from "lucide-react";

// Full-screen holding page shown while the database migration runs. Renders
// instead of <App/>, so no Firestore listeners mount and no reads are used.
export default function Maintenance() {
  return (
    <div className="min-h-screen bg-natural-bg text-natural-text font-sans flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md">
        <div className="w-16 h-16 rounded-full bg-natural-card-darker flex items-center justify-center mx-auto mb-6 shadow-inner">
          <Heart className="w-7 h-7 text-natural-terracotta" />
        </div>

        <p className="text-[11px] uppercase tracking-[0.35em] text-natural-text/40 mb-3">A private space for</p>
        <h1 className="text-4xl font-serif font-light text-natural-text mb-6">
          Nate <span className="text-natural-terracotta">❤</span> Kez
        </h1>

        <div className="bg-white border border-natural-border rounded-[28px] p-7 card-shadow">
          <div className="text-3xl mb-3">🌱</div>
          <h2 className="text-xl font-serif font-light text-natural-text mb-2">Just a little housekeeping</h2>
          <p className="text-sm text-natural-text/60 leading-relaxed">
            We're moving the garden to a cozier home so it can grow without limits. Every note, letter, and memory is
            safe — nothing is lost. We'll be back very soon. 💛
          </p>
        </div>

        <p className="text-[11px] uppercase tracking-[0.25em] text-natural-text/30 mt-6">Back shortly</p>
      </div>
    </div>
  );
}
