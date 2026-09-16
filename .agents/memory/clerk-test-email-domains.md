---
name: Clerk test email domains
description: Choosing valid email domains for programmatic Clerk users in role-based browser tests.
---

Programmatic Clerk test-user creation can reject addresses under reserved test-only domains such as `.test` with a format-validation error. Use a unique syntactically valid address on an accepted domain, and match the pre-seeded role record to that exact normalized email.

**Why:** An end-to-end operator flow was blocked before navigation because Clerk rejected an otherwise useful `.test` fixture address with HTTP 422.

**How to apply:** For Clerk browser tests that link a pre-seeded operator by verified email, generate the email first on an accepted domain (for example, `example.com`), store it lowercase, then programmatically sign in with the exact same address.