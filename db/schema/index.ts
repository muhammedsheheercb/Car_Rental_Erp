import {
  boolean,
  date,
  index,
  integer,
  jsonb,
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
    listRentBaisa: integer("list_rent_baisa").notNull(),
    minimumRentBaisa: integer("minimum_rent_baisa").notNull(),
    includedKm: integer("included_km").notNull(),
    excessKmChargeBaisa: integer("excess_km_charge_baisa").notNull(),
    lateFeeBaisa: integer("late_fee_baisa").notNull(),
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
