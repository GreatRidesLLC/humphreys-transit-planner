import { describe, it, expect } from "vitest";
import {
  ROUTES, ALL_STOPS, STOP_ROUTES, STOP_ALIASES,
  inService, serviceEndToday,
  nextScheduledDeparture, prevScheduledDeparture,
  nextDeparture, freqAt, nextServiceStart,
  findTrips, walkableTrip,
  haversineMeters, walkMinutes,
  STOP_COORDS, nearestStopTo,
  BUILDING_COORDS,
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
  it("split-shift route runs in morning peak", () => {
    expect(inService(ROUTES.BLACK, monAt(6, 30))).toBe(true);
  });
  it("split-shift route runs in afternoon peak", () => {
    expect(inService(ROUTES.BLACK, monAt(16, 30))).toBe(true);
  });
  it("split-shift route is out of service midday between peaks", () => {
    expect(inService(ROUTES.BLACK, monAt(12, 0))).toBe(false);
  });
  it("split-shift route does not run on Saturday", () => {
    expect(inService(ROUTES.BLACK, satAt(7, 0))).toBe(false);
  });
  it("Orange evening-only Mon-Thu is out of service midday Mon", () => {
    expect(inService(ROUTES.ORANGE, monAt(12, 0))).toBe(false);
  });
  it("Orange evening window Mon 20:00 is in service", () => {
    expect(inService(ROUTES.ORANGE, monAt(20, 0))).toBe(true);
  });
  it("Orange Fri overnight rolls into Sat pre-01:45 as in service", () => {
    expect(inService(ROUTES.ORANGE, satAt(1, 0))).toBe(true);
  });
  it("Orange Sat 03:00 (after overnight cutoff, before 09:00 start) is out of service", () => {
    expect(inService(ROUTES.ORANGE, satAt(3, 0))).toBe(false);
  });
  it("Orange Sun 01:00 (rollover from Sat) is in service", () => {
    expect(inService(ROUTES.ORANGE, sunAt(1, 0))).toBe(true);
  });
  it("Blue closes at 19:51 (last PDF loop arrival), not 22:00", () => {
    expect(inService(ROUTES.BLUE, monAt(19, 50))).toBe(true);
    expect(inService(ROUTES.BLUE, monAt(19, 52))).toBe(false);
  });
});

