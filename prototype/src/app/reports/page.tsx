import { requireUser } from "../../features/phase5b/auth/session";
import { getActivityReport, listReportGroups, ReportInputError, type ActivityReport } from "../../features/phase5b/expenses/reports";
import { ReportDashboard } from "../../features/phase5b/ui/report-dashboard";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const { context, start, end } = await searchParams;
  const groups = await listReportGroups(user.id);
  const group = groups.find((item) => context === `group:${item.id}`);
  const validContext = context === undefined || context === "direct" || Boolean(group);
  let report: ActivityReport | undefined;
  let error: string | undefined;

  if (!validContext) {
    error = "This report context is unavailable. Choose one of your groups or personal direct activity.";
  } else if (start !== undefined || end !== undefined) {
    try {
      report = await getActivityReport(user.id, group ? { kind: "GROUP", groupId: group.id } : { kind: "DIRECT" }, { start, end });
    } catch (cause) {
      if (!(cause instanceof ReportInputError)) throw cause;
      error = cause.message;
    }
  }

  return <ReportDashboard
    groups={groups}
    groupId={group?.id}
    start={typeof start === "string" ? start : ""}
    end={typeof end === "string" ? end : ""}
    report={report}
    error={error}
  />;
}
