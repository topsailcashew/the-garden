import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";

export const ALL_REACTIONS = [
  "❤️", "🥰", "😍", "🥹", "😂", "🤗",
  "🌹", "✨", "🔥", "🥳", "😮", "😢",
  "🙏", "💯", "👏", "💕", "😘", "🤩",
  "😭", "🫶", "💖", "😅", "🙌", "🤔"
];

interface ReactionPickerProps {
  open: boolean;
  currentReaction?: string;
  onSelect: (emoji: string) => void;
  onClose: () => void;
  onClear?: () => void;
}

// Shared fullscreen reaction picker with a frosted-glass panel. Selecting a
// reaction fires onSelect (the caller is expected to close it immediately).
export default function ReactionPicker({ open, currentReaction, onSelect, onClose, onClear }: ReactionPickerProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          id="reaction-picker-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[95] bg-black/40 flex items-center justify-center p-4"
        >
          <motion.div
            id="reaction-picker-panel"
            initial={{ opacity: 0, scale: 0.9, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 16 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-[28px] p-5 shadow-2xl w-full max-w-xs"
          >
            <div className="flex justify-end items-center mb-2">
              <button
                id="btn-close-reaction-picker"
                onClick={onClose}
                className="p-1 text-natural-text/50 hover:text-natural-text hover:bg-white/50 rounded-full cursor-pointer transition-all"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-6 gap-1.5">
              {ALL_REACTIONS.map((reaction) => (
                <button
                  id={`picker-react-${reaction}`}
                  key={reaction}
                  onClick={() => onSelect(reaction)}
                  className={`aspect-square rounded-xl flex items-center justify-center text-xl transition-all active:scale-125 cursor-pointer hover:scale-110 ${
                    currentReaction === reaction
                      ? "bg-natural-olive/25 border border-natural-olive/40 shadow-inner"
                      : "bg-white/40 hover:bg-white/80"
                  }`}
                  title={`React with ${reaction}`}
                >
                  {reaction}
                </button>
              ))}
            </div>

            {currentReaction && onClear && (
              <button
                id="btn-clear-reaction"
                onClick={onClear}
                className="w-full mt-3 text-[11px] text-natural-text/50 hover:text-natural-terracotta py-1.5 cursor-pointer transition-all"
              >
                Remove my reaction
              </button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
