# FaMiLis Demo Kit

Presenter script and reference data for demonstrating **FaMiLis** (food testing with camera capture, hedonic survey, and analytics). Structure follows a typical academic “demo kit” walkthrough: system overview, environment notes, demo accounts, and step-by-step scenarios with concrete sample values.

---

## About

FaMiLis is a food-evaluation prototype for sensory and acceptability testing. Staff manage **food products** and a **participant registry**, run **sessions** that capture camera frames (optionally processed for face-related signals), and collect a **nine-point hedonic survey** (color, flavor/aroma, salt–sweet balance, texture, and overall liking). The **dashboard** summarizes sessions per product and exposes **analytics**: confidence and hedonic distributions, attribute radar chart, timeline trend, and demographic slices (age, gender).

Using the system assumes:

- A working **MySQL** instance and applied schema (`server_database/schema.sql`).
- **Node.js** Express API (default port **5000**) and **React + Vite** frontend (default **5173**).
- For live facial/emotion-related capture: optional **Python FastAPI** service (`backend`), with `EMOTION_SERVICE_URL` pointing to it when enabled.
- A **webcam** and browser permission to use the camera when running a live session.
- Stable local network if the browser, API, and optional Python service run on different machines.

**Out of scope for the software:** final scientific interpretation of scores, IRB/ethics approvals, participant recruitment, and hardware calibration. Mis-keyed data (wrong participant label, wrong product selected) is operator responsibility.

---

## Important note (first run and loading data)

