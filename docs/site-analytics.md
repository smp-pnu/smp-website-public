# Site analytics

The authenticated Operations dashboard shows today / 7 / 30 calendar days in Asia/Seoul. This is an operational trend view, not an exact visitor census or download-delivery receipt.

- Visits, page views, top report paths and external referrer hosts come from the existing free Cloudflare Web Analytics site. The manually installed official beacon runs only on `pnusmp.com`, after hydration/idle, and excludes DNT and automated browser sessions. Automatic zone-wide injection must stay disabled so the admin site is excluded. The browser ingestion token is public; it is not a Cloudflare management credential.
- Download clicks and PDF first-display outcomes use a small same-origin collector. A PDF attempt records its start and one terminal result. Prepared-reader fallback is not a failure if the original reader succeeds. Manual retry starts another attempt. Page turns, preview images, byte-range fetches and background preloads are not downloads or new attempts.
- No identifying cookies, visitor identifiers, IPs, search strings, full referrer URLs, PDF contents or filenames are stored in the custom collector. Short random event keys prevent duplicate counts and expire after two days. Platform request handling and Cloudflare's own aggregate analytics are separate.
- Each event insert and its aggregate update share a D1 transaction. Unknown/unpublished reports, extra payload fields, cross-origin browser requests and obvious bot UAs are rejected. The endpoint gives no publication or counter information back. Anonymous analytics can still be spoofed and should not be used for security or billing decisions.

## Cost controls

No new Worker, D1, paid subscription, cron or credential is needed. The existing publisher reads aggregate analytics and writes one private dashboard snapshot **at most hourly**, with a lease. The admin UI reads that row; there is no automatic polling. Provider/query failure preserves the last successful traffic snapshot and timestamp and displays a warning. Content publication does not depend on analytics.

Custom collection has a 2,000 accepted-event/day UTC cap and a separate 20 requests/minute per-IP platform rate limiter. One browser document sends at most 30 events, batches up to eight, and never retries. Two events per normal PDF attempt plus a download click means the event cap is not a 2,000-visitor allowance. Once exhausted, measurements are partial; the public website and PDFs remain available.

Daily aggregates expire after 30 days. Inserts stop if the last completed snapshot/cleanup is more than 48 hours old, bounding growth during a scheduler outage. At the worst-case event cap there are at most about 60,000 daily aggregate rows for the normal retention period; one scan per hour is about 1.44 million reads/day before small metadata lookups, below the 5 million/day allowance. Indexed deletes and event-trigger writes also consume the account's shared D1 quota; use the adjacent Cloudflare panel to monitor actual totals. These controls reduce normal workload, not a guarantee against unlimited hostile traffic.

## Operation

Refresh reloads the stored snapshot. Collection and Cloudflare processing can lag. `—` means no result/measurement, not zero. Report view ranking uses the complete bounded report-path result from Cloudflare. Unavailable measurements display —; zero is used only when the report-path result is complete. Download ranking uses the separately measured click counts.

Revert the analytics commit to remove client collection. Keep the manual Web Analytics setting to avoid injecting analytics on administrator subdomains. The added tables are independent of CMS content, sessions and Drive originals. Historical measurements cannot be reconstructed before the collector was enabled.

References: [Cloudflare metrics](https://developers.cloudflare.com/web-analytics/data-metrics/high-level-metrics/), [FAQ and custom-event limitation](https://developers.cloudflare.com/web-analytics/faq/), [D1 free allowances](https://developers.cloudflare.com/d1/platform/pricing/).

## Full report rankings

The overview's “전체 순위” opens an authenticated detail route (`#analytics`). The period and ranking metric carry over; search, semester, page, period and metric survive refresh/history. Current catalogue entries, including private/trash entries and zero-activity reports, remain distinguishable from measured historical IDs. Ties share a rank; zero/unknown values are unranked. Filters retain the overall rank rather than renumbering results.

The hourly snapshot stores all measured report aggregates (up to 1,000 report IDs) alongside the small overview list. The Cloudflare request now asks for up to 1,001 report paths: receiving the sentinel limit rejects an incomplete result instead of presenting it as a complete ranking. The existing three hourly requests, lease, 2,000 daily event cap and 30-day retention remain unchanged. Older snapshots without a full list show a preparation state in the detail view. Provider errors retain previous traffic and show its original collection time.

`/api/dashboard/reports` uses the existing session authentication, private/no-store response policy and admin request budget. It reads one stored snapshot and one bounded catalogue join (at most 1,000 IDs); it does not query Cloudflare or scan event counters during browsing. Search/sort/pagination are client-side and render 20 rows at a time. The overview strips full-report arrays from its response and still resolves at most 60 metadata IDs. No new dependency, analytics tracker, scheduled job, credential, service or migration is added.

Insights include measured report views, download clicks, active reports, top-five view concentration, semester distribution and per-report PDF start/ready/failure/mean-display time. Views and clicks have different collection methods; they are not a conversion funnel. The week comparison uses two complete seven-day windows excluding today; it stays unavailable until 14 complete days have been collected and excludes delayed/limited data. These views are operational estimates, not person-level or academic performance measures.

Design references: [Plausible Top Pages](https://plausible.io/docs/top-pages) and its [live dashboard](https://plausible.io/plausible.io) informed the compact overview → searchable full table flow and sortable metrics. SMP keeps its own charcoal palette, shared controls and mobile rows. No Plausible service is connected.
