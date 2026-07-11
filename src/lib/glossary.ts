export type GlossaryTerm =
  | "hedonicScore"
  | "fer"
  | "confidenceScore"
  | "sensoryAttributes"
  | "invalidated"
  | "retentionStatus"
  | "sampleSize"
  | "stdDev"
  | "sessionTrends"
  | "reactionDistribution"
  | "framesAnalyzed"
  | "testingSessions"
  | "sessionStatus"
  | "sentiment"
  | "boothHandoff"
  | "participantLabel"
  | "overallAcceptance"
  | "faceOnly"
  | "lowConfidenceFilter"
  | "hedonicBand"
  | "compareSessions"
  | "sessionContinuation"
  | "ferVsSurvey"
  | "demographicsHedonic";

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
  sampleSize: {
    title: "Sample size (N)",
    body: "Completed survey responses for this product. Trends need at least 5 for reliability.",
  },
  stdDev: {
    title: "Standard deviation (σ)",
    body: "How spread out survey ratings are around the mean. Higher values mean less agreement.",
  },
  sessionTrends: {
    title: "Session trends",
    body: "Mean survey and FER ratings across testing sessions over time.",
  },
  reactionDistribution: {
    title: "Reaction distribution",
    body: "Share of frames in FER reaction buckets (like, neutral, dislike style), not survey votes.",
  },
  framesAnalyzed: {
    title: "Frames analyzed",
    body: "Camera frames that went through face detection and emotion inference.",
  },
  testingSessions: {
    title: "Testing sessions",
    body: "Recorded tasting sessions for this product.",
  },
  sessionStatus: {
    title: "Session status",
    body: "Workflow state: pending, active, completed, or cancelled. Separate from invalidate and retention.",
  },
  sentiment: {
    title: "Sentiment",
    body: "Coarse positive, neutral, or negative label derived from live FER.",
  },
  boothHandoff: {
    title: "Booth handoff",
    body: "Admin or staff starts the session and switches into the tester account automatically. Reccomended for single device testing.",
  },
  participantLabel: {
    title: "Participant label",
    body: "Stable participant ID. Reuse an existing label to continue a history, or enter a new one to create a participant.",
  },
  overallAcceptance: {
    title: "Overall acceptance",
    body: "Final overall survey liking on the 1-9 hedonic scale.",
  },
  faceOnly: {
    title: "Face only",
    body: "Show only frames where a face was detected.",
  },
  lowConfidenceFilter: {
    title: "Low confidence filter",
    body: "Show only frames with confidence under 50%.",
  },
  hedonicBand: {
    title: "Hedonic band",
    body: "Groups frames by hedonic score ranges for easier browsing.",
  },
  compareSessions: {
    title: "Compare sessions",
    body: "Select sibling sessions to view or compare for the same product and participant context.",
  },
  sessionContinuation: {
    title: "Continue tasting",
    body: "After the survey, continue with the same food, switch to a different food, or finish.",
  },
  ferVsSurvey: {
    title: "FER vs survey",
    body: "FER is camera-inferred reactions from frames. Survey is self-reported ratings. Keep them distinct.",
  },
  demographicsHedonic: {
    title: "Demographics",
    body: "Average survey hedonic scores grouped by age and gender, not FER.",
  },
};
