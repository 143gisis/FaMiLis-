import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader, PageTitle } from "../components/PageHeader";
import {
  ParticipantDeleteDialog,
  ParticipantFormModal,
  ParticipantRow,
  type ParticipantFormValues,
  type ParticipantListItem,
} from "../components/participants";
import { apiFetch } from "../lib/api";

export default function Participants() {
  const navigate = useNavigate();
  const [participants, setParticipants] = useState<ParticipantListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<ParticipantListItem | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<ParticipantListItem | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadParticipants = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/participants`, { signal });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load participants.");
      }
      setParticipants((json.participants ?? []) as ParticipantListItem[]);
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setError(err?.message || "Failed to load participants.");
      setParticipants([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void loadParticipants(ac.signal);
    return () => ac.abort();
  }, [loadParticipants]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return participants;
    return participants.filter((p) => (p.testerLabel ?? `P-${p.id}`).toLowerCase().includes(q));
  }, [participants, search]);

  const openCreate = () => {
    setEditing(null);
    setFormError(null);
    setFormMode("create");
  };

  const openEdit = (p: ParticipantListItem) => {
    setEditing(p);
    setFormError(null);
    setFormMode("edit");
  };

  const closeForm = () => {
    if (formSaving) return;
    setFormMode(null);
    setEditing(null);
    setFormError(null);
  };

  const handleFormSubmit = async (values: ParticipantFormValues) => {
    const label = values.testerLabel.trim();
    if (!label) {
      setFormError("Participant label is required.");
      return;
    }

    const age =
      values.age.trim() === ""
        ? null
        : Number.isFinite(Number(values.age))
          ? Math.round(Number(values.age))
          : null;
    if (values.age.trim() !== "" && age == null) {
      setFormError("Age must be a number between 0 and 120.");
      return;
    }
    if (age != null && (age < 0 || age > 120)) {
      setFormError("Age must be between 0 and 120.");
      return;
    }

    const gender = values.gender || null;
    setFormSaving(true);
    setFormError(null);

    try {
      if (formMode === "create") {
        const res = await apiFetch(`/api/participants`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            testerLabel: label,
            age,
            gender,
            createOnly: true,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Failed to add participant.");
        }
        setToast("Participant added");
      } else if (formMode === "edit" && editing) {
        const res = await apiFetch(`/api/participants/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ testerLabel: label, age, gender }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Failed to update participant.");
        }
        setToast("Participant updated");
      }

      setFormMode(null);
      setEditing(null);
      await loadParticipants();
    } catch (err: any) {
      setFormError(err?.message || "Failed to save participant.");
    } finally {
      setFormSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      const res = await apiFetch(`/api/participants/${deleting.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to delete participant.");
      }
      setDeleting(null);
      setToast("Participant deleted");
      await loadParticipants();
    } catch (err: any) {
      setDeleteError(err?.message || "Failed to delete participant.");
    } finally {
      setDeletePending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f7fb]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      <PageHeader />

      {toast ? (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-5 py-3 rounded-lg shadow-lg text-sm font-semibold">
          {toast}
        </div>
      ) : null}

      <main className="px-6 py-8">
        <div className="max-w-5xl mx-auto">
          <PageTitle
            title="Participants"
            subtitle="Manage tasting participants and open their session history."
          />

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by participant label…"
                className="w-full max-w-sm border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30 bg-white"
              />
              <button
                type="button"
                onClick={openCreate}
                className="bg-[#e8174a] hover:bg-[#c9143f] text-white text-sm font-semibold px-4 py-2 rounded-md shadow-sm transition-colors whitespace-nowrap"
              >
                Add participant
              </button>
            </div>

            {loading ? (
              <div className="text-center text-gray-500 text-sm py-10">Loading participants…</div>
            ) : error ? (
              <div className="text-center text-red-600 text-sm py-10">{error}</div>
            ) : filtered.length === 0 ? (
              <div className="text-center text-gray-500 text-sm py-10">
                {participants.length === 0
                  ? "No participants yet. Add one here, or create them when starting a session in Setup."
                  : "No participants match your search."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[960px] w-full text-left">
                  <thead>
                    <tr className="text-xs text-gray-500 bg-gray-50">
                      <th className="px-4 py-3 font-semibold">Label</th>
                      <th className="px-4 py-3 font-semibold w-16">Age</th>
                      <th className="px-4 py-3 font-semibold w-24">Gender</th>
                      <th className="px-4 py-3 font-semibold w-28">Created</th>
                      <th className="px-4 py-3 font-semibold w-20">Sessions</th>
                      <th className="px-4 py-3 font-semibold w-14">Last Tasted Food</th>
                      <th className="px-4 py-3 font-semibold text-right w-[1%] whitespace-nowrap">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => (
                      <ParticipantRow
                        key={p.id}
                        participant={p}
                        onOpen={() => navigate(`/participants/${p.id}`)}
                        onEdit={() => openEdit(p)}
                        onDelete={() => {
                          setDeleteError(null);
                          setDeleting(p);
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
        <ParticipantFormModal
          mode={formMode}
          initial={
            formMode === "edit" && editing
              ? {
                  testerLabel: editing.testerLabel,
                  age: editing.age,
                  gender: editing.gender,
                }
              : null
          }
          saving={formSaving}
          error={formError}
          onClose={closeForm}
          onSubmit={(values) => void handleFormSubmit(values)}
        />
      ) : null}

      {deleting ? (
        <ParticipantDeleteDialog
          label={deleting.testerLabel ?? `P-${deleting.id}`}
          deleting={deletePending}
          error={deleteError}
          onClose={() => {
            if (deletePending) return;
            setDeleting(null);
            setDeleteError(null);
          }}
          onConfirm={() => void handleDelete()}
        />
      ) : null}
    </div>
  );
}
