import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { todayYMD } from "@/lib/datetime.js";

// ISO 8601 week number (Monday-anchored), formatted YYYY-Www to match the keys
// in public/wisdom.json. Follows the standard "week containing Thursday belongs
// to that year" rule so week 1 is always the first week with >=4 days in Jan.
function isoWeekKey(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((t - yearStart) / 86400000) + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function DailyEncouragement({
  lang,
  t,
  enabled,
  onDisable,
  dismissedYmd,
  onDismiss,
}) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch("/wisdom.json", { cache: "default" })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
      .then(j => { if (!cancelled) setData(j); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [enabled]);

  if (!enabled) return null;
  const today = todayYMD();
  if (dismissedYmd === today) return null;
  if (failed || !data?.weeks) return null;

  const now = new Date();
  const week = isoWeekKey(now);
  const bucket = data.weeks[week];
  if (!Array.isArray(bucket) || bucket.length === 0) return null;

  const line = bucket[now.getDay() % bucket.length];
  const text = line?.[lang] || line?.en;
  if (!text) return null;

  return (
    <Card className="mb-3.5 border bg-card shadow-[shadow:var(--card-shadow)] ring-0 py-0">
      <div className="flex items-start gap-2 px-4 py-3">
        <p className="min-w-0 flex-1 text-[12.5px] leading-[1.55] text-muted-foreground italic">
          {text}
        </p>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Button variant="ghost" size="icon"
            aria-label={t.encouragementDismiss} title={t.encouragementDismiss}
            onClick={() => onDismiss(today)}
            className="size-6 text-muted-foreground hover:text-foreground">
            <X className="size-3.5" aria-hidden="true"/>
          </Button>
          <button type="button" onClick={onDisable}
            className={cn(
              "text-[10.5px] leading-none text-faint hover:text-muted-foreground",
              "underline decoration-dotted underline-offset-2",
            )}>
            {t.encouragementHide}
          </button>
        </div>
      </div>
    </Card>
  );
}
