export type GlossaryTerm =
  | "hedonicScore"
  | "fer"
  | "confidenceScore"
  | "sensoryAttributes"
  | "invalidated"
  | "retentionStatus";

export type GlossaryEntry = {
  title: string;
  body: string;
};

export const GLOSSARY: Record<GlossaryTerm, GlossaryEntry> = {
  hedonicScore: {
    title: "Hedonic score",
    body: "How much a taster appears to like the food, rated on a 1-9 scale.",
  },
  fer: {
    title: "FER",
    body: "Facial Emotion Recognition, which estimates a taster's reaction from camera frames.",
  },
  confidenceScore: {
    title: "Confidence score",
    body: "How certain the system is that a face was detected correctly in a frame.",
  },
  sensoryAttributes: {
    title: "Sensory attributes",
    body: "The color, aroma, salt or sweetness, and texture ratings collected from the survey.",
  },
  invalidated: {
    title: "Invalidated",
    body: "A session flagged as unusable for analysis, so its data may be excluded from reports.",
  },
  retentionStatus: {
    title: "Retention status",
    body: "Whether a session's data is still active, pending deletion, or already anonymized.",
  },
};
