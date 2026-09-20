---
name: EVM receipt scan efficiency
description: Preserve successful-transaction proof without requesting a receipt for every transaction in busy EVM blocks.
---

For native EVM monitoring, first parse block transactions for watched-recipient candidates, then request receipts only for those candidates and accept only successful receipts.

**Why:** Fetching a receipt for every transaction in each BSC block made a small bounded scan hold its lease for minutes. Recipient prefiltering preserves the requirement for successful on-chain evidence while keeping polling practical.

**How to apply:** Full blocks may be scanned for destination and value candidates, but receipt status remains authoritative before evidence is persisted. Keep a regression test proving unrelated transactions do not trigger receipt requests.