import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router";
import imgLogo from "@/assets/logo.png";
import { useApp } from "../store/AppContext";

export function AdminLayout() {
  const navigate = useNavigate();
  const { state, dispatch } = useApp();

  useEffect(() => {
    // Simple protection: if not logged in, go to login page
    if (!state.isAuthed) navigate("/login");
  }, [state.isAuthed, navigate]);

  const handleLogout = () => {
    dispatch({ type: "LOGOUT" });
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-[#f6f7fb]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      {/* Admin Navbar */}
      <nav className="fixed top-0 left-0 right-0 bg-red-600 h-[80px] flex items-center px-8 z-50">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate("/admin")}
        >
          <img src={imgLogo} alt="FaMiLis" className="w-[50px] h-[50px] object-cover" />
          <span className="text-white text-[24px] font-bold">FaMiLis</span>
        </div>
        <p className="text-white text-[24px] font-bold mx-auto">Admin View</p>
        <button
          onClick={handleLogout}
          className="bg-[#f6f7fb] text-[#0e0e0e] px-5 py-2 rounded-[10px] text-[15px] font-semibold hover:bg-white transition-colors"
          style={{ fontFamily: "'Roboto', sans-serif" }}
        >
          Log Out
        </button>
      </nav>

      {/* Content */}
      <div className="pt-[80px]">
        <Outlet />
      </div>
    </div>
  );
}
