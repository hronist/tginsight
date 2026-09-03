"use client";

import { useState } from "react";
import { RagAssistant } from "@/components/panels/RagAssistant";
import { AnalyticsPanel } from "@/components/panels/AnalyticsPanel";

type Tab = "assistant" | "analytics";

export function RightPanel() {
  const [tab, setTab] = useState<Tab>("analytics");

  return (
    <aside className="flex min-h-0 flex-col bg-[var(--bg-panel)]">
      <div className="shrink-0 border-b border-[var(--border)] p-2">
        <div
          role="tablist"
          aria-label="Right panel"
          className="grid grid-cols-2 gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1"
        >
          <TabButton
            active={tab === "analytics"}
            onClick={() => setTab("analytics")}
          >
            Analytics
          </TabButton>
          <TabButton
            active={tab === "assistant"}
            onClick={() => setTab("assistant")}
          >
            Assistant
          </TabButton>
        </div>
      </div>

      <div className="min-h-0 flex-1" role="tabpanel">
        {tab === "assistant" ? <RagAssistant /> : <AnalyticsPanel />}
      </div>
    </aside>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-[var(--bg-elevated)] text-[var(--text)] shadow-sm"
          : "text-[var(--text-muted)] hover:text-[var(--text)]"
      }`}
    >
      {children}
    </button>
  );
}
