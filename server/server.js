import express from "express";
import cors from "cors";
import { initDb } from "./init.js";

const app = express();
app.use(cors());
app.use(express.json());

let poolPromise = null;

async function start() {
  if (!poolPromise) {
    poolPromise = initDb();
  }
  const pool = await poolPromise;

  function toIsoOrNull(v) {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  // Simple health endpoint to verify server + DB
  app.get("/api/health", async (_req, res) => {
    try {
      const [rows] = await pool.query("SELECT NOW() as now");
      res.json({ ok: true, dbTime: rows[0].now });
    } catch (err) {
      console.error("Health check failed:", err);
      res.status(500).json({ ok: false, error: "DB error" });
    }
  });

  app.post("/api/login", async (req, res) => {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      return res.status(400).json({ ok: false, error: "Email and password are required." });
    }

    try {
      const [rows] = await pool.query(
        `
        SELECT user_id, username, email, password_hash, role
        FROM users
        WHERE email = ?
      `,
        [email]
      );

      if (rows.length === 0) {
        return res.status(401).json({ ok: false, error: "Invalid email or password." });
      }

      const user = rows[0];

      // NOTE: For now plain-text comparison to match seeded user.
      // Replace with proper hashing (e.g. bcrypt) later.
      if (user.password_hash !== password) {
        return res.status(401).json({ ok: false, error: "Invalid email or password." });
      }

      return res.json({
        ok: true,
        user: {
          id: user.user_id,
          username: user.username,
          email: user.email,
          role: user.role,
        },
      });
    } catch (err) {
      console.error("Login error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  // Foods list for dashboard
  app.get("/api/foods", async (_req, res) => {
    try {
      const [rows] = await pool.query(
        `
        SELECT
          fp.food_id,
          fp.name,
          fp.category,
          fp.created_at,
          COUNT(s.session_id) AS sessions_total,
          SUM(CASE WHEN s.status = 'active' THEN 1 ELSE 0 END) AS sessions_active,
          AVG(
            CASE
              WHEN s.start_time IS NOT NULL AND s.end_time IS NOT NULL THEN TIMESTAMPDIFF(SECOND, s.start_time, s.end_time) / 60.0
              ELSE NULL
            END
          ) AS avg_duration_min
        FROM food_products fp
        LEFT JOIN sessions s ON s.food_id = fp.food_id
        GROUP BY fp.food_id, fp.name, fp.category, fp.created_at
        ORDER BY fp.created_at DESC, fp.food_id DESC
      `
      );

      const foods = rows.map((r) => ({
        id: Number(r.food_id),
        name: r.name,
        category: r.category,
        createdAt: toIsoOrNull(r.created_at),
        sessionsTotal: Number(r.sessions_total ?? 0),
        sessionsActive: Number(r.sessions_active ?? 0),
        avgDurationMin: r.avg_duration_min == null ? null : Number(r.avg_duration_min),
      }));

      return res.json({ ok: true, foods });
    } catch (err) {
      console.error("GET /api/foods error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  // Create food
  app.post("/api/foods", async (req, res) => {
    const { name, category } = req.body ?? {};
    const trimmedName = typeof name === "string" ? name.trim() : "";
    const trimmedCategory = typeof category === "string" ? category.trim() : "";

    if (!trimmedName || !trimmedCategory) {
      return res.status(400).json({ ok: false, error: "name and category are required." });
    }

    try {
      const [result] = await pool.query(
        `
        INSERT INTO food_products (name, category)
        VALUES (?, ?)
      `,
        [trimmedName, trimmedCategory]
      );

      return res.json({
        ok: true,
        food: {
          id: Number(result.insertId),
          name: trimmedName,
          category: trimmedCategory,
          createdAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error("POST /api/foods error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  // Delete food (cascades sessions/frame_logs/survey_results via FKs)
  app.delete("/api/foods/:foodId", async (req, res) => {
    const foodId = Number.parseInt(req.params.foodId, 10);
    if (!Number.isFinite(foodId)) {
      return res.status(400).json({ ok: false, error: "Invalid foodId." });
    }

    try {
      const [result] = await pool.query(`DELETE FROM food_products WHERE food_id = ?`, [foodId]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ ok: false, error: "Food not found." });
      }
      return res.json({ ok: true });
    } catch (err) {
      console.error("DELETE /api/foods/:foodId error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  // Sessions for a specific food (for "View Sessions" in dashboard)
  app.get("/api/foods/:foodId/sessions", async (req, res) => {
    const foodId = Number.parseInt(req.params.foodId, 10);
    if (!Number.isFinite(foodId)) {
      return res.status(400).json({ ok: false, error: "Invalid foodId." });
    }

    try {
      const [rows] = await pool.query(
        `
        SELECT
          s.session_id,
          s.user_id,
          s.start_time,
          s.end_time,
          s.status,
          COUNT(fl.frame_log_id) AS frames,
          AVG(fl.confidence_score) AS mean_confidence
        FROM sessions s
        LEFT JOIN frame_logs fl ON fl.session_id = s.session_id
        WHERE s.food_id = ?
        GROUP BY s.session_id, s.user_id, s.start_time, s.end_time, s.status
        ORDER BY COALESCE(s.start_time, s.created_at) DESC, s.session_id DESC
      `,
        [foodId]
      );

      const sessions = rows.map((r) => ({
        id: Number(r.session_id),
        userId: Number(r.user_id),
        startTime: toIsoOrNull(r.start_time),
        endTime: toIsoOrNull(r.end_time),
        status: r.status, // 'pending' | 'active' | 'completed' | 'cancelled'
        frames: Number(r.frames ?? 0),
        meanConfidence: r.mean_confidence == null ? null : Number(r.mean_confidence),
      }));

      return res.json({ ok: true, sessions });
    } catch (err) {
      console.error("GET /api/foods/:foodId/sessions error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  // Analytics for a specific food
  app.get("/api/foods/:foodId/analytics", async (req, res) => {
    const foodId = Number.parseInt(req.params.foodId, 10);
    if (!Number.isFinite(foodId)) {
      return res.status(400).json({ ok: false, error: "Invalid foodId." });
    }

    try {
      const [[confidenceRow]] = await pool.query(
        `
        SELECT AVG(fl.confidence_score) AS mean_confidence
        FROM frame_logs fl
        INNER JOIN sessions s ON s.session_id = fl.session_id
        WHERE s.food_id = ? AND fl.confidence_score IS NOT NULL
      `,
        [foodId]
      );

      const [[hedonicRow]] = await pool.query(
        `
        SELECT AVG(fl.hedonic_score) AS mean_hedonic
        FROM frame_logs fl
        INNER JOIN sessions s ON s.session_id = fl.session_id
        WHERE s.food_id = ? AND fl.hedonic_score IS NOT NULL
      `,
        [foodId]
      );

      const [[distRow]] = await pool.query(
        `
        SELECT
          SUM(CASE WHEN (fl.hedonic_score * 10) >= 7 THEN 1 ELSE 0 END) AS positive_count,
          SUM(CASE WHEN (fl.hedonic_score * 10) >= 5 AND (fl.hedonic_score * 10) < 7 THEN 1 ELSE 0 END) AS neutral_count,
          SUM(CASE WHEN (fl.hedonic_score * 10) < 5 THEN 1 ELSE 0 END) AS negative_count,
          COUNT(fl.frame_log_id) AS total_count
        FROM frame_logs fl
        INNER JOIN sessions s ON s.session_id = fl.session_id
        WHERE s.food_id = ? AND fl.hedonic_score IS NOT NULL
      `,
        [foodId]
      );

      const totalCount = Number(distRow?.total_count ?? 0);
      const pct = (n) => (totalCount === 0 ? 0 : Math.round((Number(n ?? 0) / totalCount) * 100));
      const distribution = [
        { label: "Positive (7-9)", value: pct(distRow?.positive_count), color: "#22c55e" },
        { label: "Neutral (5-6)", value: pct(distRow?.neutral_count), color: "#eab308" },
        { label: "Negative (1-4)", value: pct(distRow?.negative_count), color: "#ef4444" },
      ];
      // Fix rounding drift to keep a stable 100% in the UI.
      const drift = 100 - distribution.reduce((a, b) => a + b.value, 0);
      if (drift !== 0) distribution[0].value = Math.max(0, distribution[0].value + drift);

      const [[radarRow]] = await pool.query(
        `
        SELECT
          AVG(sr.color_rating) AS color_rating,
          AVG(sr.flavor_aroma_rating) AS flavor_aroma_rating,
          AVG(sr.salt_sweet_rating) AS salt_sweet_rating,
          AVG(sr.texture_rating) AS texture_rating,
          AVG(sr.final_overall_rating) AS final_overall_rating
        FROM survey_results sr
        INNER JOIN sessions s ON s.session_id = sr.session_id
        WHERE s.food_id = ?
      `,
        [foodId]
      );

      const to10 = (n) => (n == null ? null : (Number(n) / 9) * 10);
      const radar = [
        { label: "Color", score: to10(radarRow?.color_rating) ?? 0 },
        { label: "Flavor/Aroma", score: to10(radarRow?.flavor_aroma_rating) ?? 0 },
        { label: "Salt/Sweet", score: to10(radarRow?.salt_sweet_rating) ?? 0 },
        { label: "Texture", score: to10(radarRow?.texture_rating) ?? 0 },
        { label: "Overall", score: to10(radarRow?.final_overall_rating) ?? 0 },
      ];

      let timeline = [
        { label: "First taste", score: 0, sub: "Early" },
        { label: "Mid", score: 0, sub: "Middle" },
        { label: "Aftertaste", score: 0, sub: "Late" },
      ];
      try {
        const [timelineRows] = await pool.query(
          `
          WITH fl AS (
            SELECT fl.hedonic_score, fl.timestamp
            FROM frame_logs fl
            INNER JOIN sessions s ON s.session_id = fl.session_id
            WHERE s.food_id = ? AND fl.hedonic_score IS NOT NULL
          ),
          bucketed AS (
            SELECT hedonic_score, NTILE(3) OVER (ORDER BY timestamp) AS bucket
            FROM fl
          )
          SELECT bucket, AVG(hedonic_score) AS avg_score
          FROM bucketed
          GROUP BY bucket
          ORDER BY bucket
        `,
          [foodId]
        );

        const byBucket = new Map(timelineRows.map((r) => [Number(r.bucket), Number(r.avg_score)]));
        timeline = [
          { label: "First taste", score: (byBucket.get(1) ?? 0) * 10, sub: "Early" },
          { label: "Mid", score: (byBucket.get(2) ?? 0) * 10, sub: "Middle" },
          { label: "Aftertaste", score: (byBucket.get(3) ?? 0) * 10, sub: "Late" },
        ];
      } catch (err) {
        // If NTILE/WITH isn't supported, keep timeline as zeros.
        console.warn("Timeline query not supported, using zeros:", err?.message ?? err);
      }

      const [ageRows] = await pool.query(
        `
        SELECT
          CASE
            WHEN sr.age BETWEEN 18 AND 25 THEN '18–25'
            WHEN sr.age BETWEEN 26 AND 40 THEN '26–40'
            WHEN sr.age BETWEEN 41 AND 60 THEN '41–60'
            WHEN sr.age >= 61 THEN '61+'
            ELSE 'Unknown'
          END AS age_group,
          AVG(sr.final_overall_rating) AS avg_rating
        FROM survey_results sr
        INNER JOIN sessions s ON s.session_id = sr.session_id
        WHERE s.food_id = ?
        GROUP BY age_group
      `,
        [foodId]
      );

      const [genderRows] = await pool.query(
        `
        SELECT
          COALESCE(sr.gender, 'other') AS gender,
          AVG(sr.final_overall_rating) AS avg_rating
        FROM survey_results sr
        INNER JOIN sessions s ON s.session_id = sr.session_id
        WHERE s.food_id = ?
        GROUP BY gender
      `,
        [foodId]
      );

      const byAge = ageRows
        .filter((r) => r.age_group !== "Unknown")
        .map((r) => ({ label: r.age_group, score: to10(r.avg_rating) ?? 0 }));

      const byGender = genderRows.map((r) => ({
        label: String(r.gender).charAt(0).toUpperCase() + String(r.gender).slice(1),
        score: to10(r.avg_rating) ?? 0,
      }));

      return res.json({
        ok: true,
        analytics: {
          meanConfidence: confidenceRow?.mean_confidence == null ? 0 : Number(confidenceRow.mean_confidence),
          // hedonic_score is stored 0..1 in frame_logs; scale to 0..10 for the dashboard.
          meanHedonic: hedonicRow?.mean_hedonic == null ? 0 : Number(hedonicRow.mean_hedonic) * 10,
          distribution,
          radar,
          timeline,
          byAge,
          byGender,
          sampleSize: totalCount,
        },
      });
    } catch (err) {
      console.error("GET /api/foods/:foodId/analytics error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  // Start a new session for a given food/user (used by Camera Setup)
  app.post("/api/sessions/start", async (req, res) => {
    const { userId, foodId } = req.body ?? {};
    const uId = Number.parseInt(String(userId ?? ""), 10);
    const fId = Number.parseInt(String(foodId ?? ""), 10);

    if (!Number.isFinite(uId) || !Number.isFinite(fId)) {
      return res.status(400).json({ ok: false, error: "userId and foodId are required." });
    }

    try {
      const [result] = await pool.query(
        `
        INSERT INTO sessions (user_id, food_id, start_time, status)
        VALUES (?, ?, NOW(), 'active')
      `,
        [uId, fId]
      );

      return res.json({
        ok: true,
        session: {
          id: Number(result.insertId),
          userId: uId,
          foodId: fId,
          status: "active",
          startTime: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error("POST /api/sessions/start error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  // Get a session + its food (used by Camera Session UI)
  app.get("/api/sessions/:sessionId", async (req, res) => {
    const sessionId = Number.parseInt(req.params.sessionId, 10);
    if (!Number.isFinite(sessionId)) {
      return res.status(400).json({ ok: false, error: "Invalid sessionId." });
    }

    try {
      const [rows] = await pool.query(
        `
        SELECT
          s.session_id,
          s.user_id,
          s.food_id,
          s.status,
          s.start_time,
          s.end_time,
          fp.name AS food_name,
          fp.category AS food_category
        FROM sessions s
        LEFT JOIN food_products fp ON fp.food_id = s.food_id
        WHERE s.session_id = ?
        LIMIT 1
      `,
        [sessionId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ ok: false, error: "Session not found." });
      }

      const r = rows[0];

      return res.json({
        ok: true,
        session: {
          id: Number(r.session_id),
          userId: Number(r.user_id),
          foodId: Number(r.food_id),
          status: r.status,
          startTime: toIsoOrNull(r.start_time),
          endTime: toIsoOrNull(r.end_time),
        },
        food: r.food_name
          ? {
              id: Number(r.food_id),
              name: String(r.food_name),
              category: String(r.food_category ?? ""),
            }
          : null,
      });
    } catch (err) {
      console.error("GET /api/sessions/:sessionId error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  // Full session detail for the results page (frame logs, system logs, survey results)
  app.get("/api/sessions/:sessionId/details", async (req, res) => {
    const sessionId = Number.parseInt(req.params.sessionId, 10);
    if (!Number.isFinite(sessionId)) {
      return res.status(400).json({ ok: false, error: "Invalid sessionId." });
    }

    try {
      const [[sessionRow]] = await pool.query(
        `
        SELECT
          s.session_id,
          s.user_id,
          s.food_id,
          s.status,
          s.start_time,
          s.end_time,
          fp.name AS food_name,
          fp.category AS food_category
        FROM sessions s
        LEFT JOIN food_products fp ON fp.food_id = s.food_id
        WHERE s.session_id = ?
        LIMIT 1
        `,
        [sessionId]
      );

      if (!sessionRow) {
        return res.status(404).json({ ok: false, error: "Session not found." });
      }

      const [[frameStatsRow]] = await pool.query(
        `
        SELECT
          COUNT(*) AS total_frames,
          AVG(confidence_score) AS mean_confidence,
          AVG(hedonic_score) AS mean_hedonic
        FROM frame_logs
        WHERE session_id = ?
        `,
        [sessionId]
      );

      const [frameRows] = await pool.query(
        `
        SELECT
          timestamp,
          face_detected,
          confidence_score,
          hedonic_score
        FROM frame_logs
        WHERE session_id = ?
        ORDER BY timestamp ASC
        `,
        [sessionId]
      );

      const [systemRows] = await pool.query(
        `
        SELECT
          log_type,
          message,
          created_at
        FROM system_logs
        WHERE session_id = ?
        ORDER BY created_at ASC
        `,
        [sessionId]
      );

      const [[surveyRow]] = await pool.query(
        `
        SELECT
          age,
          gender,
          color_rating,
          flavor_aroma_rating,
          salt_sweet_rating,
          texture_rating,
          final_overall_rating,
          remarks
        FROM survey_results
        WHERE session_id = ?
        LIMIT 1
        `,
        [sessionId]
      );

      return res.json({
        ok: true,
        session: {
          id: Number(sessionRow.session_id),
          userId: Number(sessionRow.user_id),
          foodId: Number(sessionRow.food_id),
          status: sessionRow.status,
          startTime: toIsoOrNull(sessionRow.start_time),
          endTime: toIsoOrNull(sessionRow.end_time),
        },
        food: sessionRow.food_name
          ? {
              id: Number(sessionRow.food_id),
              name: String(sessionRow.food_name),
              category: String(sessionRow.food_category ?? ""),
            }
          : null,
        metrics: {
          totalFrames: Number(frameStatsRow?.total_frames ?? 0),
          meanConfidence:
            frameStatsRow?.mean_confidence == null ? null : Number(frameStatsRow.mean_confidence),
          // hedonic_score is stored 0..1 in frame_logs; convert to 0..1, then the frontend scales to /10.
          meanHedonic: frameStatsRow?.mean_hedonic == null ? null : Number(frameStatsRow.mean_hedonic),
        },
        frameLogs: (frameRows ?? []).map((r) => ({
          timestamp: toIsoOrNull(r.timestamp),
          faceDetected: r.face_detected == null ? null : Boolean(r.face_detected),
          confidenceScore: r.confidence_score == null ? null : Number(r.confidence_score),
          hedonicScore: r.hedonic_score == null ? null : Number(r.hedonic_score),
        })),
        systemLogs: (systemRows ?? []).map((r) => ({
          logType: r.log_type,
          message: String(r.message ?? ""),
          createdAt: toIsoOrNull(r.created_at),
        })),
        surveyResults: surveyRow
          ? {
              age: surveyRow.age == null ? null : Number(surveyRow.age),
              gender: surveyRow.gender == null ? null : String(surveyRow.gender),
              colorRating: surveyRow.color_rating == null ? null : Number(surveyRow.color_rating),
              flavorAromaRating:
                surveyRow.flavor_aroma_rating == null ? null : Number(surveyRow.flavor_aroma_rating),
              saltSweetRating:
                surveyRow.salt_sweet_rating == null ? null : Number(surveyRow.salt_sweet_rating),
              textureRating:
                surveyRow.texture_rating == null ? null : Number(surveyRow.texture_rating),
              finalOverallRating:
                surveyRow.final_overall_rating == null ? null : Number(surveyRow.final_overall_rating),
              remarks: surveyRow.remarks == null ? null : String(surveyRow.remarks),
            }
          : null,
      });
    } catch (err) {
      console.error("GET /api/sessions/:sessionId/details error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  // Stop an active session (used by Stop Recording -> Survey)
  app.post("/api/sessions/:sessionId/stop", async (req, res) => {
    const sessionId = Number.parseInt(req.params.sessionId, 10);
    if (!Number.isFinite(sessionId)) {
      return res.status(400).json({ ok: false, error: "Invalid sessionId." });
    }

    try {
      const [result] = await pool.query(
        `
        UPDATE sessions
        SET end_time = NOW(),
            status = 'completed'
        WHERE session_id = ?
      `,
        [sessionId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ ok: false, error: "Session not found." });
      }

      // Fetch the updated row to return to the client
      const [[row]] = await pool.query(
        `
        SELECT
          session_id,
          user_id,
          food_id,
          status,
          start_time,
          end_time
        FROM sessions
        WHERE session_id = ?
        LIMIT 1
      `,
        [sessionId]
      );

      return res.json({
        ok: true,
        session: {
          id: Number(row.session_id),
          userId: Number(row.user_id),
          foodId: Number(row.food_id),
          status: row.status,
          startTime: toIsoOrNull(row.start_time),
          endTime: toIsoOrNull(row.end_time),
        },
      });
    } catch (err) {
      console.error("POST /api/sessions/:sessionId/stop error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  // Submit survey results for a session (one row per session via UNIQUE(session_id))
  app.post("/api/sessions/:sessionId/survey", async (req, res) => {
    const sessionId = Number.parseInt(req.params.sessionId, 10);
    if (!Number.isFinite(sessionId)) {
      return res.status(400).json({ ok: false, error: "Invalid sessionId." });
    }

    const {
      age,
      gender,
      colorRating,
      flavorAromaRating,
      saltSweetRating,
      textureRating,
      finalOverallRating,
      remarks,
    } = req.body ?? {};

    const toIntOrNull = (v) => {
      if (v == null || v === "") return null;
      const n = Number(v);
      if (!Number.isFinite(n)) return null;
      return Math.round(n);
    };

    const toTrimmedOrNull = (v) => {
      if (typeof v !== "string") return null;
      const t = v.trim();
      return t.length ? t : null;
    };

    const allowedGenders = new Set(["male", "female", "other"]);
    const ageInt = toIntOrNull(age);

    if (ageInt != null && (ageInt < 0 || ageInt > 120)) {
      return res.status(400).json({ ok: false, error: "age must be between 0 and 120." });
    }

    const genderVal = gender == null ? null : String(gender);
    if (genderVal != null && !allowedGenders.has(genderVal)) {
      return res.status(400).json({ ok: false, error: "gender must be male, female, or other." });
    }

    const colorInt = toIntOrNull(colorRating);
    const flavorInt = toIntOrNull(flavorAromaRating);
    const saltInt = toIntOrNull(saltSweetRating);
    const textureInt = toIntOrNull(textureRating);
    const finalInt = toIntOrNull(finalOverallRating);

    // Require all five ratings from the UI (matches the form design).
    if (
      colorInt == null ||
      flavorInt == null ||
      saltInt == null ||
      textureInt == null ||
      finalInt == null
    ) {
      return res.status(400).json({
        ok: false,
        error: "All ratings (Color, Flavor/Aroma, Salt/Sweet, Texture, Overall) are required.",
      });
    }

    // Basic range check (DB also enforces 1..9).
    for (const [k, n] of [
      ["colorRating", colorInt],
      ["flavorAromaRating", flavorInt],
      ["saltSweetRating", saltInt],
      ["textureRating", textureInt],
      ["finalOverallRating", finalInt],
    ]) {
      if (n < 1 || n > 9) {
        return res.status(400).json({ ok: false, error: `${k} must be between 1 and 9.` });
      }
    }

    const remarksVal = toTrimmedOrNull(remarks);

    try {
      const [[sessionRow]] = await pool.query(
        `SELECT session_id FROM sessions WHERE session_id = ? LIMIT 1`,
        [sessionId]
      );

      if (!sessionRow) {
        return res.status(404).json({ ok: false, error: "Session not found." });
      }

      // Ensure the session is marked completed even if stop endpoint wasn't called.
      await pool.query(
        `
        UPDATE sessions
        SET status = 'completed',
            end_time = COALESCE(end_time, NOW())
        WHERE session_id = ?
      `,
        [sessionId]
      );

      await pool.query(
        `
        INSERT INTO survey_results (
          session_id, age, gender,
          color_rating, flavor_aroma_rating, salt_sweet_rating,
          texture_rating, final_overall_rating,
          remarks
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          age = VALUES(age),
          gender = VALUES(gender),
          color_rating = VALUES(color_rating),
          flavor_aroma_rating = VALUES(flavor_aroma_rating),
          salt_sweet_rating = VALUES(salt_sweet_rating),
          texture_rating = VALUES(texture_rating),
          final_overall_rating = VALUES(final_overall_rating),
          remarks = VALUES(remarks)
      `,
        [
          sessionId,
          ageInt,
          genderVal,
          colorInt,
          flavorInt,
          saltInt,
          textureInt,
          finalInt,
          remarksVal,
        ]
      );

      return res.json({ ok: true, sessionId });
    } catch (err) {
      console.error("POST /api/sessions/:sessionId/survey error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  const port = process.env.PORT || 5000;
  app.listen(port, () => {
    console.log(`API server listening on http://localhost:${port}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

