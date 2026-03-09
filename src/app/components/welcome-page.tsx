import { useNavigate } from "react-router";
import { useState } from "react";
import imgLogo from "@/assets/logo.png";
import imgHeroBg from "@/assets/hero-bg.png";
import imgAbout from "@/assets/about.png";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { Phone, Mail, MapPin, ArrowRight, Sparkles, BarChart3, Monitor, FileText } from "lucide-react";

export function WelcomePage() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState("");

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-[#f6f7fb]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 bg-red-600 h-[80px] flex items-center px-8 z-50">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => scrollTo("hero")}>
          <img src={imgLogo} alt="FaMiLis" className="w-[50px] h-[50px] object-cover" />
          <span className="text-white text-[24px] font-bold">FaMiLis</span>
        </div>
        <div className="flex items-center gap-8 ml-auto">
          <button onClick={() => scrollTo("how-it-works")} className="text-white text-[18px] font-bold hover:opacity-80 transition-opacity">
            How It Works
          </button>
          <button onClick={() => scrollTo("features")} className="text-white text-[18px] font-bold hover:opacity-80 transition-opacity">
            Features
          </button>
          <button onClick={() => scrollTo("faqs")} className="text-white text-[18px] font-bold hover:opacity-80 transition-opacity">
            FAQs
          </button>
          <button onClick={() => scrollTo("about")} className="text-white text-[18px] font-bold hover:opacity-80 transition-opacity">
            About Us
          </button>
          <button
            onClick={() => navigate("/login")}
            className="bg-[#f6f7fb] text-[#0e0e0e] px-6 py-2 rounded-full text-[15px] font-semibold hover:bg-white transition-colors"
          >
            Login as Admin
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section id="hero" className="relative h-screen pt-[80px]">
        <div className="absolute inset-0 top-[80px]">
          <img src={imgHeroBg} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/30" />
        </div>
        <div className="relative z-10 flex flex-col items-start justify-center h-full px-16 max-w-[800px]">
          <h1 className="text-[#f6f7fb] text-[64px] font-extrabold leading-tight mb-4" style={{ fontFamily: "'Montserrat', sans-serif" }}>
            Welcome to FaMiLis
          </h1>
          <div className="mb-8">
            <img src={imgLogo} alt="FaMiLis Logo" className="w-[120px] h-[120px] object-cover" />
          </div>
          <button
            onClick={() => scrollTo("why-familis")}
            className="bg-[#f6f7fb] text-[#0e0e0e] px-10 py-3 rounded-full text-[24px] font-semibold hover:bg-white transition-colors shadow-lg"
          >
            Get Started
          </button>
        </div>
      </section>

      {/* Why FaMiLis Section */}
      <section id="why-familis" className="px-16 py-20 bg-[#f6f7fb]">
        <h2 className="text-[32px] font-bold text-black mb-6" style={{ fontFamily: "'Montserrat', sans-serif" }}>Why FaMiLis?</h2>
        <p className="text-[20px] text-black mb-12 max-w-[1200px]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
          Traditional surveys can be biased or incomplete. FaMiLiS adds a second layer of validation by capturing involuntary facial reactions during tasting—then links them with survey scores in one report.
        </p>

        <div className="grid grid-cols-3 gap-6 max-w-[1300px]">
          {[
            { icon: <Sparkles size={24} className="text-red-600" />, title: "Reduce survey bias", desc: "Participants may avoid negative feedback; emotions reveal unspoken reactions." },
            { icon: <Monitor size={24} className="text-red-600" />, title: "Real-time insights", desc: "Capture immediate reactions during tasting, not hours later." },
            { icon: <BarChart3 size={24} className="text-red-600" />, title: "Unified Data", desc: "Link emotion signals with hedonic scores in one platform." },
            { icon: <FileText size={24} className="text-red-600" />, title: "Central Reporting", desc: "Dashboards summarize trends for faster R&D decisions." },
            { icon: <Monitor size={24} className="text-red-600" />, title: "SME-Friendly", desc: "Works with standard webcams, no specialized hardware required." },
          ].map((item, i) => (
            <div key={i} className="bg-white rounded-[10px] p-6 shadow-[0px_7px_4px_0px_rgba(255,0,0,0.3)] hover:shadow-[0px_7px_10px_0px_rgba(255,0,0,0.5)] transition-shadow">
              <div className="flex items-center gap-3 mb-3">
                {item.icon}
                <h3 className="text-[20px] font-bold text-black" style={{ fontFamily: "'Montserrat', sans-serif" }}>{item.title}</h3>
              </div>
              <p className="text-[15px] text-black" style={{ fontFamily: "'Montserrat', sans-serif" }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="px-8 lg:px-16 py-20 bg-[#f6f7fb]">
        <h2 className="text-[32px] font-bold text-black mb-10" style={{ fontFamily: "'Montserrat', sans-serif" }}>
          How It Works
        </h2>

        <div className="flex flex-col xl:flex-row xl:items-center gap-4 xl:gap-5 max-w-[1320px]">
          {[
            {
              step: 1,
              title: "Set up a Test",
              desc: "Admin sets up camera, gives food, and instructions.",
            },
            {
              step: 2,
              title: "Recording Session",
              desc: "Participants taste while the camera captures facial expressions for emotion recognition.",
            },
            {
              step: 3,
              title: "Answer Hedonic Survey",
              desc: "9-point scale + attributes like taste, color, texture, aroma.",
            },
            {
              step: 4,
              title: "Review Results",
              desc: "Dashboard summarizes emotion trends + survey results to guide product refinement.",
            },
          ].map((item, i, arr) => (
            <div key={item.step} className="flex flex-col xl:flex-row xl:items-center gap-4 xl:gap-5 w-full xl:w-auto">
              <div className="bg-red-600 rounded-[14px] w-full xl:w-[280px] min-h-[220px] shadow-[0px_8px_14px_rgba(255,86,86,0.45)] flex flex-col items-center justify-center px-6 py-8 text-center">
                <div className="bg-white/20 rounded-full w-[56px] h-[56px] flex items-center justify-center mb-4">
                  <span className="text-white text-[28px] font-bold">{item.step}</span>
                </div>

                <h3
                  className="text-[20px] leading-[1.2] font-extrabold text-white mb-4 max-w-[220px]"
                  style={{ fontFamily: "'Montserrat', sans-serif" }}
                >
                  {item.title}
                </h3>

                <p
                  className="text-[15px] leading-[1.45] font-medium text-white max-w-[220px]"
                  style={{ fontFamily: "'Montserrat', sans-serif" }}
                >
                  {item.desc}
                </p>
              </div>

              {i < arr.length - 1 && (
                <>
                  <div className="hidden xl:flex items-center justify-center shrink-0 px-1">
                    <div className="rounded-full bg-white border-[2.5px] border-black shadow-sm px-3 py-2">
                      <ArrowRight size={46} strokeWidth={2.8} className="text-black" />
                    </div>
                  </div>

                  <div className="xl:hidden flex justify-center">
                    <div className="rounded-full bg-white border-[2.5px] border-black shadow-sm px-3 py-2 rotate-90">
                      <ArrowRight size={36} strokeWidth={2.8} className="text-black" />
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="px-16 py-20 bg-[#f6f7fb]">
        <h2 className="text-[32px] font-bold text-black mb-12" style={{ fontFamily: "'Montserrat', sans-serif" }}>Features</h2>
        <div className="grid grid-cols-2 gap-8 max-w-[1300px]">
          {[
            { title: "Facial Emotion Recognition", img: "https://images.unsplash.com/photo-1639478411016-726027171e28?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmYWNpYWwlMjBlbW90aW9uJTIwcmVjb2duaXRpb24lMjBBSSUyMHRlY2hub2xvZ3l8ZW58MXx8fHwxNzcyNjg3NjczfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral" },
            { title: "Session Setup & Monitoring", img: "https://images.unsplash.com/photo-1580781441945-3a233a33ff8c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmb29kJTIwdGFzdGluZyUyMHNlc3Npb24lMjBtb25pdG9yaW5nfGVufDF8fHx8MTc3MjY4NzY3NHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral" },
            { title: "Survey Integration", img: "https://images.unsplash.com/photo-1641630376356-fb9e646b0ea4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkaWdpdGFsJTIwc3VydmV5JTIwcXVlc3Rpb25uYWlyZSUyMHRhYmxldHxlbnwxfHx8fDE3NzI2ODc2NzR8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral" },
            { title: "Dashboards & Reporting", img: "https://images.unsplash.com/photo-1759661966728-4a02e3c6ed91?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhbmFseXRpY3MlMjBkYXNoYm9hcmQlMjBkYXRhJTIwcmVwb3J0aW5nfGVufDF8fHx8MTc3MjY4NzY3NHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral" },
          ].map((item, i) => (
            <div key={i} className="rounded-[10px] overflow-hidden border border-[#bfbfbf]">
              <ImageWithFallback src={item.img} alt={item.title} className="w-full h-[300px] object-cover" />
              <div className="bg-white p-6">
                <h3 className="text-[28px] font-bold text-black text-center" style={{ fontFamily: "'Montserrat', sans-serif" }}>{item.title}</h3>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQs Section */}
      <section id="faqs" className="px-16 py-20 bg-[#f6f7fb]">
        <h2 className="text-[32px] font-bold text-black mb-8" style={{ fontFamily: "'Montserrat', sans-serif" }}>Frequently Asked Questions</h2>
        <div className="bg-white rounded-[10px] border border-[#bfbfbf] p-10 max-w-[1200px]">
          <ol className="list-decimal pl-8 space-y-6 text-[20px]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
            {[
              {
                q: "How will the test be conducted?",
                a: "The company will provide the webcam, food, water, and studio/room where there is decent lighting to ensure clear face visibility. Emotion accuracy depends on environment factors like lighting/angle."
              },
              {
                q: "How is privacy handled?",
                a: "Participants provide informed consent; the prototype follows ethical/data privacy guidelines and treats testing data as confidential."
              },
              {
                q: "What data is saved after a session?",
                a: "The system stores the session details (food tested, timestamps, notes) and links the emotion results with the hedonic survey responses for reporting."
              },
              {
                q: "Can we edit or delete a session after it's completed?",
                a: "The admins can manage session records for cleanup or corrections, but it's recommended to keep completed sessions unchanged to preserve data integrity for analysis."
              },
              {
                q: "What if emotion recognition is inaccurate?",
                a: "The system complements (not replaces) surveys; results are cross-validated with hedonic ratings for better interpretation."
              },
            ].map((item, i) => (
              <li key={i} className="font-bold text-black">
                {item.q}
                <p className="font-normal text-[18px] mt-2 ml-4">{item.a}</p>
              </li>
            ))}
          </ol>
          <p className="text-center mt-8 text-[20px]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
            <span className="font-bold text-black">Have any questions? Email us</span>
            <a href="mailto:emailus@familis.com" className="font-bold text-red-600 ml-1 underline">here</a>
          </p>
        </div>
      </section>

      {/* About Us Section */}
      <section id="about" className="px-16 py-20 bg-[#f6f7fb]">
        <h2 className="text-[32px] font-bold text-black mb-8" style={{ fontFamily: "'Montserrat', sans-serif" }}>About Us</h2>
        <div className="flex gap-12 max-w-[1300px]">
          <div className="flex-1">
            <p className="text-[20px] text-black mb-6" style={{ fontFamily: "'Montserrat', sans-serif" }}>
              <span className="font-bold">FaMiLiS (Facial Emotion Learning Intelligence System)</span> is a De La Salle University–Manila IT Capstone project proposing an AI-assisted feedback platform that integrates facial emotion recognition and survey analytics for food product testing.
            </p>
            <div className="mt-8">
              <p className="text-[22px] font-bold text-black mb-4" style={{ fontFamily: "'Montserrat', sans-serif" }}>Contact Us:</p>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Phone className="text-red-600" size={24} />
                  <span className="text-[20px] font-bold text-black" style={{ fontFamily: "'Montserrat', sans-serif" }}>+63 912 3456789</span>
                </div>
                <div className="flex items-center gap-3">
                  <Mail className="text-red-600" size={24} />
                  <a href="mailto:emailus@familis.com" className="text-[20px] font-bold text-black underline" style={{ fontFamily: "'Montserrat', sans-serif" }}>emailus@familis.com</a>
                </div>
                <div className="flex items-center gap-3">
                  <MapPin className="text-red-600" size={24} />
                  <span className="text-[20px] font-bold text-black" style={{ fontFamily: "'Montserrat', sans-serif" }}>2401 Taft Avenue, Malate, 0922 Manila, Philippines</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex-1">
            <img src={imgAbout} alt="About FaMiLis" className="w-full h-[400px] object-cover rounded-[10px]" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-red-600 py-6 px-16 text-center">
        <p className="text-white text-[16px] font-semibold" style={{ fontFamily: "'Montserrat', sans-serif" }}>
          &copy; 2026 FaMiLis - Facial Emotion Learning Intelligence System. CAPSTONE 2502-IT Group.
        </p>
      </footer>
    </div>
  );
}
