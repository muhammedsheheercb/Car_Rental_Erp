import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { build } from "esbuild";
import postgres from "postgres";

const directory = await mkdtemp(path.join(process.cwd(), ".maintenance-check-"));
const connection = postgres(process.env.DATABASE_URL, {
  prepare: false,
  max: 1,
  onnotice: () => {},
});
try {
  await connection.begin(async (sql) => {
    const tables = [
      "vehicles",
      "vehicle_brands",
      "vehicle_services",
      "vehicle_service_settings",
      "vehicle_odometer_history",
      "service_history",
      "service_expenses",
      "rentals",
      "customers",
      "users",
      "user_branches",
    ];
    for (const t of tables) {
      await sql.unsafe(
        `CREATE TEMPORARY TABLE ${t} (LIKE public.${t} INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES) ON COMMIT DROP`,
      );
    }
    const [shadow] =
      await sql`select to_regclass('vehicles')::oid=to_regclass('pg_temp.vehicles')::oid as valid`;
    assert.equal(shadow.valid, true);
    const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    await sql`insert into users(id,username,display_name,password_hash) values(${id(1)},'fixture','Fixture Staff','fixture-only-not-a-password')`;
    await sql`insert into vehicle_brands(id,name,normalized_name) values(${id(1)},'Fixture Brand','fixture brand')`;
    await sql`insert into vehicles(id,vehicle_number,brand_id,model_id,branch_id,year,cylinder_count,color,registration_number,fuel_type,capacity,gearbox,seat_count,engine_number,chassis_number,purchase_date,current_odometer_km,status) values(${id(1)},'V1',${id(1)},${id(1)},${id(1)},2026,4,'White','REG1','PETROL','1.6','AUTOMATIC',5,'E1','C1','2026-01-01',1000,'AVAILABLE')`;
    await sql`insert into vehicle_service_settings(vehicle_id,last_engine_service_km,last_gear_oil_change_km,engine_service_interval_km,gear_oil_interval_km) values(${id(1)},500,600,5000,10000)`;
    globalThis.maintenanceDb = {
      transaction: (callback) =>
        sql.savepoint(async (tx) =>
          callback(drizzle(Object.assign(tx, { options: connection.options }))),
        ),
    };
    const bundle = path.join(directory, "service.mjs");
    await build({
      stdin: {
        resolveDir: process.cwd(),
        loader: "ts",
        contents: "export {createService,changeService} from './features/maintenance/service';",
      },
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      outfile: bundle,
      alias: { "@": process.cwd() },
      plugins: [
        {
          name: "fixture-dependencies",
          setup(p) {
            p.onResolve({ filter: /^server-only$|\/db\/client$|\/lib\/auth$/ }, (a) => ({
              path: a.path,
              namespace: "fixture",
            }));
            p.onLoad({ filter: /.*/, namespace: "fixture" }, (a) => ({
              contents: a.path.endsWith("/db/client")
                ? "export const db=globalThis.maintenanceDb;"
                : a.path.endsWith("/lib/auth")
                  ? 'export const can=(a)=>a.role==="SUPER_ADMIN";'
                  : "",
              loader: "js",
            }));
          },
        },
      ],
    });
    const { createService, changeService } = await import(pathToFileURL(bundle).href);
    const actor = {
      id: id(1),
      role: "SUPER_ADMIN",
      displayName: "Fixture Staff",
      branchIds: [],
      permissions: new Set(),
    };
    const now = new Date();
    const oman = (d) => new Date(d.getTime() + 14400000).toISOString().slice(0, 16);
    const outAt = oman(new Date(now.getTime() - 3600000));
    const completedAt = oman(now);
    const input = {
      vehicleId: id(1),
      requestId: id(2),
      staffId: id(1),
      rentalId: "",
      serviceBy: "COMPANY",
      type: "ENGINE",
      status: "SCHEDULED",
      outAt,
      completedAt,
      kmReading: "1000",
      serviceOdometerKm: "1000",
      cost: "0",
      paymentMode: "CASH",
      dueDate: "",
      dueOdometerKm: "1500",
      remarks: "Scheduled fixture",
    };
    const record = await createService(input, actor);
    assert.equal(record.status, "SCHEDULED");
    await createService(input, actor);
    const [dedup] = await sql`select count(*)::integer as n from vehicle_services`;
    assert.equal(dedup.n, 1);
    const transition = {
      serviceId: record.id,
      status: "IN_PROGRESS",
      serviceOdometerKm: "1000",
      completedAt,
      cost: "0",
      paymentMode: "CASH",
      remarks: "Start fixture",
    };
    await changeService(transition, actor);
    await sql.unsafe(
      "create function pg_temp.fail_service_odometer() returns trigger language plpgsql as $$ begin raise exception 'fixture odometer failure'; end $$",
    );
    await sql.unsafe(
      "create trigger fixture_failure before update on vehicles for each row execute function pg_temp.fail_service_odometer()",
    );
    await assert.rejects(
      () =>
        changeService(
          {
            ...transition,
            status: "COMPLETED",
            serviceOdometerKm: "1200",
            cost: "10.005",
            paymentMode: "BANK_TRANSFER",
          },
          actor,
        ),
      (e) => e.cause?.message?.includes("fixture odometer failure") === true,
    );
    const [unchanged] = await sql`select last_engine_service_km from vehicle_service_settings`;
    assert.equal(unchanged.last_engine_service_km, 500);
    const [uncompleted] = await sql`select status from vehicle_services`;
    assert.equal(uncompleted.status, "IN_PROGRESS");
    const [noExpense] = await sql`select count(*)::integer as n from service_expenses`;
    assert.equal(noExpense.n, 0);
    await sql.unsafe("drop trigger fixture_failure on vehicles");
    await sql.unsafe("drop function pg_temp.fail_service_odometer()");
    await changeService(
      {
        ...transition,
        status: "COMPLETED",
        serviceOdometerKm: "1200",
        cost: "10.005",
        paymentMode: "BANK_TRANSFER",
      },
      actor,
    );
    const [settings] = await sql`select * from vehicle_service_settings`;
    assert.equal(settings.last_engine_service_km, 1200);
    assert.equal(settings.last_gear_oil_change_km, 600);
    const [vehicle] = await sql`select current_odometer_km,status from vehicles`;
    assert.equal(vehicle.current_odometer_km, 1200);
    assert.equal(vehicle.status, "AVAILABLE");
    const [expense] = await sql`select amount_baisa,payment_mode,paid_by from service_expenses`;
    assert.equal(Number(expense.amount_baisa), 10005);
    assert.equal(expense.payment_mode, "BANK_TRANSFER");
    assert.equal(expense.paid_by, "COMPANY");
    await assert.rejects(
      () => changeService({ ...transition, status: "COMPLETED" }, actor),
      /immutable/,
    );
    const [history] = await sql`select count(*)::integer as n from service_history`;
    assert.equal(history.n, 3);
    await sql`insert into rentals(id,agreement_number,customer_id,vehicle_id,branch_id,pickup_branch_id,return_branch_id,status,starts_at,expected_return_at,pickup_odometer_km,daily_rate_baisa,included_km,excess_km_charge_baisa,late_fee_baisa,created_by) values(${id(1)},'B001',${id(1)},${id(1)},${id(1)},${id(1)},${id(1)},'ACTIVE',${new Date(now.getTime() - 7200000).toISOString()},${new Date(now.getTime() + 86400000).toISOString()},1000,10000,200,100,2000,${id(1)})`;
    await assert.rejects(
      () =>
        createService(
          {
            ...input,
            requestId: id(3),
            status: "IN_PROGRESS",
            kmReading: "1200",
            serviceOdometerKm: "1200",
          },
          actor,
        ),
      /active rental/,
    );
    console.log(
      "PostgreSQL service integration passed: idempotent scheduling, in-progress state, rollback on odometer failure, separate expense transaction, exact payment amount, immutable completion, history and rented-vehicle blocking. No application records changed.",
    );
  });
} finally {
  await connection.end();
  delete globalThis.maintenanceDb;
  await rm(directory, { recursive: true, force: true });
}
