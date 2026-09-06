"use client";

import { useRouter } from "next/navigation";
import { weekRange } from "@/lib/cycle";

/*
 * A dropdown rather than a row of pills — the switcher only ever had two
 * destinations before ("This week" / "Last week"); four needed a control that
 * scales without crowding the header. `<select>` is also the whole reason
 * this stays a two-line client component rather than a bespoke popover: full
 * keyboard support, native on every platform, nothing to build.
 */
export function WeekSwitcher({
  deptId,
  weeks,
  selectedCycleId,
}: {
  deptId: string;
  weeks: { id: string; label: string }[];
  selectedCycleId: string;
}) {
  const router = useRouter();

  return (
    <select
      value={selectedCycleId}
      onChange={(e) => router.push(`/departments/${deptId}?cycle=${e.target.value}`)}
      aria-label="Select week"
      className="h-11 rounded-lg border border-white/[0.10] bg-white/[0.05] px-3 text-sm
                 text-white/85 transition-colors hover:bg-white/[0.08]
                 focus:border-white/25 focus:outline-none"
    >
      {weeks.map((w, i) => (
        <option key={w.id} value={w.id}>
          {i === 0 ? "This week" : i === 1 ? "Last week" : weekRange(w.label)}
        </option>
      ))}
    </select>
  );
}
