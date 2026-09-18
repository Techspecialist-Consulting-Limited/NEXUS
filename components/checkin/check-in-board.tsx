"use client";

import { useMemo, useState, type ReactNode } from "react";
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
import { ArrowRight, Check, Loader2, MoreVertical, Plus, Repeat2, Send, ShieldAlert, X } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { weekLabel } from "@/lib/cycle";
import { filingFailure } from "@/lib/api-messages";
import { cn } from "@/lib/cn";
import type { OpenCommitment, PlannedCommitment } from "@/lib/checkin";

/*
 * Check-in, as a board you move commitments across rather than a list of
 * tap-to-answer prompts.
 *
 * SAME ENDPOINT, SAME RULES, NEW SURFACE. This writes through the exact
 * `/api/check-in` route `check-in-flow.tsx` already uses — same
 * `resolutions[]` shape, same `progress`/`plan` fields, same append-only
 * `check_ins.raw_text`. Nothing here is a second reporting path with its own
 * rules; it is a different way of composing the same submission.
 *
 * THREE BUCKETS, NOT SIX. The list view still exposes all six statuses
 * (delivered/in_progress/partial/blocked/deferred/dropped) because the
 * finer distinction matters when it's the only thing on screen. Here, moving
 * fast across many commitments is the point, so Done means `delivered` and
 * Not done covers blocked/deferred with one required reason — the "blocked by
 * another team" checkbox inside that modal is the one bit of nuance kept,
 * because it is one of the product's four non-negotiable scoring rules
 * (NEXUS.md: blocked-by-another-team is excluded from delivery scoring, and
 * losing that distinction would quietly stop rewarding people for flagging
 * real dependencies).
 *
 * A REASON IS REQUIRED HERE, EVEN THOUGH THE COLUMN WRITES IT AS OPTIONAL.
 * `outcome_reason` has no NOT NULL constraint — `/api/commitments/[id]/status`
 * and check-in's own tap-resolutions both allow an empty one. This board
 * enforces it earlier, in the UI, because a blank reason on a board built
 * around trays is exactly the silent drop the product exists to catch: the
 * modal's confirm button simply does not enable until something is typed.
 *
 * NEXT-WEEK CARDS ARE DRAFTS, NOT COMMITMENTS, UNTIL SUBMIT. Each one asks
 * for a real sentence — not a bare title — because that sentence becomes the
 * commitment's `source_quote` once extracted, the same verbatim-quote
 * guarantee every other commitment in this product carries. They are joined
 * into the `plan` field and go through the SAME asynchronous AI extraction
 * the free-text box already triggers; they do not appear as real rows until
 * that finishes, same latency as today.
 */

type Bucket = "unresolved" | "done" | "notDone";
const BUCKET_LABEL: Record<Bucket, string> = {
  unresolved: "To resolve",
  done: "Done",
  notDone: "Not done",
};
/**
 * A card in the "Next week" column. `persisted` distinguishes a real
 * commitment already on the server (came in via `plannedNext`, removing it
 * means writing a status change) from a plan drafted this session (removing
 * it is just splicing local state — nothing was ever saved).
 */
type NextWeekCard = { id: string; sentence: string; persisted: boolean };

const WORD_FLOOR = 3; // Same floor /api/check-in/rewrite already enforces.

