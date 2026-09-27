#!/usr/bin/env node

/**
 * Regenerates the .ics fixtures with dates relative to today.
 *
 * Fixed dates drift into the past and quietly stop producing upcoming
 * turnovers, which looks like a sync bug rather than stale test data. Run this
 * whenever the fixtures have aged out.
 *
 * Arsenal_FC.ics is deliberately not generated: it is a real published feed
 * kept verbatim so the parser is tested against something we didn't author.
 */

import { writeFileSync } from "node:fs";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const today = new Date();
today.setUTCHours(0, 0, 0, 0);

/** iCal all-day format, YYYYMMDD. */
function day(offset) {
  const date = new Date(today.getTime() + offset * MS_PER_DAY);
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function stamp() {
  return `${day(0)}T120000Z`;
}

/**
 * RFC 5545 line folding at 75 octets, continuations prefixed with a space.
 * Real provider feeds fold, so fixtures that don't would skip the unfolding
 * path entirely and hide a parser that can't handle it.
 */
function fold(line) {
  if (line.length <= 75) {
    return line;
  }

  const parts = [line.slice(0, 75)];
  let rest = line.slice(75);

  while (rest.length > 74) {
    parts.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }

  if (rest) {
    parts.push(` ${rest}`);
  }

  return parts.join("\n");
}

/**
 * DTEND is exclusive for all-day events, so it lands on the checkout date.
 * Two bookings share a date when one's end equals the other's start, which is
 * the same-day turnover a cleaner has to handle.
 */
function event({ uid, start, end, summary, description, status }) {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp()}`,
    `DTSTART;VALUE=DATE:${day(start)}`,
    `DTEND;VALUE=DATE:${day(end)}`,
    `SUMMARY:${summary}`,
  ];

  if (description) {
    lines.push(fold(`DESCRIPTION:${description}`));
  }

  if (status) {
    lines.push(`STATUS:${status}`);
  }

  lines.push("END:VEVENT");
  return lines.join("\n");
}

function calendar(name, events) {
  return [
    "BEGIN:VCALENDAR",
    "PRODID:-//ical-samples//EN",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${name}`,
    "",
    ...events,
    "",
    "END:VCALENDAR",
    "",
  ].join("\n");
}

// Airbnb's real export uses a bare "Reserved" summary and puts the reservation
// link in the description. Blocked dates come through as events too, with a
// "Not available" summary, so anything treating every VEVENT as a booking will
// invent cleaning jobs for nights with no guest.
function airbnbBooking(uid, start, end, code) {
  return event({
    uid: `${uid}@airbnb.com`,
    start,
    end,
    summary: "Reserved",
    description: `Reservation URL: https://www.airbnb.com/hosting/reservations/details/${code}\\nPhone Number (Last 4 Digits): 4417`,
  });
}

function airbnbBlock(uid, start, end) {
  return event({
    uid: `${uid}@airbnb.com`,
    start,
    end,
    summary: "Airbnb (Not available)",
  });
}

const SHARED_UID = "shared-booking-ocean-001";

const files = {
  // Happy path plus the two cases that matter most to a cleaning schedule: a
  // same-day turnover (first booking ends the day the second starts) and an
  // owner block that must not become a cleaning job.
  "airbnb-1234-ocean-drive.ics": calendar("1234 Ocean Drive", [
    airbnbBooking(SHARED_UID, 2, 5, "HMOCEAN001"),
    airbnbBooking("ocean-002", 5, 9, "HMOCEAN002"),
    airbnbBooking("ocean-003", 14, 17, "HMOCEAN003"),
    airbnbBlock("ocean-block-001", 20, 22),
  ]),

  // Second feed for the same property. It repeats SHARED_UID, so syncing both
  // feeds must produce one booking rather than two.
  "vrbo-1234-ocean-drive.ics": calendar("1234 Ocean Drive (VRBO)", [
    event({
      uid: `${SHARED_UID}@airbnb.com`,
      start: 2,
      end: 5,
      summary: "Reserved - Guest A",
      description: "Booked via VRBO",
    }),
    event({
      uid: "vrbo-ocean-101@vrbo.com",
      start: 11,
      end: 13,
      summary: "Reserved - Guest D",
      description: "Booked via VRBO",
    }),
  ]),

  "airbnb-500-beach-road.ics": calendar("500 Beach Rd", [
    airbnbBooking("beach-001", 1, 4, "HMBEACH001"),
    airbnbBooking("beach-002", 8, 12, "HMBEACH002"),
    airbnbBooking("beach-003", 21, 24, "HMBEACH003"),
  ]),

  // Boundary cases: a stay that is already underway, a single night, a long
  // stay, and one far enough out to catch any windowing assumptions.
  "edge-cases-555-juniper-road.ics": calendar("555 Juniper Road", [
    event({
      uid: "juniper-in-progress@ical-samples.test",
      start: -1,
      end: 1,
      summary: "Reserved - checkout tomorrow",
    }),
    event({
      uid: "juniper-one-night@ical-samples.test",
      start: 3,
      end: 4,
      summary: "Reserved - one night",
    }),
    event({
      uid: "juniper-long-stay@ical-samples.test",
      start: 6,
      end: 20,
      summary: "Reserved - fourteen nights",
    }),
    event({
      uid: "juniper-far-future@ical-samples.test",
      start: 300,
      end: 305,
      summary: "Reserved - next year",
    }),
    event({
      uid: "juniper-cancelled@ical-samples.test",
      start: 9,
      end: 11,
      summary: "Reserved - cancelled, should not appear",
      status: "CANCELLED",
    }),
  ]),

  // Point a property at this after syncing a populated feed to confirm that
  // bookings which vanish upstream are removed rather than left behind.
  "empty.ics": calendar("Empty Calendar", []),

  // Reuses a UID that belongs to 1234 Ocean Drive while describing a different
  // property. Only use this when deliberately testing whether booking
  // identity is scoped per property or assumed globally unique.
  "uid-collision-500-beach-road.ics": calendar("500 Beach Rd (UID collision)", [
    event({
      uid: `${SHARED_UID}@airbnb.com`,
      start: 2,
      end: 5,
      summary: "Reserved - collides with Ocean Drive",
    }),
  ]),
};

for (const [name, contents] of Object.entries(files)) {
  writeFileSync(new URL(name, import.meta.url), contents);
  console.log(`wrote ${name}`);
}

console.log(`\nDates generated relative to ${day(0)}.`);