- On first API start, `server/init.js` ensures the schema exists and seeds a default **admin** user (see [Demo users](#demo-users)).
- Loading a large SQL sample (for example `server_database/schema_sample.sql`) may take noticeable time; wait for the client to finish before demoing analytics.
- If the **emotion service** is starting or the first frames are uploading, charts and session detail may populate gradually—brief pauses are normal.
- Closing the browser does **not** stop the Node or MySQL server; background work depends on what was running (API, Python service).

---

## Demo users

Default seed (from `server/init.js` after a normal server start):

| Name (fictional role) | Position        | Email               | Password  | App role |
|----------------------|-----------------|---------------------|-----------|----------|
| Alex R. Mendoza      | Lab coordinator | admin@familis.com   | admin123  | admin    |
| Booth participant    | Test subject    | tester@familis.com  | tester123 | tester   |

The **tester** role is locked to the consent gate, live session, and survey only. Testers cannot reach the dashboard, setup, or session detail; direct URLs redirect them back to consent. Admin and staff keep full access.

Optional additional accounts (run `demo_kit/optional_demo_users.sql` if you want two logins for narration):

| Name (fictional role) | Position   | Email               | Password | App role |
|----------------------|------------|---------------------|----------|----------|
| Sam L. Torres        | Staff      | staff@familis.com   | demo2026 | staff    |
| Dr. Priya N. Shah    | PI / Admin | director@familis.com| demo2026 | admin    |

Login screen expects **email** and **password** (plain comparison to `password_hash` in the current API—suitable for demos only).

---

## Sample participant card (for scripted intake)

Use this card when pretending an email or intake form was received (similar to a “client info” table in a counseling demo kit):

| Field            | Value        |
|------------------|-------------|
| Tester label     | T-DEMO-01   |
| Age              | 22          |
| Gender           | Female      |
| Product focus    | New prototype snack (“CrispMango Bites”) |

Session platform: **in-person booth** with tablet/laptop camera. Adjust dates in steps to your actual demo day.

---

## Scenarios

### Scenario 1 — Lab adopts FaMiLis: environment check and first login

**Situation:** The lab will pilot FaMiLis next week. **Alex** verifies that operators can sign in and reach the dashboard.

**Steps:**

1. Start MySQL, then start the API: `npm run server` from the project root (see root `README.md`).
2. Start the frontend: `npm run dev` and open `http://localhost:5173`.
3. Log in with **admin@familis.com** / **admin123**.
4. Confirm redirect to the **Dashboard** and that the **Food** tab loads (empty or existing rows depending on database state).
5. *(Optional)* If demonstrating analytics with rich charts without a live session, load `server_database/schema_sample.sql` into `familis_db` **before** the demo, then refresh the dashboard.

**Talking point:** First-time sync in other systems can take minutes; here, “wait” moments usually mean DB import or optional Python model load—not Google Drive.

---

### Scenario 2 — New participant and product: registry and session setup

**Situation:** **Sam** receives the sample participant card for **T-DEMO-01** and a new SKU to test: **CrispMango Bites** (category: **snack**).

**Steps:**

1. Log in as **staff@familis.com** / **demo2026** *(or continue as admin if you did not add optional users)*.
2. On the Dashboard **Food Management** tab, click **Add New Food**: name `CrispMango Bites`, category `snack`; optionally attach an image.
3. Click **Camera Recording** to open **Setup** for a new run.
4. Select **CrispMango Bites** from the food dropdown.
5. Enter participant fields from the sample card: tester label `T-DEMO-01`, age `22`, gender **Female** (a new label creates a participant when the session starts; an existing label can be picked from suggestions).
6. Check all **consent** boxes required on the Setup page.
7. Allow the **camera** when prompted; confirm preview works.
8. Click **Start session**; the app registers the participant if needed and opens the **Session** page.

**Verification:** A new session appears as **active** (or pending then active, per your build). Food and participant are tied to this session.

---

### Scenario 3 — During the tasting session: capture, stop, survey

**Situation:** The participant is tasting **CrispMango Bites** while the operator records frames for later review and hedonic scoring.

**Steps:**

1. On the **Session** (**Camera Recording**) page, recording **starts paused** — click **Start recording** (or **Resume recording**) when the participant is ready; keep them framed reasonably if face detection is part of the story.
2. Confirm the timer stays at `00:00` until recording is resumed; no frame uploads should appear in the network tab while paused.
3. *(Optional narrative)* If the FastAPI emotion service is running, the **FER (live)** panel shows hedonic/confidence after recording starts; if offline, resume stays blocked until the service is up.
4. Use **Pause recording** / **Resume recording** as needed; switch tabs briefly to confirm auto-pause (manual resume required when returning).
5. Click **Stop recording**, confirm in the dialog (stopping navigates to the **Survey** page).
6. Complete the **Survey** on the page you are routed to after stop.
5. Enter **five ratings** on the **1–9** hedonic scale (example set for a “positive” story: Color 8, Flavor/aroma 8, Salt–sweet 7, Texture 8, Overall 8) and optional remarks: *“Pleasant mango note; would buy again.”*
6. Submit the survey.

**Verification:** Open **Session detail** for that session and confirm frame log entries, survey summary, and status **completed** where applicable.

**Talking point:** Unlike a counseling system, prior “notes” are **frame logs and survey rows**, not free-text session notes—privacy framing should match your institution’s policy.

---

### Scenario 4 — End of pilot week: product report for stakeholders

**Situation:** **Dr. Shah** needs to show stakeholders how **CrispMango Bites** performed across recent sessions (compare to CARGO’s “generate council report” step).

**Steps:**

1. Log in as **director@familis.com** / **demo2026** or **admin@familis.com**.
2. On the Dashboard, select **CrispMango Bites** (or the food used in Scenario 2).
3. Open the **Statistics & Analytics** tab for that food.
4. Walk through **mean confidence / hedonic**, **distribution**, **radar** (attribute profile), **timeline**, and **age/gender** slices.
5. If the build has no PDF export, use **browser Print → Save as PDF** or screenshots for the appendix.

**Verification:** Charts reflect non-zero sample sizes when `schema_sample` or real sessions exist; otherwise explain the dashboard’s **data-quality** empty states.

---

### Scenario 5 — Planning the next study: reading analytics for decisions

**Situation:** The lab wants to decide whether to reformulate salt–sweet balance and whether sessions had usable face data (analogous to CARGO’s prescriptive / manpower narrative).

**Steps:**

1. With date or product filters as available in your deployment, compare **timeline** peaks to scheduling of future panels.
2. Use **radar** weak dimensions (e.g. salt–sweet vs texture) to motivate formulation tweaks.
3. Discuss **confidence** distribution: many low-confidence frames may imply lighting, occlusion, or camera placement issues—not “disliking” the product.
4. Export or capture **Stats** views for a meeting pack (PDF or slides).

**Talking point:** Recommendations are **human interpretation** of charts; the app does not output hiring or policy rules like the sample CARGO kit.

---

### Scenario 6 — Tester locked flow: consent gate to survey (Phase 1)

**Situation:** A booth participant logs in on the kiosk after the operator has prepared a session. The tester should only see consent, the live session, and the survey.

**Steps:**

1. As admin, run **Setup** and start a session (Scenario 2); this stores the active session on the booth machine.
2. Log out, then log in as **tester@familis.com** / **tester123**.
3. Confirm the app lands on the full-screen **Consent** page, not the dashboard.
4. Try opening `http://localhost:5173/dashboard` directly; confirm the tester is redirected back to consent.
5. Check the dedicated **facial recording** box and the remaining consent items, then click **I Agree, Continue to Session**.
6. Record, stop, and submit the survey as in Scenario 3.

**Verification:** A `consent` row exists for the session (device ID, timestamp, `facial_recording = 1`). The tester never reaches admin pages.

---

### Scenario 7 — Invalidate a session (Phase 1, admin only)

**Situation:** A session was run with a mistaken participant label and should be flagged for deletion without removing it immediately.

**Steps:**

1. Log in as **admin@familis.com**.
2. Open **Session detail** for the session.
3. Click **Invalidate**, confirm in the dialog.
4. Confirm an **Invalidated** badge appears and the action is disabled afterward.

**Verification:** `sessions.invalidated_at` is set and `retention_status = 'pending_deletion'`. New frame uploads to that session are rejected. Actual file cleanup is deferred to the Phase 4 retention job.

---

## Quick presenter checklist

| Item | |
|------|---|
| MySQL running; `familis_db` present | ☐ |
| `npm run server` (port 5000) | ☐ |
| `npm run dev` (port 5173) | ☐ |
| Optional: `schema_sample.sql` loaded for heavy charts | ☐ |
| Optional: Python emotion service + `EMOTION_SERVICE_URL` | ☐ |
| Webcam + consent narrative ready | ☐ |
| Backup plan: screenshots of Stats tab if live camera fails | ☐ |

---

## Files in this kit

| File | Purpose |
|------|---------|
| `DEMO_KIT.md` | This walkthrough |
| `optional_demo_users.sql` | Extra staff/admin rows for two-person demos |

For bulk demo data, use `server_database/schema_sample.sql` alongside `server_database/schema.sql`.