function words(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export function CheckInBoard({
  cycleId,
  cycleLabel,
  open,
  plannedNext,
  viewToggle,
}: {
  cycleId: string;
  cycleLabel: string;
  open: OpenCommitment[];
  /** Already-declared plans for next week, read from the database. */
  plannedNext: PlannedCommitment[];
  /** The List/Board switch, rendered inside this view's own header — see check-in-workspace.tsx. */
  viewToggle?: ReactNode;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const byId = useMemo(() => new Map(open.map((c) => [c.id, c])), [open]);

  const [bucket, setBucket] = useState<Record<string, Bucket>>(() =>
    Object.fromEntries(open.map((c) => [c.id, "unresolved" as Bucket])),
  );
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [blockedFlag, setBlockedFlag] = useState<Record<string, boolean>>({});
  const [nextWeek, setNextWeek] = useState<NextWeekCard[]>(() =>
    plannedNext.map((c) => ({
      id: c.id,
      sentence: c.source_quote ?? c.title,
      persisted: true,
    })),
  );
  const [droppingId, setDroppingId] = useState<string | null>(null);

  const [reasonModalFor, setReasonModalFor] = useState<string | null>(null);
  /**
   * A card's own move menu — the tap alternative to dragging. Columns stack
   * on a phone (see the grid below), so dragging a card past the fold into a
   * column that isn't even on screen is not a real option there; this is the
   * same move a drag performs, reachable without a pointer.
   */
  const [moveMenuFor, setMoveMenuFor] = useState<string | null>(null);
  const [addingNextWeek, setAddingNextWeek] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const id = String(active.id);
    const target = over.id as Bucket;

    /*
     * Not done never writes on drop — it opens the reason modal instead. The
     * card stays wherever it was until the modal is actually confirmed.
     */
    if (target === "notDone") {
      setReasonModalFor(id);
      return;
    }
    setBucket((b) => ({ ...b, [id]: target }));
  }

  function confirmNotDone(id: string, reason: string, blocked: boolean) {
    setReasons((r) => ({ ...r, [id]: reason }));
    setBlockedFlag((f) => ({ ...f, [id]: blocked }));
    setBucket((b) => ({ ...b, [id]: "notDone" }));
    setReasonModalFor(null);
  }

  /** Same rule the drop handler applies: Not done always needs a reason first. */
  function moveTo(id: string, target: Bucket) {
    setMoveMenuFor(null);
    if (target === "notDone") {
      setReasonModalFor(id);
      return;
    }
    setBucket((b) => ({ ...b, [id]: target }));
  }

  function addNextWeek(sentence: string) {
    setNextWeek((list) => [
      ...list,
      { id: crypto.randomUUID(), sentence, persisted: false },
    ]);
    setAddingNextWeek(false);
  }

  /*
   * A DRAFT NEVER TOUCHED THE SERVER; A PERSISTED CARD ALREADY DID.
   *
   * Removing a draft is just forgetting it. Removing a persisted card is
   * withdrawing a real promise, so it goes through the same status endpoint
   * every other outcome on this board writes through — `dropped`, declared,
   * so it counts as a stated decision rather than the silent drop this
   * product exists to catch.
   */
  async function removeNextWeek(id: string) {
    const card = nextWeek.find((c) => c.id === id);
    if (!card) return;

    if (!card.persisted) {
      setNextWeek((list) => list.filter((c) => c.id !== id));
      return;
    }

    setDroppingId(id);
    try {
      const res = await fetch(`/api/commitments/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dropped", declared: true }),
      });
      if (!res.ok) throw new Error();
      setNextWeek((list) => list.filter((c) => c.id !== id));
      router.refresh();
    } catch {
      toast({
        variant: "error",
        title: "Could not withdraw that",
        description: "Nothing changed. Try again.",
      });
    } finally {
      setDroppingId(null);
    }
  }

  const doneRows = open.filter((c) => bucket[c.id] === "done");
  const notDoneRows = open.filter((c) => bucket[c.id] === "notDone");
  const unresolvedRows = open.filter((c) => bucket[c.id] === "unresolved");
  /** Not yet on the server — the only ones a submission would actually add. */
  const draftedNext = nextWeek.filter((c) => !c.persisted);

  const nothingToSubmit =
    doneRows.length === 0 && notDoneRows.length === 0 && draftedNext.length === 0;

  async function submit() {
    setSubmitting(true);

    const resolutions = [
      ...doneRows.map((c) => ({ commitmentId: c.id, status: "delivered" })),
      ...notDoneRows.map((c) => ({
        commitmentId: c.id,
        status: blockedFlag[c.id] ? "blocked" : "deferred",
        reason: reasons[c.id],
      })),
    ];

    // Persisted cards are already real commitments — resubmitting their
    // sentences would ask extraction to create the same promise twice.
    const plan = draftedNext.map((c) => c.sentence).join("\n\n");

    /*
     * Composed entirely from what the person themselves typed or chose — no
     * model paraphrase. This is what keeps `check_ins.raw_text` non-empty so
     * the week reads as genuinely responded-to (signal_integrity) rather than
     * silent, without asking anyone to type a narrative they already
     * expressed by moving cards and writing reasons.
     */
    const progressParts: string[] = [];
    if (doneRows.length) {
      progressParts.push(`Delivered: ${doneRows.map((c) => c.title).join(", ")}.`);
    }
    if (notDoneRows.length) {
      progressParts.push(
        `Not completed: ${notDoneRows
          .map(
            (c) =>
              `${c.title} (${blockedFlag[c.id] ? "blocked by another team" : "delayed"} — ${reasons[c.id]})`,
          )
          .join("; ")}.`,
      );
    }
    const progress = progressParts.join(" ");

    let answeredBack = false;
    try {
      const res = await fetch("/api/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycleId, progress, plan, dictated: false, resolutions }),
      });
      answeredBack = true;
      if (!res.ok) throw new Error(filingFailure(res.status));

      const data = (await res
        .clone()
        .json()
        .catch(() => ({}))) as { interpreting?: boolean };

      toast({
        variant: "success",
        title: "Filed",
        description:
          "Your week is recorded." +
          (data.interpreting
            ? " NEXUS is reading your next-week notes now — anything it finds appears in a moment."
            : ""),
      });

      router.refresh();
      if (data.interpreting) {
        for (const delay of [7000, 16000]) {
          setTimeout(() => router.refresh(), delay);
        }
      }
    } catch (e) {
      if (answeredBack) {
        toast({
          variant: "error",
          title: "Could not file that",
          description: e instanceof Error ? e.message : "Nothing was saved. Try again.",
        });
      } else {
        toast({
          variant: "warning",
          title: "NEXUS did not answer",
          duration: 12000,
          description:
            "The connection dropped before it replied, so this may already be recorded. Check My week before trying again.",
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  const active = activeId ? byId.get(activeId) : null;

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 pb-28 lg:gap-5">
      <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4 pt-1">
        <div className="min-w-0">
          <h1 className="page-title">Check in</h1>
          <p className="standfirst mt-1">
            Move each commitment where it landed, then add what&rsquo;s next.
          </p>
          <p className="metric mt-1.5 text-sm text-secondary">{weekLabel(cycleLabel)}</p>
        </div>
        {viewToggle}
      </header>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="grid gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-4">
          <Column
            id="unresolved"
            title="To resolve"
            hint="Drag to a tray, or use a card's own menu."
            rows={unresolvedRows}
            onOpenMove={setMoveMenuFor}
          />
          <Column
            id="done"
            title="Done"
            hint="Finished and closed out."
            rows={doneRows}
            onOpenMove={setMoveMenuFor}
          />
          <Column
            id="notDone"
            title="Not done"
            hint="Needs a reason."
            rows={notDoneRows}
            onOpenMove={setMoveMenuFor}
            renderNote={(c) => (
              <button
                type="button"
                onClick={() => setReasonModalFor(c.id)}
                className="mt-1.5 block text-left text-2xs leading-snug text-secondary underline decoration-dotted underline-offset-2 hover:text-white/80"
              >
                {blockedFlag[c.id] ? "Blocked by another team" : "Delayed"} —{" "}
                {reasons[c.id] || "add reason"}
              </button>
            )}
          />
          <NextWeekColumn
            cards={nextWeek}
            onAdd={() => setAddingNextWeek(true)}
            onRemove={(id) => void removeNextWeek(id)}
            removingId={droppingId}
          />
        </div>

        <DragOverlay>{active ? <Card c={active} /> : null}</DragOverlay>
      </DndContext>

      {/* Pinned so it's reachable without hunting for it once trays fill up. */}
      <div className="sticky bottom-4 z-10 flex justify-end">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={submitting || nothingToSubmit}
          className="nx-focus-ring inline-flex min-h-12 items-center gap-2 rounded-xl
                     bg-[var(--nx-primary)] px-6 text-sm font-medium text-[var(--nx-bg)]
                     shadow-lg transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {submitting ? (
            <Loader2 size={15} className="animate-spin" aria-hidden="true" />
          ) : (
            <Send size={15} aria-hidden="true" />
          )}
          {submitting ? "Filing…" : "Submit report"}
        </button>
      </div>

      {reasonModalFor && byId.get(reasonModalFor) && (
        <ReasonModal
          commitment={byId.get(reasonModalFor)!}
          initialReason={reasons[reasonModalFor] ?? ""}
          initialBlocked={blockedFlag[reasonModalFor] ?? false}
          onCancel={() => setReasonModalFor(null)}
          onConfirm={(reason, blocked) => confirmNotDone(reasonModalFor, reason, blocked)}
        />
      )}

      {addingNextWeek && (
        <NextWeekModal onCancel={() => setAddingNextWeek(false)} onConfirm={addNextWeek} />
      )}

      {moveMenuFor && byId.get(moveMenuFor) && (
        <MoveMenu
          commitment={byId.get(moveMenuFor)!}
          current={bucket[moveMenuFor]}
          onCancel={() => setMoveMenuFor(null)}
          onMove={(target) => moveTo(moveMenuFor, target)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Columns and cards
// ---------------------------------------------------------------------------

function Column({
  id,
  title,
  hint,
  rows,
  renderNote,
  onOpenMove,
}: {
  id: Bucket;
  title: string;
  hint: string;
  rows: OpenCommitment[];
  renderNote?: (c: OpenCommitment) => React.ReactNode;
  onOpenMove: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

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
                <DraggableCard c={c} note={renderNote?.(c)} onMove={() => onOpenMove(c.id)} />
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
  note,
  onMove,
}: {
  c: OpenCommitment;
  note?: React.ReactNode;
  onMove?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: c.id,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : undefined
      }
      className={cn("touch-none", isDragging && "opacity-40")}
    >
      <Card c={c} onMove={onMove} />
      {note}
    </div>
  );
}

function Card({ c, onMove }: { c: OpenCommitment; onMove?: () => void }) {
  return (
    <div className="rounded-lg border border-white/[0.09] bg-white/[0.03] px-3.5 py-3">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm leading-snug text-white/90">{c.title}</p>
        <div className="-mr-1.5 -mt-1 flex shrink-0 items-center gap-1">
          {c.carry_depth > 1 && (
            <span
              title={`Open for ${c.carry_depth} weeks`}
              className="metric inline-flex items-center gap-1 text-xs text-tertiary"
            >
              <Repeat2 size={12} aria-hidden="true" />
              {c.carry_depth}w
            </span>
          )}
          {/*
            The tap alternative to dragging — same move, reachable without a
            pointer. touch-none/the drag listeners live on the card's outer
            div, so stopping the pointerdown here keeps a tap on this button
            from being read as the start of a drag.
          */}
          {onMove && (
            <button
              type="button"
              onClick={onMove}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label={`Move "${c.title}" to another tray`}
              className="nx-focus-ring flex size-11 shrink-0 items-center justify-center
                         rounded-md text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white/85"
            >
              <MoreVertical size={15} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      {c.source_quote && (
        <p className="mt-1.5 truncate text-xs italic leading-snug text-tertiary">
          &ldquo;{c.source_quote}&rdquo;
        </p>
      )}
    </div>
  );
}

function NextWeekColumn({
  cards,
  onAdd,
  onRemove,
  removingId,
}: {
  cards: NextWeekCard[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  /** The persisted card currently being withdrawn, if any. */
  removingId: string | null;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col rounded-lg border border-white/[0.08] bg-white/[0.02] xl:h-[540px]">
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.07] px-3.5 py-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="card-title text-primary">Next week</h2>
            <span className="metric text-xs text-tertiary">{cards.length}</span>
          </div>
          <p className="note mt-1">What you&rsquo;re taking on next.</p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          aria-label="Add a plan for next week"
          className="nx-focus-ring grid size-9 shrink-0 place-items-center rounded-lg border
                     border-white/[0.12] text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white/95"
        >
          <Plus size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
        {cards.length === 0 ? (
          <p className="note rounded-lg border border-dashed border-white/[0.08] px-3 py-4 text-center">
            Nothing planned yet. Press + to add one.
          </p>
        ) : (
          <ul className="space-y-2">
            {cards.map((c) => (
              <li
                key={c.id}
                className={cn(
                  "group relative rounded-lg border border-white/[0.09] bg-white/[0.03] px-3.5 py-3",
                  removingId === c.id && "opacity-50",
                )}
              >
                <p className="pr-6 text-sm leading-snug text-white/90">{c.sentence}</p>
                {!c.persisted && (
                  <span className="mt-1.5 block text-2xs text-tertiary">Not filed yet</span>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(c.id)}
                  disabled={removingId === c.id}
                  aria-label={c.persisted ? "Withdraw this plan" : "Remove this plan"}
                  className="nx-focus-ring absolute right-2 top-2 grid size-7 place-items-center
                             rounded-md text-white/35 opacity-0 transition-opacity
                             hover:bg-white/[0.08] hover:text-white/80 group-hover:opacity-100
                             disabled:pointer-events-none"
                >
                  {removingId === c.id ? (
                    <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <X size={13} aria-hidden="true" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

function ReasonModal({
  commitment,
  initialReason,
  initialBlocked,
  onCancel,
  onConfirm,
}: {
  commitment: OpenCommitment;
  initialReason: string;
  initialBlocked: boolean;
  onCancel: () => void;
  onConfirm: (reason: string, blocked: boolean) => void;
}) {
  const [reason, setReason] = useState(initialReason);
  const [blocked, setBlocked] = useState(initialBlocked);
  const canConfirm = reason.trim().length > 0;

  return (
    <Dialog open onClose={onCancel} labelledBy="reason-modal-title">
      <div className="p-5 sm:p-6">
        <p className="eyebrow">Not done</p>
        <h2 id="reason-modal-title" className="card-title mt-2 pr-8 text-lg">
          {commitment.title}
        </h2>

        <label className="mt-4 flex items-start gap-2.5 rounded-lg border border-white/[0.10] bg-white/[0.03] p-3">
          <input
            type="checkbox"
            checked={blocked}
            onChange={(e) => setBlocked(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-[var(--nx-primary)]"
          />
          <span className="text-sm leading-snug text-white/85">
            <span className="flex items-center gap-1.5 font-medium">
              <ShieldAlert size={13} aria-hidden="true" />
              Blocked by another team
            </span>
            <span className="mt-0.5 block text-xs text-secondary">
              Excluded from your delivery figure — it isn&rsquo;t counted against you.
            </span>
          </span>
        </label>

        <label htmlFor="reason-text" className="eyebrow mt-4 block">
          {blocked ? "What is holding it up, and who could clear it?" : "What changed?"}
        </label>
        <textarea
          id="reason-text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder={blocked ? "Waiting on Finance to approve the budget…" : "Scope grew mid-week…"}
          className="mt-2 w-full resize-y rounded-lg border border-white/[0.12] bg-white/[0.05]
                     px-3 py-2.5 text-sm leading-relaxed text-white/90 placeholder:text-white/30
                     focus:border-white/25 focus:outline-none"
        />

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="nx-focus-ring inline-flex min-h-11 items-center rounded-lg border
                       border-white/[0.12] px-4 text-sm text-white/80 transition-colors hover:bg-white/[0.06]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason.trim(), blocked)}
            disabled={!canConfirm}
            className="nx-focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-lg
                       bg-[var(--nx-primary)] px-4 text-sm font-medium text-[var(--nx-bg)]
                       transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Check size={14} aria-hidden="true" />
            Move to Not done
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function NextWeekModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: (sentence: string) => void;
}) {
  const [sentence, setSentence] = useState("");
  const canConfirm = words(sentence) >= WORD_FLOOR;

  return (
    <Dialog open onClose={onCancel} labelledBy="next-week-modal-title">
      <div className="p-5 sm:p-6">
        <p className="eyebrow">Next week</p>
        <h2 id="next-week-modal-title" className="card-title mt-2 text-lg">
          What are you taking on?
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-secondary">
          Say it the way you would say it out loud — this becomes the commitment&rsquo;s own
          record, in your words.
        </p>

        <textarea
          value={sentence}
          onChange={(e) => setSentence(e.target.value)}
          rows={3}
          autoFocus
          placeholder="Ship the vendor launch by Friday…"
          aria-label="Describe what you're taking on next week"
          className="mt-3 w-full resize-y rounded-lg border border-white/[0.12] bg-white/[0.05]
                     px-3 py-2.5 text-sm leading-relaxed text-white/90 placeholder:text-white/30
                     focus:border-white/25 focus:outline-none"
        />

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="nx-focus-ring inline-flex min-h-11 items-center rounded-lg border
                       border-white/[0.12] px-4 text-sm text-white/80 transition-colors hover:bg-white/[0.06]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(sentence.trim())}
            disabled={!canConfirm}
            className="nx-focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-lg
                       bg-[var(--nx-primary)] px-4 text-sm font-medium text-[var(--nx-bg)]
                       transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Plus size={14} aria-hidden="true" />
            Add
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function MoveMenu({
  commitment,
  current,
  onCancel,
  onMove,
}: {
  commitment: OpenCommitment;
  current: Bucket;
  onCancel: () => void;
  onMove: (target: Bucket) => void;
}) {
  const targets = (Object.keys(BUCKET_LABEL) as Bucket[]).filter((b) => b !== current);

  return (
    <Dialog open onClose={onCancel} labelledBy="move-menu-title">
      <div className="p-5 sm:p-6">
        <p className="eyebrow">Move to</p>
        <h2 id="move-menu-title" className="card-title mt-2 pr-8 text-lg">
          {commitment.title}
        </h2>

        <div className="mt-4 flex flex-col gap-2">
          {targets.map((target) => (
            <button
              key={target}
              type="button"
              onClick={() => onMove(target)}
              className="nx-focus-ring flex min-h-12 items-center justify-between rounded-lg
                         border border-white/[0.10] bg-white/[0.03] px-4 text-sm font-medium
                         text-white/90 transition-colors hover:bg-white/[0.07]"
            >
              {BUCKET_LABEL[target]}
              <ArrowRight size={14} aria-hidden="true" className="text-white/40" />
            </button>
          ))}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="nx-focus-ring inline-flex min-h-11 items-center rounded-lg border
                       border-white/[0.12] px-4 text-sm text-white/80 transition-colors hover:bg-white/[0.06]"
          >
            Cancel
          </button>
        </div>
      </div>
    </Dialog>
  );
}
