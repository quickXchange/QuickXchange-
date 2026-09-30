---
name: Browser input event verification
description: Avoiding misleading debounce and numeric-formatting failures in browser tests.
---

Do not assume the browser testing runner's fill helper performs an atomic replacement. It can clear the field and emit incremental input events with delays between characters.

**Why:** A test of a formatting-only decimal edit reported an extra quote request. Event instrumentation showed a genuine clear-and-retype sequence with intermediate numeric amounts. Appending the decimal suffix with End plus ordinary typing correctly made no new request.

**How to apply:** For debounce or same-value formatting assertions, capture input values and request timestamps. Use genuine End-plus-suffix typing for formatting-only edits, and explicitly set short keystroke intervals for rapid typing. Distinguish helper-generated intermediate amount changes from an actual same-value edit before changing application logic.