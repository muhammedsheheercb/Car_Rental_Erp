import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const roleName = pgEnum("role_name", ["SUPER_ADMIN", "ADMIN", "USER"]);
export const auditEvent = pgEnum("audit_event", [
  "LOGIN_SUCCESS",
  "LOGIN_FAILURE",
  "LOGOUT",
  "PASSWORD_CHANGED",
  "BRANCH_CREATED",
  "BRANCH_UPDATED",
  "BRANCH_DEACTIVATED",
  "BRANCH_DELETED",
  "USER_CREATED",
  "USER_UPDATED",
  "USER_DEACTIVATED",
  "ROLE_CHANGED",
  "PERMISSIONS_CHANGED",
  "BRAND_CREATED",
  "BRAND_UPDATED",
  "BRAND_DEACTIVATED",
  "VEHICLE_CREATED",
  "VEHICLE_UPDATED",
  "VEHICLE_DEACTIVATED",
  "PRICE_OVERRIDDEN",
  "ODOMETER_RECORDED",
]);
export const permissionModules = [
  "dashboard",
  "branches",
  "users",
  "fleet",
  "customers",
  "bookings",
  "rentals",
  "finance",
  "reports",
  "settings",
] as const;
export const permissionActions = [
  "create",
  "read",
  "update",
  "delete",
  "print",
  "export",
  "approve",
  "override_price",
] as const;

export const branches = pgTable(
  "branches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    location: text("location").notNull(),
    code: text("code").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex("branches_code_unique").on(table.code)],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    mustChangePassword: boolean("must_change_password").default(true).notNull(),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex("users_username_unique").on(table.username)],
);

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: roleName("name").notNull(),
    description: text("description").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("roles_name_unique").on(table.name)],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (table) => [primaryKey({ columns: [table.userId, table.roleId] })],
);

export const userBranches = pgTable(
  "user_branches",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (table) => [primaryKey({ columns: [table.userId, table.branchId] })],
);

export const userPermissions = pgTable(
  "user_permissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    module: text("module").notNull(),
    action: text("action").notNull(),
    granted: boolean("granted").default(true).notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("user_permission_unique").on(table.userId, table.module, table.action)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    index("sessions_user_index").on(table.userId),
  ],
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    username: text("username").notNull(),
    ipHash: text("ip_hash").notNull(),
    succeeded: boolean("succeeded").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("login_attempts_lookup_index").on(table.username, table.ipHash, table.createdAt),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    event: auditEvent("event").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    metadata: jsonb("metadata").notNull().default({}),
    ipHash: text("ip_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_logs_actor_index").on(table.actorId, table.createdAt),
    index("audit_logs_branch_index").on(table.branchId, table.createdAt),
  ],
);

export const fuelType = pgEnum("fuel_type", ["PETROL", "DIESEL", "HYBRID", "ELECTRIC"]);
export const gearboxType = pgEnum("gearbox_type", ["AUTOMATIC", "MANUAL"]);
export const vehicleStatus = pgEnum("vehicle_status", ["AVAILABLE", "INACTIVE"]);
export const pricingPeriod = pgEnum("pricing_period", ["DAILY", "WEEKLY", "MONTHLY"]);
export const customerDocumentType = pgEnum("customer_document_type", [
  "LICENCE_FRONT",
  "LICENCE_BACK",
  "SIGNATURE",
  "CIVIL_ID",
  "PASSPORT",
  "VISA",
]);

export const vehicleBrands = pgTable(
  "vehicle_brands",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex("vehicle_brands_normalized_name_unique").on(table.normalizedName)],
);

export const vehicleModels = pgTable(
  "vehicle_models",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => vehicleBrands.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("vehicle_models_brand_name_unique").on(table.brandId, table.normalizedName),
    index("vehicle_models_brand_index").on(table.brandId),
  ],
);

