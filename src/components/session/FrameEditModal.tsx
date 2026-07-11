import { useEffect, useState, type FormEvent } from "react";
import type { SessionFrameLog } from "./useFrameGroups";

export type FrameEditValues = {
  faceDetected: boolean | null;
  confidenceScore: number | null; // 0..1
  hedonicScore: number | null; // 0..1
};

type FrameEditModalProps = {
  frame: SessionFrameLog;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (values: FrameEditValues) => void;
};

const inputClass =
  "w-full border border-gray-200 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30 bg-white";

function toHedonicUi(score0to1: number | null): string {
  if (score0to1 == null) return "";
  return String(Number((score0to1 * 8 + 1).toFixed(1)));
}

function fromHedonicUi(raw: string): { ok: true; value: number | null } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 1 || n > 9) {
    return { ok: false, error: "Hedonic score must be between 1 and 9, or empty." };
  }
  return { ok: true, value: (n - 1) / 8 };
}

function fromConfidenceUi(raw: string): { ok: true; value: number | null } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    return { ok: false, error: "Confidence must be between 0 and 1, or empty." };
  }
  return { ok: true, value: n };
}

export function FrameEditModal({
  frame,
  saving = false,
  error = null,
  onClose,
  onSubmit,
}: FrameEditModalProps) {
  const [faceMode, setFaceMode] = useState<"yes" | "no" | "unknown">(
    frame.faceDetected === true ? "yes" : frame.faceDetected === false ? "no" : "unknown"
  );
  const [confidence, setConfidence] = useState(
    frame.confidenceScore == null ? "" : String(frame.confidenceScore)
  );
  const [hedonic, setHedonic] = useState(toHedonicUi(frame.hedonicScore));
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setFaceMode(
      frame.faceDetected === true ? "yes" : frame.faceDetected === false ? "no" : "unknown"
    );
    setConfidence(frame.confidenceScore == null ? "" : String(frame.confidenceScore));
    setHedonic(toHedonicUi(frame.hedonicScore));
    setLocalError(null);
  }, [frame]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const conf = fromConfidenceUi(confidence);
    if (!conf.ok) {
      setLocalError(conf.error);
      return;
    }
    const hed = fromHedonicUi(hedonic);
    if (!hed.ok) {
      setLocalError(hed.error);
      return;
    }
    setLocalError(null);
    onSubmit({
      faceDetected: faceMode === "yes" ? true : faceMode === "no" ? false : null,
      confidenceScore: conf.value,
      hedonicScore: hed.value,
    });
  }

  const displayError = localError || error;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <form
        className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="frame-edit-title"
        onSubmit={handleSubmit}
      >
        <h2 id="frame-edit-title" className="text-gray-900 font-bold mb-1">
          Edit frame
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Manual QA correction for frame #{frame.frameLogId}. Changes apply to this session only.
        </p>

        <label className="block text-xs font-semibold text-gray-600 mb-1">Face detected</label>
        <select
          value={faceMode}
          onChange={(e) => setFaceMode(e.target.value as "yes" | "no" | "unknown")}
          className={`${inputClass} mb-3`}
          disabled={saving}
        >
          <option value="yes">Yes</option>
          <option value="no">No</option>
          <option value="unknown">Unknown</option>
        </select>

        <label className="block text-xs font-semibold text-gray-600 mb-1">
          Confidence (0–1)
        </label>
        <input
          type="number"
          min={0}
          max={1}
          step="0.01"
          value={confidence}
          onChange={(e) => setConfidence(e.target.value)}
          className={`${inputClass} mb-3`}
          disabled={saving}
          placeholder="e.g. 0.85"
        />

        <label className="block text-xs font-semibold text-gray-600 mb-1">
          Hedonic score (1–9)
        </label>
        <input
          type="number"
          min={1}
          max={9}
          step="0.1"
          value={hedonic}
          onChange={(e) => setHedonic(e.target.value)}
          className={`${inputClass} mb-3`}
          disabled={saving}
          placeholder="e.g. 6.5"
        />

        {displayError ? <p className="text-xs text-red-600 mb-3">{displayError}</p> : null}

        <div className="flex gap-3 mt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 border border-gray-200 text-gray-700 hover:bg-gray-50 py-2 rounded-md text-sm font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-[#e8174a] hover:bg-[#c91440] text-white py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
