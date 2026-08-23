import { redirect } from "next/navigation";

/*
 * People management moved into Administration.
 *
 * Kept as a redirect rather than deleted: /team was the only route to the
 * roster for the whole life of the product, and it is in bookmarks, in the
 * onboarding email's welcome link, and in at least one screenshot. A 404 for a
 * page that still exists somewhere else is a self-inflicted support question.
 */
export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { welcome } = await searchParams;
  redirect(welcome === "1" ? "/admin/people?welcome=1" : "/admin/people");
}