export const vehicles = pgTable(
  "vehicles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    vehicleNumber: text("vehicle_number").notNull(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => vehicleBrands.id, { onDelete: "restrict" }),
    modelId: uuid("model_id")
      .notNull()
      .references(() => vehicleModels.id, { onDelete: "restrict" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    year: integer("year").notNull(),
    cylinderCount: integer("cylinder_count").notNull(),
    color: text("color").notNull(),
    registrationNumber: text("registration_number").notNull(),
    fuelType: fuelType("fuel_type").notNull(),
    capacity: text("capacity").notNull(),
    gearbox: gearboxType("gearbox").notNull(),
    seatCount: integer("seat_count").notNull(),
    engineNumber: text("engine_number").notNull(),
    chassisNumber: text("chassis_number").notNull(),
    purchaseDate: date("purchase_date").notNull(),
    currentOdometerKm: integer("current_odometer_km").notNull(),
    status: vehicleStatus("status").default("AVAILABLE").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("vehicles_number_unique").on(table.vehicleNumber),
    uniqueIndex("vehicles_registration_unique").on(table.registrationNumber),
    uniqueIndex("vehicles_chassis_unique").on(table.chassisNumber),
    index("vehicles_branch_index").on(table.branchId),
  ],
);

export const vehicleInsurance = pgTable(
  "vehicle_insurance",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "restrict" }),
    company: text("company").notNull(),
    policyNumber: text("policy_number").notNull(),
    validUntil: date("valid_until").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("vehicle_insurance_vehicle_unique").on(table.vehicleId)],
);
export const vehicleServiceSettings = pgTable(
  "vehicle_service_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "restrict" }),
    lastEngineServiceKm: integer("last_engine_service_km").notNull(),
    lastGearOilChangeKm: integer("last_gear_oil_change_km").notNull(),
    engineServiceIntervalKm: integer("engine_service_interval_km").notNull(),
    gearOilIntervalKm: integer("gear_oil_interval_km").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("vehicle_service_settings_vehicle_unique").on(table.vehicleId)],
);
export const vehicleRegistrations = pgTable(
  "vehicle_registrations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "restrict" }),
    mulkiyaExpiryDate: date("mulkiya_expiry_date").notNull(),
    issuingDetail: text("issuing_detail"),
    ...timestamps,
  },
  (table) => [uniqueIndex("vehicle_registrations_vehicle_unique").on(table.vehicleId)],
);
export const vehiclePricing = pgTable(
  "vehicle_pricing",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "restrict" }),
    period: pricingPeriod("period").notNull(),
    listRentBaisa: numeric("list_rent_baisa", {
      precision: 15,
      scale: 0,
      mode: "number",
    }).notNull(),
    minimumRentBaisa: numeric("minimum_rent_baisa", {
      precision: 15,
      scale: 0,
      mode: "number",
    }).notNull(),
    includedKm: integer("included_km").notNull(),
    excessKmChargeBaisa: numeric("excess_km_charge_baisa", {
      precision: 15,
      scale: 0,
      mode: "number",
    }).notNull(),
    lateFeeBaisa: numeric("late_fee_baisa", { precision: 15, scale: 0, mode: "number" }).notNull(),
    lateGraceMinutes: integer("late_grace_minutes").default(60).notNull(),
    lateWindowHours: integer("late_window_hours").default(4).notNull(),
    overdueFineBaisa: numeric("overdue_fine_baisa", { precision: 15, scale: 0, mode: "number" })
      .default(5000)
      .notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("vehicle_pricing_vehicle_period_unique").on(table.vehicleId, table.period),
  ],
);
export const vehicleOdometerHistory = pgTable(
  "vehicle_odometer_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "restrict" }),
    odometerKm: integer("odometer_km").notNull(),
    recordedBy: uuid("recorded_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("vehicle_odometer_vehicle_index").on(table.vehicleId, table.createdAt)],
);

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    customerNumber: text("customer_number").notNull(),
    name: text("name").notNull(),
    mobile: text("mobile").notNull(),
    email: text("email"),
    address: text("address").notNull(),
    remarks: text("remarks"),
    civilIdNumber: text("civil_id_number"),
    civilIdExpiry: date("civil_id_expiry"),
    passportNumber: text("passport_number"),
    passportExpiry: date("passport_expiry"),
    visaNumber: text("visa_number"),
    visaExpiry: date("visa_expiry"),
    drivingLicenceNumber: text("driving_licence_number").notNull(),
    drivingLicenceExpiry: date("driving_licence_expiry").notNull(),
    sponsorDetails: text("sponsor_details"),
    isActive: boolean("is_active").default(true).notNull(),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("customers_number_unique").on(table.customerNumber),
    uniqueIndex("customers_mobile_unique").on(table.mobile),
    uniqueIndex("customers_driving_licence_unique").on(table.drivingLicenceNumber),
    uniqueIndex("customers_civil_id_unique").on(table.civilIdNumber),
    uniqueIndex("customers_passport_unique").on(table.passportNumber),
    index("customers_name_index").on(table.name),
  ],
);
export const customerDocuments = pgTable(
  "customer_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    type: customerDocumentType("type").notNull(),
    objectKey: text("object_key").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("customer_document_type_unique").on(table.customerId, table.type)],
);
export const customerBlacklist = pgTable(
  "customer_blacklist",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    description: text("description").notNull(),
    startsAt: date("starts_at"),
    endsAt: date("ends_at"),
    isActive: boolean("is_active").default(true).notNull(),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [index("customer_blacklist_customer_index").on(table.customerId, table.createdAt)],
);

