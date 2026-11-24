"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setUserActiveAction, updateUserAction } from "@/app/[locale]/(protected)/admin/actions";
import type { UserRole } from "@/features/admin/users";
import { ConfirmDialog } from "./confirm-dialog";
import { useToast } from "./toast";
import { UserPermissionsGrid } from "./user-permissions-grid";

type BranchOption = { id: string; name: string; code: string };

export function UserActions({
  user,
  assignableRoles,
  assignableBranches,
  allowedPermissions,
  canEdit,
  canDeactivate,
  canReactivate,
  isSelf,
}: {
  user: {
    id: string;
    username: string;
    displayName: string;
    role: UserRole;
    isActive: boolean;
    branchIds: string[];
    permissions: string[];
  };
  assignableRoles: UserRole[];
  assignableBranches: BranchOption[];
  allowedPermissions?: string[];
  canEdit: boolean;
  canDeactivate: boolean;
  canReactivate: boolean;
  isSelf: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [toggling, setToggling] = useState(false);
  const { show } = useToast();
  const router = useRouter();

  const submitEdit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const form = event.currentTarget;
    const displayNameInput = form.elements.namedItem("displayName") as HTMLInputElement | null;
    if (displayNameInput) {
      displayNameInput.value = displayNameInput.value.trim();
      if (!displayNameInput.value) {
        setError("Display name is required.");
        displayNameInput.focus();
        return;
      }
    }
    const formData = new FormData(form);
    startTransition(async () => {
      try {
        const result = await updateUserAction(user.id, formData);
        if (!result.ok) {
          setError(result.message);
          show(result.message, "error", `user-edit-${user.id}`);
          return;
        }
        show(result.message, "success", `user-edit-${user.id}`);
        setEditing(false);
        router.refresh();
      } catch {
        setError("We could not update this user. Please try again.");
      }
    });
  };

  const toggleActive = async (nextActive: boolean) => {
    if (toggling) return;
    setToggling(true);
    try {
      const result = await setUserActiveAction(user.id, nextActive);
      show(result.message, result.ok ? "success" : "error", `user-status-${user.id}`);
      if (result.ok) router.refresh();
    } finally {
      setToggling(false);
    }
  };

  const selectedBranches = new Set(user.branchIds);

  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-1">
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              setError("");
              setEditing(true);
            }}
            className="min-h-10 rounded-lg px-2 text-sm font-medium text-[var(--accent)]"
          >
            Edit
          </button>
        )}
        {!isSelf && user.isActive && canDeactivate && (
          <ConfirmDialog
            title={`Deactivate ${user.displayName}?`}
            description={`Username: ${user.username}. They will be signed out immediately and unable to access the system.`}
            confirmLabel="Deactivate"
            processingLabel="Deactivating…"
            pending={toggling}
            onConfirm={() => toggleActive(false)}
            trigger={
              <button
                type="button"
                disabled={toggling}
                className="min-h-10 rounded-lg px-2 text-sm text-red-300 disabled:opacity-60"
              >
                Deactivate
              </button>
            }
          />
        )}
        {!isSelf && !user.isActive && canReactivate && (
          <ConfirmDialog
            title={`Activate ${user.displayName}?`}
            description={`Username: ${user.username}. This will allow the account to sign in again with its assigned role and permissions.`}
            confirmLabel="Activate"
            processingLabel="Activating…"
            pending={toggling}
            onConfirm={() => toggleActive(true)}
            trigger={
              <button
                type="button"
                disabled={toggling}
                className="min-h-10 rounded-lg border border-[var(--edge)] px-2 text-sm text-[var(--accent)] disabled:opacity-60"
              >
                Activate
              </button>
            }
          />
        )}
        {!canEdit && (isSelf || (!canDeactivate && !canReactivate)) && (
          <span className="text-xs text-[var(--muted)]">{isSelf ? "Current user" : "—"}</span>
        )}
      </div>

      {editing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Edit user ${user.username}`}
          onMouseDown={() => !pending && setEditing(false)}
          className="fixed inset-0 z-50 grid place-items-end bg-black/75 sm:place-items-center sm:p-4"
        >
          <form
            onSubmit={submitEdit}
            onMouseDown={(event) => event.stopPropagation()}
            className="max-h-[calc(100dvh-.5rem)] w-full overflow-y-auto rounded-t-2xl border border-[var(--edge)] bg-[var(--raised)] text-start sm:max-h-[90vh] sm:max-w-2xl sm:rounded-2xl"
          >
            <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[var(--edge)] bg-[var(--raised)] p-5 sm:p-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
                  USER ACCESS
                </p>
                <h2 className="mt-1 text-xl font-semibold">Edit {user.displayName}</h2>
                <p className="mt-1 font-mono text-xs text-[var(--muted)]">{user.username}</p>
              </div>
              <button
                type="button"
                aria-label="Close edit user dialog"
                disabled={pending}
                onClick={() => setEditing(false)}
                className="min-h-11 px-3 text-lg"
              >
                ×
              </button>
            </header>

            <div className="p-5 sm:p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm">
                  Display name
                  <input
                    name="displayName"
                    defaultValue={user.displayName}
                    required
                    maxLength={120}
                    className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
                  />
                </label>
                <label className="block text-sm">
                  Role
                  <select
                    name="role"
                    defaultValue={user.role}
                    className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
                  >
                    {assignableRoles.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <fieldset className="mt-5">
                <legend className="text-sm font-medium">Branch access</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {assignableBranches.map((branch) => (
                    <label
                      key={branch.id}
                      className="flex min-h-11 items-center gap-2 rounded-lg border border-[var(--edge)] bg-black/15 px-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        name="branchIds"
                        value={branch.id}
                        defaultChecked={selectedBranches.has(branch.id)}
                      />
                      <span className="truncate">
                        {branch.name} · <span className="font-mono text-xs">{branch.code}</span>
                      </span>
                    </label>
                  ))}
                  {!assignableBranches.length && (
                    <p className="text-sm text-[var(--muted)]">No active branches available.</p>
                  )}
                </div>
              </fieldset>

              <UserPermissionsGrid
                defaultSelected={user.permissions}
                allowedPermissions={allowedPermissions}
                maxHeightClass="max-h-64"
              />

              {error && (
                <p role="alert" className="mt-4 text-sm text-red-300">
                  {error}
                </p>
              )}
            </div>

            <footer className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-[var(--edge)] bg-[var(--raised)] p-5 sm:flex-row sm:justify-end sm:p-6">
              <button
                type="button"
                disabled={pending}
                onClick={() => setEditing(false)}
                className="min-h-11 rounded-lg border border-[var(--edge)] px-4 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="min-h-11 rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-black disabled:opacity-60"
              >
                {pending ? "Saving…" : "Save changes"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </>
  );
}
