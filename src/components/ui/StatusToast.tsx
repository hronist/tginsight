"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function StatusToast({
  open,
  message,
  onClose,
  durationMs = 4500,
}: {
  open: boolean;
  message: string;
  onClose: () => void;
  durationMs?: number;
}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!open) {
      setPaused(false);
      return;
    }
    if (paused) return;
    const id = window.setTimeout(() => onCloseRef.current(), durationMs);
    return () => window.clearTimeout(id);
  }, [open, durationMs, paused]);

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed top-16 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground shadow-lg",
        "animate-in fade-in-0 slide-in-from-top-2 duration-200 motion-reduce:animate-none",
      )}
      role="status"
      aria-live="polite"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      <CheckCircle2 className="size-3.5 shrink-0 text-primary" aria-hidden />
      <span>{message}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onClose}
        aria-label="Закрыть"
      >
        <X className="size-3" />
      </Button>
    </div>
  );
}
