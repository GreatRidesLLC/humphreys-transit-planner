import { CalendarDays } from "lucide-react";
import { ko } from "date-fns/locale";

import { formatDay, HOURS, minuteOptions, startOfToday, ymd, ymdToDate } from "@/lib/datetime.js";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// Split point for the whole Depart-at / Arrive-by row. react-day-picker +
// date-fns + Radix Popper (shared by Popover and Select) is ~40 kB gzip, and
// none of it renders while the mode is "Leave now" — which is the default and
// the overwhelmingly common case. App lazy-loads this module so a rider who
// just wants the next bus never downloads a calendar.
const TIME_TRIGGER =
  "h-11 w-[62px] justify-center gap-1 rounded-md border-border bg-card px-2 font-mono text-sm " +
  "text-foreground dark:bg-card [&>svg]:size-3";

export default function TripWhenPicker({ lang, t, date, time, onDate, onTime }) {
  return (
    <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" aria-label={t.pickDate}
            className="h-11 w-full justify-start gap-2 rounded-md border-border bg-card px-3 text-sm font-normal text-foreground dark:bg-card">
            <CalendarDays className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true"/>
            <span className="truncate">{formatDay(ymdToDate(date), lang)}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar mode="single" required
            locale={lang === "ko" ? ko : undefined}
            selected={ymdToDate(date)} defaultMonth={ymdToDate(date)}
            disabled={{ before: startOfToday() }}
            onSelect={d=>{ if (d) onDate(ymd(d)); }}/>
        </PopoverContent>
      </Popover>

      <div className="flex items-center gap-1">
        <Label htmlFor="trip-hour" className="sr-only">{t.pickHour}</Label>
        <Select value={time.slice(0,2)} onValueChange={v=>onTime(`${v}:${time.slice(3,5)}`)}>
          <SelectTrigger id="trip-hour" className={TIME_TRIGGER}><SelectValue/></SelectTrigger>
          <SelectContent position="popper" className="max-h-56">
            {HOURS.map(h=><SelectItem key={h} value={h} className="font-mono">{h}</SelectItem>)}
          </SelectContent>
        </Select>
        <span aria-hidden="true" className="font-mono text-sm text-muted-foreground">:</span>
        <Label htmlFor="trip-minute" className="sr-only">{t.pickMinute}</Label>
        <Select value={time.slice(3,5)} onValueChange={v=>onTime(`${time.slice(0,2)}:${v}`)}>
          <SelectTrigger id="trip-minute" className={TIME_TRIGGER}><SelectValue/></SelectTrigger>
          <SelectContent position="popper" className="max-h-56">
            {minuteOptions(time.slice(3,5)).map(m=><SelectItem key={m} value={m} className="font-mono">{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