// Financial values are integer baisa (1 OMR = 1,000 baisa). This keeps agreements,
// invoices and ledgers exact and makes the audit trail safe to aggregate.
export const rentalStatus = pgEnum("rental_status", [
  "RESERVED",
  "ACTIVE",
  "RETURNED",
  "CANCELLED",
]);
export const paymentMethod = pgEnum("payment_method", ["CASH", "CARD", "BANK_TRANSFER", "ONLINE"]);
export const paymentDirection = pgEnum("payment_direction", ["RECEIPT", "PAYBACK"]);
export const ledgerEntryType = pgEnum("ledger_entry_type", [
  "RENT_CHARGE",
  "DEPOSIT",
  "PAYMENT",
  "PAYBACK",
  "FINE",
  "LEGAL_FINE",
  "DAMAGE",
  "ADJUSTMENT",
]);
export const serviceStatus = pgEnum("service_status", [
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
]);

export const rentals = pgTable(
  "rentals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agreementNumber: text("agreement_number").notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "restrict" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    pickupBranchId: uuid("pickup_branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    returnBranchId: uuid("return_branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    status: rentalStatus("status").default("RESERVED").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    expectedReturnAt: timestamp("expected_return_at", { withTimezone: true }).notNull(),
    pricingPeriod: pricingPeriod("pricing_period").default("DAILY").notNull(),
    rentDuration: integer("rent_duration").default(1).notNull(),
    additionalDayRentBaisa: numeric("additional_day_rent_baisa", {
      precision: 15,
      scale: 0,
      mode: "number",
    })
      .default(0)
      .notNull(),
    cancellationWindowMinutes: integer("cancellation_window_minutes").default(15).notNull(),
    freeKm: integer("free_km").default(0).notNull(),
    openKm: boolean("open_km").default(false).notNull(),
    returnedBy: uuid("returned_by").references(() => users.id, { onDelete: "restrict" }),
    segmentStartedAt: timestamp("segment_started_at", { withTimezone: true }),
    actualReturnAt: timestamp("actual_return_at", { withTimezone: true }),
    pickupOdometerKm: integer("pickup_odometer_km"),
    returnOdometerKm: integer("return_odometer_km"),
    dailyRateBaisa: numeric("daily_rate_baisa", {
      precision: 15,
      scale: 0,
      mode: "number",
    }).notNull(),
    includedKm: integer("included_km").notNull(),
    excessKmChargeBaisa: numeric("excess_km_charge_baisa", {
      precision: 15,
      scale: 0,
      mode: "number",
    }).notNull(),
    lateFeeBaisa: numeric("late_fee_baisa", { precision: 15, scale: 0, mode: "number" }).notNull(),
    lateGraceMinutes: integer("late_grace_minutes").default(60).notNull(),
    lateWindowHours: integer("late_window_hours").default(4).notNull(),
    overdueFineBaisa: numeric("overdue_fine_baisa", { precision: 15, scale: 0, mode: "number" })
      .default(5000)
      .notNull(),
    depositBaisa: numeric("deposit_baisa", { precision: 15, scale: 0, mode: "number" })
      .default(0)
      .notNull(),
    subtotalBaisa: numeric("subtotal_baisa", { precision: 15, scale: 0, mode: "number" })
      .default(0)
      .notNull(),
    taxBaisa: numeric("tax_baisa", { precision: 15, scale: 0, mode: "number" })
      .default(0)
      .notNull(),
    totalBaisa: numeric("total_baisa", { precision: 15, scale: 0, mode: "number" })
      .default(0)
      .notNull(),
    notes: text("notes"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("rentals_agreement_number_unique").on(table.agreementNumber),
    index("rentals_vehicle_status_dates_index").on(table.vehicleId, table.status, table.startsAt),
    index("rentals_branch_status_index").on(table.branchId, table.status, table.startsAt),
    index("rentals_customer_index").on(table.customerId, table.createdAt),
  ],
);

export const rentalCharges = pgTable(
  "rental_charges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    rentalId: uuid("rental_id")
      .notNull()
      .references(() => rentals.id, { onDelete: "restrict" }),
    type: ledgerEntryType("type").notNull(),
    description: text("description").notNull(),
    component: text("component").default("RENTAL").notNull(),
    amountBaisa: numeric("amount_baisa", { precision: 15, scale: 0, mode: "number" }).notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("rental_charges_rental_index").on(table.rentalId, table.createdAt)],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    receiptNumber: text("receipt_number").notNull(),
    kind: text("kind")
      .$type<"ADVANCE" | "RECEIPT" | "PAYBACK" | "REVERSAL">()
      .default("RECEIPT")
      .notNull(),
    requestId: uuid("request_id").defaultRandom().notNull(),
    rentalId: uuid("rental_id").references(() => rentals.id, { onDelete: "restrict" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    direction: paymentDirection("direction").notNull(),
    method: paymentMethod("method").notNull(),
    amountBaisa: numeric("amount_baisa", { precision: 15, scale: 0, mode: "number" }).notNull(),
    reference: text("reference"),
    note: text("note"),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    recordedBy: uuid("recorded_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("payments_receipt_number_unique").on(table.receiptNumber),
    uniqueIndex("payments_request_unique").on(table.requestId),
    index("payments_customer_index").on(table.customerId, table.receivedAt),
    index("payments_rental_index").on(table.rentalId, table.receivedAt),
  ],
);

export const customerLedger = pgTable(
  "customer_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    rentalId: uuid("rental_id").references(() => rentals.id, { onDelete: "restrict" }),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "restrict" }),
    type: ledgerEntryType("type").notNull(),
    debitBaisa: numeric("debit_baisa", { precision: 15, scale: 0, mode: "number" })
      .default(0)
      .notNull(),
    creditBaisa: numeric("credit_baisa", { precision: 15, scale: 0, mode: "number" })
      .default(0)
      .notNull(),
    description: text("description").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("customer_ledger_customer_index").on(table.customerId, table.createdAt)],
);

export const vehicleTransfers = pgTable(
  "vehicle_transfers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "restrict" }),
    fromBranchId: uuid("from_branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    toBranchId: uuid("to_branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    transferredAt: timestamp("transferred_at", { withTimezone: true }).defaultNow().notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    notes: text("notes"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (table) => [index("vehicle_transfers_vehicle_index").on(table.vehicleId, table.transferredAt)],
);

export const vehicleServices = pgTable(
  "vehicle_services",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "restrict" }),
    status: serviceStatus("status").default("SCHEDULED").notNull(),
    requestId: uuid("request_id").defaultRandom().notNull().unique(),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "restrict" }),
    serviceBy: text("service_by").$type<"COMPANY" | "CUSTOMER">().default("COMPANY").notNull(),
    rentalId: uuid("rental_id").references(() => rentals.id, { onDelete: "restrict" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "restrict" }),
    staffId: uuid("staff_id").references(() => users.id, { onDelete: "restrict" }),
    outAt: timestamp("out_at", { withTimezone: true }),
    kmReading: integer("km_reading"),
    serviceOdometerKm: integer("service_odometer_km"),
    paymentMode: paymentMethod("payment_mode"),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().default({}).notNull(),
    type: text("type").notNull(),
    dueDate: date("due_date"),
    dueOdometerKm: integer("due_odometer_km"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    costBaisa: numeric("cost_baisa", { precision: 15, scale: 0, mode: "number" })
      .default(0)
      .notNull(),
    vendor: text("vendor"),
    note: text("note"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (table) => [index("vehicle_services_due_index").on(table.vehicleId, table.status, table.dueDate)],
);

export const rentalExtensions = pgTable(
  "rental_extensions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    rentalId: uuid("rental_id")
      .notNull()
      .references(() => rentals.id, { onDelete: "restrict" }),
    previousExpectedReturnAt: timestamp("previous_expected_return_at", {
      withTimezone: true,
    }).notNull(),
    newExpectedReturnAt: timestamp("new_expected_return_at", { withTimezone: true }).notNull(),
    duration: integer("duration").notNull(),
    period: pricingPeriod("period").notNull(),
    additionalRentBaisa: numeric("additional_rent_baisa", {
      precision: 15,
      scale: 0,
      mode: "number",
    }).notNull(),
    approvedBy: uuid("approved_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }).defaultNow().notNull(),
    remarks: text("remarks").notNull(),
  },
  (table) => [index("rental_extensions_rental_index").on(table.rentalId, table.approvedAt)],
);

export const rentalCancellations = pgTable(
  "rental_cancellations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    rentalId: uuid("rental_id")
      .notNull()
      .references(() => rentals.id, { onDelete: "restrict" }),
    previousStatus: rentalStatus("previous_status").notNull(),
    startingKm: integer("starting_km").notNull(),
    endingKm: integer("ending_km").notNull(),
    remarks: text("remarks").notNull(),
    overridden: boolean("overridden").default(false).notNull(),
    cancelledBy: uuid("cancelled_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("rental_cancellations_rental_unique").on(table.rentalId)],
);

export const vehicleDamageEvidence = pgTable(
  "vehicle_damage_evidence",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    rentalId: uuid("rental_id")
      .notNull()
      .references(() => rentals.id, { onDelete: "restrict" }),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "restrict" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    phase: text("phase").$type<"BEFORE_RENTAL" | "AFTER_RETURN">().notNull(),
    location: text("location").notNull(),
    description: text("description").notNull(),
    remarks: text("remarks"),
    objectKey: text("object_key").notNull(),
    contentType: text("content_type").notNull(),
    recordedBy: uuid("recorded_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("vehicle_damage_rental_phase_index").on(table.rentalId, table.phase)],
);

export const paymentCorrections = pgTable(
  "payment_corrections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    originalPaymentId: uuid("original_payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "restrict" }),
    reversalPaymentId: uuid("reversal_payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "restrict" }),
    replacementPaymentId: uuid("replacement_payment_id").references(() => payments.id, {
      onDelete: "restrict",
    }),
    reason: text("reason").notNull(),
    correctedBy: uuid("corrected_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    correctedAt: timestamp("corrected_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("payment_corrections_original_unique").on(table.originalPaymentId)],
);
export const refundApprovals = pgTable(
  "refund_approvals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requestId: uuid("request_id").notNull(),
    rentalId: uuid("rental_id")
      .notNull()
      .references(() => rentals.id, { onDelete: "restrict" }),
    amountBaisa: numeric("amount_baisa", { precision: 15, scale: 0, mode: "number" }).notNull(),
    balanceCreditBaisa: numeric("balance_credit_baisa", {
      precision: 15,
      scale: 0,
      mode: "number",
    }).notNull(),
    remarks: text("remarks").notNull(),
    approvedBy: uuid("approved_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("refund_approvals_request_unique").on(table.requestId),
    index("refund_approvals_rental_index").on(table.rentalId),
  ],
);
export const financeFines = pgTable(
  "finance_fines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requestId: uuid("request_id").notNull(),
    kind: text("kind").$type<"NORMAL" | "LEGAL">().notNull(),
    rentalId: uuid("rental_id")
      .notNull()
      .references(() => rentals.id, { onDelete: "restrict" }),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "restrict" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    dateFrom: timestamp("date_from", { withTimezone: true }).notNull(),
    dateTo: timestamp("date_to", { withTimezone: true }).notNull(),
    amountBaisa: numeric("amount_baisa", { precision: 15, scale: 0, mode: "number" }).notNull(),
    details: text("details").notNull(),
    remarks: text("remarks"),
    bookingSnapshot: jsonb("booking_snapshot")
      .$type<Record<string, string | number | null>>()
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("finance_fines_request_unique").on(table.requestId),
    index("finance_fines_vehicle_index").on(table.vehicleId, table.kind),
  ],
);
export const legalFineHistory = pgTable("legal_fine_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  fineId: uuid("fine_id")
    .notNull()
    .references(() => financeFines.id, { onDelete: "restrict" }),
  action: text("action").$type<"CREATED" | "EDITED" | "DELETED">().notNull(),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
  reason: text("reason").notNull(),
  actorId: uuid("actor_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// NUMERIC amounts are whole baisa, never binary floating point amounts.
const exactAmount = (name: string) => numeric(name, { precision: 15, scale: 0, mode: "number" });
export const rentalVehicleSwaps = pgTable(
  "rental_vehicle_swaps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requestId: uuid("request_id").notNull().unique(),
    rentalId: uuid("rental_id")
      .notNull()
      .references(() => rentals.id, { onDelete: "restrict" }),
    previousVehicleId: uuid("previous_vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "restrict" }),
    newVehicleId: uuid("new_vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "restrict" }),
    segmentStartedAt: timestamp("segment_started_at", { withTimezone: true }).notNull(),
    transferredAt: timestamp("transferred_at", { withTimezone: true }).notNull(),
    expectedReturnAt: timestamp("expected_return_at", { withTimezone: true }).notNull(),
    startingKm: integer("starting_km").notNull(),
    endingKm: integer("ending_km").notNull(),
    newStartingKm: integer("new_starting_km").notNull(),
    remainingMaximumKm: integer("remaining_maximum_km").notNull(),
    remainingFreeKm: integer("remaining_free_km").notNull(),
    chargesBaisa: exactAmount("charges_baisa").notNull(),
    balanceBaisa: exactAmount("balance_baisa").notNull(),
    receivedBaisa: exactAmount("received_baisa").notNull(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    remarks: text("remarks").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("rental_swaps_booking_index").on(t.rentalId, t.transferredAt)],
);
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    invoiceNumber: text("invoice_number").notNull().unique(),
    requestId: uuid("request_id").notNull().unique(),
    rentalId: uuid("rental_id")
      .notNull()
      .references(() => rentals.id, { onDelete: "restrict" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    status: text("status").$type<"DRAFT" | "FINALIZED" | "VOID">().default("DRAFT").notNull(),
    subtotalBaisa: exactAmount("subtotal_baisa").notNull(),
    washingBaisa: exactAmount("washing_baisa").notNull(),
    petrolBaisa: exactAmount("petrol_baisa").notNull(),
    discountBaisa: exactAmount("discount_baisa").notNull(),
    grandTotalBaisa: exactAmount("grand_total_baisa").notNull(),
    advanceBaisa: exactAmount("advance_baisa").notNull(),
    receivedBaisa: exactAmount("received_baisa").notNull(),
    balanceBaisa: exactAmount("balance_baisa").notNull(),
    adjustmentBaisa: exactAmount("adjustment_baisa").default(0).notNull(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    remarks: text("remarks"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => [index("invoices_booking_index").on(t.rentalId)],
);
export const invoiceHistory = pgTable("invoice_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
  reason: text("reason").notNull(),
  actorId: uuid("actor_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const serviceHistory = pgTable("service_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  serviceId: uuid("service_id")
    .notNull()
    .references(() => vehicleServices.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
  actorId: uuid("actor_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export const serviceExpenses = pgTable("service_expenses", {
  id: uuid("id").defaultRandom().primaryKey(),
  serviceId: uuid("service_id")
    .notNull()
    .unique()
    .references(() => vehicleServices.id, { onDelete: "restrict" }),
  amountBaisa: numeric("amount_baisa", { precision: 15, scale: 0, mode: "number" }).notNull(),
  paidBy: text("paid_by").$type<"COMPANY" | "CUSTOMER">().notNull(),
  paymentMode: paymentMethod("payment_mode").notNull(),
  recordedBy: uuid("recorded_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export const operationalSettings = pgTable("operational_settings", {
  key: text("key").primaryKey(),
  nearServiceKm: integer("near_service_km").notNull(),
  expirySoonDays: integer("expiry_soon_days").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "restrict" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export const userSignatures = pgTable(
  "user_signatures",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    objectKey: text("object_key").notNull().unique(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    isCurrent: boolean("is_current").default(true).notNull(),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("user_signatures_user_index").on(t.userId, t.createdAt)],
);
