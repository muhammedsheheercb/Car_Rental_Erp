import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "@/app/api/user-signatures/[id]/route";
import { userSignatures } from "@/db/schema";
import {
  canManageOtherSignatures,
  documentSignature,
  saveSignature,
} from "@/features/signatures/service";
import type { Identity } from "@/lib/auth";

const fixture = vi.hoisted(() => ({
  reads: [] as unknown[][],
  writes: [] as { table: unknown; value: Record<string, unknown> }[],
  identity: null as Identity | null,
  upload: vi.fn(),
  get: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({
  getIdentity: async () => fixture.identity,
  can: (a: Identity, m: string, p: string) =>
    a.role === "SUPER_ADMIN" || a.permissions.has(`${m}:${p}`),
}));
vi.mock("@/lib/r2", () => ({
  putPrivateCustomerDocument: fixture.upload,
  getPrivateCustomerDocument: fixture.get,
}));
vi.mock("@/db/client", () => {
  const select = () => {
    const rows = fixture.reads.shift() ?? [];
    const q = {
      from: () => q,
      where: () => q,
      for: () => Promise.resolve(rows),
      // biome-ignore lint/suspicious/noThenProperty: awaitable Drizzle fixture.
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve),
    };
    return q;
  };
  return {
    db: {
      select,
      transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          select,
          update: (table: unknown) => ({
            set: (value: Record<string, unknown>) => ({
              where: async () => {
                fixture.writes.push({ table, value });
              },
            }),
          }),
          insert: (table: unknown) => ({
            values: (value: Record<string, unknown>) => {
              fixture.writes.push({ table, value });
              return { returning: async () => [{ ...value, id: "signature" }] };
            },
          }),
        }),
    },
  };
});
const id = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const actor = {
  id,
  role: "USER",
  displayName: "Staff",
  branchIds: [id],
  permissions: new Set(["settings:read", "settings:update"]),
} as unknown as Identity;
const photo = () =>
  new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])], "signature.png", {
    type: "image/png",
  });
beforeEach(() => {
  fixture.reads = [];
  fixture.writes = [];
  fixture.identity = actor;
  fixture.upload.mockReset();
  fixture.get.mockReset();
});
it("stores the correct user's private signature and retains earlier versions", async () => {
  fixture.reads = [[{ id }]];
  await saveSignature({ userId: id }, photo(), actor);
  expect(fixture.upload).toHaveBeenCalledOnce();
  expect(fixture.upload.mock.calls[0][0]).toMatch(/^user-signatures\//);
  expect(fixture.writes[0]).toEqual({ table: userSignatures, value: { isCurrent: false } });
  expect(fixture.writes[1].value).toMatchObject({
    userId: id,
    uploadedBy: id,
    contentType: "image/png",
  });
});
it("does not allow normal users to replace another user's signature", async () => {
  await expect(saveSignature({ userId: other }, photo(), actor)).rejects.toThrow("access denied");
  expect(fixture.upload).not.toHaveBeenCalled();
});
it("requires settings update permission", async () => {
  await expect(
    saveSignature({ userId: id }, photo(), { ...actor, permissions: new Set(["settings:read"]) }),
  ).rejects.toThrow("access denied");
});
it("limits administrator signature management to visible branch users", async () => {
  fixture.reads = [];
  await expect(
    saveSignature({ userId: other }, photo(), {
      ...actor,
      role: "ADMIN",
      permissions: new Set(["settings:update", "users:update"]),
    }),
  ).rejects.toThrow("access denied");
});
it("requires admin role and user update permission for other signatures", () => {
  expect(canManageOtherSignatures(actor)).toBe(false);
  expect(canManageOtherSignatures({ ...actor, role: "ADMIN" })).toBe(false);
  expect(
    canManageOtherSignatures({
      ...actor,
      role: "ADMIN",
      permissions: new Set(["settings:update", "users:update"]),
    }),
  ).toBe(true);
});
it("rejects SVG and forged image MIME", async () => {
  await expect(
    saveSignature(
      { userId: id },
      new File(["<svg/>"], "sig.svg", { type: "image/svg+xml" }),
      actor,
    ),
  ).rejects.toThrow("JPEG");
  await expect(
    saveSignature({ userId: id }, new File(["<script>"], "sig.png", { type: "image/png" }), actor),
  ).rejects.toThrow("format");
  expect(fixture.upload).not.toHaveBeenCalled();
});
it("keeps the configured signature intact when private storage upload fails", async () => {
  fixture.reads = [[{ id }]];
  fixture.upload.mockRejectedValue(new Error("Storage unavailable"));
  await expect(saveSignature({ userId: id }, photo(), actor)).rejects.toThrow(
    "Storage unavailable",
  );
  expect(fixture.writes).toHaveLength(0);
});
it("serves the owner's signature with private cache and MIME protection", async () => {
  fixture.reads = [[{ id, userId: id, objectKey: "private/key", contentType: "image/png" }]];
  fixture.get.mockResolvedValue({
    Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
  });
  const response = await GET(new Request("http://localhost/signature"), {
    params: Promise.resolve({ id }),
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("content-security-policy")).toContain("sandbox");
});
it("rejects unauthenticated and other-user signature requests without loading storage", async () => {
  fixture.identity = null;
  expect(
    (await GET(new Request("http://localhost"), { params: Promise.resolve({ id }) })).status,
  ).toBe(401);
  fixture.identity = actor;
  fixture.reads = [[{ userId: other }]];
  expect(
    (await GET(new Request("http://localhost"), { params: Promise.resolve({ id }) })).status,
  ).toBe(404);
  expect(fixture.get).not.toHaveBeenCalled();
});
it("embeds only the requested configured signature for authorized documents", async () => {
  fixture.reads = [[{ id, objectKey: "private/key", contentType: "image/png" }]];
  fixture.get.mockResolvedValue({
    Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
  });
  expect(await documentSignature(id)).toEqual({ id, src: "data:image/png;base64,AQID" });
});
