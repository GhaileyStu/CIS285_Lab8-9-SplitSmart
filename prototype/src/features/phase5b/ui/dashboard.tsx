import { redirect } from "next/navigation";
import Link from "next/link";
import { addMemberAction, createGroupAction, deactivateMemberAction, updateGroupAction } from "../actions/groups";
import { approveGroupExpenseAction, createGroupExpenseAction, rejectGroupExpenseAction } from "../actions/expenses";
import { logoutAction } from "../actions/auth";
import { SubmitButton } from "./submit-button";
import { BalanceOverview, DirectBalancePanel, FormerPersonalBalancePanel, GroupBalancePanel } from "./balance-dashboard";
import { getCurrentUser } from "../auth/session";
import { getGroupBalanceDetails, listBalanceSummariesForUser, listFormerPersonalBalances } from "../expenses/balances";
import { listDirectBalancesForUser, listDirectPaymentsForUser, listFormerGroupPayments, listGroupPayments } from "../expenses/payments";
import { listFormerParticipantPendingDecisions, listGroupExpenses } from "../expenses/history";
import { listGroupsForUser } from "../groups/service";

type GroupData = Awaited<ReturnType<typeof listGroupsForUser>>[number];
type ExpenseData = Awaited<ReturnType<typeof listGroupExpenses>>["expenses"][number];
type FormerDecisionData = Awaited<ReturnType<typeof listFormerParticipantPendingDecisions>>[number];

function money(cents: bigint, currency: string) {
  const whole = cents / BigInt(100);
  return `${currency} ${whole.toLocaleString("en-US")}.${(cents % BigInt(100)).toString().padStart(2, "0")}`;
}

