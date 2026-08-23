/**
 * Does querying a view bypass RLS on the tables underneath it?
 *
 * In PostgreSQL a view executes with the privileges of its OWNER unless it is
 * created WITH (security_invoker = true). Since these views are created by the
 * migration runner (a superuser), any policy on the underlying table is
 * evaluated as that superuser — so a view over a protected table hands the
 * data to everyone. This probe measures it directly.
 */

import { createSeededDb, loginAs, actAsService } from "./db-harness.mjs";

const db = await createSeededDb();

await actAsService(db);
const [{ total }] = (
  await db.query("select count(*)::int as total from reconciliations")
).rows;

await loginAs(db, "ngozi@nexus.demo"); // staff, Media Hub

const [{ direct }] = (
  await db.query("select count(*)::int as direct from reconciliations")
).rows;
const [{ viaView }] = (
  await db.query(
    "select coalesce(sum(people_reporting),0)::int as \"viaView\" from department_cycle_health",
  )
).rows;

console.log(`reconciliations, as service ............ ${total}`);
console.log(`reconciliations, as staff (direct) ..... ${direct}`);
console.log(`reconciliations, as staff (via view) ... ${viaView}`);
console.log(
  viaView > direct
    ? `\nLEAK: the view exposes ${viaView - direct} rows the policy denies.`
    : "\nOK: the view respects the policy.",
);

await db.close();
