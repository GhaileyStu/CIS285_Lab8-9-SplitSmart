import Form from "next/form";
import Link from "next/link";
import type { ActivityReport } from "../expenses/reports";

const hundred = BigInt(100);
const dayFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
const statusLabels: Record<string, string> = { APPROVED: "Approved", PENDING: "Pending", REJECTED: "Rejected" };

function money(cents: bigint, currencyCode: string) {
  return `${currencyCode} ${(cents / hundred).toLocaleString("en-US")}.${(cents % hundred).toString().padStart(2, "0")}`;
}

type Props = {
  groups: { id: string; name: string; currencyCode: string }[];
  groupId?: string;
  start: string;
  end: string;
  report?: ActivityReport;
  error?: string;
};

export function ReportDashboard({ groups, groupId, start, end, report, error }: Props) {
  return <main className="report-workspace">
    <header className="report-header">
      <Link className="text-link" href={groupId ? `/?group=${encodeURIComponent(groupId)}` : "/"}>← Back to workspace</Link>
      <h1>Reports</h1>
    </header>
    <Form action="/reports" className="panel report-filters" key={JSON.stringify([groupId, start, end])}>
      <label>Report context
        <select name="context" defaultValue={groupId ? `group:${groupId}` : "direct"}>
          <option value="direct">My direct activity</option>
          {groups.map((group) => <option key={group.id} value={`group:${group.id}`}>{group.name} ({group.currencyCode})</option>)}
        </select>
      </label>
      <label>Start date (UTC)<input name="start" type="date" defaultValue={start} required /></label>
      <label>End date (UTC)<input name="end" type="date" defaultValue={end} required /></label>
      <button className="button button-dark" type="submit">Run report</button>
    </Form>
    {error && <p className="notice error" role="alert">{error}</p>}
    {!report && !error && <p className="panel report-empty">Choose a date range to view expense and payment activity.</p>}
    {report && <>
      <h2>Activity for {start === end ? start : `${start} through ${end}`} (UTC)</h2>
      {report.sections.length === 0 && <p className="panel report-empty">No direct scopes or activity. Approved expenses and payments total 0.</p>}
      {report.sections.map((section) => <section className="panel report-scope" key={section.scopeId}>
        <h2>{section.label} · {section.currencyCode}</h2>
        <div className="report-columns">
          <section>
            <h3>Expenses</h3>
            <p>Gross approved expenses <strong>{money(section.approvedCents, section.currencyCode)}</strong></p>
            {section.expenses.length === 0 ? <p>No expenses in this date range.</p> :
              <ul className="report-rows">{section.expenses.map((row) => <li key={row.id}>
                <div><strong>{row.description}</strong><small>{dayFormat.format(row.date)} · Paid by {row.payer}</small>
                  <small>{statusLabels[row.status] ?? row.status}{row.reversed ? " · Reversed" : ""}{row.replacement ? " · Replacement" : ""}</small>
                </div>
                <strong>{money(row.amountCents, section.currencyCode)}</strong>
              </li>)}</ul>}
            {section.expenses.some((row) => row.reversed) && <p>Gross approved expenses include reversed originals.</p>}
          </section>
          <section>
            <h3>Payments</h3>
            <p>Total payments <strong>{money(section.paymentCents, section.currencyCode)}</strong></p>
            {section.payments.length === 0 ? <p>No payments in this date range.</p> :
              <ul className="report-rows">{section.payments.map((row) => <li key={row.id}>
                <div><strong>{row.debtor.displayName} paid {row.creditor.displayName}</strong><small>{dayFormat.format(row.paymentDate)}</small></div>
                <strong>{money(row.amountCents, section.currencyCode)}</strong>
              </li>)}</ul>}
          </section>
        </div>
      </section>)}
      <section className="panel report-scope">
        <h2>Current balance snapshot</h2>
        <p>Balances reflect current outstanding obligations regardless of the selected dates.</p>
        {report.sections.length === 0 && <p>No direct balances.</p>}
        {report.sections.map((section) => <section className="report-balance" key={section.scopeId}>
          <h3>{section.label} · {section.currencyCode}</h3>
          <p>Outstanding <strong>{money(section.outstandingCents, section.currencyCode)}</strong></p>
          {section.balances.length === 0 ? <p>No outstanding obligations.</p> :
            <ul className="report-rows">{section.balances.map((row) => <li key={row.id}>
              <span>{row.debtor} owes {row.creditor}</span>
              <strong>{money(row.amountCents, section.currencyCode)}</strong>
            </li>)}</ul>}
        </section>)}
      </section>
    </>}
  </main>;
}
