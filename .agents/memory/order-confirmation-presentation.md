---
name: Order confirmation presentation
description: Durable visual and behavior contract for customer deposit confirmation.
---

Keep order confirmation compact on phones, but use a true wide dashboard from tablet widths upward: horizontal title/status metadata, a full-width progress tracker, and an aligned 48/52 Summary/Deposit grid. Actions align below the deposit column, not inside the equal-height card row. It must follow the global Light/Dark Mode setting rather than force a dark palette. Light Mode uses white and light-blue surfaces without purple-heavy styling. Status semantics are global: current work is blue/cyan, completed steps and connectors stay green, and failed terminal states are red. Preserve every provider/manual state, exact payment value, tracking link, copy action, and restart path.

**Why:** This page is both a payment instruction surface and a status handoff. Visual simplification must not hide or reinterpret the data a customer needs to fund and track an order safely; a dark-only payment surface also breaks visual continuity after a customer selects Light Mode.

**How to apply:** Treat backend status semantics and payment values as immutable inputs. Adapt only their presentation, keep mobile below 768px single-column, keep tablet/laptop content fluid up to a 1400px maximum, and render numeric values and units as deliberate intact lines. Scope theme surfaces to this route while deriving status colors from shared state, and verify the existing interaction selectors and links whenever the layout changes.