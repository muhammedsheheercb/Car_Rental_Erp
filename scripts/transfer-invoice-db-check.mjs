import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { build } from "esbuild";
import postgres from "postgres";

const directory = await mkdtemp(path.join(process.cwd(), ".finance-check-"));
const connection = postgres(process.env.DATABASE_URL, {
  prepare: false,
  max: 1,
  onnotice: () => {},
});
try {
  await connection.begin(async (sql) => {
    // Session-local copies shadow application tables. LIKE does not copy foreign keys;
    // fixtures never touch application data and disappear when this connection closes.
    const tables = [
      "vehicles",
      "rentals",
      "customers",
      "rental_charges",
      "customer_ledger",
      "payments",
      "payment_corrections",
      "refund_approvals",
      "rental_vehicle_swaps",
      "vehicle_odometer_history",
      "invoices",
      "invoice_history",
      "vehicle_services",
      "vehicle_transfers",
    ];
    for (const table of tables) {
      await sql.unsafe(`DROP TABLE IF EXISTS pg_temp.${table}`);
      await sql.unsafe(
        `CREATE TEMPORARY TABLE ${table} (LIKE public.${table} INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES) ON COMMIT DROP`,
      );
    }
    const [shadow] =
      await sql`select to_regclass('vehicles')::oid = to_regclass('pg_temp.vehicles')::oid as valid`;
    assert.equal(shadow.valid, true, "Temporary tables must shadow application tables");
    const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const actor = {
      id: id(1),
      role: "SUPER_ADMIN",
      displayName: "Fixture",
      branchIds: [],
      permissions: new Set(),
    };
    for (const [n, status, odo] of [
      [1, "INACTIVE", 1000],
      [2, "AVAILABLE", 3000],
    ])
      await sql`insert into vehicles(id,vehicle_number,brand_id,model_id,branch_id,year,cylinder_count,color,registration_number,fuel_type,capacity,gearbox,seat_count,engine_number,chassis_number,purchase_date,current_odometer_km,status) values(${id(n)},${`V${n}`},${id(1)},${id(1)},${id(1)},2026,4,'White',${`REG${n}`},'PETROL','1.6','AUTOMATIC',5,${`E${n}`},${`C${n}`},'2026-01-01',${odo},${status})`;
    await sql`insert into customers(id,customer_number,name,mobile,address,driving_licence_number,driving_licence_expiry) values(${id(1)},'C001','Fixture Customer','99999999','Muscat','DL001','2099-01-01')`;
    const now = new Date();
    const start = new Date(now.getTime() - 7200000);
    const expected = new Date(now.getTime() + 172800000);
    const transferAt = new Date(now.getTime() - 3600000);
    const oman = (date) => new Date(date.getTime() + 14400000).toISOString().slice(0, 16);
    await sql`insert into rentals(id,agreement_number,customer_id,vehicle_id,branch_id,pickup_branch_id,return_branch_id,status,starts_at,expected_return_at,pickup_odometer_km,daily_rate_baisa,included_km,free_km,excess_km_charge_baisa,late_fee_baisa,subtotal_baisa,total_baisa,created_by) values(${id(1)},'B001',${id(1)},${id(1)},${id(1)},${id(1)},${id(1)},'ACTIVE',${start},${expected},1000,10000,200,50,100,2000,10000,10000,${id(1)})`;
    await sql`insert into customer_ledger(customer_id,rental_id,type,debit_baisa,credit_baisa,description) values(${id(1)},${id(1)},'RENT_CHARGE',10000,0,'Initial rent'),(${id(1)},${id(1)},'PAYMENT',0,5000,'Advance')`;
    await sql`insert into payments(receipt_number,rental_id,customer_id,branch_id,direction,kind,method,amount_baisa,recorded_by) values('RCT001',${id(1)},${id(1)},${id(1)},'RECEIPT','ADVANCE','CASH',5000,${id(1)})`;
    globalThis.fixtureDb = {
      transaction: (callback) =>
        sql.savepoint(async (savepoint) =>
          callback(drizzle(Object.assign(savepoint, { options: connection.options }))),
        ),
    };
    const bundle = path.join(directory, "service.mjs");
    await build({
      stdin: {
        resolveDir: process.cwd(),
        contents:
          "export {swapVehicle} from './features/transfers/service';export {saveInvoice,voidInvoice} from './features/invoices/service';export {returnContract} from './features/rentals/lifecycle';",
        loader: "ts",
      },
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      outfile: bundle,
      alias: { "@": process.cwd() },
      plugins: [
        {
          name: "test-dependencies",
          setup(plugin) {
            plugin.onResolve(
              { filter: /^server-only$|\/db\/client$|\/lib\/auth$|\/lib\/r2$/ },
              (args) => ({ path: args.path, namespace: "fixture" }),
            );
            plugin.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
              contents: args.path.endsWith("/db/client")
                ? "export const db=globalThis.fixtureDb;"
                : args.path.endsWith("/lib/auth")
                  ? 'export const can=(actor,module,action,branch)=>actor.role==="SUPER_ADMIN" || (actor.branchIds.includes(branch)&&actor.permissions.has(module+":"+action));'
                  : args.path.endsWith("/lib/r2")
                    ? 'export async function putPrivateCustomerDocument(){throw new Error("Photos are outside this fixture");}'
                    : "",
              loader: "js",
            }));
          },
        },
      ],
    });
    const { swapVehicle, saveInvoice, voidInvoice, returnContract } = await import(
      pathToFileURL(bundle).href
    );
    const swap = {
      rentalId: id(1),
      newVehicleId: id(2),
      requestId: id(3),
      transferredAt: oman(transferAt),
      endingKm: "1100",
      newStartingKm: "3000",
      damage: "0",
      washing: "1",
      petrol: "0",
      received: "2",
      method: "CASH",
      remarks: "Fixture swap",
    };
    await sql.unsafe(
      `create or replace function pg_temp.reject_replacement() returns trigger language plpgsql as $$ begin if new.id = '${id(2)}' then raise exception 'fixture failure'; end if; return new; end $$`,
    );
    await sql.unsafe(
      "create trigger fixture_failure before update on vehicles for each row execute function pg_temp.reject_replacement()",
    );
    await assert.rejects(
      () => swapVehicle(swap, actor),
      (error) => error.cause?.message?.includes("fixture failure") === true,
    );
    const [unchanged] = await sql`select vehicle_id,total_baisa from rentals where id=${id(1)}`;
    assert.equal(unchanged.vehicle_id, id(1));
    assert.equal(Number(unchanged.total_baisa), 10000);
    const [historyCount] = await sql`select count(*)::integer as n from rental_vehicle_swaps`;
    assert.equal(historyCount.n, 0);
    const [paymentCount] = await sql`select count(*)::integer as n from payments`;
    assert.equal(paymentCount.n, 1);
    const originalStates = await sql`select id,status from vehicles order by id`;
    assert.deepEqual(
      originalStates.map((v) => v.status),
      ["INACTIVE", "AVAILABLE"],
    );
    await sql.unsafe("drop trigger fixture_failure on vehicles");
    await swapVehicle(swap, actor);
    await swapVehicle(swap, actor);
    const [after] = await sql`select * from rentals where id=${id(1)}`;
    assert.equal(after.vehicle_id, id(2));
    assert.equal(Number(after.total_baisa), 11000);
    assert.equal(after.included_km, 100);
    assert.equal(after.free_km, 50);
    assert.equal(new Date(after.expected_return_at).getTime(), expected.getTime());
    const states = await sql`select id,status from vehicles order by id`;
    assert.deepEqual(
      states.map((v) => v.status),
      ["AVAILABLE", "INACTIVE"],
    );
    await returnContract(
      { rentalId: id(1), returnedAt: oman(new Date()), endingKm: "3150" },
      actor,
    );
    const invoiceInput = {
      rentalId: id(1),
      requestId: id(4),
      washing: "0",
      petrol: "0",
      discount: "1",
      received: "3",
      method: "CASH",
      status: "FINALIZED",
      remarks: "Fixture invoice",
    };
    const invoice = await saveInvoice(invoiceInput, actor);
    assert.equal(invoice.grandTotalBaisa, 10000);
    assert.equal(invoice.balanceBaisa, 0);
    await saveInvoice(invoiceInput, actor);
    const [balanced] =
      await sql`select sum(debit_baisa-credit_baisa)::numeric as balance from customer_ledger where rental_id=${id(1)}`;
    assert.equal(Number(balanced.balance), 0);
    await voidInvoice({ invoiceId: invoice.id, reason: "Fixture correction" }, actor);
    const [voided] = await sql`select status from invoices where id=${invoice.id}`;
    assert.equal(voided.status, "VOID");
    const [balance] =
      await sql`select sum(debit_baisa-credit_baisa)::numeric as balance from customer_ledger where rental_id=${id(1)}`;
    assert.equal(Number(balance.balance), 1000);
    const [receiptCount] = await sql`select count(*)::integer as n from payments`;
    assert.equal(receiptCount.n, 3);
    await sql.unsafe("drop function pg_temp.reject_replacement()");
    console.log(
      "PostgreSQL temporary-table integration passed: transfer rollback after vehicle failure, atomic swap, retry idempotency, carried KM, return, exact invoice collection and audited reversal. No application records changed.",
    );
  });
} finally {
  await connection.end();
  delete globalThis.fixtureDb;
  await rm(directory, { recursive: true, force: true });
}
