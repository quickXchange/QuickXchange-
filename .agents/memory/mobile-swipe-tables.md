---
name: Mobile swipe tables
description: The required mobile presentation contract for Admin and Customer data tables.
---

Keep real table markup on phone widths and place it inside a dedicated horizontal touch-scroll viewport. The complete table—including selection, identity, data, status, and action columns—must move together without sticky or frozen table sections.

**Why:** The stacked-card presentation hid the relationship between columns and made dense operational data harder to scan. The user explicitly chose wide, horizontally swipeable tables over mobile cards.

**How to apply:** Give tables readable minimum widths, let identity columns show complete asset names and network badges without ellipsis, constrain overflow to the table viewport, show a subtle edge hint until scrolling starts, and neutralize legacy mobile pseudo-card or sticky-table rules. For dense directories, keep identity artwork beside its copy and action groups in one horizontal line; responsive column stacking can silently determine every row’s height.

Verify the exact tablet breakpoint as well as phone and desktop widths: a legacy stacked-card rule can extend one pixel beyond a narrower phone-only table reset. Restoring table display alone may leave icon-and-label flex children stacked; check their computed direction and row height too.