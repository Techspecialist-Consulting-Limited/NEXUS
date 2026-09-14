"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Repeat2 } from "lucide-react";
import type { CommitmentRow, LiveCommitment } from "@/lib/queries";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

/*
 * Tasks, as a board you move work across rather than a list you read.
 *
 * FOUR COLUMNS, AND WHY THOSE FOUR SPECIFICALLY.
 *
 * These are not the Chairman's Backlog/Pending/Completed — that board reads
 * every status for people who cannot act on it. This one only exposes the
 * four states `task-update-dialog.tsx` already treats as safe for a person to
 * set on their own work with one click: Pending, In progress, Blocked, Done.
 * Partial, deferred, dropped and superseded stay out on purpose — each is a
 * decision that needs a reason more than a status, and belongs in the
 * check-in where the reason is captured (see that file's own comment).
 *
 * DROPPING IS NOT ALWAYS SILENT. `mark-done.tsx` already established that only
 * "done" is safe as a one-tap action — everything else carries a reason that
 * matters more than the status. So dropping onto Done, Pending or In progress
 * writes immediately; dropping onto Blocked opens the existing
 * `TaskUpdateDialog` instead of writing anything, pre-selected to Blocked, so
 * the person can say why. No new dialog was built for this — it is the exact
 * one the card-click already opens.
 *
 * WHY THIS DOES NOT NEED A SECOND WAY IN FOR KEYBOARD USERS. Every card is
 * still a plain click target that opens the same dialog a drag would have
 * opened, with every status available as a button — dragging is a shortcut
 * for what clicking already does, not a capability only a mouse can reach.
 */

const COLUMNS = [
  { status: "promised", title: "Pending", hint: "Committed to, not started yet" },
  { status: "in_progress", title: "In progress", hint: "Actively being worked on" },
  { status: "blocked", title: "Blocked", hint: "Waiting on something outside my control" },
  { status: "delivered", title: "Done", hint: "Finished and closed out" },
] as const;

type ColumnStatus = (typeof COLUMNS)[number]["status"];

function toneFor(status: string): string {
  const map: Record<string, string> = {
    promised: "var(--color-promised)",
    in_progress: "var(--color-in-progress)",
    blocked: "var(--color-blocked)",
    delivered: "var(--color-delivered)",
  };
  return map[status] ?? "var(--color-promised)";
}