function dateLabel(date: Date) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function initials(value: string) {
  return value.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function MemberList({ group, userId }: { group: GroupData; userId: string }) {
  const isOwner = group.ownerId === userId;
  return <div className="member-list">
    {group.memberships.map(({ user, role }) => <div className="member-row" key={user.id}>
      <span className="avatar">{initials(user.displayName || user.username)}</span>
      <span className="member-info"><strong>{user.displayName}</strong><small>@{user.username}{role === "OWNER" ? " · owner" : ""}</small></span>
      {isOwner && user.id !== userId && <form action={deactivateMemberAction}><input type="hidden" name="groupId" value={group.id}/><input type="hidden" name="memberUserId" value={user.id}/><button className="icon-button" aria-label={`Remove ${user.displayName}`} title="Remove member">×</button></form>}
    </div>)}
    {isOwner && <form className="inline-form add-member-form" action={addMemberAction}>
      <input type="hidden" name="groupId" value={group.id}/><input name="username" placeholder="Add by username" aria-label="Registered username" required minLength={3} maxLength={32}/><SubmitButton pendingLabel="Adding…">Add</SubmitButton>
      <small>Prototype: adds an existing account by username. No invitation email is sent.</small>
    </form>}
    {isOwner && <form className="group-settings-form stack-form" action={updateGroupAction}>
      <span className="eyebrow">GROUP SETTINGS</span><input type="hidden" name="groupId" value={group.id}/>
      <label>Group name<input name="name" defaultValue={group.name} required maxLength={80}/></label>
      <label>Currency{group._count.expenses > 0 && <input type="hidden" name="currencyCode" value={group.currencyCode}/>}<select name="currencyCode" defaultValue={group.currencyCode} disabled={group._count.expenses > 0}><option value="USD">USD · US Dollar</option><option value="CAD">CAD · Canadian Dollar</option><option value="EUR">EUR · Euro</option><option value="GBP">GBP · British Pound</option><option value="AUD">AUD · Australian Dollar</option><option value="NZD">NZD · New Zealand Dollar</option></select>{group._count.expenses > 0 && <span className="field-caption">Currency is locked after an expense is saved.</span>}</label>
      <SubmitButton className="button button-light" pendingLabel="Saving settings…">Save settings</SubmitButton>
    </form>}
  </div>;
}

function ExpenseCard({ expense, currency, userId, groupName }: {
  expense: ExpenseData | FormerDecisionData;
  currency: string;
  userId: string;
  groupName?: string;
}) {
  const revision = expense.revision;
  const approvals = revision.approvals;
  const approvedCount = approvals.filter((approval) => approval.decision === "APPROVE").length;
  const userDecision = approvals.find((approval) => approval.participantUserId === userId);
  const canDecide = expense.status === "PENDING" && !userDecision && revision.shares.some((share) => share.participantUserId === userId);
  return <article className="expense-card">
    <div className="expense-icon">{revision.splitMethod === "EQUAL" ? "↗" : "%"}</div>
    <div className="expense-main"><div className="expense-title-row"><h3>{revision.description}</h3><span className={`status-pill status-${expense.status.toLowerCase()}`}>{expense.status === "PENDING" ? "Awaiting review" : expense.status}</span></div>
      {groupName && <p className="approval-group-label">Former group · <strong>{groupName}</strong></p>}
      <p>Paid by <strong>{revision.payer.displayName}</strong> <span className="dot">·</span> {dateLabel(revision.expenseDate)} <span className="dot">·</span> {revision.splitMethod === "EQUAL" ? "Equal split" : "Percentage split"}</p>
      <div className="participants">{revision.shares.map((share) => <span className="participant-chip" key={share.id}>{share.participant.displayName} <b>{money(share.shareCents, currency)}</b></span>)}</div>
      <div className="approval-progress" aria-label={`${approvedCount} of ${revision.shares.length} approvals received`}>
        <span className="approval-count">{expense.status === "APPROVED" ? "All participants approved" : `${approvedCount} of ${revision.shares.length} approvals`}</span>
        <div className="approval-decisions">{revision.shares.map((share) => {
          const participantDecision = approvals.find((approval) => approval.participantUserId === share.participantUserId)?.decision;
          const label = participantDecision === "APPROVE" ? "Approved" : participantDecision === "REJECT" ? "Rejected" : "Awaiting";
          return <span className={`decision-chip decision-${label.toLowerCase()}`} key={share.id}>{share.participant.displayName}: {label}</span>;
        })}</div>
      </div>
      {canDecide && <div className="approval-actions">
        <form action={approveGroupExpenseAction}><input type="hidden" name="expenseId" value={expense.id}/><SubmitButton className="button button-dark" pendingLabel="Approving…">Approve</SubmitButton></form>
        <form action={rejectGroupExpenseAction}><input type="hidden" name="expenseId" value={expense.id}/><SubmitButton className="button button-reject" pendingLabel="Rejecting…">Reject</SubmitButton></form>
      </div>}
      {userDecision && <p className="own-decision">Your decision: <strong>{userDecision.decision === "APPROVE" ? "Approved" : "Rejected"}</strong></p>}
    </div><strong className="expense-total">{money(revision.amountCents, currency)}</strong>
  </article>;
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ group?: string; error?: string; notice?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const groups = await listGroupsForUser(user.id);
  const balanceSummaries = await listBalanceSummariesForUser(user.id);
  const formerBalances = await listFormerPersonalBalances(user.id);
  const directBalances = await listDirectBalancesForUser(user.id);
  const directPayments = await listDirectPaymentsForUser(user.id);
  const formerPayments = await listFormerGroupPayments(user.id);
  const formerDecisions = await listFormerParticipantPendingDecisions(user.id);
  const selected = groups.find((group) => group.id === params.group);
  const [history, groupBalances, groupPayments] = selected
    ? await Promise.all([
      listGroupExpenses(user.id, selected.id),
      getGroupBalanceDetails(user.id, selected.id),
      listGroupPayments(user.id, selected.id),
    ])
    : [null, null, []];
  const totalExpenses = groups.reduce((sum, group) => sum + group._count.expenses, 0);
  const totalMembers = groups.reduce((sum, group) => sum + group.memberships.length, 0);
  return <main className="app-shell">
    <aside className="sidebar"><Link className="brand" href="/"><span className="brand-mark">S</span><span>Split<span>Smart</span></span></Link>
      <div className="side-label">YOUR WORKSPACE</div><Link className="side-link active" href="/"><span>▦</span> Overview</Link>
      <div className="side-section"><span className="side-label">YOUR GROUPS</span><span className="side-count">{groups.length}</span></div>
      <nav className="group-nav" aria-label="Groups">{groups.map((group, index) => <a className={`group-link${selected?.id === group.id ? " selected" : ""}`} href={`/?group=${encodeURIComponent(group.id)}`} key={group.id}><span className={`group-dot dot-${index % 4}`}>{initials(group.name)}</span><span>{group.name}</span></a>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><span className="help-spark">✳</span><strong>Shared is simpler.</strong><p>Clear expenses make happy groups.</p></div><div className="profile-row"><span className="avatar profile-avatar">{initials(user.displayName)}</span><span className="profile-info"><strong>{user.displayName}</strong><small>@{user.username}</small></span><form action={logoutAction}><button className="icon-button logout-button" title="Sign out" aria-label="Sign out">↪</button></form></div></div>
    </aside>
    <section className="main-content"><header className="topbar"><div className="breadcrumb">Workspace <span>/</span> {selected ? selected.name : "Overview"}</div><div className="topbar-user"><span className="online-dot"/> Local prototype <span className="topbar-avatar">{initials(user.displayName)}</span></div></header>
      <div className="content-wrap">
        {params.error && <div className="notice error" role="alert">{params.error}</div>}{params.notice && <div className="notice success" role="status">{params.notice}</div>}
        {formerDecisions.length > 0 && <section className="panel former-approvals-panel" aria-labelledby="former-approvals-title">
          <div className="section-heading"><div><span className="eyebrow">ONE-TIME ACCESS</span><h2 id="former-approvals-title">Pending decisions <span className="heading-count">{formerDecisions.length}</span></h2></div><span className="round-icon peach">✓</span></div>
          <p className="panel-intro">These are only pending expenses in which you participated before leaving a group.</p>
          <div className="expense-list">{formerDecisions.map((expense)=><ExpenseCard key={expense.id} expense={expense} currency={expense.group.currencyCode} groupName={expense.group.name} userId={user.id}/>)}</div>
        </section>}
        {!selected ? <>
          <section className="welcome-row"><div><span className="eyebrow">YOUR SHARED SPACES</span><h1>Good to see you, {user.displayName.split(" ")[0]} <span className="wave">✳</span></h1><p>Here’s a little snapshot of your shared spending.</p></div><a href="#new-group" className="button button-dark">Create a group <span>＋</span></a></section>
          <section className="stat-grid"><div className="stat-card"><span className="stat-icon mint">▦</span><span className="stat-label">YOUR GROUPS</span><strong>{groups.length.toString().padStart(2, "0")}</strong><small>Active shared spaces</small></div><div className="stat-card"><span className="stat-icon lavender">♙</span><span className="stat-label">MEMBERS</span><strong>{totalMembers.toString().padStart(2, "0")}</strong><small>Across your groups</small></div><div className="stat-card"><span className="stat-icon peach">↗</span><span className="stat-label">RECORDED EXPENSES</span><strong>{totalExpenses.toString().padStart(2, "0")}</strong><small>Saved to your history</small></div></section>
          <BalanceOverview summaries={balanceSummaries}/>
          <DirectBalancePanel balances={directBalances} payments={directPayments} currentUserId={user.id}/>
          <FormerPersonalBalancePanel balances={formerBalances} payments={formerPayments} currentUserId={user.id}/>
          <section className="workspace-grid"><div className="panel groups-panel"><div className="section-heading"><div><span className="eyebrow">SHARED SPACES</span><h2>Your groups <span className="heading-count">{groups.length}</span></h2></div><span className="round-icon">▦</span></div>
            {groups.length === 0 ? <div className="empty-state"><span className="empty-illustration">✳</span><h3>Your first group starts here</h3><p>Bring your household, trip, or dinner crew together in one shared space.</p><a className="text-link" href="#new-group">Create your first group →</a></div> : <div className="group-cards">{groups.map((group, index) => <a className="group-card" href={`/?group=${encodeURIComponent(group.id)}`} key={group.id}><span className={`group-emblem dot-${index % 4}`}>{initials(group.name)}</span><div className="group-card-copy"><strong>{group.name}</strong><small>{group.memberships.length} members <span>·</span> {group.currencyCode}</small></div><span className="card-arrow">↗</span></a>)}</div>}
          </div><div className="panel create-panel" id="new-group"><div className="section-heading"><div><span className="eyebrow">START SOMETHING TOGETHER</span><h2>Create a group</h2></div><span className="round-icon peach">＋</span></div><p className="panel-intro">Set up a shared space for people, plans, and everyday expenses.</p><form className="stack-form" action={createGroupAction}><label>Group name<input name="name" placeholder="e.g. Maple Street House" required maxLength={80}/></label><label>Currency<select name="currencyCode" defaultValue="USD"><option value="USD">USD · US Dollar</option><option value="CAD">CAD · Canadian Dollar</option><option value="EUR">EUR · Euro</option><option value="GBP">GBP · British Pound</option><option value="AUD">AUD · Australian Dollar</option><option value="NZD">NZD · New Zealand Dollar</option></select></label><SubmitButton pendingLabel="Creating group…">Create group <span>→</span></SubmitButton></form><div className="owner-note"><span>✦</span> You’ll be the owner and first member.</div></div></section>
          <footer className="page-footer">Made for sharing the little things <span>✳</span></footer>
        </> : <>
          <section className="welcome-row group-welcome"><div><span className="eyebrow">SHARED SPACE · {selected.currencyCode}</span><h1>{selected.name}</h1><p>Keep your group’s shared costs clear and together.</p></div><Link href="/" className="button button-light">← All groups</Link></section>
          <section className="group-detail-grid"><div className="panel members-panel"><div className="section-heading"><div><span className="eyebrow">THE CREW</span><h2>Members <span className="heading-count">{selected.memberships.length}</span></h2></div><span className="round-icon">♙</span></div><MemberList group={selected} userId={user.id}/></div>
            <div className="panel expense-form-panel"><div className="section-heading"><div><span className="eyebrow">ADD TO THE LEDGER</span><h2>New expense</h2></div><span className="round-icon peach">↗</span></div>
              <form action={createGroupExpenseAction} className="stack-form expense-form"><input type="hidden" name="groupId" value={selected.id}/><div className="form-two"><label>Amount <span className="label-hint">{selected.currencyCode}</span><input name="amount" inputMode="decimal" placeholder="0.00" required pattern="[0-9]+(\.[0-9]{1,2})?"/></label><label>Date<input name="expenseDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)}/></label></div>
                <label>What was it for?<input name="description" placeholder="Groceries, dinner, utilities…" required maxLength={200}/></label><label>Who paid?<select name="payerUserId" required defaultValue={user.id}>{selected.memberships.map(({user: member})=><option key={member.id} value={member.id}>{member.displayName}{member.id === user.id ? " (you)" : ""}</option>)}</select></label>
                <fieldset className="participants-field"><legend>Who’s sharing this?</legend>{selected.memberships.map(({user: member})=><label className="participant-select" key={member.id}><input type="checkbox" name="participantUserIds" value={member.id}/><span className="checkmark"/><span>{member.displayName}{member.id === user.id ? " (you)" : ""}</span><input className="percent-input" name={`percentage-${member.id}`} aria-label={`${member.displayName} percentage`} placeholder="0.00" inputMode="decimal" pattern="[0-9]{1,3}(\.[0-9]{1,2})?"/><span className="percent-sign">%</span></label>)}</fieldset>
                <label>Split style<select name="splitMethod" defaultValue="EQUAL"><option value="EQUAL">Split equally</option><option value="PERCENTAGE">By percentage</option></select><span className="field-caption">For a percentage split, enter each selected member’s share above. Shares must total exactly 100%.</span></label><SubmitButton pendingLabel="Saving expense…">Save expense <span>→</span></SubmitButton>
              </form>
            </div>
          </section>
          {groupBalances && <GroupBalancePanel details={groupBalances} currentUserId={user.id} payments={groupPayments}/>}
          <section className="panel history-panel"><div className="section-heading"><div><span className="eyebrow">THE PAPER TRAIL</span><h2>Expense history <span className="heading-count">{history?.expenses.length ?? 0}</span></h2></div><span className="round-icon">↗</span></div>
            <p className="balance-status-note"><strong>Balance effect:</strong> approved expenses contribute to the current projection. Pending expenses await participant decisions; rejected expenses do not affect balances.</p>
            {!history?.expenses.length ? <div className="empty-history"><span>◷</span><div><strong>No expenses here yet</strong><p>Saved expenses and each person’s share will appear here.</p></div></div> : <div className="expense-list">{history.expenses.map((expense)=><ExpenseCard key={expense.id} expense={expense} currency={history.group.currencyCode} userId={user.id}/>)}</div>}
          </section><footer className="page-footer">Shared expenses stay connected to their group <span>✳</span></footer>
        </>}
      </div>
    </section>
  </main>;
}
