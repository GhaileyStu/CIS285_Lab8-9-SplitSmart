# SplitSmart Registration Error Diagnosis

## Finding

The registration request is rejected by Next.js Server Actions origin protection. The development log records:

```text
`x-forwarded-host` header with value `supreme-goldfish-jjx5p676pv5cpgx-3000.app.github.dev` does not match `origin` header with value `localhost:3000` from a forwarded Server Actions request. Aborting the action.
⨯ Error: Invalid Server Actions request.
```

The mismatch was recorded repeatedly, including at 00:19:11 in `.next/dev/logs/next-development.log`. Next.js compares the `Origin` host with `x-forwarded-host` (or `host`) to protect Server Actions against cross-site requests. Because these values differ and no matching origin is configured, Next aborts the request before running the action.

## Action and dependency inspection

- `src/features/phase5b/actions/auth.ts` starts with the file-level `"use server"` directive.
- `registerAction`, `loginAction`, and `logoutAction` are exported asynchronous functions. The registration and login functions accept `FormData`, which is valid for form Server Actions.
- `src/app/login/page.tsx` imports both `loginAction` and `registerAction` from this module and uses each in a server-rendered form.
- The current development Server Action manifest includes both `registerAction` and `loginAction`, mapped to `src/features/phase5b/actions/auth.ts`. This supports that the generated action references are valid for the current build.
- The action dependencies include server-side APIs such as `node:crypto`, Prisma, and `next/headers` cookies. No client/server boundary violation was found in the inspected chain. The client-side submit button is a separate module.
- `loginAction` is subject to the same host check and is affected by this configuration mismatch; the request is rejected before action dispatch.

## Configuration and versions

- `next.config.ts` contains no `serverActions.allowedOrigins` setting.
- The development script runs `next dev --turbopack`.
- The lockfile resolves Next.js to 16.4.6, React to 19.1.0, and both `prisma` and `@prisma/client` to 6.19.3.
- The `eslint-config-next` version is 15.5.29. Nothing in the captured failure points to that version difference as the cause.

## Root cause classification

This is a forwarded-host/origin configuration mismatch. The captured log establishes the mismatch and the rejection. It does not establish why the request's `Origin` is `localhost:3000` while the forwarded host is the GitHub Codespaces domain. The current action manifest and error log do not support an invalid action reference or stale build artifact as the cause.

## Smallest safe fix

Align the browser `Origin` with the host forwarded to Next.js. If this setup intentionally sends actions with `Origin: localhost:3000`, add that exact origin host to `experimental.serverActions.allowedOrigins`. Otherwise, correct the proxy/request setup so the origin and forwarded host agree. The right option depends on why the proxy produces the recorded localhost origin; that detail is not established by the available log.

No code, configuration, generated files, dependencies, schema, migrations, or database were changed during diagnosis. No action form was submitted.
