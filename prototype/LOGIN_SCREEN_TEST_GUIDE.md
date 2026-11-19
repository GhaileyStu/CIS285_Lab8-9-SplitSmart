# SplitSmart Login Screen Test Guide

Use these fake details to exercise registration and login before entering any personal information.

**Open the login screen:** [http://localhost:3000/login](http://localhost:3000/login)

The development server must be running from the `prototype` directory for this link to work.

## 1. Register a test account

On the **Create an account** form, enter:

| Field | Test input |
| --- | --- |
| Display name | `Test User` |
| Username | `splittest01` |
| Email | `splittest01@example.com` |
| Password | `MapleTest2026!` |

Select **Create account**. Expected result: the account is created, you are signed in, and the dashboard opens.

## 2. Verify sign-in

Select **Sign out**, then use the **Sign in** form:

| Field | Test input |
| --- | --- |
| Username | `splittest01` |
| Password | `MapleTest2026!` |

Select **Sign in**. Expected result: the dashboard opens as Test User.

## 3. Verify an incorrect password is rejected

Sign out and try:

| Field | Test input |
| --- | --- |
| Username | `splittest01` |
| Password | `WrongPassword2026!` |

Expected result: sign-in is refused with a generic incorrect-credentials message. Then use the correct password to confirm the account still works. Avoid repeated failed attempts; the prototype throttles repeated login failures.

## 4. Optional registration validation checks

- Try registering `splittest01` again. Expected result: duplicate username or email is rejected.
- Try a password shorter than 10 characters. Expected result: the form rejects it.

## Notes

- The prototype stores registered accounts in its configured local database. Use only fake test details.
- If this username or email is already in use, choose a different test username and matching `@example.com` email, then use those values consistently for sign-in.
