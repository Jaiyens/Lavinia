import Link from "next/link";
import { FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

// The Almond Logic "Reports" rail, re-skinned in the Terra palette. The portal lists its grower
// reports as printable links down the right side of the Grower Details screen; we mirror that list,
// each row linking to the Reports screen (preserving the active huller + crop year via the query
// string). Pure presentation - the report names come from REPORT_LIST in the data contract.

export function ReportsPanel({ reports, query }: { reports: readonly string[]; query: string }) {
  const href = (report: string) => {
    const params = new URLSearchParams(query);
    params.set("report", report);
    const qs = params.toString();
    return qs ? `/almondlogic/reports?${qs}` : "/almondlogic/reports";
  };

  return (
    <Card className="border border-outline-variant bg-surface-container-lowest text-on-surface ring-0 shadow-e1">
      <CardHeader>
        <CardTitle className="type-title text-on-surface">Reports</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="divide-y divide-outline-variant">
          {reports.map((report) => (
            <li key={report}>
              <Link
                href={href(report)}
                className="group flex items-center gap-2.5 py-2.5 type-body-md text-on-surface-variant transition-colors hover:text-on-surface"
              >
                <FileText
                  size={16}
                  aria-hidden
                  className="shrink-0 text-primary/70 transition-colors group-hover:text-primary"
                />
                <span className="min-w-0 flex-1 truncate">{report}</span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
