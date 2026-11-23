export type VehicleOperationalStatus =
  | "AVAILABLE"
  | "RESERVED"
  | "ON_RENT"
  | "SERVICE_OR_TRANSFER"
  | "INACTIVE";

type VehicleActionKey =
  | "booking"
  | "reserve"
  | "edit_booking"
  | "cancel_booking"
  | "pickup_dropoff"
  | "transfer_vehicle"
  | "scratch_mark"
  | "extend_contract"
  | "advance"
  | "invoice"
  | "fine"
  | "legal_fine"
  | "service"
  | "service_by_customer"
  | "retrieve_information";

export type VehicleActionPermissionFlags = {
  canCreateRental: boolean;
  canUpdateRental: boolean;
  canApproveRental: boolean;
  canReadFinance: boolean;
  canCreateFinance: boolean;
  canManageService: boolean;
};

type VehicleContextualAction = {
  key: VehicleActionKey;
  label: string;
  enabled: boolean;
  href?: string;
  reason?: string;
};

const ENABLED_BY_STATUS: Record<VehicleOperationalStatus, Set<VehicleActionKey>> = {
  AVAILABLE: new Set([
    "booking",
    "transfer_vehicle",
    "pickup_dropoff",
    "reserve",
    "fine",
    "legal_fine",
    "service",
    "retrieve_information",
  ]),
  RESERVED: new Set([
    "edit_booking",
    "cancel_booking",
    "transfer_vehicle",
    "pickup_dropoff",
    "reserve",
    "advance",
    "fine",
    "legal_fine",
    "invoice",
    "service",
    "retrieve_information",
  ]),
  ON_RENT: new Set([
    "scratch_mark",
    "edit_booking",
    "cancel_booking",
    "transfer_vehicle",
    "pickup_dropoff",
    "advance",
    "fine",
    "legal_fine",
    "extend_contract",
    "invoice",
    "service",
    "service_by_customer",
    "retrieve_information",
  ]),
  SERVICE_OR_TRANSFER: new Set(["fine", "legal_fine", "service", "retrieve_information"]),
  INACTIVE: new Set(["fine", "legal_fine", "retrieve_information"]),
};

const ACTION_DEFINITIONS: { key: VehicleActionKey; label: string }[] = [
  { key: "booking", label: "Booking" },
  { key: "reserve", label: "Reserve" },
  { key: "edit_booking", label: "Edit Booking" },
  { key: "cancel_booking", label: "Cancel Booking" },
  { key: "pickup_dropoff", label: "Pick-up and Drop-off" },
  { key: "transfer_vehicle", label: "Transfer Vehicle" },
  { key: "scratch_mark", label: "Scratch Mark" },
  { key: "extend_contract", label: "Extend Contract" },
  { key: "advance", label: "Advance" },
  { key: "invoice", label: "Invoice" },
  { key: "fine", label: "Fine" },
  { key: "legal_fine", label: "Legal Fine Entry" },
  { key: "service", label: "Service" },
  { key: "service_by_customer", label: "Service by Customer" },
  { key: "retrieve_information", label: "Retrieve Information" },
];

export function resolveVehicleOperationalStatus(input: {
  rentalStatus: string | null;
  status: string;
  isActive: boolean;
  operationallyBlocked: boolean;
}): VehicleOperationalStatus {
  if (input.rentalStatus === "ACTIVE") return "ON_RENT";
  if (input.rentalStatus === "RESERVED") return "RESERVED";
  if (input.status === "AVAILABLE" && input.isActive && !input.operationallyBlocked)
    return "AVAILABLE";
  if (input.operationallyBlocked) return "SERVICE_OR_TRANSFER";
  return "INACTIVE";
}

