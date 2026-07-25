import React from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: React.ReactNode;
  maxWidthClass?: string;
  zClass?: string;
  panelClass?: string;
}

// A native-style sheet: slides up from the bottom on mobile, centers as a card
// on larger screens. Handles the backdrop, drag handle, safe area, and scroll.
export default function BottomSheet({
  open,
  onClose,
  children,
  title,
  maxWidthClass = "max-w-lg",
  zClass = "z-[90]",
  panelClass = "bg-[#FAF6F0]"
}: BottomSheetProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className={`fixed inset-0 ${zClass} bg-black/45 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6`}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 34, stiffness: 360 }}
            onClick={(e) => e.stopPropagation()}
            className={`w-full ${maxWidthClass} ${panelClass} border border-natural-border shadow-2xl rounded-t-[26px] sm:rounded-[26px] max-h-[92dvh] sm:max-h-[86dvh] flex flex-col overflow-hidden`}
          >
            {/* Grab handle — mobile only */}
            <div className="pt-2.5 pb-1 flex justify-center sm:hidden flex-shrink-0">
              <div className="w-10 h-1.5 rounded-full bg-natural-border" />
            </div>

            {title && (
              <div className="flex items-center justify-between px-5 pt-2 sm:pt-4 pb-3 flex-shrink-0">
                <h3 className="font-serif text-lg text-natural-text">{title}</h3>
                <button
                  onClick={onClose}
                  className="p-2 -mr-1 text-natural-text/50 hover:text-natural-text active:scale-90 rounded-full transition-all"
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}

            <div className="overflow-y-auto overscroll-contain flex-1 pb-safe">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
