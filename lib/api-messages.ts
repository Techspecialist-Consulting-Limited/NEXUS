/*
 * What a failed request means, in the second person.
 *
 * These exist because of a real defect: every non-2xx from the assistant was
 * rendered as "I could not answer that just now. Try again in a moment." Three
 * of the statuses that route returns are permanent, so the sentence was telling
 * people to retry something that would fail identically forever — and a
 * one-word typed question, which is how anybody types into a box, hit exactly
 * that path.
 *
 * A status code is a fact the client already has. Collapsing five of them into
 * one sentence throws that fact away and replaces it with a guess.
 *
 * Two rules:
 *
 *   1. Say what happened, not that something happened.
 *   2. Only say "try again" when trying again could work. "Try again in a
 *      moment" after a 422 is the interface inventing hope.
 *
 * Routes that return their own human-readable `error` string — /api/onboarding,
 * /api/invitations — do not need these; their clients surface the server's
 * wording, which is more specific than anything derivable from a number.
 */

/** Failures of `POST /api/assistant/ask`. */
export function askFailure(status: number): string {
  switch (status) {
    case 400:
      return "I could not read that question. Try rewording it.";
    case 422:
      return "There was nothing there to answer. Ask me in a word or two.";
    case 409:
      return "No reporting week has settled yet, so there is nothing for me to answer from.";
    case 429:
      return "That is more questions than I can take right now. Give it a minute.";
    case 502:
    case 503:
    case 504:
      return "I could not reach the model just now. Try again in a moment.";
    default:
      return status >= 500
        ? "Something broke on my side. Try again in a moment."
        : "I could not answer that. Try rewording it.";
  }
}

/**
 * Failures of `POST /api/check-in`.
 *
 * Every one of these arrives at the end of a check-in somebody has already
 * written, so each message says what happens to their words. "Save failed
 * (401)" at the end of a five-step reconciliation is the worst moment in the
 * product to be terse.
 */
export function filingFailure(status: number): string {
  switch (status) {
    case 400:
      return "Something in this update could not be filed. Your words are still here — try filing again.";
    case 401:
      return "Your session ended before this could be filed. Sign in again in another tab, then file — nothing here is lost.";
    case 403:
      return "You are not able to file against this week.";
    case 404:
      return "That reporting week is no longer open. Reload the page to pick up the current one.";
    case 409:
      return "This week was filed somewhere else in the meantime. Reload to see what was recorded.";
    default:
      return status >= 500
        ? "NEXUS could not file that just now. Your words are still here — try again in a moment."
        : `That could not be filed (${status}). Your words are still here.`;
  }
}
