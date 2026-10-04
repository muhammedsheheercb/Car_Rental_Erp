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

## Finance modules

Finance navigation opens Advance, Payback, Receipts, Fine and Legal Fine. Access
uses branch-scoped `finance:read/create/update/delete/approve` permissions.
Payments and matching ledger entries are posted in one transaction with a locked
agreement and a unique submission ID. Invoice balances include advances,
receipts, fines, refund adjustments and paybacks.

Refund approval records an additional entitlement and any required ledger credit;
payback payments retain history and cannot exceed either the remaining approved
entitlement or available customer credit. Receipt corrections post a reversal
and optional replacement; a zero replacement amount voids the receipt. Receipts
with approved refunds require accountant review before correction.

Normal fines use the selected vehicle's booking history and post a charge and
ledger debit. Legal fines snapshot booking/customer details, show the selected
vehicle's previous legal fines, and never post rental charges. Legal fine edits
and soft deletion retain before/after history and require a reason. List filters
and financial dates use Oman time. Record views support browser printing.

## Customer vehicle transfer and invoices

`/en/transfers` searches active bookings and selects replacement vehicles. This
customer swap is separate from branch-to-branch fleet transfers. Rental update
permissions apply to the booking and replacement branches. Vehicle rows lock in
UUID order before the rental row; the transaction posts charges/payment, records
both odometers and immutable history, releases the old vehicle, and occupies the
replacement together. Reservations, service and pending fleet transfers block
replacement selection. Concurrent stale requests cannot release the wrong car.
The original rent, booking number, business branch and return deadline are
preserved. Consumed KM is deducted from standard allowance first, then free KM;
only unused allowances carry forward. Fine attribution follows vehicle segments.

`/en/invoices` supports booking search, status and Oman date filters, pagination,
draft editing, immutable finalized views, printing and audited void/reversal.
Opening Invoice from an agreement preselects its booking. Active agreements can
have drafts; return/cancellation is required before finalization so ending KM and
late charges are settled. Finalization requires `finance:approve`, and deletion
uses void records (finalized voids also require approval). Washing/petrol charges
and discount post as explicit ledger entries; existing transfer balances are
already in that ledger and are never charged twice. Advances/receipts and paybacks
are accounted for, corrected receipts are excluded, and received amounts cannot
exceed both the invoice and ledger outstanding amount. Security deposits appear
separately, are included in collection, and remain held pending approved refund.
All money columns now use PostgreSQL `NUMERIC(15,0)` in whole baisa, with exact
integer/BigInt calculations; OMR text accepts at most three decimal places.

Tests: `tests/transfers-invoices.test.ts`,
`tests/transfer-invoice-service.test.ts`; browser fixtures:
`node scripts/transfer-invoice-controls-check.mjs`. With the application running
on port 3001, `node --env-file=.env scripts/transfer-invoice-browser-check.mjs`
checks live pages and the schema. `node --env-file=.env
scripts/transfer-invoice-db-check.mjs` runs real transaction/rollback checks using
session-local temporary table copies; it never changes application records.

## A4 documents, service, expiry and user signatures

Agreement, Invoice and Legal Fine views link to dedicated A4 previews under
`/en/documents/{agreement|invoice|legal-fine|receipt}/{id}`. Document access requires
both read and print permission for the record branch. The shared layout uses
real agreement/customer/vehicle and financial data, preserves colors, excludes
application navigation/controls, and has two signature positions before return
(Customer and Authorized Staff), or three after return (adding Return Received
By). Returns now retain the actual receiving staff ID. Authorized Staff uses the
printing user's signature, with a fallback to the document creator's configured
signature; each image is labelled with its actual owner's name. The common
`components/print-document.tsx` template can be adapted to a supplied reference
image. Long records paginate on A4 with aligned tables and unbroken signature
blocks; browser printing waits for signature images/fonts to load.

Service is available under `/en/service` using branch-scoped fleet permissions.
Company services can be scheduled, started, completed or cancelled. Starting
company work checks active rentals/reservations and other work in progress.
Completed records are immutable. Completion updates the odometer and the relevant
engine/gear-oil service marker, appends history and an exact baisa expense/payment
record in the same transaction. Service By Customer requires a matching occupied
booking and records the customer-paid expense separately from rental invoices.
Customer associations are derived server-side. Expenses are recorded only at
completion; cancellation preserves history. Return/cancellation KM cannot be
below the latest recorded service/vehicle reading.

Near To Service (`/en/near-to-service`) uses last service KM plus interval minus
current KM and includes engine and gear-oil work. Expiry (`/en/expiry`) includes
Mulkiya and Insurance, classifies Expired / Expiring Soon / Valid, and uses Oman
calendar dates; expiry remains valid through the stated date. Settings stores
shared thresholds (defaults: 1,000 KM and 30 days). Administrator settings update
permission is required to change these thresholds; dashboard expiry alerts use
the same setting.

Settings also provides User Signature selection, Take Photo, Upload Signature
and preview/save. PNG/JPEG/WebP images up to 5 MB are validated and stored in
private R2. Updating a signature retains earlier versions and the uploading user.
Normal users with settings update permission manage their own signature;
administrators additionally need user update permission and branch access to
manage other users. Private preview routes require authentication and authorized
ownership, set no-store/nosniff/security headers, and never expose public storage
URLs. Authorized document pages embed only the signatures needed for their
permitted document.

Verification scripts: `scripts/maintenance-controls-check.mjs` tests forms and
exports before/after A4 fixture PDFs in `/tmp`; `scripts/maintenance-browser-check.mjs`
checks live pages on port 3001 using a temporary admin session;
`scripts/maintenance-db-check.mjs` tests actual service transactions/rollback in
transaction-local temporary tables. `scripts/signature-storage-check.mjs` writes,
reads and deletes a temporary private R2 test object and verifies denial of
unsigned S3 access without altering any configured user signature.
