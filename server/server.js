import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { initDb } from "./init.js";
import multer from "multer";
import { mkdir, readFile, unlink } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json());

let poolPromise = null;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.resolve(__dirname, "uploads");
const foodUploadsDir = path.join(uploadsRoot, "foods");
const frameLogsRoot = path.join(uploadsRoot, "frame_logs");
await mkdir(foodUploadsDir, { recursive: true });
await mkdir(frameLogsRoot, { recursive: true });

const EMOTION_SERVICE_URL = (process.env.EMOTION_SERVICE_URL || "http://127.0.0.1:8765").replace(/\/$/, "");

const JWT_SECRET = process.env.JWT_SECRET || "familis-dev-secret-change-me";
const TOKEN_TTL = process.env.JWT_TTL || "8h";

// `staff` is treated as admin-equivalent across the app (legacy role).
function isAdminRole(role) {
  return role === "admin" || role === "staff";
}

function signToken(user) {
  return jwt.sign(
    { userId: user.id, role: user.role, email: user.email, username: user.username },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

// Public API paths (relative to the /api mount) that skip authentication.
const PUBLIC_API_PATHS = new Set(["/login", "/health"]);

function requireAuth(req, res, next) {
  if (PUBLIC_API_PATHS.has(req.path)) return next();
  const header = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    return res.status(401).json({ ok: false, error: "Authentication required." });
  }
  try {
    const payload = jwt.verify(match[1], JWT_SECRET);
    req.user = {
      id: payload.userId,
      role: payload.role,
      email: payload.email,
      username: payload.username,
    };
    return next();
  } catch {
    return res.status(401).json({ ok: false, error: "Invalid or expired token." });
  }
}

function requireRole(...roles) {
  const allowed = new Set(roles);
  return (req, res, next) => {
    const role = req.user?.role;
    if (!role) return res.status(401).json({ ok: false, error: "Authentication required." });
    if (allowed.has(role) || (allowed.has("admin") && role === "staff")) {
      return next();
    }
    return res.status(403).json({ ok: false, error: "Insufficient permissions." });
  };
}

/** Exact role match — no staff→admin alias. Use for admin-only user management. */
function requireExactRole(...roles) {
  const allowed = new Set(roles);
  return (req, res, next) => {
    const role = req.user?.role;
    if (!role) return res.status(401).json({ ok: false, error: "Authentication required." });
    if (allowed.has(role)) return next();
    return res.status(403).json({ ok: false, error: "Insufficient permissions." });
  };
}

const USER_ROLES = new Set(["admin", "staff", "tester"]);
const MIN_PASSWORD_LEN = 6;

function mapUserRow(row) {
  return {
    id: row.user_id,
    username: row.username,
    email: row.email,
    role: row.role,
    createdAt: row.created_at ?? null,
    lastLogin: row.last_login ?? null,
    isActive: row.is_active === 0 || row.is_active === false ? false : true,
  };
}

async function clearEmotionHistory(sessionId) {
  try {
    await fetch(`${EMOTION_SERVICE_URL}/session/${encodeURIComponent(String(sessionId))}/history`, {
      method: "DELETE",
    });
  } catch {
    /* Python emotion service is optional at runtime */
  }
}

const foodStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, foodUploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext) ? ext : ".jpg";
    cb(null, `food-${req.params.foodId}-${Date.now()}${safeExt}`);
  },
});

const uploadFoodImage = multer({
  storage: foodStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype?.startsWith("image/")) {
      cb(new Error("Only image uploads are supported."));
      return;
    }
    cb(null, true);
  },
});

const frameUploadStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    cb(null, req._frameDir);
  },
  filename: (_req, _file, cb) => {
    cb(null, `frame_${Date.now()}.jpg`);
  },
});

const uploadSessionFrame = multer({
  storage: frameUploadStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype?.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image uploads are supported."));
    }
  },
}).single("frame");

