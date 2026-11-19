"use client";

import Link from "next/link";

export default function ReportsError({ retry }: { retry: () => void }) {
  return <main className="dashboard-error" role="alert">
    <h1>Reports could not be loaded</h1>
    <p>Try loading the report again.</p>
    <button type="button" className="button button-dark" onClick={retry}>Try again</button>
    <p><Link href="/" className="text-link">Back to workspace</Link></p>
  </main>;
}
