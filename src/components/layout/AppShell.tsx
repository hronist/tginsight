"use client";

import { useState } from "react";
import {
  CircleHelp,
  Inbox,
  LayoutDashboard,
  Menu,
  MessageCircle,
  Tags,
  X,
} from "lucide-react";
import { ChatProvider } from "@/state/ChatContext";
import { RagProvider, useRag } from "@/state/RagContext";
import { useChat } from "@/state/ChatContext";
import { FiltersPanel } from "@/components/panels/FiltersPanel";
import { AskResultPanel } from "@/components/panels/AskResultPanel";
import { MessageStream } from "@/components/panels/MessageStream";
import { IntelligencePanel } from "@/components/panels/IntelligencePanel";
import { ProgressBanner } from "@/components/ui/ProgressBanner";
import { SettingsMenu } from "@/components/ui/SettingsMenu";
import { DebugStrip } from "@/components/ui/DebugStrip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function TopBar({
  sidebarOpen,
  onToggleSidebar,
}: {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}) {
  const { meta, hitCount } = useChat();

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-3 md:px-5">
      <div className="flex min-w-0 items-center gap-2.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="lg:hidden"
          aria-label="Меню фильтров"
          aria-expanded={sidebarOpen}
          onClick={onToggleSidebar}
        >
          <Menu className="size-4" />
        </Button>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <MessageCircle className="size-[18px]" />
        </div>
        <span className="truncate text-sm font-extrabold tracking-[0.13em]">
          TG<span className="text-primary">INSIGHT</span>
        </span>
        {meta && (
          <Badge variant="outline" className="ml-1 hidden max-w-48 gap-1.5 sm:inline-flex">
            <span className="size-1.5 shrink-0 rounded-full bg-primary" />
            <span className="truncate">{meta.chatName}</span>
          </Badge>
        )}
      </div>

      <nav className="absolute top-0 left-1/2 hidden h-full -translate-x-1/2 items-stretch gap-1 lg:flex" aria-label="Навигация">
        <Button variant="ghost" className="h-full rounded-none border-b-2 border-primary text-primary">
          <LayoutDashboard className="size-4" />
          Обзор
        </Button>
        <Button variant="ghost" className="h-full rounded-none border-b-2 border-transparent text-muted-foreground">
          <Inbox className="size-4" />
          Сообщения
          {meta && (
            <Badge variant="secondary" className="ml-1">
              {hitCount > 999 ? `${Math.round(hitCount / 1000)}k` : hitCount}
            </Badge>
          )}
        </Button>
        <Button
          variant="ghost"
          disabled
          className="h-full rounded-none border-b-2 border-transparent text-muted-foreground"
          title="Скоро"
        >
          <Tags className="size-4" />
          Темы
        </Button>
      </nav>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button variant="ghost" size="icon-sm" className="hidden sm:inline-flex" aria-label="Справка">
          <CircleHelp className="size-4" />
        </Button>
        <SettingsMenu />
      </div>
    </header>
  );
}

function ShellBody() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { fileName } = useChat();
  const { askView } = useRag();
  const [uploadToast, setUploadToast] = useState(false);

  function onUploaded() {
    setUploadToast(true);
    setSidebarOpen(false);
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <TopBar sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen((v) => !v)} />
      <ProgressBanner />

      {uploadToast && fileName && (
        <div
          className="fixed top-16 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-emerald-300/50 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 shadow-lg"
          role="status"
        >
          Файл экспорта готов к анализу
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => setUploadToast(false)}
            aria-label="Закрыть"
          >
            <X className="size-3" />
          </Button>
        </div>
      )}

      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          aria-label="Закрыть меню"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[280px_minmax(0,1fr)_300px]">
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col overflow-hidden border-r border-border bg-card pt-14 shadow-xl transition-transform duration-200 lg:static lg:z-auto lg:pt-0 lg:shadow-none",
            sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          )}
        >
          <FiltersPanel onUploaded={onUploaded} />
        </aside>

        <div className="min-h-0 min-w-0 overflow-hidden">
          {askView ? <AskResultPanel /> : <MessageStream />}
        </div>

        <aside className="hidden min-h-0 overflow-hidden border-l border-border bg-card lg:flex lg:flex-col">
          <IntelligencePanel />
        </aside>
      </div>

      <DebugStrip />
    </div>
  );
}

export function AppShell() {
  return (
    <ChatProvider>
      <RagProvider>
        <ShellBody />
      </RagProvider>
    </ChatProvider>
  );
}
