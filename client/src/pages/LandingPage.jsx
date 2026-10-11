// ============================================================
// LANDING PAGE
// CYBERORBIT — ZERO TRUST & UEBA SECURITY PLATFORM
// ============================================================

// ============================================================
// 1. IMPORTS
// ============================================================

import React, { useState } from "react";

import {
  Shield,
  ShieldCheck,
  Lock,
  Cpu,
  BrainCircuit,
  Activity,
  ArrowRight,
  Radio,
  Mail,
  Send,
  CheckCircle2,
  Network,
  Eye,
  Fingerprint,
  ExternalLink,
  Menu,
  X,
} from "lucide-react";

import {
  SiReact,
  SiNodedotjs,
  SiExpress,
  SiJavascript,
  SiPostgresql,
  SiPrisma,
  SiTailwindcss,
} from "react-icons/si";

import { useTheme } from "../context/ThemeContext";
import backgroundImage from "../images/Landingpage.png";

const HEADER_HEIGHT = 76;

const LOGO_COLORS = {
  React: "#61DAFB",
  "Node.js": "#339933",
  Express: "#FFFFFF",
  JavaScript: "#F7DF1E",
  "Random Forest": "#A78BFA",
  "Contextual rules": "#F59E0B",
  PostgreSQL: "#4169E1",
  Prisma: "#FFFFFF",
  "Tailwind CSS": "#06B6D4",
  "Server-Sent Events": "#22C55E",
  "Zero Trust": "#38BDF8",
  "MITRE ATT&CK": "#EF4444",
  "REST API": "#D4AF37",
};

// ============================================================
// 2. JAVASCRIPT / STATE / FUNCTIONS
// ============================================================

