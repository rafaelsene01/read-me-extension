# LESSONS - auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

_none_

## Candidates (under observation - do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 - When an AC says the user can override a value, a task that only derives that value from a default does not satisfy it - the override control is part of the AC.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `spec/acceptance-criteria` · harmful: 0
- features: tts-reader
- evidence: spec.md P2-A AC6 (spec/acceptance-criteria)
- last seen: 2026-09-18T18:05:23Z

### L-002 - A numeric threshold AC needs boundary tests at limit-1, limit and limit+1; without them > and >= are indistinguishable and the rule is unverified.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `lib/` · harmful: 0
- features: tts-reader
- evidence: lib/storage.ts:33 (lib/)
- last seen: 2026-09-18T18:05:23Z

### L-003 - An edge case that only surfaces as a caught exception from a generic call is not detected - assert each named condition explicitly.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `lib/extract.ts` · harmful: 0
- features: tts-reader
- evidence: spec.md Edge Cases (iframe/shadow DOM) (lib/extract.ts)
- last seen: 2026-09-18T18:05:24Z

### L-004 - A helper written by one task with no task owning its wiring leaves the edge case uncovered - every helper needs a named caller in some task.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `tasks/` · harmful: 0
- features: tts-reader
- evidence: lib/segment.ts chunkSentence (tasks/)
- last seen: 2026-09-18T18:05:24Z

### L-005 - Design docs naming a browser API must be checked against the real surface before Tasks - chrome.tts delivers events via the per-utterance onEvent callback in TtsOptions, not a global event.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `design/` · harmful: 0
- features: tts-reader
- evidence: entrypoints/background.ts chrome.tts.onEvent (design/)
- last seen: 2026-09-18T18:05:24Z

### L-006 - Any await before permissions.request or Translator.create loses the user gesture - pass already-known values as arguments instead of fetching them in the handler.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `lib/` · harmful: 0
- features: tts-reader
- evidence: lib/capture.ts requestAndCapture (lib/)
- last seen: 2026-09-18T18:05:25Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
