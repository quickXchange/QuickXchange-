---
name: Telegram shared customer identity
description: Security and ownership rules for connecting Telegram chats to existing website customers.
---

Telegram must never create a separate customer identity or collect website credentials. Link a private chat only through a short-lived opaque browser challenge completed by an active Clerk-authenticated website customer; persist only the challenge hash.

**Why:** Telegram and the website share order history. A crash after order creation or an ownership race can otherwise strand an order outside the customer's history or persist tracking capability for another customer's order.

**How to apply:** Before starting a Telegram order create, freeze the linked Clerk customer ID in server-owned wizard state. In normal completion and every recovery path, conditionally claim only an unowned order (or verify the same owner) in the same transaction and before writing Telegram order links or notification outbox rows. Telegram Sign Out only removes the chat link.

Signed-in Bot tracking is owner-scoped even when the chat already holds a valid tracking capability. Unsigned tracking may retain the existing signed-capability fallback.

**Why:** The requested Bot policy is stricter than anonymous website capability tracking: signing into a customer account must not let old chat links or another customer's valid token override that account's ownership boundary.

**How to apply:** Resolve canonical IDs within the active linked customer's scope before reading details or minting a capability. Revalidate refresh callbacks, fence stored-link writes against concurrent relinking, and never claim or transfer order ownership merely to track it.

Exercise advertised command syntax through the production command dispatcher, not only the tracking-state helper.

**Why:** State-handler tests cannot prove that documented command arguments survive dispatch. A correct helper can coexist with a broken customer entry point.

**How to apply:** Verify argument-free entry, owned ID-only commands, and guest ID-plus-token commands at the dispatcher boundary whenever changing tracking instructions or states.