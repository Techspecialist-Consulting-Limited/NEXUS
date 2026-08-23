# NEXUS — UI Content Reference

> Realistic copy for every surface. Use these as the register to write in, not
> as strings to paste.
>
> **Never ship placeholder copy.** No "Lorem ipsum", no "Sample text", no
> "User 1", no bare "Something went wrong", no "Click here". Placeholder copy in
> a demo is how a stakeholder concludes the product is not real.

---

## Writing rules

1. **Say the specific thing.** "Three Techspecialist commitments" beats "some
   dependencies". A message that names nothing asks for nothing.
2. **One next step per message.** If there is no action, it is a note, not an
   alert.
3. **British English**, matching the rest of the product. "Organisation" in
   prose; `organization` stays as-is in code and table names.
4. **Numbers are numerals**, and every one of them came from the database.
5. **Sentence case** for headings and buttons. Not Title Case, not ALL CAPS
   except the `.eyebrow` label role.
6. **No ellipsis as suspense.** "Working that out…" is a state; "Loading…" is a
   shrug.

---

## Executive

### Greetings and framing

```text
Good morning, Damilola.
Your organisation at a glance — settled through W32 · 03 Aug–09 Aug.
```

The week is stated because the figures are always one cycle behind the calendar:
the current week is still inside the employees' correction window. An executive
who understands why last week is the newest settled week is one who trusts the
numbers when they arrive.

### Weekly brief

```text
Delivery held at 77% and told-in-time at 62%, with all 15 people reporting
across 5 units. The reporting pipeline migration has now moved eight weeks
running, and two Techspecialist commitments are waiting on Creative Hub.
```

### Risks — reason, impact, action

```text
"Migrate the reporting pipeline to the new warehouse" has moved 8 weeks running

Amara Okonkwo has carried this commitment 8 times. Each week on its own looked
like a small slip; the chain is the finding. Work that keeps moving is usually
too large to finish in a week rather than neglected.

→ Ask Amara what the smallest shippable piece of this would be, and let the rest
  become a separate commitment.
```

```text
Creative Hub is holding up Techspecialist

2 commitments in Techspecialist cannot move until Creative Hub clears them. The
people waiting are not scored down for it, so this will not show up as anyone's
poor week — it only shows up here.

→ Ask the Techspecialist and Creative Hub leads to name one owner for the
  handoff and commit to a date before Friday.
```

```text
4 commitments went quiet across 4 people

4 commitments ended the week unresolved and unmentioned — Musa Danjuma, Segun
Adeyemi, Tunde Balogun and Fatima Bello. That is different from being late:
being late is visible, and this was not.

→ Ask what happened to those items before treating the number as real. They have
  already been asked directly.
```

### Department summaries

```text
Growth          68%   1 dropped without saying so
Media Hub       73%   1 dropped without saying so
Creative Hub    79%   3 unplanned this week
Techspecialist  84%   2 blocked by another team
```

### Empty state — a clean week

```text
Nothing needs your attention

Every unit reported for W32 and no commitment slipped without being declared.
This page stays empty when the week is clean — it does not manufacture a concern
to look useful.
```

---

## Manager

### Support recommendations

```text
Amara has seven active commitments this week. Based on her last six weeks she
typically closes four or five. Worth agreeing which two can move before Friday
rather than finding out on Monday.
```

```text
Chidi has been blocked on Creative Hub for two cycles. His delivery rate is
protected — blocked work does not count against him — but the work has not
moved. One named owner on the Creative side would probably clear it.
```

### Follow-up questions

```text
Ask Amara whether the integration handoff is still waiting on API credentials.
This is the second week the same blocker appeared, and resolving it may unblock
two downstream tasks.
```

### Blocker summaries

```text
Creative Hub → Techspecialist    2 commitments    third cycle
Legal → Growth                   1 commitment     first cycle
```

### Recognition

```text
Ngozi flagged the podcast delay on the day it slipped rather than at the end of
the week. That is the behaviour the reporting rhythm is meant to produce, and it
is worth saying so.
```

---

## Employee

### Check-in prompts

```text
How is it going?
Say it or type it in plain sentences. NEXUS sorts it out and shows you before
anything is filed.
```

```text
Anything to add?
You have reported this week. You can add to it any time.
```

### Placeholder for the composer

```text
Finished the onboarding checklist. Legal is still blocking the vendor contract.
Next week I'll start the payments spike…
```

### AI confirmation

```text
Check this over
Edit anything that is not right. Nothing is filed until you press file.

This week
  Finished the design token documentation. The vendor contract is still blocked
  — Legal has not approved it yet.

Next week
  Start the payments spike and get the first endpoint behind a flag.

What this changes
  Vendor onboarding checklist        Done
  Ship the vendor contract           Blocked
```

### Commitment states

Labels, in the product's voice:

| Status | Label |
|---|---|
| delivered | Done |
| partial | Partly |
| in_progress | Going |
| blocked | Blocked |
| deferred | Moved |
| dropped | Dropped |
| promised | To do |
| superseded | Replaced |

### Coaching

```text
The pipeline migration has carried for three weeks

Each week on its own has looked like a small slip. Work that keeps moving is
usually too large for a week rather than neglected — worth deciding what the
smallest shippable piece is.

Based on your last three cycles
```

### Reminders

```text
Your week has not been reported
It takes about thirty seconds, and the questions are already filled in from what
you committed to.
```

```text
One quick question about your week
You committed to "add keyboard navigation to the commitment list" and did not
mention it. Done, dropped, or still going?
```

### The line that keeps the scores honest

```text
Not a performance review. Telling us early counts in your favour.
```

---

## AI assistant

### An answer

One form, 40–70 words, plain enough to follow without context. Nothing is read
aloud.

```text
Marketing is at 62% delivery, against 77% for the group. Two of its commitments
are waiting on Creative Hub approvals. Blocked work is left out of the score, so
the real gap is smaller than it looks. Ask the two leads to name one owner for
that handoff, with a date.
```

### Uncertain answer

```text
This appears to be the main blocker based on the last two reporting cycles, but
only two people mentioned it directly. Confidence: medium.
```

### Cannot answer

```text
I do not have revenue figures for this quarter. What I do have is delivery at
77% and told-in-time at 62%, with all 15 people reporting across 5 units.
```

### Follow-up suggestions

```text
Who owns the Creative Hub handoff?
Has this happened before?
Who needs support this week?
```

### Evidence descriptions

```text
Carried ×8
Currently delivered
2 blocked in Techspecialist
Blocking unit: Creative Hub
Musa Danjuma · Growth
```

---

## System messages

### Errors — say what happened and what survives

| Bad | Better |
|---|---|
| Something went wrong. | I could not answer that just now. Try again in a moment. |
| Error 500. | Could not file that — your text is still here. |
| Session expired. | Your session ended. Sign in again before filing this. |
| Not supported. | This browser cannot record speech — Chrome or Edge can. |
| Permission denied. | Dictation needs a secure page. Open NEXUS on localhost or over https. |

### Confirmations

```text
Filed
Your week is recorded. You can add to it any time.
```

### Empty states — say what the system is waiting for

```text
Nothing recorded for W33. Your next check-in creates it.
```

```text
Nobody to chase. Everyone expected to report for W33 has done so.
```

```text
Nothing waiting

You are notified when something needs you, and not otherwise. An empty page here
means the week is running itself.
```

### Provenance notes

```text
Counted from records · high confidence
Written from your own figures — none of the numbers were guessed.
Reminders have already gone out automatically. These are the ones a person needs
to follow up.
This page shows whether a check-in arrived and when — never what it said.
```
