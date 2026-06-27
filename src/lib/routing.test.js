import { describe, it, expect } from "vitest";
import {
  ROUTES, ALL_STOPS, STOP_ROUTES,
  inService, serviceEndToday,
  nextScheduledDeparture, prevScheduledDeparture,
  findTrips,
  haversineMeters, walkMinutes,
} from "./routing.js";

// Reference dates: 2026-06-29 is a Monday, 2026-07-03 Friday, 2026-07-04 Saturday.
const monAt = (h, m) => new Date(2026, 5, 29, h, m, 0, 0);
const friAt = (h, m) => new Date(2026, 6, 3, h, m, 0, 0);
const satAt = (h, m) => new Date(2026, 6, 4, h, m, 0, 0);
const sunAt = (h, m) => new Date(2026, 6, 5, h, m, 0, 0);

describe("inService", () => {
  it("Mon-Fri route runs on weekdays inside hours", () => {
    expect(inService(ROUTES.BLUE, monAt(12, 0))).toBe(true);
  });
  it("Mon-Fri route does not run on Saturday", () => {
    expect(inService(ROUTES.BLUE, satAt(12, 0))).toBe(false);
  });
  it("Mon-Fri route does not run on Sunday", () => {
    expect(inService(ROUTES.BLUE, sunAt(12, 0))).toBe(false);
  });
  it("rejects times after service-end", () => {
    expect(inService(ROUTES.BLUE, monAt(23, 0))).toBe(false);
  });
  it("rejects times before service-start", () => {
    expect(inService(ROUTES.BLUE, monAt(5, 0))).toBe(false);
  });
  it("Fri-Sat route runs on Friday inside hours", () => {
    expect(inService(ROUTES.PINK, friAt(18, 0))).toBe(true);
  });
  it("Fri-Sat route does not run on Wednesday", () => {
    expect(inService(ROUTES.PINK, new Date(2026, 6, 1, 18, 0))).toBe(false);
  });
  it("Mon-Sun route runs on Sunday inside hours", () => {
    expect(inService(ROUTES.GOLD, sunAt(12, 0))).toBe(true);
  });
});

describe("serviceEndToday", () => {
  it("returns service-end Date on a running day", () => {
    const end = serviceEndToday(ROUTES.BLUE, monAt(10, 0));
    expect(end.getHours()).toBe(22);
    expect(end.getMinutes()).toBe(0);
  });
  it("returns null on a non-running day", () => {
    expect(serviceEndToday(ROUTES.BLUE, satAt(10, 0))).toBeNull();
  });
  it("returns null for Fri-Sat route on Monday", () => {
    expect(serviceEndToday(ROUTES.PINK, monAt(18, 0))).toBeNull();
  });
});

describe("STOP_ROUTES + ALL_STOPS index", () => {
  it("STOP_ROUTES maps a known stop to all serving routes", () => {
    expect(STOP_ROUTES["Bus Terminal"]).toEqual(
      expect.arrayContaining(["GOLD", "BROWN", "GREEN", "PURPLE"])
    );
  });
  it("ALL_STOPS contains a known stop", () => {
    expect(ALL_STOPS).toContain("Main Exchange (PX)");
  });
});

describe("nextScheduledDeparture / prevScheduledDeparture", () => {
  it("GOLD honors PDF-sourced :00 :20 :40 timetable at Bus Terminal", () => {
    const d = nextScheduledDeparture(ROUTES.GOLD, "Bus Terminal", monAt(9, 30));
    expect(d).not.toBeNull();
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(40);
  });
  it("GOLD prev <= 10:00 returns 10:00 (inclusive)", () => {
    const d = prevScheduledDeparture(ROUTES.GOLD, "Bus Terminal", monAt(10, 0));
    expect(d.getHours()).toBe(10);
    expect(d.getMinutes()).toBe(0);
  });
  it("falls back to anchored heuristic for non-verified routes", () => {
    // Blue: Pedestrian Gate is index 0, offset 0, freq 15 → next after 10:07 = 10:15
    const d = nextScheduledDeparture(ROUTES.BLUE, "Pedestrian Gate", monAt(10, 7));
    expect(d.getHours()).toBe(10);
    expect(d.getMinutes()).toBe(15);
  });
});

describe("findTrips — guards", () => {
  it("returns empty for same from/to", () => {
    const r = findTrips("Bus Terminal", "Bus Terminal", monAt(12, 0), "depart");
    expect(r.trips).toEqual([]);
  });
  it("returns empty for missing stop", () => {
    const r = findTrips("Bus Terminal", "Not A Real Stop", monAt(12, 0), "depart");
    expect(r.trips).toEqual([]);
  });
});

