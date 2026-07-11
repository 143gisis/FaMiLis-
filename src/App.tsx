import { BrowserRouter, Routes, Route } from "react-router-dom";

import RequireAuth from "./RequireAuth";
import RequireRole from "./RequireRole";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Setup from "./pages/Setup";
import Session from "./pages/Session";
import SessionDetail from "./pages/SessionDetail";
import Survey from "./pages/Survey";
import Consent from "./pages/Consent";
import Participants from "./pages/Participants";
import ParticipantDetail from "./pages/ParticipantDetail";
import AdminUsers from "./pages/AdminUsers";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route element={<RequireAuth />}>
          {/* Admin / staff: full operator flow */}
          <Route element={<RequireRole allowed={["admin", "staff"]} />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/setup" element={<Setup />} />
            <Route path="/session-detail" element={<SessionDetail />} />
            <Route path="/participants" element={<Participants />} />
            <Route path="/participants/:id" element={<ParticipantDetail />} />
          </Route>

          {/* Exact admin only: user management (no staff alias) */}
          <Route element={<RequireRole allowed={["admin"]} exact />}>
            <Route path="/admin/users" element={<AdminUsers />} />
          </Route>

          {/* Tester: consent gate only */}
          <Route element={<RequireRole allowed={["tester"]} />}>
            <Route path="/consent" element={<Consent />} />
          </Route>

          {/* Shared: live session + survey */}
          <Route element={<RequireRole allowed={["admin", "staff", "tester"]} />}>
            <Route path="/session" element={<Session />} />
            <Route path="/survey" element={<Survey />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
