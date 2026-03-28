import type { FC } from "react";

type SectionId = "upload" | "anomalies" | "missing" | "insights" | "predictions" | "chatbot";

type NavbarProps = {
  activeSection: SectionId;
  onNavigate: (sectionId: SectionId) => void;
};

const navItems: Array<{ id: SectionId; label: string }> = [
  { id: "upload", label: "Upload" },
  { id: "anomalies", label: "Anomalies" },
  { id: "missing", label: "Missing Values" },
  { id: "insights", label: "Insights" },
  { id: "predictions", label: "Predictions" },
  { id: "chatbot", label: "Chatbot" },
];

const Navbar: FC<NavbarProps> = ({ activeSection, onNavigate }) => {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/20 bg-white/10 shadow-[0_14px_34px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => onNavigate("upload")}
          className="shrink-0 text-left text-lg font-semibold tracking-tight text-slate-900 transition hover:text-sky-700"
        >
          AI Dataset Analyzer
        </button>

        <nav className="flex flex-1 justify-end overflow-x-auto">
          <div className="flex min-w-max items-center gap-2 rounded-full border border-white/30 bg-white/35 px-2 py-1 shadow-sm">
            {navItems.map((item) => {
              const isActive = item.id === activeSection;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    isActive
                      ? "bg-slate-900 text-white shadow"
                      : "text-slate-700 hover:bg-white/60 hover:text-slate-900"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </header>
  );
};

export default Navbar;