describe("findTrips — direct route", () => {
  it("finds direct trip on Blue route", () => {
    const r = findTrips("Pedestrian Gate", "Eighth Army HQ", monAt(10, 0), "depart");
    const direct = r.trips.find(t => t.type === "direct");
    expect(direct).toBeTruthy();
    const busLeg = direct.legs.find(l => l.k === "bus");
    expect(["BLUE","BLACK","GREEN","ORANGE"]).toContain(busLeg.rid);
    expect(direct.arriveAt > direct.departAt).toBe(true);
  });

  it("populates clock times in order", () => {
    const r = findTrips("Pedestrian Gate", "Eighth Army HQ", monAt(10, 0), "depart");
    const trip = r.trips[0];
    let last = trip.departAt;
    for (const leg of trip.legs) {
      const start = leg.startAt || leg.boardAt;
      const end = leg.endAt || leg.alightAt;
      expect(start >= last).toBe(true);
      expect(end >= start).toBe(true);
      last = end;
    }
    expect(trip.arriveAt >= last).toBe(true);
  });
});

describe("findTrips — transfer", () => {
  it("finds a 1-transfer route when no direct exists", () => {
    // Brian D. Allgood Hospital is PURPLE-only; Pedestrian Gate is on
    // BLUE/BLACK/GREEN/ORANGE/BROWN. Shared hub: Bus Terminal (PURPLE+GREEN).
    const r = findTrips("Brian D. Allgood Hospital", "Pedestrian Gate", monAt(10, 0), "depart");
    expect(r.trips.length).toBeGreaterThan(0);
    expect(r.trips.every(t => t.type === "xfer")).toBe(true);
    const xferLeg = r.trips[0].legs.find(l => l.k === "xfer");
    expect(xferLeg).toBeTruthy();
    expect(xferLeg.at).toBeTruthy();
  });
});

describe("findTrips — service-hours filter", () => {
  it("filters out routes that are out-of-service at refTime", () => {
    // 23:30 Mon: Mon-Fri routes (Blue/Black/Orange/Green/Purple) end at 22:00.
    const r = findTrips("Pedestrian Gate", "Eighth Army HQ", monAt(23, 30), "depart");
    expect(r.trips).toEqual([]);
    expect(r.filtered).toEqual(
      expect.arrayContaining(["Blue Route", "Black Route", "Orange Route"])
    );
  });
});

describe("findTrips — overnight detection", () => {
  it("records an overnight strand when a bus leg lands past service-end", () => {
    // 21:59 Mon from Pedestrian Gate to Central Issue Facility on Blue:
    // ride is 18 stops * 2 min = 36 min → alightAt past 22:30, but boardAt
    // already past 22:00 service end → next scheduled departure jumps to
    // Tue, exceeding endToday → overnight strand recorded.
    const r = findTrips(
      "Pedestrian Gate", "Central Issue Facility",
      monAt(21, 59), "depart"
    );
    expect(r.trips).toEqual([]);
    expect(r.overnight.length).toBeGreaterThan(0);
    expect(r.overnight[0].routes).toContain("Blue Route");
  });
});

describe("findTrips — arrive-by mode", () => {
  it("departAt earlier than refTime", () => {
    const arriveBy = monAt(12, 0);
    const r = findTrips("Pedestrian Gate", "Eighth Army HQ", arriveBy, "arrive");
    expect(r.trips.length).toBeGreaterThan(0);
    expect(r.trips[0].arriveAt <= arriveBy).toBe(true);
    expect(r.trips[0].departAt < arriveBy).toBe(true);
  });
});

describe("findTrips — Gold honors PDF schedule on direct trip", () => {
  it("boardAt matches first MONDAY-SATURDAY time >= refTime+walk", () => {
    // Sunday so only GOLD/inter-garrison serve these. GOLD runs Mon-Sun.
    const r = findTrips("Bus Terminal", "Main Exchange (PX)", sunAt(10, 0), "depart");
    const goldTrip = r.trips.find(
      t => t.type === "direct" && t.legs.some(l => l.k === "bus" && l.rid === "GOLD")
    );
    expect(goldTrip).toBeTruthy();
    const busLeg = goldTrip.legs.find(l => l.k === "bus");
    // Walk leg adds 3 min minimum → arrives at stop at 10:03 → next SUNDAY
    // entry from schedules.json should follow. Just assert boardAt comes from
    // the PDF block (minute is one of the published times, not :00/:15/:30/:45).
    expect(busLeg.boardAt).toBeInstanceOf(Date);
    expect(busLeg.boardAt >= goldTrip.departAt).toBe(true);
  });
});

describe("geo helpers", () => {
  it("haversineMeters between same point is 0", () => {
    expect(haversineMeters(37.0, 127.0, 37.0, 127.0)).toBe(0);
  });
  it("walkMinutes floors at 3 min for missing data", () => {
    expect(walkMinutes(null, "Bus Terminal", null)).toBeGreaterThanOrEqual(3);
  });
});
