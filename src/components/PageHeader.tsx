import { useNavigate } from "react-router-dom";
import { getStoredRole, isAdminRole, performLogout } from "../RequireAuth";
import logo from "../assets/logo.png";

interface PageHeaderProps {
  onLogoClick?: () => void;
}

export function PageHeader({ onLogoClick }: PageHeaderProps) {
  const navigate = useNavigate();
  const handleLogo = onLogoClick ?? (() => navigate("/dashboard"));
  const canSeeParticipants = isAdminRole(getStoredRole());

  return (
    <header className="bg-[#e8174a] text-white">
      <div className="h-16 sm:h-[72px] px-4 sm:px-6 flex items-center justify-between">
        <button
          type="button"
          onClick={handleLogo}
          className="flex items-center gap-3"
          aria-label="Go to dashboard"
        >
          <img src={logo} alt="FaMiLis logo" className="w-10 h-10 sm:w-11 sm:h-11 object-contain" />
          <div>
            <span className="text-white text-xl sm:text-2xl font-bold tracking-wide leading-none block">
              FaMiLis
            </span>
            <span className="text-white/70 text-[10px] tracking-widest uppercase block leading-none">
              Food Testing Hub
            </span>
          </div>
        </button>

        <nav className="flex items-center gap-2 sm:gap-3">
          {canSeeParticipants ? (
            <button
              type="button"
              onClick={() => navigate("/participants")}
              className="bg-white/15 hover:bg-white/25 text-white border border-white/30 transition-colors px-3 py-1.5 sm:px-4 sm:py-2 rounded-md text-sm font-semibold"
            >
              Participants
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => performLogout(navigate)}
            className="bg-white/15 hover:bg-white/25 text-white border border-white/30 transition-colors px-3 py-1.5 sm:px-4 sm:py-2 rounded-md text-sm font-semibold"
          >
            Log Out
          </button>
        </nav>
      </div>
    </header>
  );
}

interface PageTitleProps {
  backLabel?: string;
  backTo?: string;
  onBack?: () => void;
  title: string;
  subtitle?: string;
}

export function PageTitle({
  backLabel = "Back to Dashboard",
  backTo = "/dashboard",
  onBack,
  title,
  subtitle,
}: PageTitleProps) {
  const navigate = useNavigate();
  const handleBack = onBack ?? (() => navigate(backTo));

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={handleBack}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-800 mb-4 text-sm transition-colors"
      >
        <span aria-hidden="true">←</span>
        {backLabel}
      </button>
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">{title}</h1>
      {subtitle ? (
        <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
      ) : null}
    </div>
  );
}
