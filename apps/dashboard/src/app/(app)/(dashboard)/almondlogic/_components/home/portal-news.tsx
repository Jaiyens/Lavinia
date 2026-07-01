import { Megaphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// The "Grower Portal News" column of the Almond Logic home, re-skinned in Terra. The real portal
// surfaces handler announcements here; we have no scraped announcement feed yet, so we stay faithful
// to the structure with a single calm welcome card plus a clear empty note, never fabricated news.
export function PortalNews() {
  return (
    <section aria-labelledby="portal-news-heading" className="min-w-0">
      <h2 id="portal-news-heading" className="type-title text-balance text-on-surface">
        Grower Portal News
      </h2>
      <p className="type-body-md mt-1 text-pretty text-on-surface-variant">
        Announcements from your hullers and handlers show up here.
      </p>

      <div className="mt-4 space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-primary">
              <Megaphone size={16} aria-hidden />
              <span className="type-label-caps">Welcome</span>
            </div>
            <CardTitle className="text-on-surface">Your Almond Logic portal is connected</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="type-body-md text-pretty text-on-surface-variant">
              Runs, deliveries, and turnout sync from your hullers and handlers. Use the tabs above to
              review grower details, run results, and reports. New announcements will appear in this
              column as they arrive.
            </p>
          </CardContent>
        </Card>

        <div className="flex min-h-[8rem] flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-outline-variant bg-surface-container-lowest p-6 text-center">
          <p className="type-body-md text-on-surface-variant">No new announcements.</p>
          <p className="type-caption mt-1 text-on-surface-variant">
            New portal news appears here after a sync.
          </p>
        </div>
      </div>
    </section>
  );
}
