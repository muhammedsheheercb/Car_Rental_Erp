import { desc, eq } from "drizzle-orm";
import { DeactivateButton } from "@/components/deactivate-button";
import { TrimmedForm } from "@/components/trimmed-form";
import { db } from "@/db/client";
import {
  branches,
  permissionActions,
  permissionModules,
  roles,
  userRoles,
  users,
} from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { createUserAction } from "../actions";
export default async function UsersPage() {
  const actor = await requirePermission("users", "read");
  const [records, branchRows, roleRows] = await Promise.all([
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
      .orderBy(desc(users.createdAt)),
    db.select().from(branches).where(eq(branches.isActive, true)),
    db.select().from(roles),
  ]);
  return (
    <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1fr)_28rem]">
      <section className="min-w-0">
        <p className="text-sm text-[var(--accent)]">ADMINISTRATION</p>
        <h1 className="mt-2 text-3xl font-semibold">Users & access</h1>
        <div className="mt-6 max-w-full overflow-x-auto rounded-2xl border border-[var(--edge)] [overscroll-behavior-inline:contain] sm:mt-8">
          <table className="min-w-[42rem] w-full table-fixed text-start text-sm">
            <colgroup>
              <col className="w-[42%]" />
              <col className="w-[23%]" />
              <col className="w-[20%]" />
              <col className="w-[10rem]" />
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
              {records.map((user) => (
                <tr
                  key={user.id}
                  className="border-t border-[var(--edge)] align-middle hover:bg-white/5"
                >
                  <td className="px-4 py-3">
                    <p className="break-words font-medium">{user.displayName}</p>
                    <p className="break-all text-[var(--muted)]">{user.username}</p>
                  </td>
                  <td className="break-words px-4 py-3">{user.role ?? "Unassigned"}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex rounded-full bg-[var(--surface)] px-2.5 py-1 text-xs">
                      {user.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-center">
                    {user.isActive && actor.role === "SUPER_ADMIN" && (
                      <DeactivateButton entity="user" id={user.id} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {actor.role === "SUPER_ADMIN" && (
        <TrimmedForm
          action={createUserAction}
          className="rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-5"
        >
          <h2 className="font-semibold">New user</h2>
          <label className="mt-4 block text-sm">
            Display name
            <input
              name="displayName"
              required
              className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] px-3"
            />
          </label>
          <label className="mt-4 block text-sm">
            Username
            <input
              name="username"
              required
              className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] px-3"
            />
          </label>
          <label className="mt-4 block text-sm">
            Initial password
            <input
              name="initialPassword"
              type="password"
              minLength={12}
              required
              className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] px-3"
            />
          </label>
          <label className="mt-4 block text-sm">
            Role
            <select
              name="role"
              className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] px-3"
            >
              {roleRows.map((role) => (
                <option key={role.id}>{role.name}</option>
              ))}
            </select>
          </label>
          <fieldset className="mt-5">
            <legend className="text-sm font-medium">Branch access</legend>
            {branchRows.map((branch) => (
              <label key={branch.id} className="mt-2 flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" name="branchIds" value={branch.id} />
                {branch.name} · {branch.code}
              </label>
            ))}
          </fieldset>
          <fieldset className="mt-5">
            <legend className="text-sm font-medium">Explicit permissions</legend>
            <div className="mt-2 max-h-64 space-y-3 overflow-auto">
              {permissionModules.map((module) => (
                <div key={module}>
                  <p className="capitalize text-[var(--muted)]">{module}</p>
                  <div className="flex flex-wrap gap-x-3">
                    {permissionActions.map((action) => (
                      <label key={action} className="flex min-h-9 items-center gap-1 text-xs">
                        <input type="checkbox" name="permissions" value={`${module}:${action}`} />
                        {action}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </fieldset>
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
