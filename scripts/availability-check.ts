import assert from "node:assert/strict";
import { sql as querySql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import postgres from "postgres";
import { vehicles } from "../db/schema/index";
import { availableFleet } from "../features/rentals/availability";

const connection = postgres(process.env.DATABASE_URL ?? "", { max: 1, prepare: false });
try {
  await connection.begin(async (sql) => {
    // Temporary tables shadow the application's tables only on this connection.
    // No application records are read or changed; all fixtures disappear on commit.
    await sql`create temporary table vehicles (id uuid, is_active boolean, status text, current_odometer_km integer) on commit drop`;
    await sql`create temporary table rentals (vehicle_id uuid, status text) on commit drop`;
    await sql`create temporary table vehicle_services (vehicle_id uuid, status text, due_date date, due_odometer_km integer) on commit drop`;
    await sql`create temporary table vehicle_transfers (vehicle_id uuid, received_at timestamptz) on commit drop`;
    const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
    for (let value = 1; value <= 10; value++)
      await sql`insert into vehicles values (${id(value)}, ${value !== 7}, ${value === 8 ? "INACTIVE" : "AVAILABLE"}, 1000)`;
    await sql`insert into rentals values (${id(2)}, 'ACTIVE'), (${id(3)}, 'RESERVED'), (${id(1)}, 'CLOSED')`;
    await sql`insert into vehicle_services values
      (${id(4)}, 'IN_PROGRESS', null, null),
      (${id(5)}, 'SCHEDULED', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Muscat')::date, null),
      (${id(9)}, 'SCHEDULED', null, 900),
      (${id(10)}, 'SCHEDULED', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Muscat')::date + 1, 2000),
      (${id(1)}, 'COMPLETED', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Muscat')::date - 1, null)`;
    await sql`insert into vehicle_transfers values (${id(6)}, null), (${id(1)}, now())`;
    const query = new PgDialect().sqlToQuery(
      querySql`select ${vehicles.id} from ${vehicles} where ${availableFleet}`,
    );
    assert.equal(query.params.length, 0);
    const available = await sql.unsafe<{ id: string }[]>(query.sql);
    assert.deepEqual(available.map((row) => row.id).sort(), [id(1), id(10)].sort());
    console.log(
      "Availability SQL passed: active/reserved rentals, in-progress/due service, pending transfers and inactive statuses block availability; completed work and future service allow it.",
    );
  });
} finally {
  await connection.end();
}
