export type ParticipantListItem = {
  id: number;
  testerLabel: string | null;
  age: number | null;
  gender: string | null;
  createdAt: string | null;
};

function formatGender(gender: string | null) {
  if (!gender) return "-";
  return gender.charAt(0).toUpperCase() + gender.slice(1);
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
}

export function ParticipantRow({
  participant,
  onOpen,
  onEdit,
  onDelete,
}: {
  participant: ParticipantListItem;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <tr className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3">
        <button
          type="button"
          onClick={onOpen}
          className="text-sm font-semibold text-gray-900 hover:text-[#e8174a] transition-colors"
        >
          {participant.testerLabel ?? `P-${participant.id}`}
        </button>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">{participant.age ?? "-"}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{formatGender(participant.gender)}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(participant.createdAt)}</td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onOpen}
            className="text-xs font-semibold text-[#e8174a] hover:text-[#c9143f] transition-colors whitespace-nowrap"
          >
            View
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors whitespace-nowrap"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="text-xs font-semibold text-red-600 hover:text-red-700 transition-colors whitespace-nowrap"
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}
