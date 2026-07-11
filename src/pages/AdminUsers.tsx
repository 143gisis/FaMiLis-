import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader, PageTitle } from "../components/PageHeader";
import {
  UserDeactivateDialog,
  UserFormModal,
  UserPasswordModal,
  UserRoleDialog,
  UserRow,
  type UserFormValues,
  type UserListItem,
} from "../components/users";
import { apiFetch } from "../lib/api";
import { FAMILIS_USER_KEY } from "../RequireAuth";

function getStoredUserId(): number | null {
  try {
    const raw = localStorage.getItem(FAMILIS_USER_KEY);
    if (!raw) return null;
    const u = JSON.parse(raw) as { id?: unknown };
    const id = u?.id;
    if (typeof id === "number" && Number.isFinite(id)) return id;
    if (typeof id === "string") {
      const n = Number.parseInt(id, 10);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  } catch {
    return null;
  }
}

export default function AdminUsers() {
  const selfId = getStoredUserId();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<UserListItem | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [roleTarget, setRoleTarget] = useState<UserListItem | null>(null);
  const [roleSaving, setRoleSaving] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);

  const [passwordTarget, setPasswordTarget] = useState<UserListItem | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [activeTarget, setActiveTarget] = useState<UserListItem | null>(null);
  const [activePending, setActivePending] = useState(false);
  const [activeError, setActiveError] = useState<string | null>(null);

  const loadUsers = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/users`, { signal });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load users.");
      }
      setUsers((json.users ?? []) as UserListItem[]);
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setError(err?.message || "Failed to load users.");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void loadUsers(ac.signal);
    return () => ac.abort();
  }, [loadUsers]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
    );
  }, [users, search]);

  const openCreate = () => {
    setEditing(null);
    setFormError(null);
    setFormMode("create");
  };

  const openEdit = (u: UserListItem) => {
    setEditing(u);
    setFormError(null);
    setFormMode("edit");
  };

  const closeForm = () => {
    if (formSaving) return;
    setFormMode(null);
    setEditing(null);
    setFormError(null);
  };

  const handleFormSubmit = async (values: UserFormValues) => {
    const username = values.username.trim();
    const email = values.email.trim();
    if (!username || !email) {
      setFormError("Username and email are required.");
      return;
    }
    if (formMode === "create" && values.password.length < 6) {
      setFormError("Password must be at least 6 characters.");
      return;
    }

    setFormSaving(true);
    setFormError(null);
    try {
      if (formMode === "create") {
        const res = await apiFetch(`/api/users`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username,
            email,
            password: values.password,
            role: values.role,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Failed to add user.");
        }
        setToast("User added");
      } else if (formMode === "edit" && editing) {
        const res = await apiFetch(`/api/users/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, email }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Failed to update user.");
        }
        setToast("User updated");
      }

      setFormMode(null);
      setEditing(null);
      await loadUsers();
    } catch (err: any) {
      setFormError(err?.message || "Failed to save user.");
    } finally {
      setFormSaving(false);
    }
  };

  const handleRoleSubmit = async (role: UserListItem["role"]) => {
    if (!roleTarget) return;
    setRoleSaving(true);
    setRoleError(null);
    try {
      const res = await apiFetch(`/api/users/${roleTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to update role.");
      }
      setRoleTarget(null);
      setToast("Role updated");
      await loadUsers();
    } catch (err: any) {
      setRoleError(err?.message || "Failed to update role.");
    } finally {
      setRoleSaving(false);
    }
  };

  const handlePasswordSubmit = async (password: string) => {
    if (!passwordTarget) return;
    setPasswordSaving(true);
    setPasswordError(null);
    try {
      const res = await apiFetch(`/api/users/${passwordTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to update password.");
      }
      setPasswordTarget(null);
      setToast("Password updated");
      await loadUsers();
    } catch (err: any) {
      setPasswordError(err?.message || "Failed to update password.");
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleActiveConfirm = async () => {
    if (!activeTarget) return;
    setActivePending(true);
    setActiveError(null);
    try {
      const res = await apiFetch(`/api/users/${activeTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !activeTarget.isActive }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to update account status.");
      }
      setActiveTarget(null);
      setToast(activeTarget.isActive ? "User deactivated" : "User reactivated");
      await loadUsers();
    } catch (err: any) {
      setActiveError(err?.message || "Failed to update account status.");
    } finally {
      setActivePending(false);
    }
  };

  return (
    <PageHeader variant="expanded">
      {toast ? (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-5 py-3 rounded-lg shadow-lg text-sm font-semibold">
          {toast}
        </div>
      ) : null}

      <main className="px-6 py-8">
        <div className="max-w-5xl mx-auto">
          <PageTitle
            title="Users"
            subtitle="Manage operator and tester accounts, roles, and passwords."
            hideBack
          />

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by username, email, or role…"
                className="w-full max-w-sm border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30 bg-white"
              />
              <button
                type="button"
                onClick={openCreate}
                className="bg-[#e8174a] hover:bg-[#c9143f] text-white text-sm font-semibold px-4 py-2 rounded-md shadow-sm transition-colors whitespace-nowrap"
              >
                Add user
              </button>
            </div>

            {loading ? (
              <div className="text-center text-gray-500 text-sm py-10">Loading users…</div>
            ) : error ? (
              <div className="text-center text-red-600 text-sm py-10">{error}</div>
            ) : filtered.length === 0 ? (
              <div className="text-center text-gray-500 text-sm py-10">
                {users.length === 0
                  ? "No users yet. Add an admin, staff, or tester account."
                  : "No users match your search."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[900px] w-full text-left">
                  <thead>
                    <tr className="text-xs text-gray-500 bg-gray-50">
                      <th className="px-4 py-3 font-semibold">Username</th>
                      <th className="px-4 py-3 font-semibold">Email</th>
                      <th className="px-4 py-3 font-semibold">Role</th>
                      <th className="px-4 py-3 font-semibold">Created</th>
                      <th className="px-4 py-3 font-semibold">Last login</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((u) => (
                      <UserRow
                        key={u.id}
                        user={u}
                        isSelf={selfId != null && selfId === u.id}
                        onEdit={() => openEdit(u)}
                        onChangeRole={() => {
                          setRoleError(null);
                          setRoleTarget(u);
                        }}
                        onSetPassword={() => {
                          setPasswordError(null);
                          setPasswordTarget(u);
                        }}
                        onToggleActive={() => {
                          setActiveError(null);
                          setActiveTarget(u);
                        }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {formMode ? (
        <UserFormModal
          mode={formMode}
          initial={
            formMode === "edit" && editing
              ? { username: editing.username, email: editing.email }
              : null
          }
          saving={formSaving}
          error={formError}
          onClose={closeForm}
          onSubmit={(values) => void handleFormSubmit(values)}
        />
      ) : null}

      {roleTarget ? (
        <UserRoleDialog
          username={roleTarget.username}
          currentRole={roleTarget.role}
          isSelf={selfId != null && selfId === roleTarget.id}
          saving={roleSaving}
          error={roleError}
          onClose={() => {
            if (roleSaving) return;
            setRoleTarget(null);
            setRoleError(null);
          }}
          onSubmit={(role) => void handleRoleSubmit(role)}
        />
      ) : null}

      {passwordTarget ? (
        <UserPasswordModal
          username={passwordTarget.username}
          saving={passwordSaving}
          error={passwordError}
          onClose={() => {
            if (passwordSaving) return;
            setPasswordTarget(null);
            setPasswordError(null);
          }}
          onSubmit={(password) => void handlePasswordSubmit(password)}
        />
      ) : null}

      {activeTarget ? (
        <UserDeactivateDialog
          username={activeTarget.username}
          deactivate={activeTarget.isActive}
          pending={activePending}
          error={activeError}
          onClose={() => {
            if (activePending) return;
            setActiveTarget(null);
            setActiveError(null);
          }}
          onConfirm={() => void handleActiveConfirm()}
        />
      ) : null}
    </PageHeader>
  );
}
