---
name: Telegram shared customer identity
description: Security and ownership rules for connecting Telegram chats to existing website customers.
---

Telegram must never create a separate customer identity or collect website credentials. Link a private chat only through a short-lived opaque browser challenge completed by an active Clerk-authenticated website customer; persist only the challenge hash.

**Why:** Telegram and the website share order history. A crash after order creation or an ownership race can otherwise strand an order outside the customer's history or persist tracking capability for another customer's order.

**How to apply:** Before starting a Telegram order create, freeze the linked Clerk customer ID in server-owned wizard state. In normal completion and every recovery path, conditionally claim only an unowned order (or verify the same owner) in the same transaction and before writing Telegram order links or notification outbox rows. Telegram Sign Out only removes the chat link.