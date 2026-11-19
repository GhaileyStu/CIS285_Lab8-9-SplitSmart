import { redirect } from "next/navigation";
import Link from "next/link";
import { loginAction, registerAction } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { getCurrentUser } from "@/lib/auth/session";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect("/");
  const params = await searchParams;
  return (
    <main className="auth-shell">
      <Link className="brand auth-brand" href="/" aria-label="SplitSmart home"><span className="brand-mark">S</span><span>Split<span>Smart</span></span></Link>
      <div className="auth-heading">
        <span className="eyebrow">YOUR SHARED LIFE, IN BALANCE</span>
        <h1>Good spending<br /><em>starts together.</em></h1>
        <p>Keep shared costs clear, fair, and easy to follow.</p>
      </div>
      {params.error && <div className="notice error" role="alert">{params.error}</div>}
      {params.notice && <div className="notice success" role="status">{params.notice}</div>}
      <div className="auth-grid">
        <section className="panel auth-card">
          <div className="section-heading"><div><span className="eyebrow">WELCOME BACK</span><h2>Sign in</h2></div><span className="round-icon">↗</span></div>
          <form action={loginAction} className="stack-form">
            <label>Username<input name="username" required minLength={3} maxLength={32} autoComplete="username" /></label>
            <label>Password<input name="password" type="password" required maxLength={200} autoComplete="current-password" /></label>
            <SubmitButton pendingLabel="Signing in…">Sign in <span aria-hidden="true">→</span></SubmitButton>
          </form>
        </section>
        <section className="panel auth-card create-account">
          <div className="section-heading"><div><span className="eyebrow">NEW TO SPLITSMART</span><h2>Create an account</h2></div><span className="round-icon peach">✳</span></div>
          <form action={registerAction} className="stack-form">
            <label>Display name<input name="displayName" required maxLength={80} autoComplete="name" /></label>
            <label>Username<input name="username" required minLength={3} maxLength={32} pattern="[A-Za-z0-9_]+" autoComplete="username" /></label>
            <label>Email<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
            <label>Password <span className="label-hint">10 characters minimum</span><input name="password" type="password" required minLength={10} maxLength={200} autoComplete="new-password" /></label>
            <SubmitButton className="button button-dark" pendingLabel="Creating account…">Create account <span aria-hidden="true">→</span></SubmitButton>
          </form>
        </section>
      </div>
      <p className="prototype-note">Local prototype accounts · Use a unique username and email</p>
    </main>
  );
}
