# iCal samples

Hand-written `.ics` calendars for testing a booking sync. They stand in for a
real Airbnb or VRBO export so you can control the dates, UIDs, and edge cases.

## Never put a real feed in this repo

Only synthetic samples belong here. A real export lists actual addresses
alongside the dates nobody will be home, and this repo is public and
permanent. Test against a real feed by pointing at the provider's URL,
never by copying it here.

## Using a sample

```
https://raw.githubusercontent.com/andonilc7/ical-samples/main/<file>.ics
```

Regenerate dates whenever they have drifted into the past:

```
node generate.mjs
```

That rewrites every generated file relative to today. `Arsenal_FC.ics` is
left alone: it is a real published feed kept verbatim so a parser can be
tested against something we did not author.

## Caching

GitHub serves these with `cache-control: max-age=300`, so an edit takes up
to five minutes to become visible.

Adding a query string does **not** help. GitHub's CDN strips the query from
its cache key, so `?v=2` still returns the cached copy. When you need a
change live immediately, either rename the file or swap `main` in the URL
for the commit SHA, which is immutable and therefore always current.

## The samples

| File | Purpose |
| --- | --- |
| `airbnb-1234-ocean-drive.ics` | Happy path: same-day turnover plus an owner block that must not become a cleaning job |
| `vrbo-1234-ocean-drive.ics` | Second feed for the same property. Shares one UID with the Airbnb file so multi-feed sync must produce one booking, not two |
| `airbnb-500-beach-road.ics` | Three bookings with gaps, a second property's happy path |
| `edge-cases-555-juniper-road.ics` | Stay already underway, one-night stay, two-week stay, far-future stay, and a `STATUS:CANCELLED` event the parser must drop |
| `empty.ics` | Valid but empty calendar. Point here after a populated feed to confirm vanished bookings get deleted |
| `uid-collision-500-beach-road.ics` | Reuses a UID that belongs to Ocean Drive. Only for testing whether booking identity is scoped per property |
| `Arsenal_FC.ics` | A real published football calendar, for testing a parser against a feed we didn't hand-write |

The generated files also fold long `DESCRIPTION` lines the way RFC 5545
requires, so the unfolding path in a parser gets exercised.
