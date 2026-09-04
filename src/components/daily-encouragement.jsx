import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";

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

export function DailyEncouragement({ lang }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/wisdom.json", { cache: "default" })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
      .then(j => { if (!cancelled) setData(j); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  if (failed || !data?.weeks) return null;

  const now = new Date();
  const bucket = data.weeks[isoWeekKey(now)];
  if (!Array.isArray(bucket) || bucket.length === 0) return null;

  const line = bucket[now.getDay() % bucket.length];
  const text = line?.[lang] || line?.en;
  if (!text) return null;

  return (
    <Card className="mb-3.5 border bg-card shadow-[shadow:var(--card-shadow)] ring-0 py-0">
      <p className="px-4 py-3 text-center text-[12.5px] leading-[1.55] text-muted-foreground italic">
        {text}
      </p>
    </Card>
  );
}
