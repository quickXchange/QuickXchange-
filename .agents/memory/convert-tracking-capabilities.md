---
name: Convert tracking capabilities
description: Security boundary for public order lookup identifiers
---

Quickex Convert IDs embed a cryptographically random UUID and may serve as the public tracking capability without a separate token. Short Manual Swap IDs must continue requiring their signed tracking token.

**Why:** the public Track Order page promises paste-an-ID lookup and clears hidden URL tokens for new searches. Requiring both a random QX UUID and a hidden token made that advertised function fail, while relaxing short Manual IDs would make enumeration practical.

**How to apply:** allow tokenless lookup only for strict `QX-<UUID>` identifiers. Do not extend this behavior to sequential or otherwise guessable order IDs.