export function getVehicleContextualActions(input: {
  locale: string;
  vehicleId: string;
  registration: string;
  status: VehicleOperationalStatus;
  activeRentalId: string | null;
  activeAgreementNumber: string | null;
  permissions: VehicleActionPermissionFlags;
}): VehicleContextualAction[] {
  const { locale, vehicleId, registration, status, activeRentalId, activeAgreementNumber } = input;
  const p = input.permissions;
  const statusAllowed = ENABLED_BY_STATUS[status];
  const regQuery = encodeURIComponent(registration);
  const bookingQuery = encodeURIComponent(activeAgreementNumber ?? registration);

  const hrefFor = (key: VehicleActionKey): string | undefined => {
    switch (key) {
      case "booking":
        return `/${locale}/rentals?vehicleId=${vehicleId}&mode=booking`;
      case "reserve":
        return `/${locale}/rentals?vehicleId=${vehicleId}&mode=reserve`;
      case "edit_booking":
        return activeRentalId ? `/${locale}/rentals/${activeRentalId}` : undefined;
      case "cancel_booking":
        return activeRentalId ? `/${locale}/rentals/${activeRentalId}#cancel` : undefined;
      case "pickup_dropoff":
        return activeRentalId
          ? `/${locale}/rentals/${activeRentalId}`
          : `/${locale}/rentals?vehicleId=${vehicleId}`;
      case "transfer_vehicle":
        return activeRentalId && status === "ON_RENT"
          ? `/${locale}/transfers?booking=${activeRentalId}`
          : `/${locale}/transfers?q=${regQuery}`;
      case "scratch_mark":
        return activeRentalId ? `/${locale}/rentals/${activeRentalId}#damage` : undefined;
      case "extend_contract":
        return activeRentalId ? `/${locale}/rentals/${activeRentalId}#extend` : undefined;
      case "advance":
        return `/${locale}/finance/advance?q=${bookingQuery}`;
      case "invoice":
        return activeRentalId
          ? `/${locale}/invoices?booking=${activeRentalId}`
          : `/${locale}/invoices?q=${regQuery}`;
      case "fine":
        return `/${locale}/finance/fine?q=${regQuery}`;
      case "legal_fine":
        return `/${locale}/finance/legal-fine?q=${regQuery}`;
      case "service":
        return `/${locale}/service?q=${regQuery}`;
      case "service_by_customer":
        return `/${locale}/service?q=${regQuery}&serviceBy=CUSTOMER`;
      case "retrieve_information":
        return undefined;
    }
  };

  const hasPermission = (key: VehicleActionKey): boolean => {
    switch (key) {
      case "booking":
      case "reserve":
        return p.canCreateRental;
      case "edit_booking":
      case "cancel_booking":
      case "pickup_dropoff":
      case "transfer_vehicle":
      case "scratch_mark":
        return p.canUpdateRental || (status === "AVAILABLE" && p.canCreateRental);
      case "extend_contract":
        return p.canUpdateRental && p.canApproveRental;
      case "advance":
      case "fine":
      case "legal_fine":
        return p.canCreateFinance || p.canReadFinance;
      case "invoice":
        return p.canReadFinance;
      case "service":
      case "service_by_customer":
        return p.canManageService;
      case "retrieve_information":
        return true;
    }
  };

  const requiresRental = (key: VehicleActionKey) =>
    ["edit_booking", "cancel_booking", "scratch_mark", "extend_contract"].includes(key);

  return ACTION_DEFINITIONS.map(({ key, label }) => {
    if (!statusAllowed.has(key)) {
      return {
        key,
        label,
        enabled: false,
        reason: `Not available while vehicle status is ${status.replaceAll("_", " ")}`,
      };
    }
    if (requiresRental(key) && !activeRentalId) {
      return {
        key,
        label,
        enabled: false,
        reason: "Requires an active or reserved booking",
      };
    }
    if (!hasPermission(key)) {
      return {
        key,
        label,
        enabled: false,
        reason: "Not permitted for your account",
      };
    }
    return {
      key,
      label,
      enabled: true,
      href: hrefFor(key),
    };
  });
}
