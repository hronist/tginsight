import type { TGMessage, TGTextPart } from "@/types/telegram";

/** Flatten Telegram `text` field (string | entity array) to plain string. */
export function flattenText(text: string | TGTextPart[] | undefined | null): string {
  if (text == null) return "";
  if (typeof text === "string") return text;
  return text
    .map((part) => (typeof part === "string" ? part : part.text ?? ""))
    .join("");
}

export function isForwarded(message: TGMessage): boolean {
  return Boolean(message.forwarded_from || message.forwarded_from_id);
}

export function isService(message: TGMessage): boolean {
  return message.type === "service";
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}
