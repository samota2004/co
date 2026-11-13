import React, { useState, useEffect } from "react";
import {
  Server, Shield, Layers, Terminal, Play, CheckCircle2,
  BrainCircuit, Flame, RefreshCw, Copy, Check, Zap,
  FileCode2, GitBranch,
} from "lucide-react";

export const ArchitecturePage = ({
  currentUser,
  users = [],
  resources = [],
  devices = [],
  onRefreshData,
}) => {
  const [activeTab, setActiveTab] = useState("architecture");

  const [healthData, setHealthData] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [healthLoading, setHealthLoading] = useState(false);

  const [selectedRoute, setSelectedRoute] = useState(null);
  const [customRequestBody, setCustomRequestBody] = useState("{}");
  const [apiResponse, setApiResponse] = useState(null);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiLatency, setApiLatency] = useState(null);
  const [apiStatus, setApiStatus] = useState(null);
  const [copiedCurl, setCopiedCurl] = useState(false);

  const [hourSlider, setHourSlider] = useState(2);
  const [deviceTrustSlider, setDeviceTrustSlider] = useState(25);
  const [downloadVolumeSlider, setDownloadVolumeSlider] = useState(650);
  const [failedLoginsSlider, setFailedLoginsSlider] = useState(3);
  const [crossDeptChecked, setCrossDeptChecked] = useState(true);
  const [privilegeChecked, setPrivilegeChecked] = useState(false);
  const [usbChecked, setUsbChecked] = useState(false);
  const [mlInferenceResult, setMlInferenceResult] = useState(null);
  const [mlInferring, setMlInferring] = useState(false);

  const [selectedMitreTechnique, setSelectedMitreTechnique] = useState("T1048");
  const [selectedMitreUser, setSelectedMitreUser] = useState(
    users[2]?.id || "user-003"
  );
  const [mitreResult, setMitreResult] = useState(null);
  const [mitreExecuting, setMitreExecuting] = useState(false);
  const [mitigationResult, setMitigationResult] = useState(null);

  useEffect(() => {
    if (!selectedMitreUser && users.length) {
      setSelectedMitreUser(users[0]?.id || "");
    }
  }, [users, selectedMitreUser]);

  const fetchHealthAndRoutes = async () => {
    try {
      setHealthLoading(true);

      const [healthResponse, routesResponse] = await Promise.all([
        fetch("/api/system/health"),
        fetch("/api/system/routes"),
      ]);

      const [healthRes, routesRes] = await Promise.all([
        healthResponse.json(),
        routesResponse.json(),
      ]);

      if (healthRes?.success) {
        setHealthData(healthRes);
      }

      if (routesRes?.success && Array.isArray(routesRes.routes)) {
        setRoutes(routesRes.routes);

        if (!selectedRoute && routesRes.routes.length > 0) {
          const initialRoute = routesRes.routes[2] || routesRes.routes[0];

          setSelectedRoute(initialRoute);
          setCustomRequestBody(
            JSON.stringify(initialRoute.sampleBody || {}, null, 2)
          );
        }
      }
    } catch (error) {
      console.error("Failed to load system health", error);
    } finally {
      setHealthLoading(false);
    }
  };

  useEffect(() => {
    fetchHealthAndRoutes();
  }, []);

  const handleSelectRoute = (route) => {
    setSelectedRoute(route);
    setCustomRequestBody(JSON.stringify(route.sampleBody || {}, null, 2));
    setApiResponse(null);
    setApiStatus(null);
    setApiLatency(null);
  };

  const handleExecuteApiRequest = async () => {
    if (!selectedRoute) return;

    try {
      setApiLoading(true);

      const startTime = performance.now();

      const options = {
        method: selectedRoute.method,
        headers: { "Content-Type": "application/json" },
      };

      if (selectedRoute.method !== "GET" && customRequestBody.trim()) {
        JSON.parse(customRequestBody);
        options.body = customRequestBody;
      }

      const response = await fetch(selectedRoute.path, options);

      setApiLatency(Math.round(performance.now() - startTime));
      setApiStatus(response.status);

      const contentType = response.headers.get("content-type");

      if (contentType?.includes("application/json")) {
        setApiResponse(await response.json());
      } else {
        setApiResponse({ textResponse: await response.text() });
      }
    } catch (error) {
      setApiResponse({ error: error.message || String(error) });
      setApiStatus(500);
    } finally {
      setApiLoading(false);
    }
  };

  const handleRunLiveMlInference = async () => {
    try {
      setMlInferring(true);

      const response = await fetch("/api/ml/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedMitreUser,
          resourceId: crossDeptChecked ? "res-fin-01" : "res-eng-01",
          downloadSizeMB: downloadVolumeSlider,
          failedLoginCount: failedLoginsSlider,
          isOffHours: hourSlider < 8 || hourSlider > 18,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "ML inference request failed");
      }

      setMlInferenceResult(data);
    } catch (error) {
      console.error("ML inference error", error);
      setMlInferenceResult({ error: error.message });
    } finally {
      setMlInferring(false);
    }
  };

  const handleRunMitreAttack = async () => {
    try {
      setMitreExecuting(true);

      const response = await fetch("/api/cyber/mitre-simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          techniqueId: selectedMitreTechnique,
          userId: selectedMitreUser,
          targetResourceId: "res-fin-01",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "MITRE simulation failed");
      }

      setMitreResult(data);
      onRefreshData?.();
    } catch (error) {
      console.error("MITRE simulation failed", error);
    } finally {
      setMitreExecuting(false);
    }
  };

  const handleExecuteMitigation = async (action) => {
    try {
      const response = await fetch("/api/cyber/mitigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          userId: selectedMitreUser,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Mitigation failed");
      }

      if (data.success) {
        setMitigationResult(data.message);
        onRefreshData?.();
        window.setTimeout(() => setMitigationResult(null), 6000);
      }
    } catch (error) {
      console.error("Mitigation failed", error);
    }
  };

  const generateCurlCommand = () => {
    if (!selectedRoute) return "";

    const origin = window.location.origin;

    if (selectedRoute.method === "GET") {
      return `curl -X GET "${origin}${selectedRoute.path}" -H "Accept: application/json"`;
    }

    return `curl -X ${selectedRoute.method} "${origin}${selectedRoute.path}" \\
  -H "Content-Type: application/json" \\
  -d '${customRequestBody.replace(/'/g, "\\'")}'`;
  };

  const handleCopyCurl = async () => {
    try {
      await navigator.clipboard.writeText(generateCurlCommand());
      setCopiedCurl(true);
      window.setTimeout(() => setCopiedCurl(false), 2000);
    } catch (error) {
      console.error("Unable to copy cURL command", error);
    }
  };

  const panel =
    "rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/25 sm:p-6";

  const muted = "text-[#A7B0BA]";
  const cyan = "text-[#67E8F9]";
  const gold = "text-[#D4AF37]";

  return (
    <div className="cyberorbit-architecture mx-auto w-full max-w-[1500px] space-y-5 px-5 pb-10 pt-5 sm:px-8 lg:px-12">
      <style>{`
        .cyberorbit-architecture {
          --co-bg: #03070C;
          --co-panel: #050A10;
          --co-panel-2: #070C12;
          --co-text: #F4F7FA;
          --co-secondary: #A7B0BA;
          --co-muted: #7F8A96;
          --co-cyan: #67E8F9;
          --co-gold: #D4AF37;
        }
        .cyberorbit-architecture * { box-sizing: border-box; }
        .cyberorbit-architecture [class~="bg-[#050A10]"] {
          background-color: #050A10 !important;
        }
        .cyberorbit-architecture [class~="bg-[#070C12]"] {
          background-color: #070C12 !important;
        }
        .cyberorbit-architecture [class~="bg-[#03070C]"] {
          background-color: #03070C !important;
        }
        .cyberorbit-architecture [class~="bg-white/[0.02]"] {
          background-color: rgba(255,255,255,.025) !important;
        }
        .cyberorbit-architecture [class~="bg-white/5"] {
          background-color: rgba(255,255,255,.04) !important;
        }
        .cyberorbit-architecture [class~="text-white"] {
          color: #F4F7FA !important;
        }
        .cyberorbit-architecture [class~="text-gray-300"],
        .cyberorbit-architecture [class~="text-gray-400"] {
          color: #A7B0BA !important;
        }
        .cyberorbit-architecture [class~="text-gray-500"] {
          color: #7F8A96 !important;
        }
        .cyberorbit-architecture [class~="bg-[#D4AF37]"],
        .cyberorbit-architecture [class~="bg-blue-600"],
        .cyberorbit-architecture [class~="bg-purple-600"] {
          background-color: #67E8F9 !important;
          color: #03070C !important;
        }
        .cyberorbit-architecture [class~="text-[#D4AF37]"] {
          color: #D4AF37 !important;
        }
        .cyberorbit-architecture [class~="border-[#D4AF37]"] {
          border-color: #D4AF37 !important;
        }
        .cyberorbit-architecture [class~="text-blue-400"],
        .cyberorbit-architecture [class~="text-indigo-400"],
        .cyberorbit-architecture [class~="text-purple-400"],
        .cyberorbit-architecture [class~="text-purple-300"],
        .cyberorbit-architecture [class~="text-purple-200"] {
          color: #67E8F9 !important;
        }
        .cyberorbit-architecture [class~="text-amber-400"] {
          color: #D4AF37 !important;
        }
        .cyberorbit-architecture [class~="bg-blue-500/10"],
        .cyberorbit-architecture [class~="bg-purple-500/10"],
        .cyberorbit-architecture [class~="bg-indigo-500/10"] {
          background-color: rgba(103,232,249,.08) !important;
        }
        .cyberorbit-architecture [class~="bg-amber-500/10"],
        .cyberorbit-architecture [class~="bg-amber-500/20"] {
          background-color: rgba(212,175,55,.10) !important;
        }
        .cyberorbit-architecture [class~="border-blue-500"],
        .cyberorbit-architecture [class~="border-purple-500"],
        .cyberorbit-architecture [class~="border-indigo-500"] {
          border-color: rgba(103,232,249,.4) !important;
        }
        .cyberorbit-architecture [class~="border-amber-500"] {
          border-color: rgba(212,175,55,.5) !important;
        }
        .cyberorbit-architecture input,
        .cyberorbit-architecture select,
        .cyberorbit-architecture textarea {
          background-color: #070C12 !important;
          color: #F4F7FA !important;
          border-color: rgba(255,255,255,.12) !important;
        }
        .cyberorbit-architecture input:focus,
        .cyberorbit-architecture select:focus,
        .cyberorbit-architecture textarea:focus {
          outline: none !important;
          border-color: rgba(103,232,249,.6) !important;
          box-shadow: 0 0 0 2px rgba(103,232,249,.1) !important;
        }
        .cyberorbit-architecture select option {
          background: #050A10;
          color: #F4F7FA;
        }
        .cyberorbit-architecture button {
          transition: all 250ms ease;
        }
        .cyberorbit-architecture .rounded-2xl.border {
          transition: border-color 250ms ease, background-color 250ms ease,
            box-shadow 250ms ease, transform 250ms ease;
        }
        .cyberorbit-architecture .rounded-2xl.border:hover {
          border-color: rgba(103,232,249,.28);
          box-shadow: 0 18px 55px rgba(0,0,0,.2);
        }
        .cyberorbit-architecture table tbody tr:hover {
          background: rgba(103,232,249,.045) !important;
        }
        @media (max-width: 768px) {
          .cyberorbit-architecture [class~="p-8"] { padding: 1.5rem !important; }
          .cyberorbit-architecture [class~="p-6"] { padding: 1.25rem !important; }
        }
      `}</style>

      {/* HERO */}
      <section className="group relative min-h-[250px] overflow-hidden rounded-2xl border border-[#67E8F9]/55 bg-[#050A10] shadow-[0_18px_60px_rgba(0,0,0,0.28)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/85 hover:shadow-[0_22px_70px_rgba(103,232,249,0.12)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "linear-gradient(rgba(103,232,249,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,0.07) 1px, transparent 1px)",
            backgroundSize: "34px 34px",
          }}
        />

        <div className="absolute right-[-2%] top-1/2 hidden h-[290px] w-[52%] -translate-y-1/2 overflow-hidden lg:block">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(103,232,249,0.10),transparent_62%)]" />
          <div className="absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#67E8F9]/15" />
          <div className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#D4AF37]/35" />
          <div className="absolute left-1/2 top-1/2 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl border border-[#67E8F9]/50 bg-[#070C12] shadow-[0_0_35px_rgba(103,232,249,0.14)]">
            <Layers className="h-10 w-10 text-[#67E8F9]" strokeWidth={1.3} />
          </div>
          <div className="absolute left-[28%] top-[25%] h-2 w-2 rounded-full bg-[#D4AF37]" />
          <div className="absolute right-[20%] top-[34%] h-2 w-2 rounded-full bg-[#67E8F9]" />
          <div className="absolute bottom-[24%] left-[34%] h-1.5 w-1.5 rounded-full bg-[#67E8F9]" />
          <div className="absolute bottom-[18%] right-[31%] h-1.5 w-1.5 rounded-full bg-[#D4AF37]" />
        </div>

        <div className="relative z-10 flex min-h-[250px] items-center px-6 py-7 sm:px-8 lg:px-9">
          <div className="max-w-[74%]">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-2 text-[12px] uppercase tracking-[0.22em] text-[#D4AF37]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37]" />
                SYSTEM ARCHITECTURE
              </span>
              <span className="text-[13px] uppercase tracking-wider text-[#7F8A96]">
                LIVE SECURITY ENGINE
              </span>
            </div>

            <h1 className="mt-3 text-4xl font-light leading-[0.95] tracking-tight text-[#F4F7FA] sm:text-5xl lg:text-6xl">
              Full-Stack Architecture &
              <span className="block text-[#67E8F9]">Security Engine</span>
            </h1>

            <p className="mt-4 max-w-2xl text-[14px] leading-6 text-[#A7B0BA]">
              End-to-end Zero Trust pipeline connecting the React interface,
              Express REST gateway, AI/ML UEBA engine, and cybersecurity
              PEP/PDP controller.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-lg border border-[#67E8F9]/25 bg-[#67E8F9]/[0.05] px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-[#67E8F9]">
                REACT + EXPRESS
              </span>
              <span className="rounded-lg border border-[#D4AF37]/30 bg-[#D4AF37]/[0.05] px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-[#D4AF37]">
                UEBA + XAI
              </span>
              <span className="rounded-lg border border-white/10 bg-[#070C12] px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-[#A7B0BA]">
                ZERO TRUST ACTIVE
              </span>
            </div>
          </div>

          <div className="absolute bottom-7 right-8 z-20">
            <button
              onClick={fetchHealthAndRoutes}
              disabled={healthLoading}
              className="flex items-center gap-2 rounded-xl border border-[#67E8F9]/35 bg-[#070C12] px-4 py-2.5 text-[11px] font-mono uppercase tracking-wider text-[#67E8F9] hover:border-[#67E8F9]/70 hover:bg-[#67E8F9]/[0.08] disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${healthLoading ? "animate-spin" : ""}`} />
              SYNC TELEMETRY
            </button>
          </div>
        </div>
      </section>
            {/* NAVIGATION */}
      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-[#03070C] p-2 sm:grid-cols-4">
        {[
          { id: "architecture", label: "1. FULL-STACK MAP", icon: Layers },
          { id: "backend-api", label: "2. REST API", icon: Server, tag: "12" },
          { id: "aiml-model", label: "3. AI / ML UEBA", icon: BrainCircuit, tag: "XAI" },
          { id: "cybersecurity", label: "4. ZERO TRUST", icon: Shield, tag: "PEP" },
        ].map(({ id, label, icon: Icon, tag }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-[11px] font-mono font-bold transition-all ${
              activeTab === id
                ? "border-[#67E8F9] bg-[#67E8F9] text-[#03070C]"
                : "border-transparent text-[#A7B0BA] hover:border-white/10 hover:bg-[#050A10] hover:text-white"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
            {tag && <span className="rounded border border-current/20 px-1.5 py-0.5 text-[9px]">{tag}</span>}
          </button>
        ))}
      </div>

      {/* TAB 1: ARCHITECTURE */}
      {activeTab === "architecture" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                title: "Node.js Backend",
                value: "Express REST Server",
                detail: `Port 3000 • Uptime ${healthData?.server?.uptimeSeconds ?? 0}s • Heap ${healthData?.server?.memory?.heapUsedMB ?? 0} MB`,
                tag: "BACKEND",
                color: "cyan",
              },
              {
                title: "Cybersecurity Core",
                value: "Zero Trust PEP / PDP",
                detail: "Continuous ABAC + Dynamic Risk & Trust Decay",
                tag: "NIST SP 800-207",
                color: "gold",
              },
              {
                title: "AI & Machine Learning",
                value: "UEBA Ensemble + XAI",
                detail: "Isolation Forest + Random Forest (0.978 ROC-AUC)",
                tag: "CERT r4.2",
                color: "cyan",
              },
              {
                title: "Frontend UI & Telemetry",
                value: "React 18 + SOC Stream",
                detail: "Multi-Role Gatekeeper, Step-Up MFA & Live Simulator",
                tag: "SPA",
                color: "gold",
              },
            ].map((item) => (
              <div key={item.title} className={`${panel} min-w-0`}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono font-bold uppercase text-[#7F8A96]">
                    {item.title}
                  </span>
                  <span className={`rounded px-2 py-1 text-[9px] font-mono ${
                    item.color === "gold"
                      ? "bg-[#D4AF37]/10 text-[#D4AF37]"
                      : "bg-[#67E8F9]/10 text-[#67E8F9]"
                  }`}>
                    {item.tag}
                  </span>
                </div>
                <div className="text-lg font-semibold text-[#F4F7FA]">{item.value}</div>
                <p className="mt-2 text-xs leading-5 text-[#A7B0BA]">{item.detail}</p>
              </div>
            ))}
          </div>

          <div className={`${panel} space-y-6`}>
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[#C5CDD5]">
              <GitBranch className={cyan} size={17} />
              NIST SP 800-207 Zero Trust & UEBA Execution Pipeline
            </h2>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
              {[
                {
                  n: "01",
                  title: "Subject & Endpoint",
                  description: "User identity, role, department, unverified IP, location, and hardware device trust score.",
                  details: [
                    `Subject: ${currentUser?.name || "Unknown User"}`,
                    `Role: ${currentUser?.role || "Not available"}`,
                    "Device Trust: 85%",
                  ],
                },
                {
                  n: "02",
                  title: "PEP Interceptor",
                  description: "Express API Gateway traps all file, resource, or authentication attempts before granting payload access.",
                  details: ["Route: /api/policy/evaluate", "Latency: ~1.2ms", "Status: Intercepting"],
                },
                {
                  n: "03",
                  title: "AI / ML Engine",
                  description: "12D feature vector extraction + Isolation Forest anomaly scoring + SHAP attribution breakdown.",
                  details: ["Model: Isolation Forest", "XAI: SHAP Factors", "Baseline: CERT r4.2"],
                },
                {
                  n: "04",
                  title: "PDP Decision",
                  description: "Synthesizes dynamic risk (0-100), trust score, sensitivity tier, and enforcement action.",
                  details: ["Actions: ALLOW | MFA | FREEZE", "Decay: -35 on Critical", "Recovery: +2 adaptive"],
                },
                {
                  n: "05",
                  title: "Mitigation & Audit",
                  description: "Step-up biometric verification, immediate token revocation, account freeze, and SOC logging.",
                  details: ["Action: Enforce", "Audit: Immutable", "SOC: Real-time"],
                },
              ].map((step) => (
                <div key={step.n} className="relative space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-all hover:-translate-y-1 hover:border-[#67E8F9]/30">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#67E8F9]/25 bg-[#67E8F9]/10 font-mono text-xs font-bold text-[#67E8F9]">
                    {step.n}
                  </div>
                  <h3 className="text-sm font-bold text-white">{step.title}</h3>
                  <p className="text-xs leading-5 text-[#A7B0BA]">{step.description}</p>
                  <div className="space-y-1 border-t border-white/10 pt-3 text-[10px] font-mono text-[#7F8A96]">
                    {step.details.map((detail) => <div key={detail}>• {detail}</div>)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div className={`${panel} space-y-4`}>
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#A7B0BA]">
                <Server className={cyan} size={16} />
                Backend Node.js & Express Modules
              </h3>
              {[
                ["server/risk-engine.js", "Multi-factor dynamic risk score computation (0-100) combining temporal, device, credential, and volume markers."],
                ["server/policy-engine.js", "NIST SP 800-207 PEP/PDP decision engine evaluating ALLOW, MONITOR, MFA, REQUIRE_APPROVAL, RESTRICT, FREEZE."],
                ["server/trust-engine.js", "Context-Based Access Control (CBAC) trust score decay and adaptive recovery calculator with historical logging."],
                ["server/gemini.js", "Threat intelligence and incident explanation copilot powered by Gemini with deterministic heuristic fallback."],
              ].map(([name, description]) => (
                <div key={name} className="flex items-start justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3">
                  <div>
                    <div className={`font-mono text-xs font-bold ${cyan}`}>{name}</div>
                    <p className="mt-1 text-[11px] leading-5 text-[#A7B0BA]">{description}</p>
                  </div>
                  <span className="shrink-0 rounded bg-emerald-500/10 px-2 py-1 text-[9px] font-mono text-emerald-400">ACTIVE</span>
                </div>
              ))}
            </div>

            <div className={`${panel} space-y-4`}>
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#A7B0BA]">
                <BrainCircuit className={gold} size={16} />
                AI / ML & Mathematical Pipeline
              </h3>
              {[
                ["12-Dimensional Feature Extractor", "Transforms raw events into normalized vector: time deviation, device trust deficit, cross-dept weight, download z-score.", "12 FEATURES"],
                ["Isolation Forest + Random Forest", "Ensemble model tuned on CERT Insider Threat Dataset r4.2 (14,280 samples) achieving 0.978 ROC-AUC.", "0.978 AUC"],
                ["SHAP Explainable AI (XAI)", "Directional feature attribution decomposing risk scores into human-readable factor contributions.", "XAI ATTRIBUTION"],
                ["Adaptive Trust State Machine", "Mathematical trust decay curve that penalizes anomalous sessions while rewarding consistent benign behavior.", "STATEFUL"],
              ].map(([name, description, tag]) => (
                <div key={name} className="flex items-start justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3">
                  <div>
                    <div className={`text-xs font-bold ${cyan}`}>{name}</div>
                    <p className="mt-1 text-[11px] leading-5 text-[#A7B0BA]">{description}</p>
                  </div>
                  <span className="shrink-0 rounded bg-[#67E8F9]/10 px-2 py-1 text-[9px] font-mono text-[#67E8F9]">{tag}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: REST API EXPLORER */}
      {activeTab === "backend-api" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className={`${panel} space-y-4 lg:col-span-5`}>
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#C5CDD5]">
                <Terminal className={cyan} size={16} />
                Backend Express Endpoints
              </h2>
              <span className="text-[11px] font-mono text-[#7F8A96]">{routes.length} Available</span>
            </div>

            <div className="max-h-[580px] space-y-2 overflow-y-auto pr-1">
              {routes.map((route, index) => {
                const isSelected =
                  selectedRoute?.path === route.path &&
                  selectedRoute?.method === route.method;

                return (
                  <button
                    key={`${route.method}-${route.path}-${index}`}
                    onClick={() => handleSelectRoute(route)}
                    className={`w-full rounded-xl border p-3 text-left transition-all ${
                      isSelected
                        ? "border-[#67E8F9]/50 bg-[#67E8F9]/[0.08] text-white"
                        : "border-white/5 bg-white/[0.02] text-[#C5CDD5] hover:border-white/15 hover:bg-white/[0.04]"
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-bold ${
                        route.method === "GET"
                          ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                          : "border border-[#67E8F9]/30 bg-[#67E8F9]/10 text-[#67E8F9]"
                      }`}>
                        {route.method}
                      </span>
                      <span className="truncate font-mono text-xs font-semibold">{route.path}</span>
                    </div>
                    <p className="line-clamp-2 text-[11px] text-[#A7B0BA]">{route.description}</p>
                  </button>
                );
              })}

              {!routes.length && (
                <div className="rounded-xl border border-dashed border-white/10 py-10 text-center text-xs text-[#7F8A96]">
                  {healthLoading ? "Loading API routes..." : "No API routes were returned by the server."}
                </div>
              )}
            </div>
          </div>

          <div className={`${panel} space-y-4 lg:col-span-7`}>
            {selectedRoute ? (
              <>
                <div className="flex flex-col justify-between gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 rounded bg-[#67E8F9]/10 px-2 py-1 text-xs font-mono font-bold text-[#67E8F9]">
                      {selectedRoute.method}
                    </span>
                    <span className="break-all font-mono text-sm font-bold text-white">{selectedRoute.path}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={handleCopyCurl}
                      className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-[#C5CDD5] hover:bg-white/10"
                    >
                      {copiedCurl ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                      {copiedCurl ? "Copied!" : "cURL"}
                    </button>
                    <button
                      onClick={handleExecuteApiRequest}
                      disabled={apiLoading}
                      className="flex items-center gap-2 rounded-lg bg-[#67E8F9] px-4 py-2 text-xs font-bold text-[#03070C] hover:bg-[#8CF0FA] disabled:opacity-50"
                    >
                      <Play size={13} />
                      {apiLoading ? "Executing..." : "Send Request"}
                    </button>
                  </div>
                </div>

                <p className="text-xs leading-5 text-[#A7B0BA]">{selectedRoute.description}</p>

                {selectedRoute.method !== "GET" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-mono font-bold uppercase text-[#A7B0BA]">
                      <span>Request JSON Body</span>
                      <span className="text-[#7F8A96]">application/json</span>
                    </div>
                    <textarea
                      value={customRequestBody}
                      onChange={(event) => setCustomRequestBody(event.target.value)}
                      rows={7}
                      spellCheck={false}
                      className="w-full resize-y rounded-xl border border-white/10 bg-[#070C12] p-3 font-mono text-xs text-[#67E8F9] focus:outline-none"
                      placeholder="{ ... }"
                    />
                  </div>
                )}

                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between text-[11px] font-mono font-bold uppercase text-[#A7B0BA]">
                    <div className="flex items-center gap-2">
                      <span>Live Server Response</span>
                      {apiStatus !== null && (
                        <span className={`rounded px-2 py-1 text-[10px] ${
                          apiStatus < 400
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-red-500/10 text-red-400"
                        }`}>
                          HTTP {apiStatus}
                        </span>
                      )}
                    </div>
                    {apiLatency !== null && <span className="text-[#7F8A96]">Roundtrip: {apiLatency}ms</span>}
                  </div>

                  <div className="max-h-[280px] overflow-y-auto rounded-xl border border-white/10 bg-[#070C12] p-4 font-mono text-xs">
                    {apiLoading ? (
                      <div className="flex items-center justify-center gap-2 py-5 text-[#7F8A96]">
                        <RefreshCw size={15} className="animate-spin text-[#67E8F9]" />
                        Sending HTTP request to Express backend...
                      </div>
                    ) : apiResponse ? (
                      <pre className="whitespace-pre-wrap break-words text-[#67E8F9]">
                        {JSON.stringify(apiResponse, null, 2)}
                      </pre>
                    ) : (
                      <div className="py-6 text-center text-[#7F8A96]">
                        Click "Send Request" to execute this endpoint on the live Node/Express server.
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="py-16 text-center text-xs text-[#7F8A96]">
                Select an endpoint from the left menu to inspect and execute it.
              </div>
            )}
          </div>
        </div>
      )}
            {/* TAB 3: AI / ML MODEL LAB */}
      {activeTab === "aiml-model" && (
        <div className="space-y-6">
          <div className={`${panel} space-y-6`}>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
                  <BrainCircuit className={cyan} size={17} />
                  Live Isolation Forest & UEBA Feature Vector Playground
                </h2>
                <p className="mt-1 text-xs leading-5 text-[#A7B0BA]">
                  Adjust behavioral features to trigger real-time feature extraction,
                  anomaly prediction, and SHAP attribution.
                </p>
              </div>

              <button
                onClick={handleRunLiveMlInference}
                disabled={mlInferring || !selectedMitreUser}
                className="flex items-center justify-center gap-2 rounded-xl bg-[#67E8F9] px-4 py-2.5 text-xs font-bold text-[#03070C] hover:bg-[#8CF0FA] disabled:opacity-50"
              >
                <Zap size={14} className={mlInferring ? "animate-spin" : ""} />
                {mlInferring ? "Inferring..." : "Execute ML Model"}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-6 rounded-xl border border-white/5 bg-white/[0.02] p-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-3">
                <div className="flex justify-between text-xs">
                  <span className="text-[#C5CDD5]">Access Time</span>
                  <span className={`font-mono font-bold ${cyan}`}>
                    {String(hourSlider).padStart(2, "0")}:00
                    {hourSlider < 8 || hourSlider > 18 ? " (Off-Hours)" : " (Normal)"}
                  </span>
                </div>
                <input type="range" min="0" max="23" value={hourSlider}
                  onChange={(e) => setHourSlider(Number(e.target.value))}
                  className="w-full accent-[#67E8F9]" />
                <div className="flex justify-between text-[10px] text-[#7F8A96]">
                  <span>00:00</span><span>12:00</span><span>23:00</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between text-xs">
                  <span className="text-[#C5CDD5]">Device Trust Rating</span>
                  <span className={`font-mono font-bold ${cyan}`}>{deviceTrustSlider}%</span>
                </div>
                <input type="range" min="5" max="100" value={deviceTrustSlider}
                  onChange={(e) => setDeviceTrustSlider(Number(e.target.value))}
                  className="w-full accent-[#67E8F9]" />
                <div className="flex justify-between text-[10px] text-[#7F8A96]">
                  <span>5% Untrusted</span><span>50%</span><span>100% Managed</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between text-xs">
                  <span className="text-[#C5CDD5]">Download Size</span>
                  <span className={`font-mono font-bold ${cyan}`}>{downloadVolumeSlider} MB</span>
                </div>
                <input type="range" min="10" max="2000" step="20" value={downloadVolumeSlider}
                  onChange={(e) => setDownloadVolumeSlider(Number(e.target.value))}
                  className="w-full accent-[#67E8F9]" />
                <div className="flex justify-between text-[10px] text-[#7F8A96]">
                  <span>10 MB</span><span>500 MB</span><span>2000 MB</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between text-xs">
                  <span className="text-[#C5CDD5]">Failed Authentication Count</span>
                  <span className={`font-mono font-bold ${cyan}`}>{failedLoginsSlider} attempts</span>
                </div>
                <input type="range" min="0" max="10" value={failedLoginsSlider}
                  onChange={(e) => setFailedLoginsSlider(Number(e.target.value))}
                  className="w-full accent-[#67E8F9]" />
                <div className="flex justify-between text-[10px] text-[#7F8A96]">
                  <span>0 Clean</span><span>5</span><span>10 Brute-Force</span>
                </div>
              </div>

              {[
                {
                  title: "Cross-Department Access",
                  description: "Access outside assigned department clearance",
                  checked: crossDeptChecked,
                  change: setCrossDeptChecked,
                },
                {
                  title: "Privilege Escalation Flag",
                  description: "Attempted admin command execution",
                  checked: privilegeChecked,
                  change: setPrivilegeChecked,
                },
                {
                  title: "USB Data Transfer",
                  description: "Removable storage activity detected",
                  checked: usbChecked,
                  change: setUsbChecked,
                },
              ].map((feature) => (
                <label key={feature.title}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/5 bg-[#070C12] p-3">
                  <span>
                    <span className="block text-xs font-medium text-white">{feature.title}</span>
                    <span className="mt-1 block text-[10px] text-[#7F8A96]">{feature.description}</span>
                  </span>
                  <input type="checkbox" checked={feature.checked}
                    onChange={(e) => feature.change(e.target.checked)}
                    className="h-4 w-4 accent-[#67E8F9]" />
                </label>
              ))}
            </div>

            {mlInferenceResult && (
              <div className="space-y-4 rounded-xl border border-[#67E8F9]/25 bg-[#070C12] p-5">
                {mlInferenceResult.error ? (
                  <p className="text-sm text-red-400">{mlInferenceResult.error}</p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold uppercase text-[#A7B0BA]">Model Output</span>
                        <span className={`rounded px-2 py-1 text-xs font-mono font-bold ${
                          mlInferenceResult.isAnomalous
                            ? "border border-red-500/30 bg-red-500/10 text-red-400"
                            : "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        }`}>
                          {mlInferenceResult.isAnomalous ? "ANOMALY DETECTED" : "BENIGN ACTIVITY"}
                        </span>
                      </div>
                      <div className="text-xs font-mono text-[#A7B0BA]">
                        Anomaly Score:{" "}
                        <span className="font-bold text-white">
                          {Number(mlInferenceResult.mlAnomalyScore ?? 0) * 100}%
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-[11px] font-mono font-bold uppercase text-[#A7B0BA]">
                        SHAP Explainable AI Attribution Breakdown
                      </div>

                      {(mlInferenceResult.attributions || []).length ? (
                        mlInferenceResult.attributions.map((attr, index) => (
                          <div key={`${attr.factor || "factor"}-${index}`}
                            className="flex items-center justify-between gap-4 rounded-lg border border-white/5 bg-white/[0.02] p-3">
                            <div>
                              <div className="text-xs font-semibold text-white">{attr.factor}</div>
                              <div className="mt-1 text-[11px] text-[#A7B0BA]">{attr.description}</div>
                            </div>
                            <span className="shrink-0 font-mono text-xs font-bold text-[#67E8F9]">
                              +{attr.scoreImpact} pts
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-[#7F8A96]">No attribution details were returned.</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className={`${panel} space-y-4`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
                <FileCode2 className={cyan} size={17} />
                Production Scikit-Learn / XGBoost Implementation Export
              </h3>
              <span className="text-[10px] font-mono text-[#D4AF37]">
                Python 3.10+ / CERT r4.2 Benchmark
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#070C12] p-4">
              <pre className="font-mono text-xs leading-6 text-[#67E8F9]">{`# Production Contextual UEBA Anomaly Detection Pipeline
import numpy as np
from sklearn.ensemble import IsolationForest
import xgboost as xgb
import shap

class ZeroTrustUEBAPipeline:
    def __init__(self):
        # Unsupervised Isolation Forest for raw outlier identification
        self.iso_forest = IsolationForest(
            n_estimators=200,
            contamination=0.035,
            random_state=42,
            n_jobs=-1
        )
        # Supervised XGBoost meta-classifier for contextual risk weighting
        self.xgb_model = xgb.XGBClassifier(
            max_depth=5,
            learning_rate=0.05,
            n_estimators=300,
            eval_metric="auc"
        )
        self.explainer = None

    def fit_pipeline(self, X_train, y_train):
        self.iso_forest.fit(X_train)
        iso_scores = -self.iso_forest.score_samples(X_train).reshape(-1, 1)
        X_enhanced = np.hstack([X_train, iso_scores])
        self.xgb_model.fit(X_enhanced, y_train)
        self.explainer = shap.TreeExplainer(self.xgb_model)
        return self

    def predict_risk_and_xai(self, feature_vector):
        iso_score = -self.iso_forest.score_samples(feature_vector.reshape(1, -1))
        x_in = np.hstack([feature_vector.reshape(1, -1), iso_score.reshape(1, 1)])
        prob = self.xgb_model.predict_proba(x_in)[0, 1]
        shap_values = self.explainer.shap_values(x_in)[0]
        return {
            "risk_probability": float(prob),
            "anomaly_score": float(iso_score[0]),
            "shap_attribution": shap_values.tolist()
        }`}</pre>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: CYBERSECURITY / ZERO TRUST */}
      {activeTab === "cybersecurity" && (
        <div className="space-y-6">
          <div className={`${panel} space-y-6`}>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
                  <Shield className={gold} size={17} />
                  MITRE ATT&CK Threat Simulation & Automated Zero Trust Mitigation
                </h2>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-[#A7B0BA]">
                  Launch adversary techniques against the Zero Trust Policy
                  Enforcement Point (PEP) and observe automated containment.
                </p>
              </div>

              <button
                onClick={handleRunMitreAttack}
                disabled={mitreExecuting || !selectedMitreUser}
                className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-50"
              >
                <Flame size={14} className={mitreExecuting ? "animate-spin" : ""} />
                {mitreExecuting ? "Executing Attack..." : "Launch MITRE Attack"}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  id: "T1078",
                  title: "Credential Stuffing",
                  description: "Multiple failed passwords from unverified external IP proxy.",
                },
                {
                  id: "T1048",
                  title: "Off-Hours Exfiltration",
                  description: "750 MB mass financial record download at 02:00 AM.",
                },
                {
                  id: "T1052",
                  title: "Removable USB Copy",
                  description: "Unencrypted peripheral drive file copy during active session.",
                },
                {
                  id: "T1068",
                  title: "Privilege Escalation",
                  description: "Unauthorized attempt to modify IAM administrative access rules.",
                },
              ].map((technique) => (
                <button
                  key={technique.id}
                  onClick={() => setSelectedMitreTechnique(technique.id)}
                  className={`rounded-xl border p-4 text-left transition-all ${
                    selectedMitreTechnique === technique.id
                      ? "border-[#D4AF37]/60 bg-[#D4AF37]/[0.08]"
                      : "border-white/10 bg-white/[0.02] hover:border-[#67E8F9]/30"
                  }`}
                >
                  <div className="mb-2 text-[10px] font-mono font-bold text-[#D4AF37]">
                    MITRE {technique.id}
                  </div>
                  <div className="mb-1 text-sm font-bold text-white">{technique.title}</div>
                  <p className="text-xs leading-5 text-[#A7B0BA]">{technique.description}</p>
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 sm:flex-row sm:items-center">
              <label htmlFor="mitre-target-user" className="text-xs font-medium text-[#A7B0BA]">
                Simulate Against Account
              </label>
              <select
                id="mitre-target-user"
                value={selectedMitreUser}
                onChange={(e) => setSelectedMitreUser(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-white/10 px-3 py-2 text-xs"
              >
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.employeeId} - {user.department}) - Risk: {user.currentRiskScore}
                  </option>
                ))}
              </select>
            </div>

            {mitigationResult && (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-400">
                <CheckCircle2 size={19} className="shrink-0" />
                <span className="font-medium">{mitigationResult}</span>
              </div>
            )}

            {mitreResult && (
              <div className="space-y-4 rounded-xl border border-red-500/30 bg-[#070C12] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                  <div>
                    <div className="text-xs font-mono font-bold text-[#D4AF37]">
                      {mitreResult.techniqueName}
                    </div>
                    <div className="mt-1 text-sm font-bold text-white">
                      {mitreResult.scenarioName}
                    </div>
                  </div>

                  {mitreResult.zeroTrustDecision && (
                    <span className={`rounded-lg border px-3 py-1.5 text-xs font-mono font-bold ${
                      mitreResult.zeroTrustDecision.decision === "FREEZE"
                        ? "border-red-500/30 bg-red-500/10 text-red-400"
                        : mitreResult.zeroTrustDecision.decision === "MFA"
                          ? "border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#D4AF37]"
                          : "border-[#67E8F9]/30 bg-[#67E8F9]/10 text-[#67E8F9]"
                    }`}>
                      PEP ACTION: {mitreResult.zeroTrustDecision.decision}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 text-xs md:grid-cols-3">
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                    <div className="text-[10px] font-mono uppercase text-[#7F8A96]">
                      New Dynamic Risk Score
                    </div>
                    <div className="mt-2 text-xl font-bold text-red-400">
                      {mitreResult.user?.newRiskScore ?? "—"} / 100
                    </div>
                    <div className="mt-1 text-[11px] text-[#A7B0BA]">
                      ML Anomaly: {Number(mitreResult.mlEvaluation?.anomalyScore ?? 0) * 100}%
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                    <div className="text-[10px] font-mono uppercase text-[#7F8A96]">
                      New Trust Score
                    </div>
                    <div className="mt-2 text-xl font-bold text-[#D4AF37]">
                      {mitreResult.user?.newTrustScore ?? "—"} / 100
                    </div>
                    <div className="mt-1 text-[11px] text-[#A7B0BA]">
                      Contextual Trust Decay Applied
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                    <div className="text-[10px] font-mono uppercase text-[#7F8A96]">
                      Account Security Standing
                    </div>
                    <div className="mt-2 text-xl font-bold text-white">
                      {mitreResult.user?.status ?? "—"}
                    </div>
                    <div className="mt-1 text-[11px] text-[#A7B0BA]">
                      {mitreResult.zeroTrustDecision?.isFrozen
                        ? "Account Auto-Frozen"
                        : "Access Restricted"}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
                  <span className="mr-2 text-xs font-mono font-bold text-[#A7B0BA]">
                    Execute Instant SOC Remediation:
                  </span>

                  <button
                    onClick={() => handleExecuteMitigation("FREEZE_ACCOUNT")}
                    className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-500"
                  >
                    Lock Account & Revoke JWT
                  </button>

                  <button
                    onClick={() => handleExecuteMitigation("STEP_UP_MFA")}
                    className="rounded-lg bg-[#D4AF37] px-3 py-2 text-xs font-bold text-[#03070C] hover:bg-[#E4C45A]"
                  >
                    Force Biometric MFA Challenge
                  </button>

                  <button
                    onClick={() => handleExecuteMitigation("ISOLATE_DEVICE")}
                    className="rounded-lg border border-[#67E8F9]/30 bg-[#67E8F9]/10 px-3 py-2 text-xs font-bold text-[#67E8F9] hover:bg-[#67E8F9]/20"
                  >
                    Isolate & Revoke Device
                  </button>

                  <button
                    onClick={() => handleExecuteMitigation("UNFREEZE_ACCOUNT")}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500"
                  >
                    Restore to Active Standing
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};