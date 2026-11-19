"use client";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <main className="dashboard-error" role="alert">
    <span className="eyebrow">WORKSPACE UNAVAILABLE</span>
    <h1>Your balances could not be loaded.</h1>
    <p>Please retry. Your saved expenses and balance records have not been changed.</p>
    {error.digest && <small>Reference: {error.digest}</small>}
    <button className="button button-dark" onClick={retry}>Try again</button>
  </main>;
}