app.use("/uploads", express.static(uploadsRoot));

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

  function mapFrameLogRow(r) {
    return {
      frameLogId: Number(r.frame_log_id),
      timestamp: toIsoOrNull(r.timestamp),
      faceDetected: r.face_detected == null ? null : Boolean(r.face_detected),
      confidenceScore: r.confidence_score == null ? null : Number(r.confidence_score),
      hedonicScore: r.hedonic_score == null ? null : Number(r.hedonic_score),
      frameImageUrl: r.frame_image_url == null ? null : String(r.frame_image_url),
    };
  }

  async function getSessionFrameMetrics(sessionId) {
    const [[row]] = await pool.query(
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
    return {
      totalFrames: Number(row?.total_frames ?? 0),
      meanConfidence: row?.mean_confidence == null ? null : Number(row.mean_confidence),
      meanHedonic: row?.mean_hedonic == null ? null : Number(row.mean_hedonic),
    };
  }

  function parseOptionalScore01(value, fieldName) {
    if (value === null) return { ok: true, value: null };
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return { ok: false, error: `${fieldName} must be a number between 0 and 1, or null.` };
    }
    if (value < 0 || value > 1) {
      return { ok: false, error: `${fieldName} must be between 0 and 1.` };
    }
    return { ok: true, value };
  }

  async function unlinkFrameImage(frameImageUrl) {
    if (!frameImageUrl) return;
    const url = String(frameImageUrl);
    const rel = url.startsWith("/uploads/") ? url.slice("/uploads/".length) : null;
    if (!rel) return;
    try {
      await unlink(path.join(uploadsRoot, rel));
    } catch {
      /* file may already be missing */
    }
  }

  // Resilient system log writer — failures never bubble up to the caller.
  async function writeSystemLog(p, { sessionId, logType, message }) {
    try {
      await p.query(
        `INSERT INTO system_logs (session_id, log_type, message) VALUES (?, ?, ?)`,
        [sessionId ?? null, logType, message]
      );
    } catch (err) {
      console.warn("writeSystemLog failed:", err?.message || err);
    }
  }

  // Per-session throttle map for inference-error logs to avoid one row per frame.
  const inferenceLogThrottle = new Map();
  const INFERENCE_LOG_THROTTLE_MS = 60_000;

  const allowedSessionStatuses = new Set(["pending", "active", "completed", "cancelled"]);

  async function prepareSessionFrameUpload(req, res, next) {
    const sessionId = Number.parseInt(req.params.sessionId, 10);
    if (!Number.isFinite(sessionId)) {
      return res.status(400).json({ ok: false, error: "Invalid sessionId." });
    }
    req._frameSessionId = sessionId;
    req._frameDir = path.join(frameLogsRoot, String(sessionId));
    try {
      await mkdir(req._frameDir, { recursive: true });
      return next();
    } catch (err) {
      console.error("prepareSessionFrameUpload:", err);
      return res.status(500).json({ ok: false, error: "Could not prepare upload directory." });
    }
  }

  // Gate every /api/* route except login and health (see PUBLIC_API_PATHS).
  app.use("/api", requireAuth);

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
        SELECT user_id, username, email, password_hash, role, is_active
        FROM users
        WHERE email = ?
      `,
        [email]
      );

      if (rows.length === 0) {
        return res.status(401).json({ ok: false, error: "Invalid email or password." });
      }

      const user = rows[0];
      if (user.is_active === 0 || user.is_active === false) {
        return res.status(401).json({ ok: false, error: "This account is deactivated." });
      }

      const stored = user.password_hash;

      const isBcrypt =
        typeof stored === "string" && /^\$2[aby]\$\d{2}\$/.test(stored);

      let passwordOk = false;
      if (isBcrypt) {
        passwordOk = await bcrypt.compare(password, stored);
      } else if (stored === password) {
        // Legacy plain-text row: migrate in place on first successful login.
        passwordOk = true;
        try {
          const newHash = await bcrypt.hash(password, 10);
          await pool.query("UPDATE users SET password_hash = ? WHERE user_id = ?", [
            newHash,
            user.user_id,
          ]);
        } catch (migrateErr) {
          console.error("Password hash migration failed:", migrateErr);
        }
      }

      if (!passwordOk) {
        return res.status(401).json({ ok: false, error: "Invalid email or password." });
      }

      try {
        await pool.query("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE user_id = ?", [
          user.user_id,
        ]);
      } catch {
        /* non-fatal */
      }

      const safeUser = {
        id: user.user_id,
        username: user.username,
        email: user.email,
        role: user.role,
      };

      return res.json({
        ok: true,
        user: safeUser,
        token: signToken(safeUser),
      });
    } catch (err) {
      console.error("Login error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  // ── Admin user management (exact admin only; no staff alias) ──────────────

  app.get("/api/users", requireExactRole("admin"), async (_req, res) => {
    try {
      const [rows] = await pool.query(
        `
        SELECT user_id, username, email, role, created_at, last_login, is_active
        FROM users
        ORDER BY created_at DESC, user_id DESC
      `
      );
      return res.json({ ok: true, users: rows.map(mapUserRow) });
    } catch (err) {
      console.error("GET /api/users error:", err);
      return res.status(500).json({ ok: false, error: "Failed to load users." });
    }
  });

  app.post("/api/users", requireExactRole("admin"), async (req, res) => {
    const { email, username, password, role } = req.body ?? {};
    const emailTrim = typeof email === "string" ? email.trim() : "";
    const usernameTrim = typeof username === "string" ? username.trim() : "";
    const passwordStr = typeof password === "string" ? password : "";
    const roleStr = typeof role === "string" ? role.trim() : "";

    if (!emailTrim || !usernameTrim || !passwordStr) {
      return res.status(400).json({
        ok: false,
        error: "Email, username, and password are required.",
      });
    }
    if (passwordStr.length < MIN_PASSWORD_LEN) {
      return res.status(400).json({
        ok: false,
        error: `Password must be at least ${MIN_PASSWORD_LEN} characters.`,
      });
    }
    if (!USER_ROLES.has(roleStr)) {
      return res.status(400).json({
        ok: false,
        error: "Role must be admin, staff, or tester.",
      });
    }

    try {
      const passwordHash = await bcrypt.hash(passwordStr, 10);
      const [result] = await pool.query(
        `
        INSERT INTO users (username, email, password_hash, role, is_active)
        VALUES (?, ?, ?, ?, 1)
      `,
        [usernameTrim, emailTrim, passwordHash, roleStr]
      );

      const [rows] = await pool.query(
        `
        SELECT user_id, username, email, role, created_at, last_login, is_active
        FROM users
        WHERE user_id = ?
      `,
        [result.insertId]
      );

      return res.status(201).json({ ok: true, user: mapUserRow(rows[0]) });
    } catch (err) {
      if (err?.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ ok: false, error: "Email already in use." });
      }
      console.error("POST /api/users error:", err);
      return res.status(500).json({ ok: false, error: "Failed to create user." });
    }
  });

  app.patch("/api/users/:id", requireExactRole("admin"), async (req, res) => {
    const userId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ ok: false, error: "Invalid user id." });
    }

    const body = req.body ?? {};
    const hasRole = Object.prototype.hasOwnProperty.call(body, "role");
    const hasIsActive = Object.prototype.hasOwnProperty.call(body, "isActive");
    const hasPassword = Object.prototype.hasOwnProperty.call(body, "password");
    const hasUsername = Object.prototype.hasOwnProperty.call(body, "username");
    const hasEmail = Object.prototype.hasOwnProperty.call(body, "email");

    if (!hasRole && !hasIsActive && !hasPassword && !hasUsername && !hasEmail) {
      return res.status(400).json({
        ok: false,
        error: "Provide username, email, role, isActive, and/or password to update.",
      });
    }

    const actorId = req.user?.id;
    const isSelf = actorId != null && Number(actorId) === userId;

    try {
      const [existingRows] = await pool.query(
        `
        SELECT user_id, username, email, role, created_at, last_login, is_active
        FROM users
        WHERE user_id = ?
      `,
        [userId]
      );
      if (existingRows.length === 0) {
        return res.status(404).json({ ok: false, error: "User not found." });
      }
      const existing = existingRows[0];

      let nextUsername = existing.username;
      if (hasUsername) {
        const usernameTrim = typeof body.username === "string" ? body.username.trim() : "";
        if (!usernameTrim) {
          return res.status(400).json({ ok: false, error: "Username is required." });
        }
        nextUsername = usernameTrim;
      }

      let nextEmail = existing.email;
      if (hasEmail) {
        const emailTrim = typeof body.email === "string" ? body.email.trim() : "";
        if (!emailTrim) {
          return res.status(400).json({ ok: false, error: "Email is required." });
        }
        nextEmail = emailTrim;
      }

      let nextRole = existing.role;
      if (hasRole) {
        const roleStr = typeof body.role === "string" ? body.role.trim() : "";
        if (!USER_ROLES.has(roleStr)) {
          return res.status(400).json({
            ok: false,
            error: "Role must be admin, staff, or tester.",
          });
        }
        if (isSelf && roleStr !== "admin") {
          return res.status(400).json({
            ok: false,
            error: "You cannot change your own role.",
          });
        }
        nextRole = roleStr;
      }

      let nextActive = existing.is_active === 0 || existing.is_active === false ? 0 : 1;
      if (hasIsActive) {
        if (typeof body.isActive !== "boolean") {
          return res.status(400).json({ ok: false, error: "isActive must be a boolean." });
        }
        if (isSelf && body.isActive === false) {
          return res.status(400).json({
            ok: false,
            error: "You cannot deactivate your own account.",
          });
        }
        nextActive = body.isActive ? 1 : 0;
      }

      // Block demoting/deactivating the last active admin.
      const wasActiveAdmin =
        existing.role === "admin" && !(existing.is_active === 0 || existing.is_active === false);
      const willBeActiveAdmin = nextRole === "admin" && nextActive === 1;
      if (wasActiveAdmin && !willBeActiveAdmin) {
        const [adminCountRows] = await pool.query(
          `
          SELECT COUNT(*) AS n
          FROM users
          WHERE role = 'admin' AND is_active = 1 AND user_id != ?
        `,
          [userId]
        );
        if (Number(adminCountRows[0]?.n ?? 0) < 1) {
          return res.status(400).json({
            ok: false,
            error: "Cannot remove the last active admin.",
          });
        }
      }

      let passwordHash = null;
      if (hasPassword) {
        const passwordStr = typeof body.password === "string" ? body.password : "";
        if (!passwordStr || passwordStr.length < MIN_PASSWORD_LEN) {
          return res.status(400).json({
            ok: false,
            error: `Password must be at least ${MIN_PASSWORD_LEN} characters.`,
          });
        }
        passwordHash = await bcrypt.hash(passwordStr, 10);
      }

      const sets = [];
      const params = [];
      if (hasUsername) {
        sets.push("username = ?");
        params.push(nextUsername);
      }
      if (hasEmail) {
        sets.push("email = ?");
        params.push(nextEmail);
      }
      if (hasRole) {
        sets.push("role = ?");
        params.push(nextRole);
      }
      if (hasIsActive) {
        sets.push("is_active = ?");
        params.push(nextActive);
      }
      if (passwordHash) {
        sets.push("password_hash = ?");
        params.push(passwordHash);
      }
      params.push(userId);

      await pool.query(`UPDATE users SET ${sets.join(", ")} WHERE user_id = ?`, params);

      const [rows] = await pool.query(
        `
        SELECT user_id, username, email, role, created_at, last_login, is_active
        FROM users
        WHERE user_id = ?
      `,
        [userId]
      );

      return res.json({ ok: true, user: mapUserRow(rows[0]) });
    } catch (err) {
      if (err?.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ ok: false, error: "Email already in use." });
      }
      console.error("PATCH /api/users/:id error:", err);
      return res.status(500).json({ ok: false, error: "Failed to update user." });
    }
  });

  app.get("/api/participants", async (_req, res) => {
    try {
      const [rows] = await pool.query(
        `
        SELECT participant_id, tester_label, age, gender, created_at
        FROM participants
        ORDER BY created_at DESC, participant_id DESC
      `
      );
      return res.json({
        ok: true,
        participants: rows.map((r) => ({
          id: Number(r.participant_id),
          testerLabel: r.tester_label == null ? null : String(r.tester_label),
          age: r.age == null ? null : Number(r.age),
          gender: r.gender == null ? null : String(r.gender),
          createdAt: toIsoOrNull(r.created_at),
        })),
      });
    } catch (err) {
      console.error("GET /api/participants error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  app.post("/api/participants", async (req, res) => {
    const rawLabel = req.body?.testerLabel;
    const testerLabel = typeof rawLabel === "string" ? rawLabel.trim() : "";
    const ageRaw = req.body?.age;
    const genderRaw = req.body?.gender;
    // Participants UI "Add" sends createOnly so duplicate labels 409 instead of upserting.
    // Setup omits this flag and keeps the existing reuse-by-label behavior.
    const createOnly = req.body?.createOnly === true;
    if (!testerLabel) {
      return res.status(400).json({ ok: false, error: "testerLabel is required." });
    }
    const age =
      ageRaw == null || ageRaw === ""
        ? null
        : Number.isFinite(Number(ageRaw))
          ? Math.round(Number(ageRaw))
          : null;
    if (age != null && (age < 0 || age > 120)) {
      return res.status(400).json({ ok: false, error: "age must be between 0 and 120." });
    }
    const allowedGenders = new Set(["male", "female", "other"]);
    const gender = genderRaw == null || genderRaw === "" ? null : String(genderRaw);
    if (gender != null && !allowedGenders.has(gender)) {
      return res.status(400).json({ ok: false, error: "gender must be male, female, or other." });
    }

    try {
      const [[existing]] = await pool.query(
        `
        SELECT participant_id, tester_label, age, gender, created_at
        FROM participants
        WHERE tester_label = ?
        LIMIT 1
      `,
        [testerLabel]
      );

      if (existing) {
        if (createOnly) {
          return res.status(409).json({
            ok: false,
            error: "A participant with this label already exists.",
          });
        }
        await pool.query(
          `
          UPDATE participants
          SET age = COALESCE(?, age),
              gender = COALESCE(?, gender)
          WHERE participant_id = ?
        `,
          [age, gender, Number(existing.participant_id)]
        );
        const [[updated]] = await pool.query(
          `
          SELECT participant_id, tester_label, age, gender, created_at
          FROM participants
          WHERE participant_id = ?
          LIMIT 1
        `,
          [Number(existing.participant_id)]
        );
        return res.json({
          ok: true,
          participant: {
            id: Number(updated.participant_id),
            testerLabel: updated.tester_label == null ? null : String(updated.tester_label),
            age: updated.age == null ? null : Number(updated.age),
            gender: updated.gender == null ? null : String(updated.gender),
            createdAt: toIsoOrNull(updated.created_at),
          },
          reused: true,
        });
      }

      const [result] = await pool.query(
        `INSERT INTO participants (tester_label, age, gender) VALUES (?, ?, ?)`,
        [testerLabel, age, gender]
      );
      return res.json({
        ok: true,
        participant: {
          id: Number(result.insertId),
          testerLabel,
          age,
          gender,
          createdAt: new Date().toISOString(),
        },
        reused: false,
      });
    } catch (err) {
      console.error("POST /api/participants error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  // Update demographics from Participants management UI (admin/staff).
  app.patch("/api/participants/:participantId", requireRole("admin", "staff"), async (req, res) => {
    const participantId = Number.parseInt(req.params.participantId, 10);
    if (!Number.isFinite(participantId)) {
      return res.status(400).json({ ok: false, error: "Invalid participantId." });
    }

    const hasLabel = Object.prototype.hasOwnProperty.call(req.body ?? {}, "testerLabel");
    const hasAge = Object.prototype.hasOwnProperty.call(req.body ?? {}, "age");
    const hasGender = Object.prototype.hasOwnProperty.call(req.body ?? {}, "gender");
    if (!hasLabel && !hasAge && !hasGender) {
      return res.status(400).json({ ok: false, error: "Provide testerLabel, age, and/or gender." });
    }

    let testerLabel = undefined;
    if (hasLabel) {
      const rawLabel = req.body?.testerLabel;
      testerLabel = typeof rawLabel === "string" ? rawLabel.trim() : "";
      if (!testerLabel) {
        return res.status(400).json({ ok: false, error: "testerLabel cannot be empty." });
      }
    }

    let age = undefined;
    if (hasAge) {
      const ageRaw = req.body?.age;
      age =
        ageRaw == null || ageRaw === ""
          ? null
          : Number.isFinite(Number(ageRaw))
            ? Math.round(Number(ageRaw))
            : null;
      if (ageRaw != null && ageRaw !== "" && age == null) {
        return res.status(400).json({ ok: false, error: "age must be a number between 0 and 120." });
      }
      if (age != null && (age < 0 || age > 120)) {
        return res.status(400).json({ ok: false, error: "age must be between 0 and 120." });
      }
    }

    let gender = undefined;
    if (hasGender) {
      const genderRaw = req.body?.gender;
      const allowedGenders = new Set(["male", "female", "other"]);
      gender = genderRaw == null || genderRaw === "" ? null : String(genderRaw);
      if (gender != null && !allowedGenders.has(gender)) {
        return res.status(400).json({ ok: false, error: "gender must be male, female, or other." });
      }
    }

    try {
      const [[existing]] = await pool.query(
        `
        SELECT participant_id, tester_label, age, gender, created_at
        FROM participants
        WHERE participant_id = ?
        LIMIT 1
      `,
        [participantId]
      );
      if (!existing) {
        return res.status(404).json({ ok: false, error: "Participant not found." });
      }

      if (testerLabel != null) {
        const [[dup]] = await pool.query(
          `
          SELECT participant_id
          FROM participants
          WHERE tester_label = ? AND participant_id <> ?
          LIMIT 1
        `,
          [testerLabel, participantId]
        );
        if (dup) {
          return res.status(409).json({
            ok: false,
            error: "A participant with this label already exists.",
          });
        }
      }

      const nextLabel = testerLabel !== undefined ? testerLabel : existing.tester_label;
      const nextAge = age !== undefined ? age : existing.age;
      const nextGender = gender !== undefined ? gender : existing.gender;

      await pool.query(
        `
        UPDATE participants
        SET tester_label = ?, age = ?, gender = ?
        WHERE participant_id = ?
      `,
        [nextLabel, nextAge, nextGender, participantId]
      );

      const [[updated]] = await pool.query(
        `
        SELECT participant_id, tester_label, age, gender, created_at
        FROM participants
        WHERE participant_id = ?
        LIMIT 1
      `,
        [participantId]
      );

      return res.json({
        ok: true,
        participant: {
          id: Number(updated.participant_id),
          testerLabel: updated.tester_label == null ? null : String(updated.tester_label),
          age: updated.age == null ? null : Number(updated.age),
          gender: updated.gender == null ? null : String(updated.gender),
          createdAt: toIsoOrNull(updated.created_at),
        },
      });
    } catch (err) {
      console.error("PATCH /api/participants/:participantId error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  // Hard-delete participant; sessions/consent unlink via ON DELETE SET NULL.
  app.delete("/api/participants/:participantId", requireRole("admin", "staff"), async (req, res) => {
    const participantId = Number.parseInt(req.params.participantId, 10);
    if (!Number.isFinite(participantId)) {
      return res.status(400).json({ ok: false, error: "Invalid participantId." });
    }

    try {
      const [[existing]] = await pool.query(
        `SELECT participant_id FROM participants WHERE participant_id = ? LIMIT 1`,
        [participantId]
      );
      if (!existing) {
        return res.status(404).json({ ok: false, error: "Participant not found." });
      }

      const [[active]] = await pool.query(
        `
        SELECT session_id
        FROM sessions
        WHERE participant_id = ? AND status = 'active'
        LIMIT 1
      `,
        [participantId]
      );
      if (active) {
        return res.status(409).json({
          ok: false,
          error: "Cannot delete a participant with an active session.",
        });
      }

      await pool.query(`DELETE FROM participants WHERE participant_id = ?`, [participantId]);
      return res.json({ ok: true });
    } catch (err) {
      console.error("DELETE /api/participants/:participantId error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  // Single participant profile + lifetime session summary (for /participants/:id).
  app.get("/api/participants/:participantId", async (req, res) => {
    const participantId = Number.parseInt(req.params.participantId, 10);
    if (!Number.isFinite(participantId)) {
      return res.status(400).json({ ok: false, error: "Invalid participantId." });
    }

    try {
      const [[row]] = await pool.query(
        `
        SELECT participant_id, tester_label, age, gender, created_at
        FROM participants
        WHERE participant_id = ?
        LIMIT 1
      `,
        [participantId]
      );

      if (!row) {
        return res.status(404).json({ ok: false, error: "Participant not found." });
      }

      const [[stats]] = await pool.query(
        `
        SELECT COUNT(*) AS session_count, MAX(start_time) AS last_session_at
        FROM sessions
        WHERE participant_id = ?
      `,
        [participantId]
      );

      return res.json({
        ok: true,
        participant: {
          id: Number(row.participant_id),
          testerLabel: row.tester_label == null ? null : String(row.tester_label),
          age: row.age == null ? null : Number(row.age),
          gender: row.gender == null ? null : String(row.gender),
          createdAt: toIsoOrNull(row.created_at),
        },
        sessionCount: Number(stats?.session_count ?? 0),
        lastSessionAt: toIsoOrNull(stats?.last_session_at),
      });
    } catch (err) {
      console.error("GET /api/participants/:participantId error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  // Session history for a participant (one food per session; "snacks" = distinct foods across sessions).
  app.get("/api/participants/:participantId/sessions", async (req, res) => {
    const participantId = Number.parseInt(req.params.participantId, 10);
    if (!Number.isFinite(participantId)) {
      return res.status(400).json({ ok: false, error: "Invalid participantId." });
    }

    try {
      const [[participantRow]] = await pool.query(
        `SELECT participant_id FROM participants WHERE participant_id = ? LIMIT 1`,
        [participantId]
      );
      if (!participantRow) {
        return res.status(404).json({ ok: false, error: "Participant not found." });
      }

      const [rows] = await pool.query(
        `
        SELECT
          s.session_id,
          s.food_id,
          fp.name AS food_name,
          fp.category AS food_category,
          fp.image_url AS food_image_url,
          s.status,
          s.start_time,
          s.end_time,
          sr.session_id AS survey_session_id,
          sr.color_rating,
          sr.flavor_aroma_rating,
          sr.salt_sweet_rating,
          sr.texture_rating,
          sr.final_overall_rating,
          (SELECT COUNT(*) FROM frame_logs fl WHERE fl.session_id = s.session_id) AS frame_count,
          EXISTS(SELECT 1 FROM consent c WHERE c.session_id = s.session_id) AS has_consent
        FROM sessions s
        LEFT JOIN food_products fp ON fp.food_id = s.food_id
        LEFT JOIN survey_results sr ON sr.session_id = s.session_id
        WHERE s.participant_id = ?
        ORDER BY s.start_time DESC, s.session_id DESC
      `,
        [participantId]
      );

      return res.json({
        ok: true,
        sessions: (rows ?? []).map((r) => ({
          id: Number(r.session_id),
          foodId: r.food_id == null ? null : Number(r.food_id),
          foodName: r.food_name == null ? null : String(r.food_name),
          foodCategory: r.food_category == null ? null : String(r.food_category),
          foodImageUrl: r.food_image_url == null ? null : String(r.food_image_url),
          status: r.status,
          startTime: toIsoOrNull(r.start_time),
          endTime: toIsoOrNull(r.end_time),
          hasSurvey: r.survey_session_id != null,
          hasConsent: Boolean(r.has_consent),
          frameCount: Number(r.frame_count ?? 0),
          survey:
            r.survey_session_id == null
              ? null
              : {
                  color: r.color_rating == null ? null : Number(r.color_rating),
                  flavorAroma: r.flavor_aroma_rating == null ? null : Number(r.flavor_aroma_rating),
                  saltSweet: r.salt_sweet_rating == null ? null : Number(r.salt_sweet_rating),
                  texture: r.texture_rating == null ? null : Number(r.texture_rating),
                  overall: r.final_overall_rating == null ? null : Number(r.final_overall_rating),
                },
        })),
      });
    } catch (err) {
      console.error("GET /api/participants/:participantId/sessions error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  // Consent freshness check for the survey continuation flow (24h same-day skip).
  app.get("/api/participants/:participantId/consent-status", async (req, res) => {
    const participantId = Number.parseInt(req.params.participantId, 10);
    if (!Number.isFinite(participantId)) {
      return res.status(400).json({ ok: false, error: "Invalid participantId." });
    }
    const withinHoursRaw = Number(req.query.withinHours);
    const withinHours = Number.isFinite(withinHoursRaw) && withinHoursRaw > 0 ? withinHoursRaw : 24;

    try {
      const [[row]] = await pool.query(
        `SELECT MAX(agreed_at) AS last_consent_at FROM consent WHERE participant_id = ?`,
        [participantId]
      );

      const lastConsentAt = toIsoOrNull(row?.last_consent_at);
      let hasValidConsent = false;
      if (lastConsentAt) {
        const ageMs = Date.now() - new Date(lastConsentAt).getTime();
        hasValidConsent = ageMs >= 0 && ageMs <= withinHours * 3600 * 1000;
      }

      return res.json({ ok: true, hasValidConsent, lastConsentAt });
    } catch (err) {
      console.error("GET /api/participants/:participantId/consent-status error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  // Log a participant's facial-recording consent (audit trail).
  app.post("/api/consent", async (req, res) => {
    const { sessionId, participantId, deviceId, facialRecording, consentVersion } = req.body ?? {};

    const device = typeof deviceId === "string" ? deviceId.trim() : "";
    if (!device) {
      return res.status(400).json({ ok: false, error: "deviceId is required." });
    }
    if (facialRecording !== true) {
      return res.status(400).json({ ok: false, error: "facial recording consent is required." });
    }

    const sId =
      sessionId == null || sessionId === "" ? null : Number.parseInt(String(sessionId), 10);
    const pId =
      participantId == null || participantId === ""
        ? null
        : Number.parseInt(String(participantId), 10);
    if ((sId != null && !Number.isFinite(sId)) || (pId != null && !Number.isFinite(pId))) {
      return res.status(400).json({ ok: false, error: "Invalid sessionId or participantId." });
    }

    const version =
      typeof consentVersion === "string" && consentVersion.trim() ? consentVersion.trim() : "1.0";

    try {
      if (sId != null) {
        const [[sessionRow]] = await pool.query(
          `SELECT session_id FROM sessions WHERE session_id = ? LIMIT 1`,
          [sId]
        );
        if (!sessionRow) {
          return res.status(404).json({ ok: false, error: "Session not found." });
        }
      }

      const ipAddress = (req.ip || req.socket?.remoteAddress || "").slice(0, 45) || null;
      const agreedAt = new Date();
      const [result] = await pool.query(
        `
        INSERT INTO consent (session_id, participant_id, device_id, facial_recording, consent_version, ip_address)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
        [sId, pId, device, true, version, ipAddress]
      );

      // Reset session clock so elapsed time excludes the consent step.
      let sessionStartTime = null;
      if (sId != null) {
        sessionStartTime = agreedAt.toISOString();
        await pool.query(`UPDATE sessions SET start_time = ? WHERE session_id = ?`, [
          agreedAt,
          sId,
        ]);
      }

      return res.json({
        ok: true,
        consent: {
          id: Number(result.insertId),
          sessionId: sId,
          participantId: pId,
          deviceId: device,
          facialRecording: true,
          consentVersion: version,
          agreedAt: sessionStartTime ?? agreedAt.toISOString(),
        },
        sessionStartTime,
      });
    } catch (err) {
      console.error("POST /api/consent error:", err);
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
          fp.image_url,
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
        GROUP BY fp.food_id, fp.name, fp.category, fp.image_url, fp.created_at
        ORDER BY fp.created_at DESC, fp.food_id DESC
      `
      );

      const foods = rows.map((r) => ({
        id: Number(r.food_id),
        name: r.name,
        category: r.category,
        imageUrl: r.image_url == null ? null : String(r.image_url),
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

  app.post("/api/foods/:foodId/image", uploadFoodImage.single("image"), async (req, res) => {
    const foodId = Number.parseInt(req.params.foodId, 10);
    if (!Number.isFinite(foodId)) {
      return res.status(400).json({ ok: false, error: "Invalid foodId." });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, error: "Image file is required." });
    }

    try {
      const imageUrl = `/uploads/foods/${req.file.filename}`;
      const [result] = await pool.query(
        `
        UPDATE food_products
        SET image_url = ?
        WHERE food_id = ?
      `,
        [imageUrl, foodId]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ ok: false, error: "Food not found." });
      }
      return res.json({ ok: true, imageUrl });
    } catch (err) {
      console.error("POST /api/foods/:foodId/image error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  app.delete("/api/foods/:foodId/image", async (req, res) => {
    const foodId = Number.parseInt(req.params.foodId, 10);
    if (!Number.isFinite(foodId)) {
      return res.status(400).json({ ok: false, error: "Invalid foodId." });
    }

    try {
      const [rows] = await pool.query(
        `SELECT image_url FROM food_products WHERE food_id = ?`,
        [foodId]
      );
      const row = rows[0];
      if (!row) {
        return res.status(404).json({ ok: false, error: "Food not found." });
      }

      const imageUrl = row.image_url == null ? null : String(row.image_url);
      if (imageUrl) {
        const rel = imageUrl.startsWith("/uploads/") ? imageUrl.slice("/uploads/".length) : null;
        if (rel) {
          const filePath = path.join(uploadsRoot, rel);
          try {
            await unlink(filePath);
          } catch {
            /* file may already be missing */
          }
        }
      }

      await pool.query(
        `UPDATE food_products SET image_url = NULL WHERE food_id = ?`,
        [foodId]
      );

      return res.json({ ok: true, imageUrl: null });
    } catch (err) {
      console.error("DELETE /api/foods/:foodId/image error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  // Edit food name and/or category
  app.patch("/api/foods/:foodId", async (req, res) => {
    const foodId = Number.parseInt(req.params.foodId, 10);
    if (!Number.isFinite(foodId)) {
      return res.status(400).json({ ok: false, error: "Invalid foodId." });
    }

    const { name, category } = req.body ?? {};
    const trimName = typeof name === "string" ? name.trim() : null;
    const trimCategory = typeof category === "string" ? category.trim() : null;

    if (trimName === null && trimCategory === null) {
      return res.status(400).json({ ok: false, error: "At least one of name or category is required." });
    }
    if (trimName !== null && trimName === "") {
      return res.status(400).json({ ok: false, error: "name cannot be empty." });
    }
    if (trimCategory !== null && trimCategory === "") {
      return res.status(400).json({ ok: false, error: "category cannot be empty." });
    }

    try {
      const setClauses = [];
      const params = [];
      if (trimName !== null) { setClauses.push("name = ?"); params.push(trimName); }
      if (trimCategory !== null) { setClauses.push("category = ?"); params.push(trimCategory); }
      params.push(foodId);

      const [result] = await pool.query(
        `UPDATE food_products SET ${setClauses.join(", ")} WHERE food_id = ?`,
        params
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ ok: false, error: "Food not found." });
      }

      const [[row]] = await pool.query(
        `SELECT food_id, name, category, image_url, created_at FROM food_products WHERE food_id = ? LIMIT 1`,
        [foodId]
      );

      return res.json({
        ok: true,
        food: {
          id: Number(row.food_id),
          name: String(row.name),
          category: String(row.category ?? ""),
          imageUrl: row.image_url == null ? null : String(row.image_url),
          createdAt: toIsoOrNull(row.created_at),
        },
      });
    } catch (err) {
      console.error("PATCH /api/foods/:foodId error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  // Delete food (cascades sessions/frame_logs/survey_results via FKs)
  app.delete("/api/foods/:foodId", async (req, res) => {
    const foodId = Number.parseInt(req.params.foodId, 10);
    if (!Number.isFinite(foodId)) {
      return res.status(400).json({ ok: false, error: "Invalid foodId." });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      await conn.beginTransaction();

      const [sessionDelete] = await conn.query(`DELETE FROM sessions WHERE food_id = ?`, [foodId]);
      const [result] = await conn.query(`DELETE FROM food_products WHERE food_id = ?`, [foodId]);
      if (result.affectedRows === 0) {
        await conn.rollback();
        return res.status(404).json({ ok: false, error: "Food not found." });
      }

      await conn.commit();
      return res.json({
        ok: true,
        deletedSessions: Number(sessionDelete?.affectedRows ?? 0),
      });
    } catch (err) {
      if (conn) await conn.rollback();
      console.error("DELETE /api/foods/:foodId error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    } finally {
      conn?.release();
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
      const [[sessionCountRow]] = await pool.query(
        `
        SELECT COUNT(*) AS session_count
        FROM sessions
        WHERE food_id = ?
      `,
        [foodId]
      );

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
          SUM(CASE WHEN (fl.hedonic_score * 8 + 1) >= 7 THEN 1 ELSE 0 END) AS positive_count,
          SUM(CASE WHEN (fl.hedonic_score * 8 + 1) >= 5 AND (fl.hedonic_score * 8 + 1) < 7 THEN 1 ELSE 0 END) AS neutral_count,
          SUM(CASE WHEN (fl.hedonic_score * 8 + 1) < 5 THEN 1 ELSE 0 END) AS negative_count,
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

      const to9FromNormalized = (n) => (n == null ? null : Number(n) * 8 + 1);
      const radar = [
        { label: "Color", score: radarRow?.color_rating == null ? 0 : Number(radarRow.color_rating) },
        {
          label: "Flavor/Aroma",
          score: radarRow?.flavor_aroma_rating == null ? 0 : Number(radarRow.flavor_aroma_rating),
        },
        { label: "Salt/Sweet", score: radarRow?.salt_sweet_rating == null ? 0 : Number(radarRow.salt_sweet_rating) },
        { label: "Texture", score: radarRow?.texture_rating == null ? 0 : Number(radarRow.texture_rating) },
        {
          label: "Overall",
          score: radarRow?.final_overall_rating == null ? 0 : Number(radarRow.final_overall_rating),
        },
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
          { label: "First taste", score: to9FromNormalized(byBucket.get(1)) ?? 0, sub: "Early" },
          { label: "Mid", score: to9FromNormalized(byBucket.get(2)) ?? 0, sub: "Middle" },
          { label: "Aftertaste", score: to9FromNormalized(byBucket.get(3)) ?? 0, sub: "Late" },
        ];
      } catch (err) {
        // If NTILE/WITH isn't supported, keep timeline as zeros.
        console.warn("Timeline query not supported, using zeros:", err?.message ?? err);
      }

      // Phase 2: per-aspect stats (mean, stdDev, n) for the survey attributes.
      const [[aspectRow]] = await pool.query(
        `
        SELECT
          COUNT(sr.color_rating) AS color_n,
          AVG(sr.color_rating) AS color_mean,
          STDDEV_SAMP(sr.color_rating) AS color_stddev,
          COUNT(sr.flavor_aroma_rating) AS flavor_aroma_n,
          AVG(sr.flavor_aroma_rating) AS flavor_aroma_mean,
          STDDEV_SAMP(sr.flavor_aroma_rating) AS flavor_aroma_stddev,
          COUNT(sr.salt_sweet_rating) AS salt_sweet_n,
          AVG(sr.salt_sweet_rating) AS salt_sweet_mean,
          STDDEV_SAMP(sr.salt_sweet_rating) AS salt_sweet_stddev,
          COUNT(sr.texture_rating) AS texture_n,
          AVG(sr.texture_rating) AS texture_mean,
          STDDEV_SAMP(sr.texture_rating) AS texture_stddev,
          COUNT(sr.final_overall_rating) AS overall_n,
          AVG(sr.final_overall_rating) AS overall_mean,
          STDDEV_SAMP(sr.final_overall_rating) AS overall_stddev
        FROM survey_results sr
        INNER JOIN sessions s ON s.session_id = sr.session_id
        WHERE s.food_id = ?
      `,
        [foodId]
      );

      const toAspectStat = (mean, stddev, n) => ({
        mean: mean == null ? 0 : Number(mean),
        stdDev: stddev == null ? 0 : Number(stddev),
        n: Number(n ?? 0),
      });

      const aspectStats = {
        color: toAspectStat(aspectRow?.color_mean, aspectRow?.color_stddev, aspectRow?.color_n),
        flavorAroma: toAspectStat(
          aspectRow?.flavor_aroma_mean,
          aspectRow?.flavor_aroma_stddev,
          aspectRow?.flavor_aroma_n
        ),
        saltSweet: toAspectStat(aspectRow?.salt_sweet_mean, aspectRow?.salt_sweet_stddev, aspectRow?.salt_sweet_n),
        texture: toAspectStat(aspectRow?.texture_mean, aspectRow?.texture_stddev, aspectRow?.texture_n),
        overall: toAspectStat(aspectRow?.overall_mean, aspectRow?.overall_stddev, aspectRow?.overall_n),
      };

      // Phase 2: session-over-time trends — one row per completed survey, ordered by session start.
      const [trendRows] = await pool.query(
        `
        SELECT
          s.session_id,
          s.start_time,
          sr.color_rating,
          sr.flavor_aroma_rating,
          sr.salt_sweet_rating,
          sr.texture_rating,
          sr.final_overall_rating,
          fer.mean_hedonic
        FROM survey_results sr
        INNER JOIN sessions s ON s.session_id = sr.session_id
        LEFT JOIN (
          SELECT session_id, AVG(hedonic_score) AS mean_hedonic
          FROM frame_logs
          WHERE hedonic_score IS NOT NULL
          GROUP BY session_id
        ) fer ON fer.session_id = s.session_id
        WHERE s.food_id = ?
        ORDER BY s.start_time ASC
      `,
        [foodId]
      );

      const sessionTrends = (trendRows ?? []).map((r) => ({
        sessionId: Number(r.session_id),
        sessionDate: toIsoOrNull(r.start_time),
        overallRating: r.final_overall_rating == null ? null : Number(r.final_overall_rating),
        color: r.color_rating == null ? null : Number(r.color_rating),
        flavorAroma: r.flavor_aroma_rating == null ? null : Number(r.flavor_aroma_rating),
        saltSweet: r.salt_sweet_rating == null ? null : Number(r.salt_sweet_rating),
        texture: r.texture_rating == null ? null : Number(r.texture_rating),
        // hedonic_score is normalized 0..1 in frame_logs; map to 1..9 for UI consistency.
        meanFerHedonic: r.mean_hedonic == null ? null : Number(r.mean_hedonic) * 8 + 1,
      }));

      const [ageRows] = await pool.query(
        `
        SELECT
          CASE
            WHEN p.age BETWEEN 18 AND 25 THEN '18–25'
            WHEN p.age BETWEEN 26 AND 40 THEN '26–40'
            WHEN p.age BETWEEN 41 AND 60 THEN '41–60'
            WHEN p.age >= 61 THEN '61+'
            ELSE 'Unknown'
          END AS age_group,
          AVG(sr.final_overall_rating) AS avg_rating
        FROM survey_results sr
        INNER JOIN sessions s ON s.session_id = sr.session_id
        LEFT JOIN participants p ON p.participant_id = s.participant_id
        WHERE s.food_id = ?
        GROUP BY age_group
      `,
        [foodId]
      );

      const [genderRows] = await pool.query(
        `
        SELECT
          COALESCE(p.gender, 'other') AS gender,
          AVG(sr.final_overall_rating) AS avg_rating
        FROM survey_results sr
        INNER JOIN sessions s ON s.session_id = sr.session_id
        LEFT JOIN participants p ON p.participant_id = s.participant_id
        WHERE s.food_id = ?
        GROUP BY gender
      `,
        [foodId]
      );

      const byAge = ageRows
        .filter((r) => r.age_group !== "Unknown")
        .map((r) => ({ label: r.age_group, score: r.avg_rating == null ? 0 : Number(r.avg_rating) }));

      const byGender = genderRows.map((r) => ({
        label: String(r.gender).charAt(0).toUpperCase() + String(r.gender).slice(1),
        score: r.avg_rating == null ? 0 : Number(r.avg_rating),
      }));

      const [[surveyCountRow]] = await pool.query(
        `
        SELECT COUNT(*) AS survey_count
        FROM survey_results sr
        INNER JOIN sessions s ON s.session_id = sr.session_id
        WHERE s.food_id = ?
      `,
        [foodId]
      );
      const sessionCount = Number(sessionCountRow?.session_count ?? 0);
      const surveyCount = Number(surveyCountRow?.survey_count ?? 0);

      return res.json({
        ok: true,
        analytics: {
          meanConfidence: confidenceRow?.mean_confidence == null ? 0 : Number(confidenceRow.mean_confidence),
          // hedonic_score is normalized 0..1 in frame_logs; map to 1..9 for UI consistency.
          meanHedonic: hedonicRow?.mean_hedonic == null ? 0 : Number(hedonicRow.mean_hedonic) * 8 + 1,
          distribution,
          radar,
          timeline,
          byAge,
          byGender,
          sampleSize: surveyCount,
          sessionCount,
          frameLogCount: totalCount,
          surveyCount,
          aspectStats,
          sessionTrends,
        },
      });
    } catch (err) {
      console.error("GET /api/foods/:foodId/analytics error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  // Phase 2: flat export rows for a food product (client builds CSV/XLSX from this JSON).
  app.get("/api/foods/:foodId/export", requireRole("admin", "staff"), async (req, res) => {
    const foodId = Number.parseInt(req.params.foodId, 10);
    if (!Number.isFinite(foodId)) {
      return res.status(400).json({ ok: false, error: "Invalid foodId." });
    }

    try {
      const [[foodRow]] = await pool.query(
        `SELECT food_id, name, category FROM food_products WHERE food_id = ? LIMIT 1`,
        [foodId]
      );
      if (!foodRow) {
        return res.status(404).json({ ok: false, error: "Food not found." });
      }

      const [rows] = await pool.query(
        `
        SELECT
          s.session_id,
          s.status,
          s.start_time,
          s.end_time,
          p.tester_label,
          p.age,
          p.gender,
          (SELECT COUNT(*) FROM frame_logs fl WHERE fl.session_id = s.session_id) AS frame_count,
          sr.color_rating,
          sr.flavor_aroma_rating,
          sr.salt_sweet_rating,
          sr.texture_rating,
          sr.final_overall_rating,
          sr.remarks
        FROM sessions s
        LEFT JOIN participants p ON p.participant_id = s.participant_id
        LEFT JOIN survey_results sr ON sr.session_id = s.session_id
        WHERE s.food_id = ?
        ORDER BY s.start_time ASC
      `,
        [foodId]
      );

      const sessions = rows.map((r) => ({
        sessionId: Number(r.session_id),
        status: r.status,
        startTime: toIsoOrNull(r.start_time),
        endTime: toIsoOrNull(r.end_time),
        participantLabel: r.tester_label == null ? null : String(r.tester_label),
        participantAge: r.age == null ? null : Number(r.age),
        participantGender: r.gender == null ? null : String(r.gender),
        frameCount: Number(r.frame_count ?? 0),
        hasSurvey: r.final_overall_rating != null,
      }));

      const surveys = rows
        .filter((r) => r.final_overall_rating != null)
        .map((r) => ({
          sessionId: Number(r.session_id),
          participantLabel: r.tester_label == null ? null : String(r.tester_label),
          age: r.age == null ? null : Number(r.age),
          gender: r.gender == null ? null : String(r.gender),
          colorRating: r.color_rating == null ? null : Number(r.color_rating),
          flavorAromaRating: r.flavor_aroma_rating == null ? null : Number(r.flavor_aroma_rating),
          saltSweetRating: r.salt_sweet_rating == null ? null : Number(r.salt_sweet_rating),
          textureRating: r.texture_rating == null ? null : Number(r.texture_rating),
          finalOverallRating: Number(r.final_overall_rating),
          remarks: r.remarks == null ? null : String(r.remarks),
        }));

      return res.json({
        ok: true,
        food: { id: Number(foodRow.food_id), name: String(foodRow.name), category: String(foodRow.category ?? "") },
        sessions,
        surveys,
      });
    } catch (err) {
      console.error("GET /api/foods/:foodId/export error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  // Start a new session for a given food/user (used by Camera Setup)
  app.post("/api/sessions/start", async (req, res) => {
    const { userId, foodId, participantId } = req.body ?? {};
    const uId = Number.parseInt(String(userId ?? ""), 10);
    const fId = Number.parseInt(String(foodId ?? ""), 10);
    const pId =
      participantId == null || participantId === ""
        ? null
        : Number.parseInt(String(participantId), 10);

    if (!Number.isFinite(uId) || !Number.isFinite(fId) || (pId != null && !Number.isFinite(pId))) {
      return res.status(400).json({ ok: false, error: "userId, foodId, and optional participantId are required." });
    }

    try {
      // Block starting a second session while this participant still has one active
      // (e.g. a stale "same product" / "different product" continuation double-click).
      if (pId != null) {
        const [[activeRow]] = await pool.query(
          `SELECT session_id FROM sessions WHERE participant_id = ? AND status = 'active' LIMIT 1`,
          [pId]
        );
        if (activeRow) {
          return res.status(409).json({
            ok: false,
            error: `This participant already has an active session (S-${activeRow.session_id}). Finish or stop it before starting a new one.`,
          });
        }
      }

      const [result] = await pool.query(
        `
        INSERT INTO sessions (user_id, participant_id, food_id, start_time, status)
        VALUES (?, ?, ?, NOW(), 'active')
      `,
        [uId, pId, fId]
      );

      const newSessionId = Number(result.insertId);
      void writeSystemLog(pool, { sessionId: newSessionId, logType: "info", message: "Session started." });

      return res.json({
        ok: true,
        session: {
          id: newSessionId,
          userId: uId,
          participantId: pId,
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

  // Discover the most recent booth session that has not had a survey submitted yet.
  // Used by Consent.tsx when familis.currentSession was cleared by logout.
  app.get("/api/sessions/booth/active", async (_req, res) => {
    try {
      const [rows] = await pool.query(
        `
        SELECT
          s.session_id,
          s.user_id,
          s.participant_id,
          s.food_id,
          s.status,
          s.start_time,
          fp.name AS food_name,
          fp.category AS food_category,
          fp.image_url AS food_image_url
        FROM sessions s
        LEFT JOIN food_products fp ON fp.food_id = s.food_id
        LEFT JOIN survey_results sr ON sr.session_id = s.session_id
        WHERE s.status IN ('active', 'completed')
          AND sr.session_id IS NULL
        ORDER BY s.start_time DESC
        LIMIT 1
      `
      );

      if (rows.length === 0) {
        return res.json({ ok: true, session: null, food: null });
      }

      const r = rows[0];
      return res.json({
        ok: true,
        session: {
          id: Number(r.session_id),
          userId: Number(r.user_id),
          participantId: r.participant_id == null ? null : Number(r.participant_id),
          foodId: Number(r.food_id),
          status: r.status,
          startTime: toIsoOrNull(r.start_time),
        },
        food: r.food_name
          ? {
              id: Number(r.food_id),
              name: String(r.food_name),
              category: String(r.food_category ?? ""),
              imageUrl: r.food_image_url == null ? null : String(r.food_image_url),
            }
          : null,
      });
    } catch (err) {
      console.error("GET /api/sessions/booth/active error:", err);
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
          s.participant_id,
          s.food_id,
          s.status,
          s.start_time,
          s.end_time,
          fp.name AS food_name,
          fp.category AS food_category,
          fp.image_url AS food_image_url,
          EXISTS(SELECT 1 FROM survey_results sr WHERE sr.session_id = s.session_id) AS has_survey,
          EXISTS(SELECT 1 FROM consent c WHERE c.session_id = s.session_id) AS has_consent
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
          participantId: r.participant_id == null ? null : Number(r.participant_id),
          foodId: Number(r.food_id),
          status: r.status,
          startTime: toIsoOrNull(r.start_time),
          endTime: toIsoOrNull(r.end_time),
          hasSurvey: Boolean(r.has_survey),
          hasConsent: Boolean(r.has_consent),
        },
        food: r.food_name
          ? {
              id: Number(r.food_id),
              name: String(r.food_name),
              category: String(r.food_category ?? ""),
              imageUrl: r.food_image_url == null ? null : String(r.food_image_url),
            }
          : null,
      });
    } catch (err) {
      console.error("GET /api/sessions/:sessionId error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  // Proxy: Python emotion service health (optional; used by Session UI)
  app.get("/api/emotion/health", async (_req, res) => {
    try {
      const r = await fetch(`${EMOTION_SERVICE_URL}/health`);
      const j = await r.json().catch(() => null);
      return res.json({ ok: true, emotion: j });
    } catch (err) {
      console.warn("GET /api/emotion/health: emotion service unreachable:", err?.message || err);
      return res.json({
        ok: false,
        emotion: null,
        error: "Emotion service unreachable. Start backend/6.3/emotion_service.py or set EMOTION_SERVICE_URL.",
      });
    }
  });

  // Upload one camera frame: save image, run 6.3 inference, insert frame_logs
  app.post(
    "/api/sessions/:sessionId/frames",
    prepareSessionFrameUpload,
    (req, res, next) => {
      uploadSessionFrame(req, res, (err) => {
        if (err) {
          return res.status(400).json({ ok: false, error: err.message || "Upload failed." });
        }
        next();
      });
    },
    async (req, res) => {
      const sessionId = req._frameSessionId;
      if (!req.file?.path) {
        return res.status(400).json({ ok: false, error: "Missing frame (multipart field name: frame)." });
      }

      try {
        const [[sess]] = await pool.query(
          `SELECT status, invalidated_at FROM sessions WHERE session_id = ? LIMIT 1`,
          [sessionId]
        );
        if (!sess) {
          return res.status(404).json({ ok: false, error: "Session not found." });
        }
        if (sess.invalidated_at != null) {
          void writeSystemLog(pool, { sessionId, logType: "warning", message: "Frame upload rejected: session is invalidated." });
          return res.status(409).json({ ok: false, error: "Session is invalidated; frame capture is disabled." });
        }
        if (sess.status !== "active") {
          void writeSystemLog(pool, { sessionId, logType: "warning", message: `Frame upload rejected: session status is '${sess.status}'.` });
          return res.status(409).json({ ok: false, error: "Session is not active; cannot record frames." });
        }

        let faceDetected = null;
        let hedonic = null;
        let conf = null;
        let inferenceOk = false;
        let inferenceError = null;
        let sentiment = null;
        let valence1to9 = null;

        try {
          const buf = await readFile(req.file.path);
          const fd = new FormData();
          fd.append("session_id", String(sessionId));
          fd.append(
            "image",
            new Blob([buf], { type: req.file.mimetype || "image/jpeg" }),
            req.file.filename || "frame.jpg"
          );
          const predRes = await fetch(`${EMOTION_SERVICE_URL}/predict`, { method: "POST", body: fd });
          const predJson = await predRes.json().catch(() => null);
          if (predRes.ok && predJson && predJson.ok === true) {
            inferenceOk = true;
            sentiment = predJson.sentiment == null ? null : String(predJson.sentiment);
            valence1to9 = typeof predJson.valence1to9 === "number" ? predJson.valence1to9 : null;
            if (predJson.faceDetected === true) {
              faceDetected = true;
              hedonic = typeof predJson.hedonicScore === "number" ? predJson.hedonicScore : null;
              conf = typeof predJson.confidenceScore === "number" ? predJson.confidenceScore : null;
            } else if (predJson.faceDetected === false) {
              faceDetected = false;
            }
          } else {
            inferenceError =
              (predJson && predJson.error) || `Emotion service HTTP ${predRes.status}`;
          }
        } catch (err) {
          inferenceError = err?.message || String(err);
          console.warn("Frame inference error:", inferenceError);
        }

        if (!inferenceOk && inferenceError) {
          const now = Date.now();
          const lastLogged = inferenceLogThrottle.get(sessionId) ?? 0;
          if (now - lastLogged >= INFERENCE_LOG_THROTTLE_MS) {
            inferenceLogThrottle.set(sessionId, now);
            void writeSystemLog(pool, {
              sessionId,
              logType: "warning",
              message: `Emotion inference failed: ${inferenceError}`,
            });
          }
        }

        const relUrl = `/uploads/frame_logs/${sessionId}/${req.file.filename}`;
        const [insertResult] = await pool.query(
          `
          INSERT INTO frame_logs (session_id, timestamp, face_detected, confidence_score, hedonic_score, frame_image_url)
          VALUES (?, NOW(), ?, ?, ?, ?)
        `,
          [sessionId, faceDetected, conf, hedonic, relUrl]
        );

        return res.json({
          ok: true,
          frameLogId: Number(insertResult.insertId),
          frameImageUrl: relUrl,
          faceDetected,
          confidenceScore: conf,
          hedonicScore: hedonic,
          sentiment,
          valence1to9,
          inferenceOk,
          inferenceError,
        });
      } catch (err) {
        console.error("POST /api/sessions/:sessionId/frames error:", err);
        return res.status(500).json({ ok: false, error: "Server error." });
      }
    }
  );

  // Manual QA: update face / confidence / hedonic on a single frame log
  app.patch(
    "/api/sessions/:sessionId/frames/:frameLogId",
    requireRole("admin", "staff"),
    async (req, res) => {
      const sessionId = Number.parseInt(req.params.sessionId, 10);
      const frameLogId = Number.parseInt(req.params.frameLogId, 10);
      if (!Number.isFinite(sessionId)) {
        return res.status(400).json({ ok: false, error: "Invalid sessionId." });
      }
      if (!Number.isFinite(frameLogId)) {
        return res.status(400).json({ ok: false, error: "Invalid frameLogId." });
      }

      const body = req.body ?? {};
      const hasFace = Object.prototype.hasOwnProperty.call(body, "faceDetected");
      const hasConf = Object.prototype.hasOwnProperty.call(body, "confidenceScore");
      const hasHedonic = Object.prototype.hasOwnProperty.call(body, "hedonicScore");
      if (!hasFace && !hasConf && !hasHedonic) {
        return res.status(400).json({
          ok: false,
          error: "Provide faceDetected, confidenceScore, and/or hedonicScore.",
        });
      }

      let faceDetected;
      if (hasFace) {
        if (body.faceDetected !== null && typeof body.faceDetected !== "boolean") {
          return res.status(400).json({ ok: false, error: "faceDetected must be a boolean or null." });
        }
        faceDetected = body.faceDetected;
      }

      let confidenceScore;
      if (hasConf) {
        const parsed = parseOptionalScore01(body.confidenceScore, "confidenceScore");
        if (!parsed.ok) return res.status(400).json({ ok: false, error: parsed.error });
        confidenceScore = parsed.value;
      }

      let hedonicScore;
      if (hasHedonic) {
        const parsed = parseOptionalScore01(body.hedonicScore, "hedonicScore");
        if (!parsed.ok) return res.status(400).json({ ok: false, error: parsed.error });
        hedonicScore = parsed.value;
      }

      try {
        const [[existing]] = await pool.query(
          `
          SELECT
            frame_log_id,
            session_id,
            timestamp,
            face_detected,
            confidence_score,
            hedonic_score,
            frame_image_url
          FROM frame_logs
          WHERE frame_log_id = ? AND session_id = ?
          LIMIT 1
          `,
          [frameLogId, sessionId]
        );
        if (!existing) {
          return res.status(404).json({ ok: false, error: "Frame not found for this session." });
        }

        const nextFace = hasFace ? faceDetected : existing.face_detected;
        const nextConf = hasConf ? confidenceScore : existing.confidence_score;
        const nextHedonic = hasHedonic ? hedonicScore : existing.hedonic_score;

        await pool.query(
          `
          UPDATE frame_logs
          SET face_detected = ?, confidence_score = ?, hedonic_score = ?
          WHERE frame_log_id = ? AND session_id = ?
          `,
          [nextFace, nextConf, nextHedonic, frameLogId, sessionId]
        );

        const [[updated]] = await pool.query(
          `
          SELECT
            frame_log_id,
            timestamp,
            face_detected,
            confidence_score,
            hedonic_score,
            frame_image_url
          FROM frame_logs
          WHERE frame_log_id = ?
          LIMIT 1
          `,
          [frameLogId]
        );

        const metrics = await getSessionFrameMetrics(sessionId);
        const actor = req.user?.username || req.user?.id || "unknown";
        void writeSystemLog(pool, {
          sessionId,
          logType: "info",
          message: `Frame ${frameLogId} manually updated by ${actor}.`,
        });

        return res.json({
          ok: true,
          frame: mapFrameLogRow(updated),
          metrics,
        });
      } catch (err) {
        console.error("PATCH /api/sessions/:sessionId/frames/:frameLogId error:", err);
        return res.status(500).json({ ok: false, error: "Server error." });
      }
    }
  );

  // Manual QA: delete a single frame log and its image file
  app.delete(
    "/api/sessions/:sessionId/frames/:frameLogId",
    requireRole("admin", "staff"),
    async (req, res) => {
      const sessionId = Number.parseInt(req.params.sessionId, 10);
      const frameLogId = Number.parseInt(req.params.frameLogId, 10);
      if (!Number.isFinite(sessionId)) {
        return res.status(400).json({ ok: false, error: "Invalid sessionId." });
      }
      if (!Number.isFinite(frameLogId)) {
        return res.status(400).json({ ok: false, error: "Invalid frameLogId." });
      }

      try {
        const [[existing]] = await pool.query(
          `
          SELECT frame_log_id, frame_image_url
          FROM frame_logs
          WHERE frame_log_id = ? AND session_id = ?
          LIMIT 1
          `,
          [frameLogId, sessionId]
        );
        if (!existing) {
          return res.status(404).json({ ok: false, error: "Frame not found for this session." });
        }

        await pool.query(
          `DELETE FROM frame_logs WHERE frame_log_id = ? AND session_id = ?`,
          [frameLogId, sessionId]
        );
        await unlinkFrameImage(existing.frame_image_url);

        const metrics = await getSessionFrameMetrics(sessionId);
        const actor = req.user?.username || req.user?.id || "unknown";
        void writeSystemLog(pool, {
          sessionId,
          logType: "info",
          message: `Frame ${frameLogId} manually deleted by ${actor}.`,
        });

        return res.json({ ok: true, metrics });
      } catch (err) {
        console.error("DELETE /api/sessions/:sessionId/frames/:frameLogId error:", err);
        return res.status(500).json({ ok: false, error: "Server error." });
      }
    }
  );

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
          s.participant_id,
          s.food_id,
          s.status,
          s.invalidated_at,
          s.retention_status,
          s.start_time,
          s.end_time,
          fp.name AS food_name,
          fp.category AS food_category,
          fp.image_url AS food_image_url
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
          frame_log_id,
          timestamp,
          face_detected,
          confidence_score,
          hedonic_score,
          frame_image_url
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

      const [[participantRow]] = sessionRow.participant_id
        ? await pool.query(
            `SELECT participant_id, tester_label FROM participants WHERE participant_id = ? LIMIT 1`,
            [sessionRow.participant_id]
          )
        : [[null]];

      const [[surveyRow]] = await pool.query(
        `
        SELECT
          p.age AS participant_age,
          p.gender AS participant_gender,
          color_rating,
          flavor_aroma_rating,
          salt_sweet_rating,
          texture_rating,
          final_overall_rating,
          remarks
        FROM sessions s
        LEFT JOIN survey_results sr ON sr.session_id = s.session_id
        LEFT JOIN participants p ON p.participant_id = s.participant_id
        WHERE s.session_id = ?
        LIMIT 1
        `,
        [sessionId]
      );

      return res.json({
        ok: true,
        session: {
          id: Number(sessionRow.session_id),
          userId: Number(sessionRow.user_id),
          participantId: sessionRow.participant_id == null ? null : Number(sessionRow.participant_id),
          foodId: Number(sessionRow.food_id),
          status: sessionRow.status,
          invalidatedAt: toIsoOrNull(sessionRow.invalidated_at),
          retentionStatus: sessionRow.retention_status ?? "active",
          startTime: toIsoOrNull(sessionRow.start_time),
          endTime: toIsoOrNull(sessionRow.end_time),
        },
        food: sessionRow.food_name
          ? {
              id: Number(sessionRow.food_id),
              name: String(sessionRow.food_name),
              category: String(sessionRow.food_category ?? ""),
              imageUrl: sessionRow.food_image_url == null ? null : String(sessionRow.food_image_url),
            }
          : null,
        participant: participantRow
          ? {
              id: Number(participantRow.participant_id),
              testerLabel: participantRow.tester_label == null ? null : String(participantRow.tester_label),
            }
          : null,
        metrics: {
          totalFrames: Number(frameStatsRow?.total_frames ?? 0),
          meanConfidence:
            frameStatsRow?.mean_confidence == null ? null : Number(frameStatsRow.mean_confidence),
          // hedonic_score is stored 0..1 in frame_logs; convert to 0..1, then the frontend scales to /10.
          meanHedonic: frameStatsRow?.mean_hedonic == null ? null : Number(frameStatsRow.mean_hedonic),
        },
        frameLogs: (frameRows ?? []).map((r) => mapFrameLogRow(r)),
        systemLogs: (systemRows ?? []).map((r) => ({
          logType: r.log_type,
          message: String(r.message ?? ""),
          createdAt: toIsoOrNull(r.created_at),
        })),
        surveyResults: surveyRow
          ? {
              age: surveyRow.participant_age == null ? null : Number(surveyRow.participant_age),
              gender: surveyRow.participant_gender == null ? null : String(surveyRow.participant_gender),
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

  // Phase 2: single-session export — meta, survey, and frame aggregates (summary-only, no per-frame rows).
  app.get("/api/sessions/:sessionId/export", requireRole("admin", "staff"), async (req, res) => {
    const sessionId = Number.parseInt(req.params.sessionId, 10);
    if (!Number.isFinite(sessionId)) {
      return res.status(400).json({ ok: false, error: "Invalid sessionId." });
    }

    try {
      const [[sessionRow]] = await pool.query(
        `
        SELECT
          s.session_id,
          s.status,
          s.start_time,
          s.end_time,
          fp.name AS food_name,
          fp.category AS food_category,
          p.tester_label,
          p.age,
          p.gender
        FROM sessions s
        LEFT JOIN food_products fp ON fp.food_id = s.food_id
        LEFT JOIN participants p ON p.participant_id = s.participant_id
        WHERE s.session_id = ?
        LIMIT 1
      `,
        [sessionId]
      );

      if (!sessionRow) {
        return res.status(404).json({ ok: false, error: "Session not found." });
      }

      const [[surveyRow]] = await pool.query(
        `
        SELECT color_rating, flavor_aroma_rating, salt_sweet_rating, texture_rating, final_overall_rating, remarks
        FROM survey_results
        WHERE session_id = ?
        LIMIT 1
      `,
        [sessionId]
      );

      const [[frameRow]] = await pool.query(
        `
        SELECT
          COUNT(*) AS total_frames,
          AVG(confidence_score) AS mean_confidence,
          AVG(hedonic_score) AS mean_hedonic,
          SUM(CASE WHEN face_detected = 1 THEN 1 ELSE 0 END) AS face_detected_count,
          SUM(CASE WHEN (hedonic_score * 8 + 1) >= 7 THEN 1 ELSE 0 END) AS positive_count,
          SUM(CASE WHEN (hedonic_score * 8 + 1) >= 5 AND (hedonic_score * 8 + 1) < 7 THEN 1 ELSE 0 END) AS neutral_count,
          SUM(CASE WHEN (hedonic_score * 8 + 1) < 5 THEN 1 ELSE 0 END) AS negative_count
        FROM frame_logs
        WHERE session_id = ?
      `,
        [sessionId]
      );

      return res.json({
        ok: true,
        session: {
          id: Number(sessionRow.session_id),
          status: sessionRow.status,
          startTime: toIsoOrNull(sessionRow.start_time),
          endTime: toIsoOrNull(sessionRow.end_time),
          foodName: sessionRow.food_name == null ? null : String(sessionRow.food_name),
          foodCategory: sessionRow.food_category == null ? null : String(sessionRow.food_category),
          participantLabel: sessionRow.tester_label == null ? null : String(sessionRow.tester_label),
          participantAge: sessionRow.age == null ? null : Number(sessionRow.age),
          participantGender: sessionRow.gender == null ? null : String(sessionRow.gender),
        },
        survey: surveyRow
          ? {
              colorRating: surveyRow.color_rating == null ? null : Number(surveyRow.color_rating),
              flavorAromaRating:
                surveyRow.flavor_aroma_rating == null ? null : Number(surveyRow.flavor_aroma_rating),
              saltSweetRating: surveyRow.salt_sweet_rating == null ? null : Number(surveyRow.salt_sweet_rating),
              textureRating: surveyRow.texture_rating == null ? null : Number(surveyRow.texture_rating),
              finalOverallRating:
                surveyRow.final_overall_rating == null ? null : Number(surveyRow.final_overall_rating),
              remarks: surveyRow.remarks == null ? null : String(surveyRow.remarks),
            }
          : null,
        frameSummary: {
          totalFrames: Number(frameRow?.total_frames ?? 0),
          meanConfidence: frameRow?.mean_confidence == null ? null : Number(frameRow.mean_confidence),
          meanHedonicOutOf9: frameRow?.mean_hedonic == null ? null : Number(frameRow.mean_hedonic) * 8 + 1,
          faceDetectedCount: Number(frameRow?.face_detected_count ?? 0),
          positiveCount: Number(frameRow?.positive_count ?? 0),
          neutralCount: Number(frameRow?.neutral_count ?? 0),
          negativeCount: Number(frameRow?.negative_count ?? 0),
        },
      });
    } catch (err) {
      console.error("GET /api/sessions/:sessionId/export error:", err);
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
          participant_id,
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

      void clearEmotionHistory(sessionId);
      void writeSystemLog(pool, { sessionId, logType: "info", message: "Session completed." });

      return res.json({
        ok: true,
        session: {
          id: Number(row.session_id),
          userId: Number(row.user_id),
          participantId: row.participant_id == null ? null : Number(row.participant_id),
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

  // Update session status from session detail header control
  app.patch("/api/sessions/:sessionId/status", async (req, res) => {
    const sessionId = Number.parseInt(req.params.sessionId, 10);
    if (!Number.isFinite(sessionId)) {
      return res.status(400).json({ ok: false, error: "Invalid sessionId." });
    }
    const statusRaw = req.body?.status;
    const status = typeof statusRaw === "string" ? statusRaw.trim().toLowerCase() : "";
    if (!allowedSessionStatuses.has(status)) {
      return res.status(400).json({
        ok: false,
        error: "status must be one of pending, active, completed, cancelled.",
      });
    }

    try {
      // Read old status before updating so we can log the transition.
      const [[oldRow]] = await pool.query(
        `SELECT status FROM sessions WHERE session_id = ? LIMIT 1`,
        [sessionId]
      );
      if (!oldRow) {
        return res.status(404).json({ ok: false, error: "Session not found." });
      }
      const oldStatus = oldRow.status;

      const [result] = await pool.query(
        `
        UPDATE sessions
        SET status = ?,
            end_time = CASE
              WHEN ? = 'completed' AND end_time IS NULL THEN NOW()
              ELSE end_time
            END
        WHERE session_id = ?
      `,
        [status, status, sessionId]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ ok: false, error: "Session not found." });
      }

      const [[row]] = await pool.query(
        `
        SELECT session_id, user_id, participant_id, food_id, status, start_time, end_time
        FROM sessions
        WHERE session_id = ?
        LIMIT 1
      `,
        [sessionId]
      );
      void writeSystemLog(pool, {
        sessionId,
        logType: "info",
        message: `Session status changed from '${oldStatus}' to '${row.status}'.`,
      });
      return res.json({
        ok: true,
        session: {
          id: Number(row.session_id),
          userId: Number(row.user_id),
          participantId: row.participant_id == null ? null : Number(row.participant_id),
          foodId: Number(row.food_id),
          status: row.status,
          startTime: toIsoOrNull(row.start_time),
          endTime: toIsoOrNull(row.end_time),
        },
      });
    } catch (err) {
      console.error("PATCH /api/sessions/:sessionId/status error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  // Flag a session for deletion without removing data yet (Phase 4 retention job
  // performs the actual cleanup). Distinct from DELETE, which is immediate.
  app.post("/api/sessions/:sessionId/invalidate", requireRole("admin"), async (req, res) => {
    const sessionId = Number.parseInt(req.params.sessionId, 10);
    if (!Number.isFinite(sessionId)) {
      return res.status(400).json({ ok: false, error: "Invalid sessionId." });
    }

    try {
      const [result] = await pool.query(
        `
        UPDATE sessions
        SET invalidated_at = COALESCE(invalidated_at, NOW()),
            retention_status = 'pending_deletion'
        WHERE session_id = ?
      `,
        [sessionId]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ ok: false, error: "Session not found." });
      }

      const [[row]] = await pool.query(
        `
        SELECT session_id, status, invalidated_at, retention_status
        FROM sessions
        WHERE session_id = ?
        LIMIT 1
      `,
        [sessionId]
      );

      void writeSystemLog(pool, { sessionId, logType: "warning", message: "Session flagged for deletion (invalidated)." });
      return res.json({
        ok: true,
        session: {
          id: Number(row.session_id),
          status: row.status,
          invalidatedAt: toIsoOrNull(row.invalidated_at),
          retentionStatus: row.retention_status,
        },
      });
    } catch (err) {
      console.error("POST /api/sessions/:sessionId/invalidate error:", err);
      return res.status(500).json({ ok: false, error: "Server error." });
    }
  });

  app.delete("/api/sessions/:sessionId", async (req, res) => {
    const sessionId = Number.parseInt(req.params.sessionId, 10);
    if (!Number.isFinite(sessionId)) {
      return res.status(400).json({ ok: false, error: "Invalid sessionId." });
    }
    try {
      const [result] = await pool.query(`DELETE FROM sessions WHERE session_id = ?`, [sessionId]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ ok: false, error: "Session not found." });
      }
      return res.json({ ok: true });
    } catch (err) {
      console.error("DELETE /api/sessions/:sessionId error:", err);
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
          session_id,
          color_rating, flavor_aroma_rating, salt_sweet_rating,
          texture_rating, final_overall_rating,
          remarks
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          color_rating = VALUES(color_rating),
          flavor_aroma_rating = VALUES(flavor_aroma_rating),
          salt_sweet_rating = VALUES(salt_sweet_rating),
          texture_rating = VALUES(texture_rating),
          final_overall_rating = VALUES(final_overall_rating),
          remarks = VALUES(remarks)
      `,
        [
          sessionId,
          colorInt,
          flavorInt,
          saltInt,
          textureInt,
          finalInt,
          remarksVal,
        ]
      );

      void writeSystemLog(pool, { sessionId, logType: "info", message: "Survey submitted." });
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

