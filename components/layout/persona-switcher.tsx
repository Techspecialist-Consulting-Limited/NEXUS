"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { UserRound } from "lucide-react";

/*
 * Change seats — local development only.
 *
 * Not a display toggle. Switching persona changes the database identity every
 * query runs under, so the page that comes back is the page that person is
 * permitted to see: sit in the Chairman's seat and the reconciliations still
 * awaiting employee confirmation genuinely disappear, because RLS removed the
 * rows.
 *
 * The shell renders this only when no auth provider is configured, so it
 * cannot become a way around real authentication.
 */
export function PersonaSwitcher({
  people,
  currentId,
}: {
  people: { id: string; full_name: string; role: string; department_name: string | null }[];
  currentId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(id: string) {
    startTransition(async () => {
      await fetch("/api/persona", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: id }),
      });
      router.refresh();
    });
  }

  if (people.length === 0) return null;

  return (
    <label className="relative inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/[0.10] bg-white/[0.04] pl-3 pr-2 text-sm">
      <UserRound size={15} className="shrink-0 text-white/50" aria-hidden="true" />
      <span className="sr-only">Viewing as</span>
      <select
        value={currentId}
        disabled={pending}
        onChange={(e) => change(e.target.value)}
        /*
          Narrower on a phone than it used to be. This is a development
          control sharing a 360px header with the organisation name — and
          with the link into Administration — and it was winning that
          argument, leaving the org shown as "Nex…".
        */
        className="min-h-11 max-w-[7rem] cursor-pointer truncate bg-transparent pr-1 text-white/90 outline-none disabled:opacity-50 sm:max-w-[16rem]"
      >
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.full_name} · {p.role === "executive" ? "Chairman" : p.role}
          </option>
        ))}
      </select>
    </label>
  );
}
