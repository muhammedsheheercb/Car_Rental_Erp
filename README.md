# Car_Rental_Erp
Car Rental Billing PWA

## Local configuration

Copy `.env.example` to `.env`, set the Neon `DATABASE_URL`, and generate a unique
`SESSION_SECRET` of at least 32 characters. The application intentionally refuses to
start without these values; this prevents accidental use of an insecure session secret
or an unknown database. Run `npm run db:migrate`, then use `npm run db:seed-admin` once
after setting the initial administrator variables.
# Customer rental identity rule

A customer can be created with any combination of Civil ID, passport, and visa. Before a rental is confirmed, require a current driving licence, licence front/back images, customer signature, and at least one current identity document applicable to the customer. Booking/rental confirmation must call `assertCustomerCanBeBooked(customerId)` inside its transaction; it blocks active blacklist entries and returns the recorded reason.

## Booking settings

Booking pickup and return times use `Asia/Muscat` (UTC+04:00). Daily periods add
calendar days, weekly periods add seven days, and monthly periods add calendar
months, clamping to the last day when necessary. Rent is the selected period's
rate multiplied by duration. KM Maximum is the total booking allowance; additional
Free KM is added once, and Open KM disables excess kilometre charges.

Booking down payments cannot exceed rent plus the security deposit. A positive
payment creates a receipt and customer-ledger credit in the same transaction as
the reservation. The logged-in user is recorded by the server. Configured rent
can be overridden only by an admin with `rentals:override_price`, and overrides
are audited. Vehicle commitments are checked under a vehicle row lock; adjacent
reservations are permitted, overlaps are rejected, and active rentals block new
bookings until return. Fleet availability summaries exclude vehicles with pending
reservations or active rentals, while booking selection uses the requested period.

Apply migrations before running the new booking form. Run `npm test` for the
KM, return-time, payment-limit and booking-workflow tests.

## Operational vehicle views

The dashboard and rentals page link to Today Reserve, Today Arrival, On Rent,
Available Vehicles, and Late Car under `/en/operations/` (also `/ar/operations/`).
Today views cover the full Oman calendar day. Late status is calculated from the
expected-return timestamp and advances on screen without database writes.
Operational pages refresh their data every minute.

Fleet availability excludes pending reservations, active rentals, in-progress
service, scheduled service due by date or odometer, unreceived transfers, and
inactive vehicles. Future service appointments alone do not block availability
now. `scripts/availability-check.ts` verifies the SQL with temporary PostgreSQL
tables without changing application records.

## Late charges and agreement history

`features/rentals/late-charges.ts` is the authoritative financial late calculator.
Each 24-hour overdue cycle has a default 60-minute free grace period followed by
up to four chargeable hours, rounded up. Exceeding that window replaces that
cycle's hourly fees with one additional day's rent. A separate OMR 5 fine applies
for each completed 24-hour overdue day. Rates, grace, window and daily fine are
configured in the vehicle's Rental settings and snapshotted when booking. Daily
agreements use their contracted daily rate for additional days; weekly/monthly
agreements use the snapshotted vehicle daily rate. Estimates do not write charges;
returning the vehicle posts separate rental, late-fee, overdue-fine and excess-KM
components and matching ledger debits.

Open an agreement from Rentals or an operational vehicle card. Extensions require
`rentals:update` and `rentals:approve` for the agreement branch. Approval records
the previous/new deadline, period/duration, rent, user, time and remarks; all
covered periods use the new deadline. Extensions are checked against conflicting
vehicle reservations. Cancellation requires update permission, confirmation and
remarks. Normal users can cancel within 15 minutes of booking creation; an Admin
or Super Admin with approval permission can override the cutoff. Cancellation
records history and retains all financial entries; refunds/adjustments are
separate financial transactions.

Damage photos are append-only private R2 evidence. Record Before Rental evidence
while reserved and After Return evidence after return. Vehicle/customer associations
are derived from the agreement; photo views enforce the rental branch permissions.
Take Photo and Upload Photo accept JPEG, PNG and WebP up to 5 MB. Lifecycle and
financial rule tests are in `tests/late-charges.test.ts` and
`tests/rental-lifecycle.test.ts`.
