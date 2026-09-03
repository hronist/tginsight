import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const TONE_CLASS = {
  blue: "bg-[#4a413d] text-[#fff8f5]",
  teal: "bg-[#5a8a7a] text-[#fff8f5]",
  violet: "bg-[#7a6a8a] text-[#fff8f5]",
  orange: "bg-[#c47a4a] text-[#fff8f5]",
} as const;

export type AvatarTone = keyof typeof TONE_CLASS;

export function toneFromSeed(seed: string): AvatarTone {
  const tones = Object.keys(TONE_CLASS) as AvatarTone[];
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return tones[Math.abs(h) % tones.length];
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export function UserAvatar({
  name,
  seed,
  tone,
  size = "default",
  className,
}: {
  name: string;
  seed?: string;
  tone?: AvatarTone;
  size?: "default" | "sm" | "lg";
  className?: string;
}) {
  const resolvedTone = tone ?? toneFromSeed(seed ?? name);
  return (
    <Avatar size={size} className={className}>
      <AvatarFallback className={cn("text-[10px] font-semibold", TONE_CLASS[resolvedTone])}>
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
