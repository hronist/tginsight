"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Hash } from "lucide-react";
import { UserAvatar, toneFromSeed } from "@/components/ui/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { NormalizedMessage } from "@/types/telegram";
import type { FilterHit } from "@/lib/telegram/filter";
import { cn } from "@/lib/utils";

function formatTime(date: string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date.replace("T", " ").slice(11, 16);
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function highlightText(text: string, patterns: string[]) {
  if (patterns.length === 0) return text;
  try {
    const escaped = patterns.map((p) =>
      p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    );
    const regex = new RegExp(`(${escaped.join("|")})`, "gi");
    const parts = text.split(regex);
    const lowerPatterns = patterns.map((p) => p.toLowerCase());
    return parts.map((part, i) =>
      lowerPatterns.includes(part.toLowerCase()) ? (
        <mark key={i} className="rounded-sm bg-primary/20 px-0.5 text-foreground">
          {part}
        </mark>
      ) : (
        part
      ),
    );
  } catch {
    return text;
  }
}

export function MessageCard({
  message,
  matched,
  highlightPatterns,
}: {
  message: NormalizedMessage;
  matched: boolean;
  highlightPatterns: string[];
}) {
  const name = message.from ?? message.fromId ?? "Unknown";
  const tone = toneFromSeed(message.fromId ?? name);

  return (
    <article
      className={cn(
        "group rounded-xl bg-card px-3.5 py-3 ring-1 transition-all",
        matched
          ? "ring-border/70 hover:shadow-md hover:ring-primary/40"
          : "bg-muted/40 opacity-75 ring-border/40 hover:opacity-100 hover:ring-border/60",
      )}
    >
      <header className="flex items-center gap-2.5">
        <UserAvatar name={name} tone={tone} size="sm" className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-[13px] font-semibold tracking-tight text-foreground">
              {name}
            </span>
            <time
              dateTime={message.date}
              className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
            >
              {formatTime(message.date)}
            </time>
          </div>
        </div>
      </header>

      <p className="mt-2 text-[13px] leading-relaxed break-words whitespace-pre-wrap text-foreground/90">
        {highlightText(message.text, highlightPatterns)}
      </p>

      <footer className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] tabular-nums text-muted-foreground/60">
        <span className="inline-flex items-center gap-0.5">
          <Hash className="size-2.5" />
          {message.id}
        </span>
        {message.month && (
          <>
            <span aria-hidden className="opacity-40">
              ·
            </span>
            <span>{message.month}</span>
          </>
        )}
        {message.fromId && (
          <>
            <span aria-hidden className="opacity-40">
              ·
            </span>
            <span className="truncate">{message.fromId}</span>
          </>
        )}
      </footer>
    </article>
  );
}

export function MessageHitRow({
  hit,
  highlightPatterns = [],
  score,
  focused,
  onFocus,
  expanded: expandedProp,
  onToggleExpand,
  defaultExpanded = false,
}: {
  hit: FilterHit;
  highlightPatterns?: string[];
  score?: number;
  focused?: boolean;
  onFocus?: () => void;
  expanded?: boolean;
  onToggleExpand?: () => void;
  defaultExpanded?: boolean;
}) {
  const [uncontrolled, setUncontrolled] = useState(defaultExpanded);
  const controlled = expandedProp !== undefined;
  const expanded = controlled ? Boolean(expandedProp) : uncontrolled;
  const toggle = () => {
    if (controlled) onToggleExpand?.();
    else setUncontrolled((v) => !v);
  };
  const hasContext = hit.chain.length > 1;
  const matched = hit.chain.find((m) => m.id === hit.matchedId);
  if (!matched) return null;

  const visibleChain = expanded ? hit.chain : [matched];

  return (
    <div
      className={cn(
        "space-y-1.5",
        focused && "rounded-xl ring-2 ring-primary/20",
      )}
      onClick={onFocus}
    >
      <div className="flex flex-wrap items-center gap-2">
        {hasContext && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              toggle();
            }}
          >
            {expanded ? (
              <ChevronUp className="size-3" />
            ) : (
              <ChevronDown className="size-3" />
            )}
            {expanded
              ? `Скрыть контекст (${hit.chain.length - 1})`
              : `Контекст (+${hit.chain.length - 1})`}
          </Button>
        )}
        {typeof score === "number" && (
          <Badge variant="secondary" className="text-[10px] tabular-nums">
            score {score.toFixed(3)}
          </Badge>
        )}
      </div>
      {visibleChain.map((msg) => (
        <div
          key={msg.id}
          className={cn(
            msg.id !== hit.matchedId &&
              expanded &&
              "ml-3 border-l-2 border-border/50 pl-3",
          )}
        >
          <MessageCard
            message={msg}
            matched={msg.id === hit.matchedId}
            highlightPatterns={highlightPatterns}
          />
        </div>
      ))}
    </div>
  );
}
