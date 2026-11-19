import { randomUUID } from "node:crypto";
import Link from "next/link";
import { getGroupBalanceDetails, listBalanceSummariesForUser, listFormerPersonalBalances } from "../expenses/balances";
import { listDirectBalancesForUser, listDirectPaymentsForUser, listFormerGroupPayments, listGroupPayments } from "../expenses/payments";
import { recordPaymentAction } from "../actions/payments";
import { SubmitButton } from "./submit-button";

type Overview = Awaited<ReturnType<typeof listBalanceSummariesForUser>>;
type GroupDetails = Awaited<ReturnType<typeof getGroupBalanceDetails>>;
type FormerBalances = Awaited<ReturnType<typeof listFormerPersonalBalances>>;
type PaymentHistoryRows = Awaited<ReturnType<typeof listGroupPayments>>;
type DirectBalances = Awaited<ReturnType<typeof listDirectBalancesForUser>>;
type DirectHistory = Awaited<ReturnType<typeof listDirectPaymentsForUser>>;
type FormerHistory = Awaited<ReturnType<typeof listFormerGroupPayments>>;

function PaymentForm({ scopeId, creditorUserId, amountInput, groupId }: {
  scopeId: string;
  creditorUserId: string;
  amountInput: string;
  groupId?: string;
}) {
  return <form action={recordPaymentAction} className="payment-form">
    <input type="hidden" name="scopeId" value={scopeId}/>
    <input type="hidden" name="creditorUserId" value={creditorUserId}/>
    {groupId && <input type="hidden" name="groupId" value={groupId}/>}
    <input type="hidden" name="idempotencyKey" value={randomUUID()}/>
    <label>Amount to pay<input name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" defaultValue={amountInput} required/></label>
    <label>Payment date<input name="paymentDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required/></label>
    <SubmitButton className="button button-dark" pendingLabel="Recording…">Record payment</SubmitButton>
  </form>;
}

function PaymentHistory({ payments, emptyMessage = "No payments have been recorded here." }: {
  payments: { id: string; amount: string; paymentDate: Date; debtorName: string; creditorName: string; groupName?: string | null }[];
  emptyMessage?: string;
}) {
  return payments.length === 0
    ? <p className="payment-history-empty">{emptyMessage}</p>
    : <ul className="payment-history-list">{payments.map((payment) => <li key={payment.id}>
      <span><strong>{payment.debtorName}</strong> paid <strong>{payment.creditorName}</strong><small>{payment.groupName ? `${payment.groupName} · ` : ""}{new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(payment.paymentDate)}</small></span>
      <b>{payment.amount}</b>
    </li>)}</ul>;
}

function Totals({ values }: { values: { owedToMe: string; iOwe: string; netPosition: string; outstandingTotal: string } }) {
  return <dl className="balance-totals">
    <div><dt>Owed to you</dt><dd>{values.owedToMe}</dd></div>
    <div><dt>You owe</dt><dd>{values.iOwe}</dd></div>
    <div><dt>Your net position</dt><dd>{values.netPosition}</dd></div>
    <div><dt>Group outstanding</dt><dd>{values.outstandingTotal}</dd></div>
  </dl>;
}

export function BalanceOverview({ summaries }: { summaries: Overview }) {
  return <section className="panel balance-overview" aria-labelledby="balance-overview-title">
    <div className="section-heading"><div><span className="eyebrow">CURRENT NET BALANCES</span><h2 id="balance-overview-title">Group balances</h2></div><span className="round-icon peach">↔</span></div>
    <p className="panel-intro">Balances come from approved expenses and are netted per member pair. Currencies stay separate.</p>
    {summaries.length === 0 ? <p className="balance-empty">Join or create a group to see your balances.</p> : <div className="balance-summary-grid">{summaries.map((group) => <Link className="balance-summary-card" href={`/?group=${encodeURIComponent(group.id)}`} key={group.id}>
      <span className="balance-summary-heading"><strong>{group.name}</strong></span>
      <span className="balance-summary-net">{group.netPosition}</span>
      <span className="balance-summary-lines"><span>Owed to you <b>{group.owedToMe}</b></span><span>You owe <b>{group.iOwe}</b></span><span>Group outstanding <b>{group.outstandingTotal}</b></span></span>
      <span className="balance-summary-link">Open group balances →</span>
    </Link>)}</div>}
  </section>;
}

