import React, { createContext, useCallback, useContext, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle } from "lucide-react";

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within a ConfirmProvider");
  return ctx.confirm;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve });
    });
  }, []);

  const handleChoice = (result: boolean) => {
    pending?.resolve(result);
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <AnimatePresence>
        {pending && (
          <motion.div
            id="confirm-dialog-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => handleChoice(false)}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white border border-natural-border rounded-[28px] p-6 max-w-sm w-full card-shadow textured-bg"
            >
              <div className="flex items-start gap-3 mb-2">
                {pending.danger && (
                  <div className="w-8 h-8 rounded-full bg-natural-card-darker flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-4 h-4 text-natural-terracotta" />
                  </div>
                )}
                <h3 className="font-serif text-lg italic font-light text-natural-text pt-1">{pending.title}</h3>
              </div>
              <p className="text-sm text-natural-text/70 leading-relaxed mb-6">{pending.message}</p>
              <div className="flex gap-3 justify-end">
                <button
                  id="btn-confirm-cancel"
                  type="button"
                  onClick={() => handleChoice(false)}
                  className="bg-natural-card hover:bg-natural-card-darker border border-natural-border text-natural-text text-xs font-medium py-2 px-4 rounded-xl cursor-pointer transition-all"
                >
                  {pending.cancelLabel || "Cancel"}
                </button>
                <button
                  id="btn-confirm-accept"
                  type="button"
                  onClick={() => handleChoice(true)}
                  className={`text-xs font-medium font-serif italic py-2 px-4 rounded-xl cursor-pointer transition-all text-white ${
                    pending.danger
                      ? "bg-natural-terracotta hover:bg-natural-terracotta-hover"
                      : "bg-natural-olive hover:bg-natural-olive-hover"
                  }`}
                >
                  {pending.confirmLabel || "Confirm"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ConfirmContext.Provider>
  );
}
