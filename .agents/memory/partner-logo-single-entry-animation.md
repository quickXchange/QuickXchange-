---
name: Partner logo single-entry animation
description: Why the partner strip must animate without rendering copies of published entries.
---

Each enabled partner entry should have one rendered logo. The old infinite-loop marquee appended a second copy of every logo, so the two published partners appeared twice despite having one record each.

**Why:** Duplication was a rendering technique, not duplicate source data; deleting or merging records would have damaged operator-managed content without fixing the cause.

**How to apply:** Keep partner identities sourced from published Site Studio data. For continuous motion, wrap each single item only while it is completely outside the viewport rather than cloning it. Leave enough cycle length that a wrap cannot show a reset or an entirely empty strip. Explicitly created separate entries remain distinct.