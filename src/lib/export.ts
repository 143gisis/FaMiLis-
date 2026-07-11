import * as XLSX from "xlsx";

export type ExportFormat = "csv" | "xlsx";

export type FoodExportSessionRow = {
  sessionId: number;
  status: string;
  startTime: string | null;
  endTime: string | null;
  participantLabel: string | null;
  participantAge: number | null;
  participantGender: string | null;
  frameCount: number;
  hasSurvey: boolean;
};

export type FoodExportSurveyRow = {
  sessionId: number;
  participantLabel: string | null;
  age: number | null;
  gender: string | null;
  colorRating: number | null;
  flavorAromaRating: number | null;
  saltSweetRating: number | null;
  textureRating: number | null;
  finalOverallRating: number;
  remarks: string | null;
};

export type FoodExportPayload = {
  food: { id: number; name: string; category: string };
  sessions: FoodExportSessionRow[];
  surveys: FoodExportSurveyRow[];
};

export type SessionExportPayload = {
  session: {
    id: number;
    status: string;
    startTime: string | null;
    endTime: string | null;
    foodName: string | null;
    foodCategory: string | null;
    participantLabel: string | null;
    participantAge: number | null;
    participantGender: string | null;
  };
  survey: {
    colorRating: number | null;
    flavorAromaRating: number | null;
    saltSweetRating: number | null;
    textureRating: number | null;
    finalOverallRating: number | null;
    remarks: string | null;
  } | null;
  frameSummary: {
    totalFrames: number;
    meanConfidence: number | null;
    meanHedonicOutOf9: number | null;
    faceDetectedCount: number;
    positiveCount: number;
    neutralCount: number;
    negativeCount: number;
  };
};

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug || "export";
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildFoodSessionRows(payload: FoodExportPayload) {
  return payload.sessions.map((s) => ({
    "Session ID": s.sessionId,
    Status: s.status,
    "Start Time": s.startTime ?? "",
    "End Time": s.endTime ?? "",
    "Participant Label": s.participantLabel ?? "",
    "Participant Age": s.participantAge ?? "",
    "Participant Gender": s.participantGender ?? "",
    "Frame Count": s.frameCount,
    "Has Survey": s.hasSurvey ? "Yes" : "No",
  }));
}

function buildFoodSurveyRows(payload: FoodExportPayload) {
  return payload.surveys.map((s) => ({
    "Session ID": s.sessionId,
    "Participant Label": s.participantLabel ?? "",
    Age: s.age ?? "",
    Gender: s.gender ?? "",
    Color: s.colorRating ?? "",
    "Flavor/Aroma": s.flavorAromaRating ?? "",
    "Salt/Sweet": s.saltSweetRating ?? "",
    Texture: s.textureRating ?? "",
    Overall: s.finalOverallRating,
    Remarks: s.remarks ?? "",
  }));
}

/**
 * Downloads a food product's sessions (+ survey rows for XLSX) as CSV or XLSX.
 * CSV is single-sheet (Sessions only) since the format has no sheet concept;
 * use XLSX for the full Sessions + Survey breakdown.
 */
export function downloadFoodExport(payload: FoodExportPayload, format: ExportFormat): void {
  const base = `${slugify(payload.food.name)}-export-${todayStamp()}`;
  const sessionRows = buildFoodSessionRows(payload);

  if (format === "csv") {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sessionRows), "Sessions");
    XLSX.writeFile(wb, `${base}.csv`, { bookType: "csv" });
    return;
  }

  const surveyRows = buildFoodSurveyRows(payload);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sessionRows), "Sessions");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(surveyRows), "Survey");
  XLSX.writeFile(wb, `${base}.xlsx`);
}

function buildSessionRows(payload: SessionExportPayload) {
  const s = payload.session;
  const sv = payload.survey;
  const fs = payload.frameSummary;
  return [
    {
      "Session ID": s.id,
      Status: s.status,
      "Start Time": s.startTime ?? "",
      "End Time": s.endTime ?? "",
      Food: s.foodName ?? "",
      Category: s.foodCategory ?? "",
      "Participant Label": s.participantLabel ?? "",
      "Participant Age": s.participantAge ?? "",
      "Participant Gender": s.participantGender ?? "",
      "Survey Color": sv?.colorRating ?? "",
      "Survey Flavor/Aroma": sv?.flavorAromaRating ?? "",
      "Survey Salt/Sweet": sv?.saltSweetRating ?? "",
      "Survey Texture": sv?.textureRating ?? "",
      "Survey Overall": sv?.finalOverallRating ?? "",
      "Survey Remarks": sv?.remarks ?? "",
      "Total Frames": fs.totalFrames,
      "Mean Confidence": fs.meanConfidence == null ? "" : `${Math.round(fs.meanConfidence * 100)}%`,
      "Mean Hedonic (FER, /9)": fs.meanHedonicOutOf9 == null ? "" : fs.meanHedonicOutOf9.toFixed(1),
      "Faces Detected": fs.faceDetectedCount,
      "Positive Frames (7-9)": fs.positiveCount,
      "Neutral Frames (5-6)": fs.neutralCount,
      "Negative Frames (1-4)": fs.negativeCount,
    },
  ];
}

/** Downloads a single session's metadata, survey, and frame aggregates (summary-only, no per-frame rows). */
export function downloadSessionExport(payload: SessionExportPayload, format: ExportFormat): void {
  const base = `session-${payload.session.id}-export-${todayStamp()}`;
  const rows = buildSessionRows(payload);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Session");
  if (format === "csv") {
    XLSX.writeFile(wb, `${base}.csv`, { bookType: "csv" });
  } else {
    XLSX.writeFile(wb, `${base}.xlsx`);
  }
}
