import Link from "next/link";
import { getGroupBalanceDetails, listBalanceSummariesForUser, listFormerPersonalBalances } from "../expenses/balances";

type Overview = Awaited<ReturnType<typeof listBalanceSummariesForUser>>;
type GroupDetails = Awaited<ReturnType<typeof getGroupBalanceDetails>>;
type FormerBalances = Awaited<ReturnType<typeof listFormerPersonalBalances>>;

function Totals({ values }: { values: { owedToMe: string; iOwe: string; netPosition: string; outstandingTotal: string } }) {
  return <dl className="balance-totals">
    <div><dt>Owed to you</dt><dd>{values.owedToMe}</dd></div>
    <div><dt>You owe</dt><dd>{values.iOwe}</dd></div>
    <div><dt>Your net position</dt><dd>{values.netPosition}</dd></div>
    <div><dt>Group outstanding</dt><dd>{values.outstandingTotal}</dd></div>
  </dl>;
}

function PersonalPairRows({ rows }: { rows: { id: string; debtorName: string; creditorName: string; amount: string }[] }) {
  return rows.length === 0
    ? <p className="balance-empty">No outstanding pairwise balances. Your recorded balances are settled.</p>
    : <ul className="balance-pairs">{rows.map((row) => <li key={row.id}>
      <span><strong>{row.debtorName}</strong><small>owes</small><strong>{row.creditorName}</strong></span>
      <b>{row.amount}</b>
    </li>)}</ul>;
}

export function BalanceOverview({ summaries }: { summaries: Overview }) {
  return <section className="panel balance-overview" aria-labelledby="balance-overview-title">
    <div className="section-heading"><div><span className="eyebrow">CURRENT NET BALANCES</span><h2 id="balance-overview-title">Group balances</h2></div><span className="round-icon peach">↔</span></div>
    <p className="panel-intro">Balances come from approved expenses and are netted per member pair. Currencies stay separate.</p>
    {summaries.length === 0 ? <p className="balance-empty">Join or create a group to see your balances.</p> : <div className="balance-summary-grid">{summaries.map((group) => <Link className="balance-summary-card" href={`/?group=${encodeURIComponent(group.id)}`} key={group.id}>
      <span className="balance-summary-heading"><strong>{group.name}</strong><small>{group.currencyCode}</small></span>
      <span className="balance-summary-net">{group.netPosition}</span>
      <span className="balance-summary-lines"><span>Owed to you <b>{group.owedToMe}</b></span><span>You owe <b>{group.iOwe}</b></span><span>Group outstanding <b>{group.outstandingTotal}</b></span></span>
      <span className="balance-summary-link">Open group balances →</span>
    </Link>)}</div>}
  </section>;
}

export function GroupBalancePanel({ details }: { details: GroupDetails }) {
  return <section className="panel group-balance-panel" aria-labelledby="group-balance-title">
    <div className="section-heading"><div><span className="eyebrow">NETTED PAIRWISE PROJECTION · {details.group.currencyCode}</span><h2 id="group-balance-title">Outstanding balances</h2></div><span className="round-icon peach">↔</span></div>
    <p className="panel-intro">These are current net balances between members, not the original share of any single expense.</p>
    <Totals values={details}/>
    <div className="balance-pair-heading"><strong>Who owes whom</strong><span>Current net amount</span></div>
    <PersonalPairRows rows={details.pairwise}/>
  </section>;
}

export function FormerPersonalBalancePanel({ balances }: { balances: FormerBalances }) {
  if (balances.length === 0) return null;
  return <section className="panel former-balance-panel" aria-labelledby="former-balance-title">
    <div className="section-heading"><div><span className="eyebrow">PERSONAL HISTORY</span><h2 id="former-balance-title">Your former group balances</h2></div><span className="round-icon lavender">↔</span></div>
    <p className="panel-intro">Only your own pairwise balances are shown. This does not provide access to group-wide balances or history.</p>
    {balances.map((group) => <div className="former-balance-group" key={group.groupId}>
      <h3>{group.groupName} <small>{group.currencyCode}</small></h3>
      <dl className="balance-totals balance-personal-totals">
        <div><dt>Owed to you</dt><dd>{group.owedToMe}</dd></div><div><dt>You owe</dt><dd>{group.iOwe}</dd></div><div><dt>Your net position</dt><dd>{group.netPosition}</dd></div>
      </dl>
      <PersonalPairRows rows={group.pairwise}/>
    </div>)}
  </section>;
}
