import { useNavigate } from "react-router";
import imgThankYouBg from "@/assets/thankyou-bg.png";

export function ThankYouPage() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-[calc(100vh-80px)] flex flex-col items-center justify-center" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      {/* Background Image */}
      <div className="absolute inset-0 overflow-hidden">
        <img src={imgThankYouBg} alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/20" />
      </div>

      {/* Content Card */}
      <div className="relative z-10 bg-white/90 rounded-[10px] border border-black shadow-[0px_4px_4px_0px_rgba(0,0,0,0.4)] px-20 py-16 text-center max-w-[900px] mx-auto">
        <h1
          className="text-[64px] font-extrabold text-white mb-8"
          style={{
            textShadow: "0px 4px 4px rgba(0,0,0,0.25)",
            WebkitTextStroke: "1px rgba(0,0,0,0.1)",
            color: "#333",
          }}
        >
          Thank you for participating!
        </h1>
      </div>

      {/* Back Button */}
      <button
        onClick={() => navigate("/admin")}
        className="relative z-10 mt-8 bg-white text-black px-10 py-4 rounded-[10px] border border-black text-[24px] font-extrabold hover:bg-gray-50 transition-colors"
        style={{ fontFamily: "'Roboto', sans-serif" }}
      >
        Back to Dashboard
      </button>
    </div>
  );
}
