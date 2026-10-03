import { sql } from "drizzle-orm";
import { rentals, vehicleServices, vehicles, vehicleTransfers } from "@/db/schema";

/** Fleet summaries exclude vehicles committed to any pending reservation or active rental.
 * Booking availability instead checks the requested time interval under a vehicle-row lock.
 */
export const vehicleCommitment = sql<boolean>`exists (
  select 1 from ${rentals}
  where ${rentals.vehicleId} = ${vehicles.id}
  and ${rentals.status} in ('RESERVED', 'ACTIVE')
)`;
export const operationalBlocking = sql<boolean>`(exists (
  select 1 from ${vehicleServices} where ${vehicleServices.vehicleId} = ${vehicles.id}
  and (${vehicleServices.status} = 'IN_PROGRESS' or
    (${vehicleServices.status} = 'SCHEDULED' and (${vehicleServices.dueDate} <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Muscat')::date or ${vehicleServices.dueOdometerKm} <= ${vehicles.currentOdometerKm})))
) or exists (
  select 1 from ${vehicleTransfers} where ${vehicleTransfers.vehicleId} = ${vehicles.id}
  and ${vehicleTransfers.receivedAt} is null
))`;
export const availableFleet = sql<boolean>`(${vehicles.isActive} = true and ${vehicles.status} = 'AVAILABLE' and not ${vehicleCommitment} and not ${operationalBlocking})`;
export const vehicleCommitmentStatus = sql<string | null>`(
  select ${rentals.status} from ${rentals}
  where ${rentals.vehicleId} = ${vehicles.id} and ${rentals.status} in ('RESERVED', 'ACTIVE')
  order by case when ${rentals.status} = 'ACTIVE' then 0 else 1 end, ${rentals.startsAt}
  limit 1
)`;
