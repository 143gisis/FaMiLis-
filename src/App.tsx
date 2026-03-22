import { BrowserRouter, Routes, Route } from "react-router-dom";

import RequireAuth from "./RequireAuth";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Setup from "./pages/Setup";
import Session from "./pages/Session";
import SessionDetail from "./pages/SessionDetail";
import Survey from "./pages/Survey";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route element={<RequireAuth />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/session" element={<Session />} />
          <Route path="/session-detail" element={<SessionDetail />} />
          <Route path="/survey" element={<Survey />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}