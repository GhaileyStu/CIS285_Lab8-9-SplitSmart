# SplitSmart Lab 9 — Phase 5E/5F Performance Diagnosis

## Finding

Cold Turbopack route compilation was the largest measured local delay. The observed dashboard startup span was 1.94 s, the first dashboard compile took 3.98 s, and server rendering took 1.01 s. The earlier isolated Phase 5F investigation measured a 5.85 s cold Reports request and sub-120 ms warm report requests. Current evidence does not establish the cause of the persistent loading state in the Codespaces browser or show a performance regression attributable to Phase 5E.

## Workspace and methodology

- Repository `/workspaces/CIS285_Lab8-SplitSmart`, branch `feature/splitsmart-prototype`, tracking the corresponding origin branch.
- The starting worktree had modified dashboard and stylesheet files plus untracked Phase 5F source, tests, preparation, implementation, and loading diagnosis reports. Those changes were preserved.
- This pass read the existing Next.js trace and logs, inspected processes and resources, reviewed application and migration source, and ran representative SQL with SQLite in immutable read-only mode. No server was restarted or probed with new requests. The earlier controlled request timings below are from the Phase 5F loading diagnosis.

## Startup, compilation, and serving

| Stage | Evidence | Observed time |
| --- | --- | ---: |
| Server startup | Current `.next/dev/trace`, `start-dev-server` | 1.94 s |
| Bundler setup | Nested `setup-dev-bundler` span | 1.39 s |
| First dashboard compilation | `compile-path` for `/` | 3.98 s |
| Dashboard request handler | `handle-request` for `/` | 1.30 s |
| Dashboard server render | Nested `render-path` span, including application work | 1.01 s |
| Cold signed-in Reports navigation | Prior isolated Turbopack development run, including compilation | 5.85 s |
| Warm signed-in group/direct Reports navigation | Prior isolated development run | 119 ms / 68 ms |
| Warm signed-in production Reports | Prior isolated run, HTML and React Server Component responses | 21–76 ms / 13–60 ms |

Nested spans overlap their parent and should not be added to them. The current log shows first dashboard compilation beginning about 107 seconds after process launch. That gap separates server launch from the first observed compile event. The React DevTools browser message appeared 21.67 seconds after the compilation message, but these entries are not matched request start and finish markers. The trace measures about five seconds for compilation and server handling, with browser asset delivery, hydration, forwarded transport, and log arrival outside those measurements. No current Reports request appears in the available trace. The prior cold and warm Reports results are documented in [Phase 5F Loading Diagnosis](PHASE5F_LOADING_FIX_REPORT.md).

## Phase 5E payment and balance paths

- Payment recording validates the session actor and scope, checks the idempotency key and exact outstanding pair, then inserts the payment in a transaction. The SQLite trigger applies the delta to that pair. Dashboard reads use the current projection without replaying expenses or payment history. The write transaction is reached on payment submission, while a normal dashboard render uses read paths.
- The signed-in dashboard awaits seven independent service calls in sequence after session resolution. It loads overview balance summaries, direct balances and payments, former-member balances and payments, and former pending decisions even when a selected group view cannot display several overview panels. Direct and former-member history paths also resolve scopes separately from balance paths. The selected group then loads its expense history, balances, and payments in parallel. This is confirmed excess work in the code, but the trace does not isolate how much of the render span it consumed.
- Group, direct, and former-member payment history queries fetch full authorized histories. Group expense history loads all revisions, shares, and approval decisions before selecting the current revision. These paths can increase query and rendering cost as history grows. The observed database is too small to demonstrate that effect.
- Payment submission redirects to the dashboard. The ordinary redirect and Next.js link or form prefetch can produce multiple network entries. No polling, interval, or automatic refresh loop was found in the inspected paths. The available trace contains a single dashboard request span and cannot establish browser request duplication.

## Phase 5F report path

The route authenticates and reads the active group selector. A dated report is queried only when date parameters are supplied. The report uses a short read transaction to recheck membership and select authorized scopes, date-bounded revisions and payments, and current obligations. It discards superseded candidates and aggregates in memory with exact cents, then renders the matching lists. Broad ranges and large histories can increase this cost. No such stall was measured on the sampled data.

The route loading boundary is a static Suspense fallback. Earlier probes saw it resolve to final content in signed-in development and production requests. The currently available logs show no associated Reports exception or Prisma error. The forwarded browser stream and client JavaScript were outside the read-only observations. The persistent browser symptom therefore remains unresolved.

## Database, connections, and resources

- The database file is 396 KiB and contains one group, three memberships, one balance scope, five expenses and revisions, eleven shares, nine approvals, one payment, and two pairwise obligations.
- The shared Prisma client is held on the development process global object. The inspected request paths use that client or its transaction handle. One open development database file descriptor was visible in the Next.js process snapshot. These observations give no evidence of repeated client creation per request. The descriptor snapshot does not measure pool activity over time.
- No lock matching the database device and inode appeared in the sampled kernel lock list. The database directory showed no journal or WAL sidecars at the time of inspection. This does not exclude intermittent lock waits during writes.
- Representative SQLite read probes, averaged over 1,000 executions, took about 0.002–0.004 ms each on the local immutable snapshot. Plans used the scope/date indexes for ranged payments and expenses and the scope/pair index for the projection. Payment history used the scope/date index with a temporary sort for the secondary creation-time ordering. The probes exclude Prisma overhead, transaction waits, relation hydration, and rendering.
- One `npm run dev` process tree hosted one Next.js server. The container exposed two CPUs. Load averages were 0.53, 0.64, and 0.70, with about 2.1 GiB available RAM and 19 GiB free workspace storage. The server’s sampled RSS was about 282–288 MiB. CPU and memory counters showed no throttling or OOM events. CPU and I/O pressure were nonzero at the snapshot. This does not establish sustained resource saturation during the incident.

## Smallest safe next action

Keep the current server and caches. Compare the first dashboard and Reports visits with a second visit in the affected Codespaces browser. If Reports stays on the fallback after the warm visit, capture the request URL, status, response type, timing and whether the document or React Server Component response finished, together with the browser Console error and matching server timestamp. Omit cookies and authorization values. A completed server response with a stuck browser points the next investigation toward hydration or forwarded delivery. A pending server request calls for request-level timing around session lookup, report reads, and rendering.

If a warm dashboard render is independently confirmed slow, the smallest source correction is to load overview-only balance summaries and direct/former histories only on the overview branch. Keep the pending-decision section available wherever it currently renders and preserve authorization checks. That change targets confirmed redundant work and would need its own before-and-after timings. No schema, trigger, dependency, or cache change is supported by the present evidence.

## Preservation

Only this report was added. The development database SHA-256 before and after collection was `4705b0b842a04c486f6cb1046d1e05e94bea274232d63f332757d13ea1dffefa`. No source, database, schema, migrations, dependencies, caches, or processes were changed. Nothing was committed or pushed. Phase 5G was not started.
