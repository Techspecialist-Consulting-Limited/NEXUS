"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty-state";
import { Building2 } from "lucide-react";
import type { DepartmentMember, DepartmentRow } from "@/lib/departments";
import { unitTone } from "@/lib/unit-tone";

/*
 * Units, their leads and their members.
 *
 * THE DESTRUCTIVE ACTION IS ARCHIVE, AND THE INTERFACE SAYS WHY. A unit with a
 * quarter of reporting behind it cannot be deleted without either taking that
 * history or orphaning it, so the button is "Archive" and the confirmation
 * states plainly that the history stays. Offering "Delete" and quietly doing
 * something else would be worse than either.
 *
 * Archiving does NOT move anybody out. Fourteen people relocated by a click
 * nobody thought was a relocation is exactly the kind of surprise that makes
 * administrators stop trusting a settings page.
 */
export function DepartmentsManager({
  departments,
  members,
}: {
  departments: DepartmentRow[];
  members: DepartmentMember[];
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const live = departments.filter((d) => !d.archived_at);
  const archived = departments.filter((d) => d.archived_at);
  const shown = showArchived ? departments : live;

  async function call(
    key: string,
    init: RequestInit,
    onDone: () => void,
    failure: string,
  ) {
    setBusy(key);
    try {
      const res = await fetch("/api/admin/departments", {
        headers: { "Content-Type": "application/json" },
        ...init,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? failure);
      onDone();
      router.refresh();
    } catch (e) {
      toast({
        variant: "error",
        title: failure,
        description: e instanceof Error ? e.message : "NEXUS could not be reached.",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ---- create ------------------------------------------------------ */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const n = name.trim();
          if (!n) return;
          void call(
            "create",
            { method: "POST", body: JSON.stringify({ name: n, description: null }) },
            () => {
              setName("");
              toast({ variant: "success", title: "Unit created", description: `${n} is ready for members.` });
            },
            "Could not create that unit",
          );
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <label className="min-w-0 flex-1">
          <span className="block text-xs font-medium text-white/75">New unit</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Operations"
            className="mt-2 min-h-11 w-full rounded-lg border border-white/[0.10] bg-white/[0.03]
                       px-3 text-sm text-white/90 placeholder:text-white/25
                       focus:border-white/25 focus:outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={!name.trim() || busy === "create"}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--dept-techspecialist)]
                     px-4 text-sm font-medium text-[var(--on-accent)] transition-opacity
                     hover:opacity-90 disabled:opacity-30"
        >
          {busy === "create" ? (
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          ) : (
            <Plus size={14} aria-hidden="true" />
          )}
          Create
        </button>
      </form>

      {/* ---- list -------------------------------------------------------- */}
      {live.length === 0 && archived.length === 0 ? (
        <div className="rounded-lg border border-white/[0.09] bg-white/[0.02]">
          <EmptyState
            icon={Building2}
            title="No units yet"
            body="NEXUS groups reporting by unit. Without one, every finding is about the whole company and no lead has a team to look after."
          />
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((dept) => {
            const isArchived = Boolean(dept.archived_at);
            return (
              <li
                key={dept.id}
                className={cn(
                  "rounded-lg border border-white/[0.09] bg-white/[0.02] px-4 py-3.5",
                  isArchived && "opacity-55",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium text-white/90">
                      <span
                        aria-hidden="true"
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: unitTone(dept.id) }}
                      />
                      {dept.name}
                      {isArchived && (
                        <span className="text-2xs uppercase tracking-wide text-tertiary">
                          Archived
                        </span>
                      )}
                    </p>
                    <p className="note mt-1">
                      {dept.member_count === 0
                        ? "No members yet"
                        : `${dept.member_count} ${dept.member_count === 1 ? "member" : "members"}`}
                      {dept.lead_name ? ` · led by ${dept.lead_name}` : " · no lead assigned"}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/*
                      The lead picker offers everybody in the organisation, not
                      just this unit's members. A unit lead is frequently
                      somebody who sits elsewhere, and filtering the list to the
                      unit makes that arrangement impossible to express.
                    */}
                    <label className="sr-only" htmlFor={`lead-${dept.id}`}>
                      Lead of {dept.name}
                    </label>
                    <select
                      id={`lead-${dept.id}`}
                      value={dept.lead_id ?? ""}
                      disabled={isArchived || busy === dept.id}
                      onChange={(e) =>
                        void call(
                          dept.id,
                          {
                            method: "PATCH",
                            body: JSON.stringify({
                              id: dept.id,
                              leadId: e.target.value || null,
                            }),
                          },
                          () =>
                            toast({
                              variant: "success",
                              title: "Lead updated",
                              description: `${dept.name} now has the lead you chose.`,
                            }),
                          "Could not change the lead",
                        )
                      }
                      className="min-h-11 rounded-lg border border-white/[0.10] bg-white/[0.03]
                                 px-2.5 text-xs text-white/85 focus:border-white/25
                                 focus:outline-none disabled:opacity-40"
                    >
                      <option value="">No lead</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.full_name}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      disabled={busy === dept.id}
                      onClick={() => {
                        if (
                          !isArchived &&
                          !window.confirm(
                            `Archive ${dept.name}?\n\nIt stops being offered when placing people. Every commitment, reconciliation and finding it already carries stays exactly where it is, and you can restore it at any time.`,
                          )
                        ) {
                          return;
                        }
                        void call(
                          dept.id,
                          {
                            method: "PATCH",
                            body: JSON.stringify({ id: dept.id, archived: !isArchived }),
                          },
                          () =>
                            toast({
                              variant: "success",
                              title: isArchived ? "Restored" : "Archived",
                              description: isArchived
                                ? `${dept.name} is available again.`
                                : `${dept.name} keeps its history and stops appearing in pickers.`,
                            }),
                          isArchived ? "Could not restore that unit" : "Could not archive that unit",
                        );
                      }}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border
                                 border-white/[0.10] px-3 text-xs text-white/65
                                 transition-colors hover:bg-white/[0.06] hover:text-white/90
                                 disabled:opacity-40"
                    >
                      {isArchived ? (
                        <ArchiveRestore size={13} aria-hidden="true" />
                      ) : (
                        <Archive size={13} aria-hidden="true" />
                      )}
                      {isArchived ? "Restore" : "Archive"}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {archived.length > 0 && (
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className="-my-2 inline-flex min-h-11 items-center self-start px-1 text-xs
                     text-[var(--dept-techspecialist)] transition-opacity hover:opacity-80"
        >
          {showArchived
            ? "Hide archived units"
            : `Show ${archived.length} archived ${archived.length === 1 ? "unit" : "units"}`}
        </button>
      )}
    </div>
  );
}
