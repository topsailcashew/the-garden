import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

interface ToastItem {
  id: number;
  message: string;
  variant: "error" | "success";
}

interface ToastContextValue {
  showToast: (message: string, variant?: "error" | "success") => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const showToast = useCallback((message: string, variant: "error" | "success" = "error") => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div id="toast-container" className="fixed bottom-4 right-4 z-[100] space-y-2 max-w-xs w-full pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={`pointer-events-auto flex items-start gap-2 rounded-2xl border p-3.5 shadow-lg text-xs font-medium ${
                t.variant === "error"
                  ? "bg-red-50 border-red-200 text-red-700"
                  : "bg-natural-card border-natural-border text-natural-text"
              }`}
            >
              {t.variant === "error" ? (
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
              )}
              <span className="flex-1 leading-snug">{t.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
