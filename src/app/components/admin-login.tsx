import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router";
import { useApp } from "../store/AppContext";
import imgLogo from "@/assets/logo.png";
import imgLoginBg from "@/assets/login-bg.png";
import { Mail, Lock, LogIn } from "lucide-react";

export function AdminLogin() {
  const navigate = useNavigate();
  const { dispatch } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    // Simple demo validation
    if (email === "admin@familis.com" && password === "admin123") {
      dispatch({ type: "LOGIN", payload: { email } });
      navigate("/admin");
    } else if (!email || !password) {
      setError("Please fill in all fields.");
    } else {
      setError("Invalid email or password. Try admin@familis.com / admin123");
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f7fb] relative" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 bg-red-600 h-[80px] flex items-center px-8 z-50">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate("/")}>
          <img src={imgLogo} alt="FaMiLis" className="w-[50px] h-[50px] object-cover" />
          <span className="text-white text-[24px] font-bold">FaMiLis</span>
        </div>
        <div className="flex items-center gap-8 ml-auto">
          <button onClick={() => navigate("/")} className="text-white text-[18px] font-bold hover:opacity-80">How It Works</button>
          <button onClick={() => navigate("/")} className="text-white text-[18px] font-bold hover:opacity-80">Features</button>
          <button onClick={() => navigate("/")} className="text-white text-[18px] font-bold hover:opacity-80">FAQs</button>
          <button onClick={() => navigate("/")} className="text-white text-[18px] font-bold hover:opacity-80">About Us</button>
        </div>
      </nav>

      {/* Background */}
      <div className="absolute inset-0 top-[80px]">
        <img src={imgLoginBg} alt="" className="w-full h-full object-cover opacity-40" />
      </div>

      {/* Login Card */}
      <div className="relative z-10 flex items-center justify-center min-h-screen pt-[80px]">
        <div className="w-[650px] overflow-hidden rounded-[70px] shadow-2xl">
          {/* Red Header */}
          <div className="bg-red-600 px-12 pt-10 pb-8 text-center relative">
            <div className="flex justify-center mb-2">
              <img src={imgLogo} alt="FaMiLis" className="w-[80px] h-[80px] object-cover shadow-lg rounded-full" />
            </div>
            <h2 className="text-white text-[36px] font-bold mt-2">Welcome Back!</h2>
            <p className="text-white text-[16px] font-semibold mt-1">Login to start testing!</p>
          </div>

          {/* White Form */}
          <div className="bg-white px-12 py-10">
            <form onSubmit={handleLogin}>
              <div className="mb-6">
                <label className="text-black text-[18px] font-medium block mb-2" style={{ fontFamily: "'Roboto', sans-serif" }}>Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-red-600" size={20} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@familis.com"
                    className="w-full pl-12 pr-4 py-3 border border-[#bfbfbf] rounded-[10px] text-[16px] text-black placeholder:text-[#bdb4b4] focus:outline-none focus:border-red-400"
                    style={{ fontFamily: "'Albert Sans', sans-serif" }}
                  />
                </div>
              </div>

              <div className="mb-6">
                <label className="text-black text-[18px] font-medium block mb-2" style={{ fontFamily: "'Roboto', sans-serif" }}>Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-red-600" size={20} />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full pl-12 pr-4 py-3 border border-[#bfbfbf] rounded-[10px] text-[16px] text-black placeholder:text-[#bdb4b4] focus:outline-none focus:border-red-400"
                    style={{ fontFamily: "'Albert Sans', sans-serif" }}
                  />
                </div>
              </div>

              {error && (
                <p className="text-red-600 text-[14px] mb-4 text-center">{error}</p>
              )}

              <button
                type="submit"
                className="w-full bg-red-600 text-white py-4 rounded-full text-[24px] font-semibold flex items-center justify-center gap-3 hover:bg-red-700 transition-colors"
              >
                <LogIn size={28} />
                Login
              </button>

              <p className="text-center mt-6 text-[18px]" style={{ fontFamily: "'Roboto', sans-serif" }}>
                <span className="text-black/50">Don't have an account yet? </span>
                <span className="text-red-600 cursor-pointer hover:underline">Register here</span>
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