export function TaskBoard({
  open,
  doneThisWeek,
  onOpenBlocked,
  onOpenDetail,
}: {
  /** Still-open work — `liveCommitments`, the same set the list view reads. */
  open: LiveCommitment[];
  /** This week's delivered items, for the Done column. */
  doneThisWeek: CommitmentRow[];
  /** Opens the detail dialog pre-selected to Blocked, for a drop onto that column. */
  onOpenBlocked: (c: CommitmentRow) => void;
  /** Opens the detail dialog as-is, for a plain click. */
  onOpenDetail: (c: CommitmentRow) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const byColumn = useMemo(() => {
    const map: Record<ColumnStatus, CommitmentRow[]> = {
      promised: [],
      in_progress: [],
      blocked: [],
      delivered: [],
    };
    for (const c of open) {
      if (c.status === "promised" || c.status === "in_progress" || c.status === "blocked") {
        map[c.status].push(c);
      }
    }
    map.delivered = doneThisWeek;
    return map;
  }, [open, doneThisWeek]);

  const allById = useMemo(() => {
    const m = new Map<string, CommitmentRow>();
    for (const c of open) m.set(c.id, c);
    for (const c of doneThisWeek) m.set(c.id, c);
    return m;
  }, [open, doneThisWeek]);

  const active = activeId ? allById.get(activeId) ?? null : null;

  async function moveTo(c: CommitmentRow, status: ColumnStatus) {
    if (status === c.status) return;

    /*
     * Blocked never writes on drop — it opens the dialog instead, pre-picked.
     * The card stays where it is until the person actually saves; nothing is
     * silently reclassified.
     */
    if (status === "blocked") {
      onOpenBlocked(c);
      return;
    }

    setBusyId(c.id);
    try {
      const res = await fetch(`/api/commitments/${c.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, declared: true }),
      });

      if (!res.ok) {
        toast({
          variant: "error",
          title: "That could not be moved",
          description:
            res.status === 404
              ? "This is no longer yours to change."
              : "Nothing was saved. Try again.",
        });
        return;
      }

      toast({
        variant: "success",
        title: "Moved",
        description: `“${c.title}” is now ${COLUMNS.find((col) => col.status === status)?.title.toLowerCase()}, and NEXUS has it as declared.`,
      });
      router.refresh();
    } catch {
      toast({
        variant: "error",
        title: "NEXUS could not be reached",
        description: "Nothing was saved.",
      });
    } finally {
      setBusyId(null);
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const c = allById.get(String(active.id));
    if (!c) return;
    void moveTo(c, over.id as ColumnStatus);
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="grid gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-4">
        {COLUMNS.map((col) => (
          <Column
            key={col.status}
            status={col.status}
            title={col.title}
            hint={col.hint}
            rows={byColumn[col.status]}
            busyId={busyId}
            onOpen={onOpenDetail}
          />
        ))}
      </div>

      <DragOverlay>
        {active ? <Card c={active} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  status,
  title,
  hint,
  rows,
  busyId,
  onOpen,
}: {
  status: ColumnStatus;
  title: string;
  hint: string;
  rows: CommitmentRow[];
  busyId: string | null;
  onOpen: (c: CommitmentRow) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-0 min-w-0 flex-col rounded-lg border bg-white/[0.02] transition-colors xl:h-[540px]",
        isOver ? "border-white/30 bg-white/[0.05]" : "border-white/[0.08]",
      )}
    >
      <div className="shrink-0 border-b border-white/[0.07] px-3.5 py-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={{ background: toneFor(status) }}
          />
          <h2 className="card-title text-primary">{title}</h2>
          <span className="metric text-xs text-tertiary">{rows.length}</span>
        </div>
        <p className="note mt-1">{hint}</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
        {rows.length === 0 ? (
          <p className="note rounded-lg border border-dashed border-white/[0.08] px-3 py-4 text-center">
            Nothing here.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((c) => (
              <li key={c.id}>
                <DraggableCard c={c} busy={busyId === c.id} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function DraggableCard({
  c,
  busy,
  onOpen,
}: {
  c: CommitmentRow;
  busy: boolean;
  onOpen: (c: CommitmentRow) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: c.id,
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      {...attributes}
      onClick={() => onOpen(c)}
      disabled={busy}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : undefined
      }
      className={cn(
        "w-full text-left",
        isDragging && "opacity-40",
        busy && "opacity-50",
      )}
    >
      <Card c={c} />
    </button>
  );
}

function Card({ c, dragging = false }: { c: CommitmentRow; dragging?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-white/[0.09] bg-white/[0.03] px-3.5 py-3 transition-colors hover:bg-white/[0.05]",
        dragging && "shadow-xl",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm leading-snug text-white/90">{c.title}</p>
        {c.carry_depth > 1 && (
          <span
            title={`Open for ${c.carry_depth} weeks`}
            className="metric inline-flex shrink-0 items-center gap-1 text-xs text-tertiary"
          >
            <Repeat2 size={12} aria-hidden="true" />
            {c.carry_depth}w
          </span>
        )}
      </div>

      {c.status === "blocked" && c.depends_on_department && (
        <p className="mt-1.5 text-xs text-secondary">
          Waiting on {c.depends_on_department}
        </p>
      )}

      {!c.was_planned && (
        <span className="note mt-1.5 block">Unplanned — arrived during the week</span>
      )}
    </div>
  );
}
