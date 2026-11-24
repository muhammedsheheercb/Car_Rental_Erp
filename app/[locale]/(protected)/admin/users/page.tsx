import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import Link from "next/link";
import { TrimmedForm } from "@/components/trimmed-form";
import { UserActions } from "@/components/user-actions";
import { UserPermissionsGrid } from "@/components/user-permissions-grid";
import { db } from "@/db/client";
import { branches, roles, userBranches, userPermissions, userRoles, users } from "@/db/schema";
import { allowedRolesForActor, canManageUserTarget, type UserRole } from "@/features/admin/users";
import { can, requirePermission } from "@/lib/auth";
import { createUserAction } from "../actions";

const PAGE_SIZE = 15;

export default async function UsersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; role?: string; status?: string; page?: string }>;
}) {
  const actor = await requirePermission("users", "read");
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const q = query.q?.trim() ?? "";
  const roleFilter = ["SUPER_ADMIN", "ADMIN", "USER"].includes(query.role ?? "")
    ? (query.role as UserRole)
    : "";
  const statusFilter = ["active", "inactive"].includes(query.status ?? "")
    ? (query.status as "active" | "inactive")
    : "";
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);

  const actorScope =
    actor.role === "SUPER_ADMIN"
      ? undefined
      : and(
          sql`coalesce(${roles.name}::text, 'USER') <> 'SUPER_ADMIN'`,
          or(
            eq(users.id, actor.id),
            actor.branchIds.length
              ? sql`exists(select 1 from ${userBranches} where ${userBranches.userId} = ${users.id} and ${userBranches.branchId} in (${sql.join(
                  actor.branchIds.map((id) => sql`${id}`),
                  sql`, `,
                )}))`
              : eq(users.id, actor.id),
          ),
        );

  const where = and(
    actorScope,
    q ? or(ilike(users.displayName, `%${q}%`), ilike(users.username, `%${q}%`)) : undefined,
    roleFilter ? eq(roles.name, roleFilter) : undefined,
    statusFilter === "active"
      ? eq(users.isActive, true)
      : statusFilter === "inactive"
        ? eq(users.isActive, false)
        : undefined,
  );

  const [records, totalRows, branchRows] = await Promise.all([
    db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        isActive: users.isActive,
        role: roles.name,
      })
      .from(users)
      .leftJoin(userRoles, eq(userRoles.userId, users.id))
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ count: count() })
      .from(users)
      .leftJoin(userRoles, eq(userRoles.userId, users.id))
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .where(where),
    db
      .select({ id: branches.id, name: branches.name, code: branches.code })
      .from(branches)
      .where(
        and(
          eq(branches.isActive, true),
          actor.role === "SUPER_ADMIN"
            ? undefined
            : actor.branchIds.length
              ? inArray(branches.id, actor.branchIds)
              : sql`false`,
        ),
      ),
  ]);

  const userIds = records.map((row) => row.id);
  const [branchAssignments, permissionAssignments] = userIds.length
    ? await Promise.all([
        db
          .select({
            userId: userBranches.userId,
            branchId: branches.id,
            branchName: branches.name,
            branchCode: branches.code,
          })
          .from(userBranches)
          .innerJoin(branches, eq(branches.id, userBranches.branchId))
          .where(inArray(userBranches.userId, userIds)),
        db
          .select({
            userId: userPermissions.userId,
            module: userPermissions.module,
            action: userPermissions.action,
          })
          .from(userPermissions)
          .where(and(inArray(userPermissions.userId, userIds), eq(userPermissions.granted, true))),
      ])
    : [[], []];

  const total = totalRows[0]?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const assignableRoles = allowedRolesForActor(actor.role);
  const assignablePermissions = actor.role === "SUPER_ADMIN" ? undefined : [...actor.permissions];
  const canCreate = can(actor, "users", "create");
  const canUpdate = can(actor, "users", "update");
  const canDelete = can(actor, "users", "delete");

  const pageHref = (nextPage: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (roleFilter) p.set("role", roleFilter);
    if (statusFilter) p.set("status", statusFilter);
    p.set("page", String(nextPage));
    return `/${locale}/admin/users?${p.toString()}`;
  };

  return (
    <div className={`grid min-w-0 gap-8 ${canCreate ? "xl:grid-cols-[minmax(0,1fr)_28rem]" : ""}`}>
      <section className="min-w-0">
        <p className="text-sm text-[var(--accent)]">ADMINISTRATION</p>
        <h1 className="mt-2 text-3xl font-semibold">Users & access</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {actor.role === "SUPER_ADMIN"
            ? "Manage accounts, branch access, and module permissions across all branches."
            : "Manage users and permissions within your assigned branches."}
        </p>

        <form className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search name or username"
            aria-label="Search users"
            className="min-h-11 rounded-lg border border-[var(--edge)] bg-[var(--surface)] px-3 text-sm"
          />
          <select
            name="role"
            defaultValue={roleFilter}
            aria-label="Filter by role"
            className="min-h-11 rounded-lg border border-[var(--edge)] bg-[var(--surface)] px-3 text-sm"
          >
            <option value="">All roles</option>
            {assignableRoles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <select
            name="status"
            defaultValue={statusFilter}
            aria-label="Filter by status"
            className="min-h-11 rounded-lg border border-[var(--edge)] bg-[var(--surface)] px-3 text-sm"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <div className="flex gap-2">
            <button
              type="submit"
              className="min-h-11 flex-1 rounded-lg border border-[var(--edge)] bg-[var(--raised)] px-4 text-sm font-medium"
            >
              Filter
            </button>
            {(q || roleFilter || statusFilter) && (
              <Link
                href={`/${locale}/admin/users` as never}
                className="min-h-11 content-center rounded-lg border border-[var(--edge)] px-3 text-sm text-[var(--accent)]"
              >
                Clear
              </Link>
            )}
          </div>
        </form>

        <p className="mt-3 text-sm text-[var(--muted)]">
          {total} user{total === 1 ? "" : "s"}
        </p>

        <div className="mt-3 max-w-full overflow-x-auto rounded-2xl border border-[var(--edge)] [overscroll-behavior-inline:contain]">
          <table className="min-w-[54rem] w-full table-fixed text-start text-sm">
            <colgroup>
              <col className="w-[24%]" />
              <col className="w-[14%]" />
              <col className="w-[24%]" />
              <col className="w-[12%]" />
              <col className="w-[11%]" />
              <col className="w-[15%]" />
            </colgroup>
            <thead className="bg-[var(--raised)] text-[var(--muted)]">
              <tr>
                <th
                  scope="col"
                  className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wide"
                >
                  User
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wide"
                >
                  Role
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wide"
                >
                  Branches
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide"
                >
                  Permissions
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide"
                >
                  Status
                </th>
                <th
                  scope="col"
                  className="px-2 py-3 text-center text-xs font-medium uppercase tracking-wide"
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {records.map((user) => {
                const role: UserRole = user.role ?? "USER";
                const userBranchList = branchAssignments.filter((b) => b.userId === user.id);
                const userBranchIds = userBranchList.map((b) => b.branchId);
                const userPermList = permissionAssignments
                  .filter((p) => p.userId === user.id)
                  .map((p) => `${p.module}:${p.action}`);
                const manageable = canManageUserTarget(actor, {
                  id: user.id,
                  role,
                  branchIds: userBranchIds,
                });
                return (
                  <tr
                    key={user.id}
                    className="border-t border-[var(--edge)] align-middle hover:bg-white/5"
                  >
                    <td className="px-4 py-3">
                      <p className="break-words font-medium">{user.displayName}</p>
                      <p className="break-all font-mono text-xs text-[var(--muted)]">
                        {user.username}
                      </p>
                    </td>
                    <td className="break-words px-4 py-3 text-xs font-medium">{role}</td>
                    <td className="px-4 py-3 text-xs">
                      {role === "SUPER_ADMIN" ? (
                        <span className="text-[var(--accent)]">All branches</span>
                      ) : userBranchList.length ? (
                        <div className="flex flex-wrap gap-1">
                          {userBranchList.map((b) => (
                            <span
                              key={b.branchId}
                              className="rounded border border-[var(--edge)] bg-[var(--surface)] px-2 py-0.5"
                            >
                              {b.branchCode}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[var(--muted)]">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-[var(--muted)]">
                      {role === "SUPER_ADMIN" ? "Full" : userPermList.length}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs ${user.isActive ? "bg-emerald-400/15 text-emerald-200" : "bg-red-400/15 text-red-200"}`}
                      >
                        {user.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <UserActions
                        user={{
                          id: user.id,
                          username: user.username,
                          displayName: user.displayName,
                          role,
                          isActive: user.isActive,
                          branchIds: userBranchIds,
                          permissions: userPermList,
                        }}
                        assignableRoles={assignableRoles}
                        assignableBranches={branchRows}
                        allowedPermissions={assignablePermissions}
                        canEdit={canUpdate && manageable}
                        canDeactivate={canDelete && manageable}
                        canReactivate={canUpdate && manageable}
                        isSelf={user.id === actor.id}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!records.length && <p className="p-8 text-[var(--muted)]">No matching users found.</p>}
        </div>

        {total > PAGE_SIZE && (
          <nav aria-label="User pages" className="mt-4 flex items-center justify-end gap-3 text-sm">
            {page > 1 && (
              <Link
                href={pageHref(page - 1) as never}
                className="min-h-10 content-center rounded-lg border border-[var(--edge)] px-3"
              >
                Previous
              </Link>
            )}
            <span className="text-[var(--muted)]">
              Page {page} of {totalPages}
            </span>
            {page < totalPages && (
              <Link
                href={pageHref(page + 1) as never}
                className="min-h-10 content-center rounded-lg border border-[var(--edge)] px-3"
              >
                Next
              </Link>
            )}
          </nav>
        )}
      </section>

      {canCreate && (
        <TrimmedForm
          action={createUserAction}
          className="h-fit rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-5"
        >
          <h2 className="text-lg font-semibold">New user</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Users must change their initial password on first login.
          </p>
          <label className="mt-4 block text-sm">
            Display name
            <input
              name="displayName"
              required
              maxLength={120}
              className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
            />
          </label>
          <label className="mt-4 block text-sm">
            Username
            <input
              name="username"
              required
              minLength={3}
              maxLength={64}
              placeholder="e.g. muscat.staff"
              className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
            />
          </label>
          <label className="mt-4 block text-sm">
            Initial password
            <input
              name="initialPassword"
              type="password"
              minLength={12}
              required
              placeholder="Minimum 12 characters"
              className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
            />
          </label>
          <label className="mt-4 block text-sm">
            Role
            <select
              name="role"
              defaultValue={assignableRoles.includes("USER") ? "USER" : assignableRoles[0]}
              className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
            >
              {assignableRoles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="mt-5">
            <legend className="text-sm font-medium">
              Branch access{actor.role !== "SUPER_ADMIN" ? " *" : ""}
            </legend>
            {branchRows.map((branch) => (
              <label key={branch.id} className="mt-2 flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" name="branchIds" value={branch.id} />
                {branch.name} · <span className="font-mono text-xs">{branch.code}</span>
              </label>
            ))}
            {!branchRows.length && (
              <p className="mt-2 text-xs text-[var(--muted)]">No active branches assigned.</p>
            )}
          </fieldset>
          <UserPermissionsGrid
            allowedPermissions={assignablePermissions}
            maxHeightClass="max-h-64"
          />
          <button
            type="submit"
            className="mt-6 min-h-11 w-full rounded-lg bg-[var(--accent)] font-semibold text-black"
          >
            Create user
          </button>
        </TrimmedForm>
      )}
    </div>
  );
}