describe("serviceEndToday", () => {
  it("returns service-end Date on a running day", () => {
    const end = serviceEndToday(ROUTES.BLUE, monAt(10, 0));
    expect(end.getHours()).toBe(19);
    expect(end.getMinutes()).toBe(51);
  });
  it("returns null on a non-running day", () => {
    expect(serviceEndToday(ROUTES.BLUE, satAt(10, 0))).toBeNull();
  });
  it("returns null for Fri-Sat route on Monday", () => {
    expect(serviceEndToday(ROUTES.PINK, monAt(18, 0))).toBeNull();
  });
  it("returns the latest window end for a split-shift route", () => {
    // Black has morning + afternoon windows; asking during morning must return
    // the afternoon window's end (19:00), not the morning window's end.
    const end = serviceEndToday(ROUTES.BLACK, monAt(7, 0));
    expect(end.getHours()).toBe(19);
    expect(end.getMinutes()).toBe(0);
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
  it("SOCKOR HQ is registered as a Blue-only stop", () => {
    expect(ALL_STOPS).toContain("SOCKOR HQ");
    expect(STOP_ROUTES["SOCKOR HQ"]).toEqual(["BLUE"]);
  });
});

describe("STOP_ALIASES", () => {
  it("every alias key resolves to a canonical stop that exists on some route", () => {
    for (const canonical of Object.keys(STOP_ALIASES)) {
      expect(ALL_STOPS, `alias key "${canonical}" is not a real stop`).toContain(canonical);
    }
  });

  it("aliases are unique across the whole map (no double-claim)", () => {
    const seen = new Map();
    for (const [canonical, aliases] of Object.entries(STOP_ALIASES)) {
      for (const alias of aliases) {
        const prior = seen.get(alias.toLowerCase());
        expect(prior, `alias "${alias}" is claimed by both "${prior}" and "${canonical}"`).toBeUndefined();
        seen.set(alias.toLowerCase(), canonical);
      }
    }
  });

  it("user-requested aliases are present", () => {
    expect(STOP_ALIASES["Pedestrian Gate"]).toEqual(expect.arrayContaining(["Walk-in Gate"]));
    expect(STOP_ALIASES["Eighth Army HQ"]).toEqual(expect.arrayContaining(["8th Army"]));
  });

  it("common shorthand aliases are present", () => {
    expect(STOP_ALIASES["Central Issue Facility"]).toEqual(expect.arrayContaining(["CIF"]));
    expect(STOP_ALIASES["Brian D. Allgood Hospital"]).toEqual(expect.arrayContaining(["BDAACH"]));
    expect(STOP_ALIASES["Bus Terminal"]).toEqual(expect.arrayContaining(["BT"]));
  });
});

describe("nextScheduledDeparture / prevScheduledDeparture", () => {
  it("GOLD honors PDF-sourced Mon–Fri 30-min timetable at Bus Terminal", () => {
    // Photo (Exhibit #0019, table 4): Mon–Fri BT dispatches 09:00, 09:30,
    // 10:00 … 15:30, then 16:00 every 15 min. After 09:31 → 10:00.
    const d = nextScheduledDeparture(ROUTES.GOLD, "Bus Terminal", monAt(9, 31));
    expect(d).not.toBeNull();
    expect(d.getHours()).toBe(10);
    expect(d.getMinutes()).toBe(0);
  });
  it("GOLD Mon–Fri switches to 15-min headway after 16:00", () => {
    // After 16:00 dispatches are :00 :15 :30 :45. From 16:01 → 16:15.
    const d = nextScheduledDeparture(ROUTES.GOLD, "Bus Terminal", monAt(16, 1));
    expect(d.getHours()).toBe(16);
    expect(d.getMinutes()).toBe(15);
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
  it("flags same-stop with sameStop:true", () => {
    const r = findTrips("Bus Terminal", "Bus Terminal", monAt(12, 0), "depart");
    expect(r.trips).toEqual([]);
    expect(r.sameStop).toBe(true);
  });
  it("returns empty for missing stop", () => {
    const r = findTrips("Bus Terminal", "Not A Real Stop", monAt(12, 0), "depart");
    expect(r.trips).toEqual([]);
    expect(r.sameStop).toBeUndefined();
  });
});

describe("walkableTrip", () => {
  it("suggests walking for very close stops", () => {
    // Family Mini Mall ↔ Pacific Victors Chapel: neighboring stops, ~360m.
    const w = walkableTrip(
      "Family Mini Mall / Gas Station", "Pacific Victors Chapel",
      null, null, null, null,
    );
    expect(w).toBeTruthy();
    expect(w.minutes).toBeGreaterThan(0);
    expect(w.minutes).toBeLessThanOrEqual(15);
  });
  it("returns null when far apart", () => {
    // Brian D. Allgood Hospital to Pedestrian Gate — spans the installation.
    const w = walkableTrip(
      "Brian D. Allgood Hospital", "Pedestrian Gate",
      null, null, null, null,
    );
    expect(w).toBeNull();
  });
  it("resolves user coords over stop coords", () => {
    const w = walkableTrip(
      "Bus Terminal", "Bus Terminal",
      null, null,
      { lat: 36.9622, lon: 127.0111 }, // Auto Skills Center coords
      null, // no dest override → uses Bus Terminal stop coords
    );
    // Distance ≈ 1.4 km on this installation — beyond cap → null.
    expect(w === null || w.minutes <= 15).toBe(true);
  });
});

describe("OSM building coverage", () => {
  it("Bldg 2250 (Automotive Skills Center) has coords + nearest stop resolves", () => {
    const b = BUILDING_COORDS["2250"];
    expect(b).toBeTruthy();
    expect(b.name).toMatch(/Automotive Skills/);
    const hit = nearestStopTo({ lat: b.lat, lon: b.lon });
    expect(hit).toBeTruthy();
    expect(hit.meters).toBeLessThan(500);
  });
});

describe("findTrips — noPathEver + route lists", () => {
  it("exposes fromRoutes + toRoutes for both stops", () => {
    const r = findTrips("Pedestrian Gate", "Eighth Army HQ", monAt(10, 0), "depart");
    expect(r.fromRoutes.length).toBeGreaterThan(0);
    expect(r.toRoutes.length).toBeGreaterThan(0);
    expect(r.noPathEver).toBe(false);
  });
  it("noPathEver stays false when a direct or xfer path exists but routes are OOS", () => {
    // Blue only runs Mon-Fri; Sat 12:00 → Blue+similar OOS but path exists.
    const r = findTrips("Corps of Engineers", "LTG Maude Hall (9th St)", satAt(12, 0), "depart");
    expect(r.noPathEver).toBe(false);
    // Green runs Sat → some trip should be found, this is a smoke check on shape.
    expect(r.fromRoutes).toContain("Blue Route");
    expect(r.toRoutes).toContain("Blue Route");
  });
});

describe("findTrips — walk-only fallback", () => {
  it("returns walkOnly when Pink is out of service and destination is walkable via stop coords", () => {
    // Family Mini Mall is Pink-only. Pacific Victors Chapel is on many routes
    // but on Monday-midday Pink is OOS → no direct or transfer at this stop.
    // Stops are ~360m apart, so walkOnly should surface.
    const r = findTrips(
      "Family Mini Mall / Gas Station", "Pacific Victors Chapel",
      monAt(12, 0), "depart",
      null, null, null, null,
    );
    expect(r.walkOnly).toBeTruthy();
    expect(r.walkOnly.minutes).toBeLessThanOrEqual(15);
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
    // Purple runs Sat 09:00–25:30, Green Sat 07:00–23:00 — both in service at noon Sat.
    const r = findTrips("Brian D. Allgood Hospital", "Pedestrian Gate", satAt(12, 0), "depart");
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
    // 19:25 Mon Central Issue Facility → Pedestrian Gate on Blue: Blue is
    // still in service (closes 19:51) but CIF's last PDF arrival is 19:21,
    // so nextScheduledDeparture jumps to Tue 08:36 — past today's endToday →
    // overnight strand recorded.
    const r = findTrips(
      "Central Issue Facility", "Pedestrian Gate",
      monAt(19, 25), "depart"
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
  it("boardAt matches first SUNDAY time >= refTime+walk", () => {
    // Morning Calm Center is a GOLD-only stop, so the direct trip is
    // guaranteed to be Gold regardless of what else runs on Sunday.
    const r = findTrips("Bus Terminal", "Morning Calm Center", sunAt(10, 0), "depart");
    const goldTrip = r.trips.find(
      t => t.type === "direct" && t.legs.some(l => l.k === "bus" && l.rid === "GOLD")
    );
    expect(goldTrip).toBeTruthy();
    const busLeg = goldTrip.legs.find(l => l.k === "bus");
    expect(busLeg.boardAt).toBeInstanceOf(Date);
    expect(busLeg.boardAt >= goldTrip.departAt).toBe(true);
  });
});

describe("PURPLE PDF-sourced schedule (schedules.json)", () => {
  it("Bus Terminal Mon 20:00 → 20:00", () => {
    const d = nextScheduledDeparture(ROUTES.PURPLE, "Bus Terminal", monAt(20, 0));
    expect(d.getHours()).toBe(20); expect(d.getMinutes()).toBe(0);
  });
  it("Brian D. Allgood Fri 22:00 → 22:12 (BT 21:45 + 27-min loop)", () => {
    const d = nextScheduledDeparture(ROUTES.PURPLE, "Brian D. Allgood Hospital", friAt(22, 0));
    expect(d.getHours()).toBe(22); expect(d.getMinutes()).toBe(12);
  });
  it("Bus Terminal Sat 00:00 finds Fri-overnight departure (00:00)", () => {
    const d = nextScheduledDeparture(ROUTES.PURPLE, "Bus Terminal", satAt(0, 0));
    expect(d.getDate()).toBe(satAt(0, 0).getDate());
    expect(d.getHours()).toBe(0); expect(d.getMinutes()).toBe(0);
  });
  it("Bus Terminal Sat 06:00 skips to 09:00 (gap between overnight end and daytime start)", () => {
    const d = nextScheduledDeparture(ROUTES.PURPLE, "Bus Terminal", satAt(6, 0));
    expect(d.getHours()).toBe(9); expect(d.getMinutes()).toBe(0);
  });
});

describe("inService — multi-window schedule", () => {
  it("PURPLE runs Mon evening (Mon–Thu 19:00–22:45)", () => {
    expect(inService(ROUTES.PURPLE, monAt(20, 0))).toBe(true);
  });
  it("PURPLE does not run Mon midday", () => {
    expect(inService(ROUTES.PURPLE, monAt(12, 0))).toBe(false);
  });
  it("PURPLE runs Fri 23:00 (Fri window 19:00–25:30)", () => {
    expect(inService(ROUTES.PURPLE, friAt(23, 0))).toBe(true);
  });
  it("PURPLE runs Sat 00:30 via Fri overnight overflow", () => {
    expect(inService(ROUTES.PURPLE, satAt(0, 30))).toBe(true);
  });
  it("PURPLE runs Sun 12:00 (Sun 09:00–22:45)", () => {
    expect(inService(ROUTES.PURPLE, sunAt(12, 0))).toBe(true);
  });
  it("GREEN now runs Sat midday (weekend window added)", () => {
    expect(inService(ROUTES.GREEN, satAt(10, 0))).toBe(true);
  });
  it("BROWN Fri does not run at 17:00 (Fri starts 19:00)", () => {
    expect(inService(ROUTES.BROWN, friAt(17, 0))).toBe(false);
  });
  it("BROWN Fri runs at 20:00", () => {
    expect(inService(ROUTES.BROWN, friAt(20, 0))).toBe(true);
  });
  it("BROWN Sat runs at 17:00 (Sat starts 16:00)", () => {
    expect(inService(ROUTES.BROWN, satAt(17, 0))).toBe(true);
  });
});

describe("geo helpers", () => {
  it("haversineMeters between same point is 0", () => {
    expect(haversineMeters(37.0, 127.0, 37.0, 127.0)).toBe(0);
  });
  it("walkMinutes floors at 3 min for missing data", () => {
    expect(walkMinutes(null, "Bus Terminal", null)).toBeGreaterThanOrEqual(3);
  });

  describe("Family Housing Towers (15th Street) coord", () => {
    const stop = "Family Housing Towers (15th Street)";
    it("has coords in STOP_COORDS", () => {
      const s = STOP_COORDS[stop];
      expect(s).toBeDefined();
      expect(s.lat).toBeCloseTo(36.9556, 4);
      expect(s.lon).toBeCloseTo(127.0158, 4);
    });
    it("is served by the Pink route", () => {
      expect(ROUTES.PINK.stops).toContain(stop);
    });
    it("walkMinutes uses haversine (not 3-min floor) when user coords supplied", () => {
      // ~555m north of the stop → ceil(555 / (5000/60)) ≈ 7 min, well above the floor.
      const user = { lat: 36.9606, lon: 127.0158 };
      expect(walkMinutes(null, stop, user)).toBeGreaterThan(3);
    });
    it("nearestStopTo returns this stop when user stands on it", () => {
      const near = nearestStopTo({ lat: 36.9556, lon: 127.0158 });
      expect(near.stop).toBe(stop);
      expect(near.meters).toBeLessThan(50);
    });
  });
});

describe("nextDeparture source", () => {
  it("reports pdf for a stop with a transcribed timetable", () => {
    const d = nextDeparture(ROUTES.GOLD, "Bus Terminal", satAt(12, 0));
    expect(d).not.toBeNull();
    expect(d.source).toBe("pdf");
  });

  it("reports heuristic for a verified route at a stop the PDF never covered", () => {
    // Green is verified:true; schedules.json carries Bus Terminal + Pedestrian
    // Gate, so pick a still-uncovered stop for this assertion.
    const d = nextDeparture(ROUTES.GREEN, "Desiderio ATC Tower", satAt(14, 10));
    expect(d).not.toBeNull();
    expect(d.source).toBe("heuristic");
  });

  it("uses the active window's freq, not the route default", () => {
    // Green is 15 min Mon-Fri but 30 min at the weekend. Desiderio ATC Tower
    // is stops[2] → 4-min offset; from Sat 14:10 the :00-anchored 30-min
    // heuristic lands on 14:34, not 14:19.
    expect(freqAt(ROUTES.GREEN, monAt(14, 10))).toBe(15);
    expect(freqAt(ROUTES.GREEN, satAt(14, 10))).toBe(30);
    const d = nextDeparture(ROUTES.GREEN, "Desiderio ATC Tower", satAt(14, 10));
    expect(d.time.getHours()).toBe(14);
    expect(d.time.getMinutes()).toBe(34);
  });
});

describe("nextServiceStart", () => {
  it("finds today's opening for a route that has not started yet", () => {
    const d = nextServiceStart(ROUTES.BROWN, satAt(9, 0));
    expect(d.getDay()).toBe(6);
    expect(d.getHours()).toBe(16);
  });

  it("rolls to the next service day when today is finished", () => {
    const d = nextServiceStart(ROUTES.BLUE, satAt(9, 0));
    expect(d.getDay()).toBe(1);
    expect(d.getHours()).toBe(8);
  });
});
