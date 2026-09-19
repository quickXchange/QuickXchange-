---
name: Published Site Content freshness
description: Ensures owner-published Site Content revisions propagate to public pages without workflow restarts or stale shared-cache windows.
---

Public Site Content revision responses must require revalidation rather than using shared stale-while-revalidate caching.

**Why:** Admin publication writes a new immutable revision immediately, but shared response caching can continue serving the previous revision for minutes. This breaks the expectation that Save/Publish updates the website without redeployment.

**How to apply:** Keep immutable media aggressively cached, but send revision-bearing Site Content aggregate and individual-page responses with `max-age=0, must-revalidate`. Client mutation success should still invalidate its local published-content query.

Development Admin publications are not deployment payloads; production uses a separate database and may have no corresponding revision after code is published.

**Why:** A successful code publish can leave production content empty even though the development preview shows a published card.

**How to apply:** Publish operator-managed content through the live Admin. When a public element is mandatory before the first production publication, give only that element an explicit source-controlled fallback that a later live publication overrides.