export function GroupBalancePanel({ details, currentUserId, payments }: { details: GroupDetails; currentUserId: string; payments: PaymentHistoryRows }) {
  return <section className="panel group-balance-panel" aria-labelledby="group-balance-title">
    <div className="section-heading"><div><span className="eyebrow">NETTED PAIRWISE PROJECTION · {details.group.currencyCode}</span><h2 id="group-balance-title">Outstanding balances</h2></div><span className="round-icon peach">↔</span></div>
    <p className="panel-intro">These are current net balances between members, not the original share of any single expense.</p>
    <Totals values={details}/>
    <div className="balance-pair-heading"><strong>Who owes whom</strong><span>Current net amount</span></div>
    {details.pairwise.length === 0 ? <p className="balance-empty">No outstanding group obligations. This group is settled.</p> : <ul className="balance-pairs">{details.pairwise.map((row) => <li key={row.id}>
      <span><strong>{row.debtorName}</strong><small>owes</small><strong>{row.creditorName}</strong><b>{row.amount}</b></span>
      {row.debtorUserId === currentUserId && <PaymentForm scopeId={row.scopeId} creditorUserId={row.creditorUserId} amountInput={row.amountInput} groupId={details.group.id}/>}
    </li>)}</ul>}
    <div className="payment-history"><div className="balance-pair-heading"><strong>Payment history</strong><span>{payments.length} recorded</span></div><PaymentHistory payments={payments}/></div>
  </section>;
}

export function DirectBalancePanel({ balances, payments, currentUserId }: { balances: DirectBalances; payments: DirectHistory; currentUserId: string }) {
  if (balances.length === 0 && payments.length === 0) return null;
  return <section className="panel direct-balance-panel" aria-labelledby="direct-balance-title">
    <div className="section-heading"><div><span className="eyebrow">PERSONAL PAIR SCOPES · CURRENCIES SEPARATE</span><h2 id="direct-balance-title">Direct balances</h2></div><span className="round-icon mint">↔</span></div>
    <p className="panel-intro">These one-to-one balances are separate from every group balance.</p>
    {balances.length === 0 ? <p className="balance-empty">No direct obligations are outstanding.</p> : <ul className="balance-pairs">{balances.map((row) => <li key={row.scopeId}>
      <span><strong>{row.debtorName}</strong><small>owes</small><strong>{row.creditorName}</strong><b>{row.amount}</b></span>
      {row.isCurrentUserDebtor && row.debtorUserId === currentUserId && <PaymentForm scopeId={row.scopeId} creditorUserId={row.creditorUserId} amountInput={row.amountInput}/>}
    </li>)}</ul>}
    <div className="payment-history"><div className="balance-pair-heading"><strong>Direct payment history</strong><span>{payments.length} recorded</span></div><PaymentHistory payments={payments}/></div>
  </section>;
}

export function FormerPersonalBalancePanel({ balances, payments, currentUserId }: { balances: FormerBalances; payments: FormerHistory; currentUserId: string }) {
  if (balances.length === 0 && payments.length === 0) return null;
  return <section className="panel former-balance-panel" aria-labelledby="former-balance-title">
    <div className="section-heading"><div><span className="eyebrow">PERSONAL HISTORY</span><h2 id="former-balance-title">Your former group balances</h2></div><span className="round-icon lavender">↔</span></div>
    <p className="panel-intro">Only your own pairwise balances are shown. This does not provide access to group-wide balances or history.</p>
    {balances.map((group) => <div className="former-balance-group" key={group.groupId}>
      <h3>{group.groupName} <small>{group.currencyCode}</small></h3>
      <dl className="balance-totals balance-personal-totals">
        <div><dt>Owed to you</dt><dd>{group.owedToMe}</dd></div><div><dt>You owe</dt><dd>{group.iOwe}</dd></div><div><dt>Your net position</dt><dd>{group.netPosition}</dd></div>
      </dl>
      {group.pairwise.length === 0 ? <p className="balance-empty">No outstanding balance for your recorded pairs.</p> : <ul className="balance-pairs">{group.pairwise.map((row) => <li key={row.id}>
        <span><strong>{row.debtorName}</strong><small>owes</small><strong>{row.creditorName}</strong><b>{row.amount}</b></span>
        {row.debtorUserId === currentUserId && <PaymentForm scopeId={row.scopeId} creditorUserId={row.creditorUserId} amountInput={row.amountInput} groupId={group.groupId}/>}
      </li>)}</ul>}
    </div>)}
    <div className="payment-history"><div className="balance-pair-heading"><strong>Your former-group payment history</strong><span>{payments.length} recorded</span></div><PaymentHistory payments={payments}/></div>
  </section>;
}
