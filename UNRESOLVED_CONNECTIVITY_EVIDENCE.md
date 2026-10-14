# Unresolved connection evidence and required actions

Investigation: 2026-10-14, approximately 22:34–22:40 UTC.
Production: https://quickchange.exchange

No application code, credentials, financial settings, Production data, or DNS was changed. No publishing, financial transactions, or unrelated regression tests were performed.

## Quickex: confirmed

- The application uses the official public catalog endpoint:
  `https://quickex.io/api/v2/instruments/public`.
- Workspace DNS, Google DNS-over-HTTPS, and Cloudflare DNS-over-HTTPS agree on the IPv4 destination set:

  ```
  159.65.49.147
  165.22.196.213
  64.226.113.6
  87.199.207.128
  ```

- New TCP-only probes to **both ports 443 and 80 on every address** remained in Linux TCP state 2 (`SYN_SENT`), with one SYN retransmission recorded per socket after approximately 1.2 seconds, and no completed connection during the approximately 2-second observation. These augment the preceding certificate-verifying HTTPS probes that timed out before connecting.
- UDP tracepath reached the hosting cloud's network before later hops stopped responding. This establishes that a default route exists; unanswered UDP hops do not locate the TCP drop.
- A separate web-fetch service returned catalog JSON containing instrument identities from the **exact public endpoint**. It also returned the Quickex homepage. This is diagnostic evidence only: no external fetch service is used to supply customer quotes or financial data.
- Published application logs continue to report `QUICKEX_NETWORK`.
- One workspace control request reported public egress `34.30.164.149`. This is **not** a verified Production egress address or proof of the source NAT used toward Quickex. Do not treat it as a permanent allowlist entry.

### What this rules out, and what it does not

The failure precedes TLS and API authentication. Changing API keys, signatures, affiliate IDs, amounts, pricing, or request paths cannot repair an uncompleted TCP handshake.

DNS inconsistency, a missing default route, and a global Quickex website/catalog outage are not supported by the evidence. Destination-specific hosting egress policy, forward/return routing failure, and Quickex-side source-IP filtering remain possible.

A client observing unanswered SYNs cannot determine which network owner discarded them. No provider firewall logs or hosting NAT/flow logs are available from this workspace.

### Exact next action to restore the path

Provide the destination IP set, TCP port 443, UTC probe window, and source-egress caveat above to the hosting network operator and Quickex network/API operator:

1. **Hosting:** identify the actual Production source NAT address(es) and inspect outbound flow/firewall/NAT records for TCP 443 to the four destinations. Confirm whether SYNs leave the hosting boundary and whether SYN-ACKs return.
2. **Quickex:** inspect edge/firewall/access-policy records for those verified source addresses and UTC times. Confirm whether SYNs arrive and whether a source-IP, cloud/ASN, geographic, or partner allowlist rule rejects them.
3. Apply the correction supported by those records:
   - Hosting egress denial → hosting operator permits the legitimate destination.
   - Quickex filtering → Quickex corrects its policy/allowlist for verified Production egress.
   - SYN/SYN-ACK lost between the boundaries → the network operators resolve the forward/return route.
4. If Quickex requires fixed source IPs, agree an explicitly supported, trusted stable-egress arrangement before configuring an allowlist. Replit documentation search reports dynamic workspace/Autoscale outbound pools; one observed workspace IP is not a durable solution.
5. After connectivity is restored, verify certificate-valid HTTPS to the catalog and authenticated provider readiness from the **actual Production runtime**, then request fresh Fixed/Floating quotes through the existing application. Do not create an order to test connectivity.

Do not bypass TLS, proxy financial traffic through the diagnostic fetch service, rotate credentials speculatively, or present retained rates as fresh.

## PostgreSQL: recurrence and current stability

New deployment logs show physical connection-establishment failures after the earlier report:

| UTC | Worker | Pool total / idle / waiting at catch |
|---|---|---|
| 22:26:16.348 | Blockchain monitoring | 8 / 4 / 0 |
| 22:27:54.248 | Customer notifications | 8 / 0 / 0 |
| 22:27:55.048 | Telegram news | 7 / 0 / 0 |
| 22:27:55.048 | Newsletter | 6 / 0 / 0 |

They are intermittent and **not resolved**. Counters at catch time do not establish occupancy throughout the failed acquisition, and these failures occur before the associated SQL executes.

### Controlled live observation

From **22:38:31 to 22:40:22 UTC**, paired real Production requests were made roughly every 10 seconds:

| Endpoint | Successful samples | Median | Maximum |
|---|---:|---:|---:|
| API liveness `/api/healthz` | 12/12 | 44.5 ms | 163 ms |
| Database readiness `/api/readyz` | 12/12 | 87 ms | 218 ms |

No matching physical-establishment, pool-acquisition, idle-client, or slow-acquisition log entries were returned for this observation interval. Readiness executes `SELECT 1` through the application's real pool; it can reuse an established connection and therefore does **not** independently prove that every new physical connection would succeed.

This verifies a healthy short observation window, not long-term stability.

### Exact next action for the database incident

The published process still lacks the already-tested acquisition-start/end timing and event-loop instrumentation in the workspace. **Approve publishing those existing changes**, then correlate the next failure with:

- Acquisition start/end counts and duration, connecting/queued behavior, and event-loop delay.
- Hosting CPU throttling, memory pressure, instance lifecycle and network events.
- PostgreSQL gateway/server handshake and connection-limit logs at the same UTC time.

Use that correlation to distinguish physical network/authentication handshake delays, event-loop/resource stalls, and genuine pool waiting. Current evidence does not justify increasing the pool limit, rewriting unrelated SQL, or retrying financial writes.

## Overall result

- Quickex: external network path blocked; exact filtering/routing owner requires two-sided flow evidence.
- PostgreSQL: failures have recurred; short-window checks pass, but incident root cause and sustained stability remain unverified.
- No new application optimization is justified by these observations alone.
