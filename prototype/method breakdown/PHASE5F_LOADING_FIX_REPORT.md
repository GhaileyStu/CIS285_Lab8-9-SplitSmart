# SplitSmart Phase 5F — Reports Loading Diagnosis

## Outcome

The persistent loading screen reported in the browser was not reproduced. Signed-in requests completed on both an isolated Turbopack development server and a production server using a snapshot of the development database. The failing browser’s Network and Console evidence was unavailable, so the cause remains unconfirmed and no application fix was applied.

## Investigation and results

| Check | Observed result |
| --- | --- |
| Running development server and logs | Next.js 16.4.6 was running on port 3000. Its development log showed startup, compilation, and a React DevTools informational message. It contained no Reports exception or Prisma error associated with the incident. This log does not capture every HTTP request. |
| Signed-out request to the running server | `/reports` completed in 1.85 seconds, including the streamed loading fallback and the existing sign-in redirect. The checked local JavaScript assets returned HTTP 200. |
| Signed-in isolated development server | With Turbopack and Codespaces development mode enabled, the first React Server Component request completed in 5.85 seconds and returned the date picker. Its server log showed cold route compilation. Subsequent group and direct report requests completed in 119 ms and 68 ms and contained the current balance snapshot. No runtime exception appeared. |
| Signed-in production rendering | Direct HTML requests for the date picker, group report, direct report, and invalid-date state completed in 21–76 ms. React Server Component navigation requests returned their expected payloads in 13–60 ms after following the framework’s request URL normalization redirect. The production log showed no runtime error. |
| Report service regression checks | `npx vitest run tests/phase5b/expenses/reports.test.ts` passed all 18 tests. |

The initial Reports page awaits session resolution and the active group selector. It runs the dated activity query only after date parameters are supplied. The isolated database snapshot contained five expense revisions, one payment, and two outstanding obligation rows. The populated group case exercised the authorized activity and snapshot paths. The direct report exercised the empty-scope path. The separate test suite covered populated direct scopes.

The route-level loading component is a static Suspense fallback with no client-side timer or polling. It can be present in the first streamed response while the route is compiling or rendering. The tested streams carried their final content and ended. Invalid date input rendered an inline validation message. The route error boundary is present for unexpected failures, and none of the reproduced requests entered it.

## Blocker and change scope

Cold compilation explains a brief loading state in the isolated development case. It does not establish why the user's browser remained stuck. The available HTTP probes did not run browser JavaScript or traverse the user's forwarded browser connection. To distinguish a stalled navigation stream from a client-side failure, the missing evidence is the failing browser request's status, timing and response type, any console error, and the corresponding server timestamp. Session cookie values should be omitted from any shared capture.

Only this diagnosis report was added. The full suite, lint, TypeScript, and production build were not rerun during this diagnosis because no source fix was applied. The production HTTP reproduction used the existing Phase 5F build.

## Data preservation

The development database was opened read-only to make a disposable SQLite snapshot. The diagnostic session was created only in that snapshot. The SHA-256 before and after diagnosis was `4705b0b842a04c486f6cb1046d1e05e94bea274232d63f332757d13ea1dffefa`. Schema, migrations, dependencies, and existing application files were untouched. Nothing was committed or pushed. Phase 5G was not started.
