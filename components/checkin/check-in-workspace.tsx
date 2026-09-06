"use client";

import { useState } from "react";
import { Kanban, List } from "lucide-react";
import { CheckInFlow } from "@/components/checkin/check-in-flow";
import { CheckInBoard } from "@/components/checkin/check-in-board";
import { cn } from "@/lib/cn";
import type { OpenCommitment, PlannedCommitment } from "@/lib/checkin";

type View = "list" | "board";

/*
 * The switch between the two complete, independent ways to file a week —
 * same pattern as Pending Tasks' List/Board toggle. Each view owns its own
 * header rather than sharing one, deliberately: CheckInFlow's header carries
 * its Stages nav, which is meaningless in board form, and neither view was
 * worth reshaping just to share a title row.
 *
 * The toggle itself is built once here and handed to whichever header is
 * showing, so it sits inside that header's own row next to the title — the
 * same place Pending Tasks puts it — rather than floating above both in a
 * strip of its own right under the global nav bar.
 */
export function CheckInWorkspace({
  cycleId,
  cycleLabel,
  open,
  plannedNext,
}: {
  cycleId: string;
  cycleLabel: string;
  open: OpenCommitment[];
  /** Already-declared plans for next week — see check-in-board.tsx. */
  plannedNext: PlannedCommitment[];
}) {
  const [view, setView] = useState<View>("list");
  const toggle = <ViewToggle view={view} onChange={setView} />;

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-2">
      {view === "list" ? (
        <CheckInFlow
          cycleId={cycleId}
          cycleLabel={cycleLabel}
          open={open}
          viewToggle={toggle}
        />
      ) : (
        <CheckInBoard
          cycleId={cycleId}
          cycleLabel={cycleLabel}
          open={open}
          plannedNext={plannedNext}
          viewToggle={toggle}
        />
      )}
    </div>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: View;
  onChange: (view: View) => void;
}) {
  const options: { id: View; label: string; icon: typeof List }[] = [
    { id: "list", label: "List", icon: List },
    { id: "board", label: "Board", icon: Kanban },
  ];

  return (
    <div
      role="tablist"
      aria-label="Switch between list and board"
      className="flex gap-1 rounded-lg border border-white/[0.08] bg-white/[0.03] p-1"
    >
      {options.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={view === id}
          onClick={() => onChange(id)}
          className={cn(
            "nx-focus-ring inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-colors",
            view === id
              ? "bg-[var(--nx-text-primary)] text-[var(--nx-bg)] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
              : "text-[var(--nx-text-secondary)] hover:bg-white/[0.04] hover:text-[var(--nx-text-primary)]",
          )}
        >
          <Icon size={13} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}
