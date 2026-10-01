---
name: Admin pagination boundaries
description: Honest totals and isolated shared-footer presentation when existing APIs must remain unchanged.
---

A full returned page is not proof of a global total. Keep unknown-total paging honest when an existing endpoint returns only rows or a cursor. Never substitute global affiliate statistics for an account-specific or filtered count.

**Why:** The Owner requested exact result counts while explicitly prohibiting backend behavior changes. Some older financial and activity list contracts expose no matching count. Guessing would mislead operators; scanning the entire ledger merely to count it would add unrequested load.

**How to apply:** Use exact server totals or the full filtered client collection where available. Clearly report the remaining API limitation and obtain permission before extending a backend contract for totals.

Shared Admin footers must not carry old route-specific pagination layout classes, and their controls must remain excluded from both public/global and Admin generic form styling.

**Why:** A common component alone did not ensure parity: legacy footer classes reintroduced mobile vertical controls, while duplicated generic form contracts separately enlarged compact selectors. Fixing only one stylesheet did not fix computed geometry.

**How to apply:** Preserve test IDs rather than old presentation classes. Check the shared footer under actual host classes at phone, tablet, and desktop widths, including empty lists, and inspect computed dimensions when source specificity is ambiguous.