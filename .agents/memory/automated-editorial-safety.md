---
name: Automated editorial safety
description: Safety and branding invariants for source-driven Blog automation and scheduling.
---

Source-driven article previews must not write candidates, duplicate fingerprints, articles, or other state that changes a later real run. AI-generated articles remain drafts for human review even when an automatic publication mode exists. Scheduled runs must atomically claim a durable timezone-local occurrence so multiple replicas cannot execute the same slot.

**Why:** Source verification and structured generation reduce risk but do not prove every generated claim. Preview side effects can suppress legitimate later runs, and process-local scheduler locks do not prevent duplicate work across replicas.

**How to apply:** Preserve these invariants whenever changing automation discovery, generation, publication modes, duplicate detection, scheduler timing, or run leasing.

Automated cover creation may use AI for topic-specific background art, but deterministic composition must own the final dimensions, brand mark, title treatment, output format, and safe storage namespace. A deterministic branded fallback must remain available when AI image generation fails.

**Why:** AI-only image output is inconsistent and can fail externally; publication identity and social-card dimensions must remain predictable.

**How to apply:** Keep branded composition after background generation, record generation provenance, and do not bypass the fallback when changing image models or prompts.