export const LandingPage = ({
  onLogin,
  onEnterDashboard,
  onNavigateToLogin,
  onExplorePlatform,
}) => {
  const { isDark } = useTheme();

  // ----------------------------------------------------------
  // STATE
  // ----------------------------------------------------------

  const [contactSubmitted, setContactSubmitted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [contactForm, setContactForm] = useState({
    name: "",
    email: "",
    organization: "",
    message: "",
  });

  // ----------------------------------------------------------
  // NAVIGATION DATA
  // ----------------------------------------------------------

  const navItems = [
    ["about", "About"],
    ["architecture", "Architecture"],
    ["technologies", "Technologies"],
    ["capabilities", "Capabilities"],
    ["ai-security", "AI Engine"],
    ["team", "Team"],
    ["contact", "Contact"],
  ];

  const scrollToSection = (id) => {
    setMobileMenuOpen(false);

    const element = document.getElementById(id);

    if (!element) return;

    const targetPosition =
      element.getBoundingClientRect().top + window.scrollY - HEADER_HEIGHT;

    window.scrollTo({
      top: Math.max(0, targetPosition),
      behavior: "smooth",
    });

    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, "", `#${id}`);
    }
  };
  // ----------------------------------------------------------
  // LOGIN
  // ----------------------------------------------------------

  const handleLoginClick = () => {
    setMobileMenuOpen(false);

    if (onNavigateToLogin) {
      onNavigateToLogin();
    } else if (onLogin) {
      onLogin();
    }
  };

  // ----------------------------------------------------------
  // EXPLORE PLATFORM
  // ----------------------------------------------------------

  const handleExploreClick = () => {
    const aboutSection = document.getElementById("about");

    if (aboutSection) {
      scrollToSection("about");
    } else if (onExplorePlatform) {
      onExplorePlatform();
    }
  };

  // ----------------------------------------------------------
  // CONTACT FORM
  // ----------------------------------------------------------

  const handleContactSubmit = async (e) => {
    e.preventDefault();

    if (contactForm.name && contactForm.email) {
      try {
        const response = await fetch("https://formspree.io/f/myeyloqo", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(contactForm),
        });

        if (response.ok) {
          setContactSubmitted(true);

          setTimeout(() => {
            setContactSubmitted(false);

            setContactForm({
              name: "",
              email: "",
              organization: "",
              message: "",
            });
          }, 5000);
        } else {
          alert("Failed to send inquiry. Please try again.");
        }
      } catch (error) {
        console.error("Contact form submission error:", error);
        alert("Something went wrong. Please try again.");
      }
    }
  };

  // ----------------------------------------------------------
  // TECHNOLOGIES DATA
  // ----------------------------------------------------------

  const technologies = [
    {
      name: "React",
      category: "Frontend",
      desc: "Reactive state management with dynamic SOC visualizations",
      icon: SiReact,
    },
    {
      name: "Node.js",
      category: "Runtime",
      desc: "Event-driven runtime for enterprise telemetry",
      icon: SiNodedotjs,
    },
    {
      name: "Express",
      category: "API Gateway",
      desc: "RESTful security endpoints and policy routing",
      icon: SiExpress,
    },
    {
      name: "JavaScript",
      category: "Core Language",
      desc: "Full-stack unified modern JavaScript architecture",
      icon: SiJavascript,
    },
    {
      name: "Random Forest",
      category: "Supervised ML",
      desc: "Classification model for known behavioral patterns",
      icon: BrainCircuit,
    },
    {
      name: "Contextual rules",
      category: "Anomaly Detection",
      desc: "Context signals and observed historical behavior",
      icon: Activity,
    },
    {
      name: "PostgreSQL",
      category: "Database",
      desc: "Structured storage for enterprise security telemetry",
      icon: SiPostgresql,
    },
    {
      name: "Prisma",
      category: "ORM",
      desc: "Type-safe data modeling and structured query transactions",
      icon: SiPrisma,
    },
    {
      name: "Tailwind CSS",
      category: "Design System",
      desc: "Responsive enterprise interface system",
      icon: SiTailwindcss,
    },
    {
      name: "Server-Sent Events",
      category: "Streaming",
      desc: "Real-time telemetry delivery to the client",
      icon: Radio,
    },
    {
      name: "Zero Trust",
      category: "Architecture",
      desc: "Continuous verification and adaptive access",
      icon: ShieldCheck,
    },
    {
      name: "MITRE ATT&CK",
      category: "Threat Model",
      desc: "Structured mapping of adversarial techniques",
      icon: Fingerprint,
    },
    {
      name: "REST API",
      category: "Integration",
      desc: "Security APIs connecting intelligence, policy and response layers",
      icon: Network,
    },
  ];

  // ----------------------------------------------------------
  // CAPABILITIES DATA
  // ----------------------------------------------------------

  const capabilities = [
    {
      num: "01",
      icon: Eye,
      title: "Continuous Monitoring",
      desc: "Collects approved endpoint metadata independently of the browser. Dashboard updates reflect authenticated uploads; collector intervals and coverage are documented.",
    },
    {
      num: "02",
      icon: BrainCircuit,
      title: "Behavioral Intelligence",
      desc: "Learns working-hour, download-volume and location baselines from at least seven observed prior days. Insufficient history is reported explicitly.",
    },
    {
      num: "03",
      icon: Cpu,
      title: "AI Risk Detection",
      desc: "Random Forest inference for complete approved user-day aggregates, combined with contextual rules and observed behavioral baselines.",
    },
    {
      num: "04",
      icon: Fingerprint,
      title: "Explainable AI (XAI)",
      desc: "Model assessments include real SHAP feature contributions. Contextual policy decisions show their observed risk factors separately.",
    },
    {
      num: "05",
      icon: Shield,
      title: "Adaptive Zero Trust",
      desc: "Dynamic Policy Decision Point translates computed risk into real-time actions: progressive MFA challenges, session restriction, supervisor approval, or instant freeze.",
    },
    {
      num: "06",
      icon: Radio,
      title: "Incident Response",
      desc: "Elevated policy assessments create persisted security incidents linked to activity and audited account actions. MITRE mapping requires analyst validation.",
    },
  ];

  // ----------------------------------------------------------
  // TEAM DATA
  // ----------------------------------------------------------

  const team = [
    {
      name: "Priyanka Samota",
      role: "Project Lead & ML Engineer",
      responsibility:
        "Overall project development, architecture, ML experimentation, feature engineering, Zero Trust policy design, backend integration and frontend implementation.",
      initials: "PS",
      avatar:
        "https://api.dicebear.com/10.x/voxel-art/svg?seed=Aryan&skinColor=f5d0b0&hairColor=8b5e3c&cheeksVariant=blush&outfitVariant=dress&jacketColor=c4b5fd&backgroundColor=03070c",
    },

    {
      name: "Sangamesh Kaji",
      role: "Full-Stack Development Support",
      responsibility:
        "Full-stack implementation support, backend integration, debugging and development tasks.",
      initials: "SK",
      avatar:
        "https://api.dicebear.com/10.x/voxel-art/svg?seed=ArjunMale10&skinColor=f5d0b0&hairColor=8d6e63&backgroundColor=03070c",
    },

    {
      name: "Kanaparthi Nishitha",
      role: "Cybersecurity Research Analyst",
      responsibility:
        "Cybersecurity research, insider-threat scenarios, UEBA concepts and threat detection research inputs.",
      initials: "KN",
      avatar:
        "https://api.dicebear.com/10.x/voxel-art/svg?seed=GirlAva&skinColor=f5d0b0&hairColor=cc6677&cheeksVariant=blush&outfitVariant=dress&jacketColor=e64980&backgroundColor=03070c",
    },

    {
      name: "Jayant",
      role: "Testing & Project Support",
      responsibility:
        "Application testing, feature validation, documentation and project coordination support.",
      initials: "JB",
      avatar:
        "https://api.dicebear.com/10.x/voxel-art/svg?seed=ArjunMale04&skinColor=f5d0b0&hairColor=3b2f2f&cheeksVariant=none&backgroundColor=03070c",
    },
  ];

  // ----------------------------------------------------------
  // ARCHITECTURE DATA
  // ----------------------------------------------------------

  const architecture = [
    {
      step: "01",
      title: "TELEMETRY",
      desc: "Auth, Device, Network, Egress",
    },
    {
      step: "02",
      title: "FEATURE EXTRACTION",
      desc: "Time, Volume, Baseline Delta",
    },
    {
      step: "03",
      title: "ML DETECTION",
      desc: "Random Forest + contextual rules",
    },
    {
      step: "04",
      title: "RISK ANALYSIS",
      desc: "0-100 Continuous Score Decay",
    },
    {
      step: "05",
      title: "XAI ATTRIBUTION",
      desc: "Decomposed Risk Factors",
    },
    {
      step: "06",
      title: "ZERO TRUST POLICY",
      desc: "ALLOW, MFA, RESTRICT, FREEZE",
    },
    {
      step: "07",
      title: "INCIDENT RESPONSE",
      desc: "MITRE ATT&CK & Containment",
    },
  ];

  // ----------------------------------------------------------
  // THEME
  // ----------------------------------------------------------

  const pageBg = isDark ? "#03070C" : "#F8F8F5";
  const textPrimary = isDark ? "#F4F7FA" : "#111317";
  const textSecondary = isDark ? "#A7B0BA" : "#59616A";

  // ==========================================================
  // 3. HTML / JSX — PAGE STRUCTURE
  // ==========================================================

  return (
    <div
      className="min-h-screen overflow-x-hidden"
      style={{
        backgroundColor: pageBg,
        color: textPrimary,
      }}
    >
      {/* ======================================================
          HEADER
      ====================================================== */}

      <header
        className={`fixed top-0 left-0 right-0 z-[9999] h-[76px] border-b backdrop-blur-xl ${
          isDark
            ? "bg-[#03070C]/90 border-white/10"
            : "bg-[#F8F8F5]/95 border-black/10"
        }`}
      >
        <div className="max-w-[1500px] mx-auto px-5 sm:px-8 lg:px-12 h-full flex items-center justify-between">
          {/* ---------------- LOGO ---------------- */}

          <button
            type="button"
            onClick={() =>
              window.scrollTo({
                top: 0,
                behavior: "smooth",
              })
            }
            className="flex items-center gap-3 cursor-pointer"
          >
            <div className="relative w-10 h-10 flex items-center justify-center shrink-0">
              <div className="absolute inset-0 rounded-full border border-[#D4AF37] rotate-45" />
              <div className="absolute inset-[6px] rounded-full border border-cyan-300/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#D4AF37]" />
            </div>

            <div className="text-left">
              <div
                className={`text-2xl sm:text-3xl tracking-[0.20em] font-semibold leading-none ${
                  isDark ? "text-white" : "text-black"
                }`}
              >
                CYBERORBIT
              </div>

              <div className="mt-1 text-[8px] uppercase tracking-[0.30em] text-cyan-300">
                Insider Threat Defense
              </div>
            </div>
          </button>

          {/* ---------------- DESKTOP NAV ---------------- */}

          <nav className="hidden lg:flex items-center gap-6 xl:gap-7">
            {navItems.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => scrollToSection(id)}
                className={`text-[12px] uppercase tracking-[0.14em] transition-colors cursor-pointer ${
                  isDark
                    ? "text-gray-400 hover:text-cyan-300"
                    : "text-gray-600 hover:text-cyan-700"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          {/* ---------------- LOGIN ---------------- */}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleLoginClick}
              className="hidden sm:flex items-center gap-2 px-5 py-2.5 rounded-md border border-cyan-300 text-cyan-300 text-[10px] uppercase tracking-[0.16em] hover:bg-cyan-300 hover:text-black transition-all cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              Secure Admin Login
            </button>

            {/* MOBILE MENU BUTTON */}

            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 text-gray-300 hover:text-cyan-300 cursor-pointer"
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {/* ---------------- MOBILE NAV ---------------- */}

        {mobileMenuOpen && (
          <div
            className={`lg:hidden border-t border-white/10 px-5 py-5 space-y-3 ${
              isDark ? "bg-[#03070C]" : "bg-[#F8F8F5]"
            }`}
          >
            {navItems.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => scrollToSection(id)}
                className="block w-full text-left text-[12px] uppercase tracking-[0.18em] text-gray-400 hover:text-cyan-300 cursor-pointer py-2"
              >
                {label}
              </button>
            ))}

            <button
              type="button"
              onClick={handleLoginClick}
              className="sm:hidden mt-2 w-full py-3 rounded-md border border-cyan-300 text-cyan-300 text-[11px] uppercase tracking-[0.16em] cursor-pointer"
            >
              Secure Admin Login
            </button>
          </div>
        )}
      </header>

      {/* ======================================================
          HERO
      ====================================================== */}

      <section
        id="hero"
        className="relative min-h-[calc(100vh-76px)] mt-[76px] overflow-hidden"
        style={{
          backgroundImage: `
            linear-gradient(
              90deg,
              rgba(2, 7, 12, 0.48) 0%,
              rgba(2, 7, 12, 0.38) 38%,
              rgba(2, 7, 12, 0.18) 65%,
              rgba(2, 7, 12, 0.08) 100%
            ),
            url(${backgroundImage})
          `,
          backgroundSize: "cover",
          backgroundPosition: "center center",
          backgroundRepeat: "no-repeat",
        }}
      >
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(103,232,249,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(103,232,249,0.025)_1px,transparent_1px)] bg-[size:64px_64px]" />

        <div className="relative z-10 max-w-[1500px] mx-auto px-5 sm:px-8 lg:px-12 min-h-[calc(100vh-76px)] flex items-center py-12 lg:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 w-full items-center">
            {/* ==================================================
                HERO LEFT
            ================================================== */}

            <div className="lg:col-span-6">
              <div className="max-w-3xl">
                <div className="flex flex-wrap items-center gap-3 mb-6">
                  <span className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-cyan-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-300" />
                    ZERO TRUST • UEBA • AI SECURITY
                  </span>
                </div>

                {/* ORIGINAL HERO CONTENT */}

                <h1 className="text-[56px] sm:text-[68px] lg:text-[76px] xl:text-[82px] font-light tracking-[-0.045em] leading-[0.92] text-white">
                  <span className="text-white">CYBER</span>
                  <span className="text-[#D4AF37]">ORBIT</span>
                </h1>

                <div className="mt-5 text-xl sm:text-2xl lg:text-[27px] font-light tracking-tight text-white">
                  Zero Trust Security.
                </div>

                <div className="mt-1 text-xl sm:text-2xl lg:text-[27px] font-light tracking-tight text-cyan-300">
                  Intelligent Insider Threat Detection.
                </div>

                <div className="mt-6 w-20 h-px bg-[#D4AF37]" />

                <p className="mt-6 max-w-2xl text-base sm:text-lg text-gray-300 leading-8">
                  CyberOrbit continuously monitors user behavior, device trust,
                  telemetry, risk signals and security events to detect insider
                  threats and enforce Zero Trust policies.
                </p>

                {/* ---------------- BUTTONS ---------------- */}

                <div className="mt-8 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleLoginClick}
                    className="group inline-flex items-center gap-3 px-6 py-3.5 rounded-lg bg-cyan-300 text-black text-[11px] font-bold uppercase tracking-[0.14em] hover:bg-cyan-200 transition-colors cursor-pointer"
                  >
                    Secure Login
                    <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                  </button>

                  <button
                    type="button"
                    onClick={handleExploreClick}
                    className="group inline-flex items-center gap-3 px-6 py-3.5 rounded-lg border border-white/20 text-white text-[11px] uppercase tracking-[0.14em] hover:border-cyan-300 hover:text-cyan-300 transition-all cursor-pointer"
                  >
                    Explore Platform
                    <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                  </button>
                </div>

                {/* ---------------- METRICS ---------------- */}

                <div className="mt-10 pt-5 border-t border-white/15 grid grid-cols-3 gap-5 max-w-xl">
                  <div>
                    <div className="text-2xl sm:text-3xl font-light text-cyan-300">
                      Approved
                    </div>

                    <div className="mt-1 text-[10px] sm:text-[11px] uppercase tracking-[0.13em] text-gray-400">
                      Activity metadata
                    </div>
                  </div>

                  <div>
                    <div className="text-2xl sm:text-3xl font-light text-cyan-300">
                      Saved report
                    </div>

                    <div className="mt-1 text-[10px] sm:text-[11px] uppercase tracking-[0.13em] text-gray-400">
                      Model evidence
                    </div>
                  </div>

                  <div>
                    <div className="text-2xl sm:text-3xl font-light text-white">
                      Recorded
                    </div>

                    <div className="mt-1 text-[10px] sm:text-[11px] uppercase tracking-[0.13em] text-gray-400">
                      Risk decisions
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => scrollToSection("about")}
                  className="mt-5 flex items-center gap-3 text-[9px] uppercase tracking-[0.25em] text-gray-500 hover:text-cyan-300 transition-colors cursor-pointer"
                >
                  <span className="w-6 h-px bg-gray-600" />
                  Scroll to Explore
                </button>
              </div>
            </div>

            {/* ==================================================
                HERO RIGHT — ZERO TRUST PIPELINE
            ================================================== */}

            {/* ==================================================
                HERO RIGHT — ZERO TRUST PIPELINE
            ================================================== */}

            <div className="lg:col-span-6">
              <div className="ml-auto w-full max-w-[612px] lg:mt-0">
                <div className="rounded-2xl border border-white/15 bg-[#02070c]/85 shadow-2xl overflow-hidden">
                  {/* ---------------- PANEL HEADER ---------------- */}
                  <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.25em] text-[#D4AF37]">
                        ZERO TRUST DEFENSE PIPELINE
                      </div>

                      <div className="mt-1 text-[9px] text-gray-500 font-mono">
                        CYBERORBIT / LIVE CONTROL PLANE
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-[9px] uppercase tracking-wider text-cyan-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-300" />
                      REAL-TIME
                    </div>
                  </div>

                  {/* ---------------- PIPELINE ---------------- */}

                  <div className="p-3 space-y-1.5">
                    {[
                      {
                        step: "01",
                        title: "Telemetry",
                        tag: "INPUT",
                        desc: "Auth, Device, Network, Activity Streams",
                        color: "cyan",
                      },

                      {
                        step: "02",
                        title: "ML Detection",
                        tag: "INFERENCE",
                        desc: "Random Forest + contextual rules",
                        color: "violet",
                      },

                      {
                        step: "03",
                        title: "Risk Analysis",
                        tag: "SCORING",
                        desc: "Dynamic Trust Delta & Risk Attribution",
                        color: "gold",
                      },

                      {
                        step: "04",
                        title: "Zero Trust Policy",
                        tag: "ENFORCEMENT",
                        desc: "Continuous Verification & Decision Point",
                        color: "blue",
                      },

                      {
                        step: "05",
                        title: "Incident Response",
                        tag: "CONTAINMENT",
                        desc: "MITRE ATT&CK & Automated Containment",
                        color: "red",
                      },
                    ].map((item, index, array) => {
                      const accent =
                        item.color === "cyan"
                          ? "text-cyan-300 border-cyan-300/30"
                          : item.color === "violet"
                            ? "text-violet-300 border-violet-300/30"
                            : item.color === "gold"
                              ? "text-[#D4AF37] border-[#D4AF37]/30"
                              : item.color === "blue"
                                ? "text-blue-300 border-blue-300/30"
                                : "text-red-300 border-red-300/30";

                      return (
                        <React.Fragment key={item.step}>
                          <div
                            className={`
                              rounded-xl
                              border
                              bg-white/[0.025]
                              hover:bg-white/[0.045]
                              transition-all
                              ${accent}
                            `}
                          >
                            <div className="px-4 py-3 flex items-center gap-4">
                              {/* STEP */}

                              <div className="w-10 h-10 shrink-0 rounded-md border border-current/30 flex items-center justify-center text-[10px] font-mono">
                                {item.step}
                              </div>

                              {/* CONTENT */}

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[17px] text-white font-medium">
                                    {item.title}
                                  </span>

                                  <span className="px-2 py-1 rounded-md border border-current/30 text-[9px] uppercase tracking-wider">
                                    {item.tag}
                                  </span>
                                </div>

                                <div className="mt-1 text-[10px] text-gray-500 font-mono truncate">
                                  {item.desc}
                                </div>
                              </div>

                              {/* STATUS */}

                              <div className="w-2 h-2 rounded-full bg-current shrink-0" />
                            </div>
                          </div>

                          {index < array.length - 1 && (
                            <div className="flex justify-center h-2">
                              <span className="text-gray-600 text-[10px]">
                                ↓
                              </span>
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>

                  {/* ---------------- PANEL FOOTER ---------------- */}

                  <div className="px-5 py-2.5 border-t border-white/10 flex items-center justify-between">
                    <span className="text-[8px] uppercase tracking-[0.18em] text-gray-600">
                      LATENCY: &lt;15MS
                    </span>

                    <span className="text-[8px] uppercase tracking-[0.18em] text-cyan-300">
                      ADAPTIVE ZERO TRUST
                    </span>
                  </div>
                </div>

                {/* ---------------- SECURITY STATUS ---------------- */}

                <div className="mt-2 flex items-center justify-between text-[8px] uppercase tracking-[0.18em] text-gray-500">
                  <span className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Security Layer Operational
                  </span>

                  <span>Identity • Behavior • Data</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ======================================================
          ABOUT / PHILOSOPHY
      ====================================================== */}

      <section
        id="about"
        className={`scroll-mt-[76px] py-24 md:py-32 border-b ${
          isDark ? "border-white/10" : "border-black/10"
        }`}
      >
        <div className="max-w-[1500px] mx-auto px-5 sm:px-8 lg:px-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-14 items-start">
            <div className="lg:col-span-5">
              <div className="text-[10px] uppercase tracking-[0.3em] text-[#D4AF37] mb-5">
                01 / PHILOSOPHY
              </div>

              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-extralight tracking-[-0.04em] leading-[0.95]">
                Security that
                <span className="block text-cyan-300">understands</span>
                <span className="block text-cyan-300">behavior.</span>
              </h2>

              <div className="mt-8 w-20 h-px bg-[#D4AF37]" />
            </div>

            <div className="lg:col-span-7">
              <p className="text-base text-white leading-7">
                CyberOrbit is designed around a simple principle: trust must be
                continuously evaluated.
              </p>

              <p className="mt-7 text-base text-gray-400 leading-8">
                Instead of relying only on perimeter authentication, CyberOrbit
                continuously evaluates identities, devices, behavioral signals,
                access patterns and security telemetry. This allows security
                teams to understand whether activity remains consistent with an
                employee's normal behavioral baseline.
              </p>

              <p className="mt-7 text-base text-gray-400 leading-8">
                The platform combines behavioral intelligence, machine learning,
                explainable risk analysis and adaptive Zero Trust enforcement
                into a single security workflow.
              </p>

              <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 border-y border-white/10 rounded-xl overflow-hidden">
                <div className="p-6 sm:border-r border-white/10">
                  <ShieldCheck className="w-5 h-5 text-cyan-300" />

                  <h3 className="mt-5 text-base font-medium text-white">
                    Identity First
                  </h3>

                  <p className="mt-2 text-[11px] text-gray-500 leading-6">
                    Every identity remains continuously evaluated.
                  </p>
                </div>

                <div className="p-6 sm:border-r border-white/10">
                  <BrainCircuit className="w-5 h-5 text-violet-300" />

                  <h3 className="mt-5 text-base font-medium text-white">
                    Behavioral Context
                  </h3>

                  <p className="mt-2 text-[11px] text-gray-500 leading-6">
                    Detect deviations from established behavior.
                  </p>
                </div>

                <div className="p-6">
                  <Lock className="w-5 h-5 text-[#D4AF37]" />

                  <h3 className="mt-5 text-base font-medium text-white">
                    Adaptive Control
                  </h3>

                  <p className="mt-2 text-[11px] text-gray-500 leading-6">
                    Turn risk into policy decisions.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ======================================================
          ARCHITECTURE
      ====================================================== */}

      <section
        id="architecture"
        className="relative scroll-mt-[76px] py-24 md:py-32 border-b border-white/10 bg-black/40"
      >
        <div className="max-w-[1500px] mx-auto px-5 sm:px-8 lg:px-12">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="text-[10px] uppercase tracking-[0.3em] text-[#D4AF37] mb-5">
              02 / PIPELINE ARCHITECTURE
            </div>

            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-extralight tracking-[-0.04em]">
              How CyberOrbit Works
            </h2>

            <div className="w-16 h-px bg-[#D4AF37] mx-auto mt-7" />

            <p className="mt-7 text-base text-gray-400 leading-8">
              From raw client event ingestion to adaptive policy containment.
            </p>
          </div>

          {/* ---------------- HORIZONTAL ARCHITECTURE ---------------- */}

          <div className="w-full grid grid-cols-7 gap-3">
            {architecture.map((item) => (
              <div
                key={item.step}
                className="rounded-xl border border-white/10 bg-[#050A10] hover:border-cyan-300/30 transition-all"
              >
                <div className="p-4 flex flex-col min-h-[180px]">
                  {/* STEP */}

                  <div className="w-9 h-9 rounded-md border border-cyan-300/20 flex items-center justify-center text-[10px] font-mono text-cyan-300 mb-4">
                    {item.step}
                  </div>

                  {/* TITLE */}

                  {/* TITLE */}
                  <h3 className="text-sm font-medium text-white leading-6 tracking-wide">
                    {item.title}
                  </h3>

                  {/* DESCRIPTION */}

                  <p className="mt-4 text-[11px] text-gray-400 leading-5">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* ======================================================
          TECHNOLOGIES
      ====================================================== */}

      <section
        id="technologies"
        className="relative scroll-mt-[76px] py-24 md:py-32 border-b border-white/10"
      >
        <div className="max-w-[1500px] mx-auto px-5 sm:px-8 lg:px-12">
          <div className="max-w-3xl mb-14">
            <div className="text-[10px] uppercase tracking-[0.3em] text-[#D4AF37] mb-5">
              03 / TECHNOLOGY STACK
            </div>

            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-extralight tracking-[-0.04em]">
              Built for
              <span className="block text-cyan-300">
                security intelligence.
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-5">
            {technologies.map((technology) => {
              const Icon = technology.icon;

              return (
                <div
                  key={technology.name}
                  className="w-full h-[250px] rounded-xl border border-white/10 bg-[#050A10] p-6 hover:border-cyan-300/30 hover:bg-[#071018] transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-md border border-cyan-300/20 flex items-center justify-center">
                      <Icon
                        className="w-5 h-5"
                        style={{
                          color: LOGO_COLORS[technology.name] || "#67E8F9",
                        }}
                      />
                    </div>

                    <span className="text-[9px] uppercase tracking-[0.15em] text-gray-500">
                      {technology.category}
                    </span>
                  </div>

                  <h3 className="mt-6 text-lg font-medium text-white">
                    {technology.name}
                  </h3>

                  <p className="mt-3 text-sm text-gray-500 leading-6">
                    {technology.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ======================================================
          CAPABILITIES
      ====================================================== */}

      <section
        id="capabilities"
        className="relative scroll-mt-[76px] py-24 md:py-32 border-b border-white/10 bg-[#020508]"
      >
        <div className="max-w-[1500px] mx-auto px-5 sm:px-8 lg:px-12">
          <div className="max-w-3xl mb-14">
            <div className="text-[10px] uppercase tracking-[0.3em] text-[#D4AF37] mb-5">
              04 / SECURITY CAPABILITIES
            </div>

            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-extralight tracking-[-0.04em]">
              Intelligence from
              <span className="block text-cyan-300">signal to action.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {capabilities.map((capability) => {
              const Icon = capability.icon;

              return (
                <div
                  key={capability.num}
                  className="group min-h-[300px] rounded-xl border border-white/10 p-7 bg-[#03070C] hover:bg-[#071018] hover:border-cyan-300/30 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-[#D4AF37]">
                      {capability.num}
                    </span>

                    <Icon className="w-6 h-6 text-gray-600 group-hover:text-cyan-300 transition-colors" />
                  </div>

                  <h3 className="mt-12 text-xl md:text-2xl font-light text-white group-hover:text-cyan-300 transition-colors">
                    {capability.title}
                  </h3>

                  <div className="mt-5 w-9 h-px bg-[#D4AF37] group-hover:w-16 transition-all" />

                  <p className="mt-6 text-sm text-gray-500 leading-7">
                    {capability.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ======================================================
          AI ENGINE
      ====================================================== */}

      <section
        id="ai-security"
        className="relative scroll-mt-[76px] py-24 md:py-32 bg-[#020508] border-b border-white/10 overflow-hidden"
      >
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_80%_50%,rgba(103,232,249,0.06),transparent_30%)]" />

        <div className="relative max-w-[1500px] mx-auto px-5 sm:px-8 lg:px-12">
          {/* HEADER */}

          <div className="text-center max-w-4xl mx-auto">
            <div className="text-[10px] uppercase tracking-[0.3em] text-[#D4AF37] mb-5">
              05 / AI DECISION ENGINE
            </div>

            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-extralight tracking-[-0.04em] leading-[0.95]">
              Behavioral
              <span className="block text-cyan-300">intelligence.</span>
            </h2>

            <div className="mt-8 w-20 h-px bg-[#D4AF37] mx-auto" />

            <p className="mt-8 text-base text-gray-400 leading-8 max-w-3xl mx-auto">
              CyberOrbit combines supervised and unsupervised machine learning
              with contextual security signals to identify deviations from
              established employee behavior.
            </p>
          </div>

          {/* AI CAPABILITIES */}

          <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* RANDOM FOREST */}

            <div className="rounded-2xl border border-white/10 bg-[#050A10] p-7 min-h-[190px] hover:border-cyan-300/30 hover:bg-[#071018] transition-all">
              <div className="w-12 h-12 rounded-lg border border-cyan-300/20 flex items-center justify-center">
                <BrainCircuit className="w-6 h-6 text-cyan-300" />
              </div>

              <h3 className="mt-7 text-xl font-medium text-white">
                Random Forest
              </h3>

              <p className="mt-3 text-sm text-gray-500 leading-6">
                Known behavioral pattern classification
              </p>
            </div>

            {/* ISOLATION FOREST */}

            <div className="rounded-2xl border border-white/10 bg-[#050A10] p-7 min-h-[190px] hover:border-cyan-300/30 hover:bg-[#071018] transition-all">
              <div className="w-12 h-12 rounded-lg border border-cyan-300/20 flex items-center justify-center">
                <BrainCircuit className="w-6 h-6 text-cyan-300" />
              </div>

              <h3 className="mt-7 text-xl font-medium text-white">
                Contextual rules
              </h3>

              <p className="mt-3 text-sm text-gray-500 leading-6">
                Detection of unusual activity and anomalies
              </p>
            </div>

            {/* EXPLAINABLE AI */}

            <div className="rounded-2xl border border-white/10 bg-[#050A10] p-7 min-h-[190px] hover:border-violet-300/30 hover:bg-[#071018] transition-all">
              <div className="w-12 h-12 rounded-lg border border-violet-300/20 flex items-center justify-center">
                <BrainCircuit className="w-6 h-6 text-violet-300" />
              </div>

              <h3 className="mt-7 text-xl font-medium text-white">
                Explainable AI
              </h3>

              <p className="mt-3 text-sm text-gray-500 leading-6">
                Human-readable risk attribution
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ======================================================
            TEAM
      ====================================================== */}

      <section
        id="team"
        className="relative scroll-mt-[76px] py-24 md:py-32 border-b border-white/10"
      >
        <div className="max-w-[1500px] mx-auto px-5 sm:px-8 lg:px-12">
          {/* TEAM HEADER */}
          <div className="max-w-3xl mb-14">
            <div className="text-[10px] uppercase tracking-[0.3em] text-[#D4AF37] mb-5">
              06 / TEAM
            </div>

            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-extralight tracking-[-0.04em]">
              Built by a
              <span className="block text-cyan-300">focused team.</span>
            </h2>
          </div>

          {/* TEAM CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
            {team.map((member) => (
              <div
                key={member.initials}
                className="rounded-xl border border-white/10 bg-[#050A10] p-7 hover:border-cyan-300/30 transition-all"
              >
                {/* MEMBER HEADER */}
                <div className="flex items-center gap-5">
                  {/* AVATAR */}
                  <div className="w-16 h-16 shrink-0 flex items-center justify-center">
                    <img
                      src={member.avatar}
                      alt={member.name}
                      className="w-full h-full object-contain"
                    />
                  </div>

                  {/* NAME + ROLE */}
                  <div className="min-w-0">
                    <h3 className="text-lg text-white font-medium leading-6">
                      {member.name}
                    </h3>

                    <div className="mt-2 text-[10px] uppercase tracking-[0.12em] text-[#D4AF37] leading-4">
                      {member.role}
                    </div>
                  </div>
                </div>

                {/* DIVIDER */}
                <div className="mt-5 w-8 h-px bg-cyan-300" />

                {/* RESPONSIBILITY */}
                <p className="mt-5 text-sm text-gray-500 leading-7">
                  {member.responsibility}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ======================================================
          CONTACT
      ====================================================== */}

      <section
        id="contact"
        className="relative scroll-mt-[76px] py-24 md:py-32 bg-[#020508]"
      >
        <div className="max-w-[1500px] mx-auto px-5 sm:px-8 lg:px-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-14">
            {/* ---------------- LEFT ---------------- */}

            <div className="lg:col-span-5">
              <div className="text-[10px] uppercase tracking-[0.3em] text-[#D4AF37] mb-5">
                07 / CONNECT
              </div>

              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-extralight tracking-[-0.04em] leading-[0.95]">
                Let's build a
                <span className="block text-cyan-300">safer environment.</span>
              </h2>

              <div className="mt-8 w-20 h-px bg-[#D4AF37]" />

              <p className="mt-8 text-base text-gray-400 leading-8 max-w-md">
                Connect with the CyberOrbit team to discuss the platform,
                research architecture and security intelligence workflow.
              </p>

              <div className="mt-9 space-y-5 text-sm font-mono">
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-[#D4AF37]" />

                  <a
                    href="mailto:priyankasamota946@gmail.com"
                    className="text-gray-400 hover:text-cyan-300 transition-colors"
                  >
                    priyankasamota946@gmail.com
                  </a>
                </div>

                <div className="flex items-center gap-3">
                  <ExternalLink className="w-5 h-5 text-[#D4AF37]" />

                  <a
                    href="https://github.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-gray-400 hover:text-cyan-300 transition-colors"
                  >
                    github.com/samota2004
                  </a>
                </div>
              </div>

              <div className="mt-10 flex flex-wrap gap-2">
                <span className="px-3 py-2 rounded-md border border-white/10 text-[9px] uppercase tracking-[0.15em] text-gray-500">
                  Insider Threat
                </span>

                <span className="px-3 py-2 rounded-md border border-white/10 text-[9px] uppercase tracking-[0.15em] text-gray-500">
                  UEBA
                </span>

                <span className="px-3 py-2 rounded-md border border-white/10 text-[9px] uppercase tracking-[0.15em] text-gray-500">
                  Zero Trust
                </span>
              </div>
            </div>

            {/* ---------------- FORM ---------------- */}

            <div className="lg:col-span-7">
              <div className="rounded-2xl border border-white/10 bg-[#050A10] p-7 md:p-10">
                {contactSubmitted ? (
                  <div className="min-h-[400px] flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 rounded-full border border-emerald-400/30 flex items-center justify-center">
                      <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                    </div>

                    <h3 className="mt-7 text-2xl text-white">
                      Inquiry Received
                    </h3>

                    <p className="mt-3 text-sm text-gray-500">
                      Thank you for connecting with the CyberOrbit team.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleContactSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-[10px] uppercase tracking-[0.18em] text-gray-500 mb-2">
                          Name
                        </label>

                        <input
                          type="text"
                          value={contactForm.name}
                          onChange={(e) =>
                            setContactForm({
                              ...contactForm,
                              name: e.target.value,
                            })
                          }
                          className="w-full rounded-md border border-white/10 bg-[#03070C] px-4 py-3.5 text-sm text-white outline-none focus:border-cyan-300/50"
                          placeholder="Your name"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] uppercase tracking-[0.18em] text-gray-500 mb-2">
                          Email
                        </label>

                        <input
                          type="email"
                          value={contactForm.email}
                          onChange={(e) =>
                            setContactForm({
                              ...contactForm,
                              email: e.target.value,
                            })
                          }
                          className="w-full rounded-md border border-white/10 bg-[#03070C] px-4 py-3.5 text-sm text-white outline-none focus:border-cyan-300/50"
                          placeholder="you@company.com"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase tracking-[0.18em] text-gray-500 mb-2">
                        Organization
                      </label>

                      <input
                        type="text"
                        value={contactForm.organization}
                        onChange={(e) =>
                          setContactForm({
                            ...contactForm,
                            organization: e.target.value,
                          })
                        }
                        className="w-full rounded-md border border-white/10 bg-[#03070C] px-4 py-3.5 text-sm text-white outline-none focus:border-cyan-300/50"
                        placeholder="Organization"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase tracking-[0.18em] text-gray-500 mb-2">
                        Message
                      </label>

                      <textarea
                        rows={6}
                        value={contactForm.message}
                        onChange={(e) =>
                          setContactForm({
                            ...contactForm,
                            message: e.target.value,
                          })
                        }
                        className="w-full rounded-md border border-white/10 bg-[#03070C] px-4 py-3.5 text-sm text-white outline-none focus:border-cyan-300/50 resize-none"
                        placeholder="Tell us about your security requirements..."
                      />
                    </div>

                    <button
                      type="submit"
                      className="group inline-flex items-center justify-center gap-3 w-full md:w-auto px-7 py-3.5 rounded-md bg-cyan-300 text-black text-[11px] font-bold uppercase tracking-[0.16em] hover:bg-cyan-200 transition-colors cursor-pointer"
                    >
                      Send Inquiry
                      <Send className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ======================================================
          FOOTER
      ====================================================== */}

      <footer className="relative z-10 border-t border-white/10 bg-[#010305]">
        <div className="max-w-[1500px] mx-auto px-5 sm:px-8 lg:px-12">
          {/* ---------------- MAIN FOOTER ---------------- */}

          <div className="py-10 grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
            {/* FOOTER BRAND — SAME LOGO AS HEADER */}

            <div className="flex items-center gap-3">
              <div className="relative w-10 h-10 flex items-center justify-center shrink-0">
                <div className="absolute inset-0 rounded-full border border-[#D4AF37] rotate-45" />

                <div className="absolute inset-[6px] rounded-full border border-cyan-300/70" />

                <div className="w-2.5 h-2.5 rounded-full bg-[#D4AF37]" />
              </div>

              <div>
                <div className="text-xl tracking-[0.20em] text-white font-semibold leading-none">
                  CYBERORBIT
                </div>

                <div className="mt-1 text-[8px] uppercase tracking-[0.30em] text-cyan-300">
                  Insider Threat Defense
                </div>
              </div>
            </div>

            {/* CENTER */}

            <div className="text-center">
              <div className="text-[10px] uppercase tracking-[0.22em] text-gray-400">
                AI-Powered Zero Trust Security Platform
              </div>

              <div className="mt-2 text-[9px] uppercase tracking-[0.16em] text-gray-600">
                Identity • Behavior • Risk • Response
              </div>
            </div>

            {/* STATUS */}

            <div className="flex md:justify-end justify-start">
              <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.16em] text-gray-500">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                System Architecture Operational
              </div>
            </div>
          </div>

          {/* ---------------- FOOTER BOTTOM ---------------- */}

          <div className="py-5 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-[8px] uppercase tracking-[0.18em] text-gray-700">
              © {new Date().getFullYear()} CYBERORBIT. ALL RIGHTS RESERVED.
            </div>

            <div className="flex items-center gap-5 text-[8px] uppercase tracking-[0.18em] text-gray-700">
              <span>Zero Trust</span>

              <span>UEBA</span>

              <span>AI Security</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

// ============================================================
// 4. EXPORT
// ============================================================

export default LandingPage;
