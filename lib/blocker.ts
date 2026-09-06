/**
 * What a blocked commitment is waiting on. Mirrors `blocker_kind` in
 * migration 0003 exactly.
 *
 * Kept as plain, checkable sentences rather than a badge — "waiting on
 * another team" is a fact the reader can act on; a coloured chip reading
 * "external_team" is not.
 */

export type BlockerKind =
  | "none"
  | "external_team"
  | "external_party"
  | "capacity"
  | "self"
  | "unknown";

const LABEL: Record<BlockerKind, string> = {
  none: "",
  external_team: "Waiting on another team",
  external_party: "Waiting on a client, vendor or regulator",
  capacity: "Ran out of time or people",
  self: "Waiting on their own dependency",
  unknown: "No reason given",
};

export function blockerLabel(kind: string): string {
  return LABEL[kind as BlockerKind] ?? LABEL.unknown;
}
