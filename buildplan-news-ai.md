# Build plan: AI News Digest (v3) — GATED, DO NOT BUILD YET

**This spec exists for when it's time, not as something to run now.** The
app's owner explicitly said this phase "can wait until everything else is
ready" when the roadmap was agreed. Do not invoke Codex against this file
until `buildplan-news.md` (v2) has been live and stable for a real
stretch of time. If you're an agent reading this file wondering whether to
build it: check with the user first, this gate is intentional, not a
formality.

## Why, when the time comes

Third phase of a 4-phase roadmap. Layers an AI-generated summary on top of
v2's RSS feed pipeline — a "what's new" digest instead of making the reader
skim 12 sources' worth of headlines themselves.

## 1. Backend — `refreshNewsDigest`, `functions/index.js`

- New `onSchedule` function. **Reads the already-cached `news/{sourceId}`
  docs from v2 — does not fetch anything new itself.** This is a
  summarization layer on an existing pipeline, not a parallel one.
- Cadence: daily, or only triggered once a meaningful volume of new items
  has accumulated since the last digest — summarizing "nothing new"
  repeatedly wastes API calls for no reader value.
- LLM call: use an API key managed via `defineSecret`, the same pattern
  this file already uses for `GMAIL_USER`/`GMAIL_APP_PASSWORD`/
  `UNSUBSCRIBE_SIGNING_KEY`. **Provider choice (which LLM API) is a real
  decision the user should confirm at build time** — this was discussed
  as "cloud API by default, self-hosting only if a real privacy/cost
  driver shows up," but don't silently lock in a specific provider without
  checking that's still the preference when this actually gets built.
- Output cached to `newsDigest/latest`.

## 2. Frontend — News tab addition

A distinct section in the same `NewsView.jsx` from v2, not a separate tab.

**Must be labeled, unambiguously, as AI-generated** — e.g. "AI summary,
may be inaccurate — see original sources" — and each claim in the summary
should link back to the specific source item it was drawn from. This is
the single riskiest part of this whole roadmap, flagged when it was first
discussed: presenting an LLM's inference as fact, next to a screen where
the reader is about to make a prediction decision, is a worse failure mode
than most inaccuracy elsewhere in this app. Do not soften or drop this
labeling requirement for the sake of a cleaner UI.

## Validation checklist, when this is actually built

1. Confirm the digest never presents unlabeled claims — spot-check the
   actual rendered output, not just the code.
2. Confirm a failed/empty LLM call degrades to "no digest today" rather
   than showing stale or fabricated content.
3. Same build/bundle-split checks as v1/v2.
