import type { ReactNode } from "react";

export function SectionPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#e8174a] text-white text-xs font-bold uppercase tracking-wider mb-3">
      {children}
    </span>
  );
}
