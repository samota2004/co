import React,{useEffect,useState} from "react";
import {requestApi} from "../services/api.js";
import {
  Shield,
  ShieldCheck,
  Laptop,
  CheckCircle2,
  Lock,
  Activity,
  TrendingUp,
  FileText,
  Clock,
  Wifi,
  Monitor,
  Smartphone,
  AlertCircle,
} from "lucide-react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useTheme } from "../context/ThemeContext";
import { EndpointMonitor } from '../components/EndpointMonitor.jsx';

const employeeRole = user => ['EMPLOYEE', 'MANAGER'].includes(user?.roleCode || user?.role);

export const EmployeeDashboard = ({ currentUser, users = [], isAdminView = false, selectedEmployeeId = '', ...props }) => {
  const [selectedId, setSelectedId] = useState(() => isAdminView && users.some(user => user.id === selectedEmployeeId && employeeRole(user)) ? selectedEmployeeId : '');
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const employeeRows = users.filter(employeeRole);

  useEffect(() => {
    if (!isAdminView) return;
    setSelectedId(employeeRows.some(user => user.id === selectedEmployeeId) ? selectedEmployeeId : '');
    setDetail(null);
    setError('');
  }, [selectedEmployeeId, isAdminView]);

  useEffect(() => {
    if (!isAdminView || !selectedId) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    setDetail(null);
    requestApi(`/api/users/${encodeURIComponent(selectedId)}`)
      .then(result => {
        if (result.user?.id !== selectedId || !employeeRole(result.user)) {
          throw new Error('The server did not return the selected employee.');
        }
        if (!cancelled) setDetail(result);
      })
      .catch(reason => { if (!cancelled) setError(reason.message || 'Unable to load this employee.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isAdminView, selectedId]);

  if (isAdminView && !selectedId) {
    return <div className="mx-auto w-full max-w-[1500px] space-y-5 px-5 pb-10 sm:px-8 lg:px-12">
      <header className="rounded-2xl border border-[#67E8F9]/40 bg-[#050A10] p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-[#D4AF37]">EMPLOYEE MONITORING</p>
        <h1 className="mt-2 text-3xl font-light">Select an employee</h1>
        <p className="mt-2 text-sm text-[#A7B0BA]">Choose an authorized employee to view their security posture, login sessions, activity, and endpoint agent.</p>
      </header>
      <section className="overflow-x-auto rounded-2xl border border-white/10 bg-[#050A10] p-5" aria-label="Employee list">
        <h2 className="mb-4 text-xl">Employee List</h2>
        {employeeRows.length ? <table className="w-full text-left"><thead><tr><th className="p-3">Name</th><th className="p-3">Employee ID</th><th className="p-3">Department</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3">Risk</th><th className="p-3">Trust</th></tr></thead><tbody>
          {employeeRows.map(user => <tr key={user.id} tabIndex={0} role="button" aria-label={`View ${user.name}`} onClick={() => setSelectedId(user.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(user.id); } }} className="cursor-pointer border-t border-white/10 hover:bg-white/5 focus-visible:outline focus-visible:outline-cyan-300">
            <td className="p-3">{user.name}</td><td className="p-3">{user.employeeId || '—'}</td><td className="p-3">{user.department || user.departmentCode || '—'}</td><td className="p-3">{user.roleCode || user.role}</td><td className="p-3">{user.status}</td><td className="p-3">{user.currentRiskScore ?? user.riskScore ?? '—'}</td><td className="p-3">{user.currentTrustScore ?? user.trustScore ?? '—'}</td>
          </tr>)}
        </tbody></table> : <p role="status">No authorized employees available.</p>}
      </section>
    </div>;
  }

  if (isAdminView) {
    if (loading) return <div className="p-6"><button type="button" onClick={() => { setSelectedId(''); setDetail(null); }}>Employee List</button><p role="status" className="mt-4">Loading selected employee…</p></div>;
    if (error || !detail) return <div className="p-6"><button type="button" onClick={() => { setSelectedId(''); setDetail(null); setError(''); }}>Employee List</button>{error && <p role="alert" className="mt-4 text-red-400">{error}</p>}</div>;
    return <div><div className="px-5 pt-4 sm:px-8 lg:px-12"><button type="button" onClick={() => { setSelectedId(''); setDetail(null); }} className="rounded border border-cyan-700 px-3 py-2">← Employee List</button></div><EmployeeDashboardDetails {...props} currentUser={detail.user} events={detail.events || []} devices={detail.devices || []} monitoringData={detail} /></div>;
  }

  return <EmployeeDashboardDetails {...props} currentUser={currentUser} />;
};

const EmployeeDashboardDetails = ({
  currentUser,
  events = [],
  devices = [],
  onOpenAccessRequestModal,
  monitoringData = null,
}) => {
  const { isDark } = useTheme();

  // ======================================================
  // DATA / EMPLOYEE CONTEXT
  // ======================================================

  // Filter events and devices for this employee
  const userEvents = events.filter((e) => e.userId === currentUser?.id);
  const userDevices = devices.filter((d) => d.userId === currentUser?.id);
  const displayEvents = userEvents;
  const displayDevices = userDevices;
  const [activeSessions, setActiveSessions] = useState([]);
const [sessionsLoading, setSessionsLoading] = useState(true);
const [sessionsError, setSessionsError] = useState(false);

useEffect(() => {
  let cancelled = false;

  const loadSessions = async () => {
    try {
      const result = monitoringData
        ? { sessions: (monitoringData.sessions || []).filter(session => session.status === 'ACTIVE') }
        : await requestApi("/api/auth/sessions");

      if (!cancelled) {
        setActiveSessions(result.sessions ?? []);
        setSessionsError(false);
      }
    } catch (error) {
      if (!cancelled) {
        setSessionsError(true);
      }
    } finally {
      if (!cancelled) {
        setSessionsLoading(false);
      }
    }
  };

  loadSessions();

  return () => {
    cancelled = true;
  };
}, [currentUser?.id, monitoringData]);

  // ======================================================
  // SECURITY STATUS
  // ======================================================
  const riskScore = currentUser?.currentRiskScore ?? currentUser?.riskScore ?? 0;
  const trustScore = currentUser?.currentTrustScore ?? currentUser?.trustScore ?? 0;

  const getSecurityStatus = (score) => {
    if (score < 40)
      return {
        label: "HEALTHY & SAFE",
        color: "text-emerald-400",
        border: "border-cyan-300/25",
      };
    if (score < 60)
      return {
        label: "ELEVATED MONITORING",
        color: "text-cyan-300",
        border: "border-cyan-300/60",
      };
    if (score < 75)
      return {
        label: "RESTRICTED PRIVILEGES",
        color: "text-orange-400",
        border: "border-orange-500/50",
      };
    return {
      label: "FROZEN / CONTAINED",
      color: "text-red-400",
      border: "border-red-500/50",
    };
  };

  const status = getSecurityStatus(riskScore);

  // ======================================================
  // CHART DATA
  // ======================================================
  const[history,setHistory]=useState([]),[historyError,setHistoryError]=useState('');
  useEffect(()=>{if(!currentUser?.id)return;if(monitoringData){setHistory(monitoringData.trustHistory||[]);setHistoryError('');return;}const refresh=()=>requestApi('/api/users/'+currentUser.id).then(d=>{setHistory(d.trustHistory||[]);setHistoryError('');}).catch(e=>setHistoryError(e.message));refresh();const timer=setInterval(refresh,30000);return()=>clearInterval(timer);},[currentUser?.id,monitoringData]);
  const trendData=history.map(h=>({time:new Date(h.timestamp).toLocaleTimeString(),trust:h.trustScore,risk:h.riskScore,logins:userEvents.filter(e=>['LOGIN','LOGIN_SUCCESS'].includes(e.eventType)&&Math.floor(new Date(e.timestamp).getTime()/60000)===Math.floor(new Date(h.timestamp).getTime()/60000)).length}));
  const loginTrendData=monitoringData?.loginHistory?.some(row=>['AUTH_LOGIN','AUTH_FAILED'].includes(row.action))?monitoringData.loginHistory.filter(row=>['AUTH_LOGIN','AUTH_FAILED'].includes(row.action)).slice().reverse().map(row=>({time:new Date(row.timestamp).toLocaleTimeString(),logins:1})):trendData;
  const groups=new Map();for(const e of userEvents){const name=e.eventType||e.type||'Unknown';groups.set(name,(groups.get(name)||0)+1);}
  const totalActivity=[...groups.values()].reduce((total,value)=>total+value,0);
  const activityDist=[...groups].map(([name,value],i)=>({name,value:totalActivity?Math.round(value*100/totalActivity):0,color:['#67E8F9','#D4AF37','#F59E0B','#94A3B8'][i%4]}));

  // ======================================================
  // MAIN COMPONENT
  // ======================================================

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 px-5 pb-10 sm:px-8 lg:px-12">
      {historyError&&<p role="alert" className="text-red-400">{historyError}</p>}
      {!history.length&&<p>No recorded risk/trust trend yet.</p>}
      {currentUser?.id && <EndpointMonitor employeeId={currentUser.id} />}
      {/* Editorial Profile Header */}
      <div className="console-hero group relative min-h-[210px] overflow-hidden rounded-2xl border border-[#67E8F9]/55 bg-[#050A10] shadow-[0_18px_60px_rgba(0,0,0,0.28)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/85 hover:shadow-[0_22px_70px_rgba(103,232,249,0.12)]">
        <div className="relative z-10 flex min-h-[210px] items-center px-6 py-7 sm:px-8 lg:px-9">
          <div className="relative z-10 max-w-[74%]">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <span className="text-[12px] uppercase tracking-[0.22em] text-[#D4AF37]">
                <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.7)]" />
                EMPLOYEE SECURITY CENTER
              </span>
              <span className="text-[13px] uppercase tracking-wider text-[#7F8A96]">
                ID: {currentUser?.employeeId || "EMP001"}
              </span>
            </div>

            <h1 className="text-4xl font-light leading-[0.95] tracking-tight text-[#F4F7FA] sm:text-5xl lg:text-6xl">
              {currentUser?.name || "Employee Profile"}
            </h1>

            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-[#A7B0BA]">
              <div>
                <span className="text-[#7F8A96]">DEPARTMENT: </span>
                <span className="text-current font-semibold">
                  {currentUser?.department || "Engineering"}
                </span>
              </div>
              <div>
                <span className="text-[#7F8A96]">ROLE: </span>
                <span className="text-current font-semibold">
                  {currentUser?.role?.replace("_", " ") || "Main Admin"}
                </span>
              </div>
              {currentUser?.email && <div><span className="text-[#7F8A96]">EMAIL: </span><span className="text-current font-semibold">{currentUser.email}</span></div>}
              <div>
                <span className="text-[#7F8A96]">SECURITY STATUS: </span>
                <span className={`font-semibold ${status.color}`}>
                  {status.label}
                </span>
              </div>
            </div>
            <p className="mt-4 max-w-2xl text-[14px] leading-6 text-[#A7B0BA]">
              Continuous employee security visibility across identity, devices,
              trust posture, and behavioral activity.
            </p>
          </div>

          {/* Employee security visual */}
          <div className="pointer-events-none absolute inset-y-0 right-0 w-[52%] overflow-hidden">
            <div
              className="absolute inset-0 opacity-70"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(103,232,249,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,0.08) 1px, transparent 1px)",
                backgroundSize: "49px 54px",
              }}
            />
            <div className="absolute right-[18%] top-1/2 h-40 w-40 -translate-y-1/2 rounded-full border border-[#67E8F9]/15" />
            <div className="absolute right-[18%] top-1/2 h-32 w-32 -translate-y-1/2 rounded-full border border-[#D4AF37]/30" />
            <div className="absolute right-[18%] top-1/2 h-24 w-24 -translate-y-1/2 rounded-full border border-[#67E8F9]/25" />
            <div className="absolute right-[18%] top-1/2 flex h-20 w-20 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-2xl border border-[#67E8F9]/45 bg-[#050A10]/80 shadow-[0_0_35px_rgba(103,232,249,0.08)]">
              <ShieldCheck
                className="h-9 w-9 text-[#67E8F9]"
                strokeWidth={1.5}
              />
            </div>
            <span className="absolute right-[18%] top-[20%] h-2 w-2 translate-x-1/2 rounded-full bg-[#D4AF37] shadow-[0_0_12px_rgba(212,175,55,0.8)]" />
            <span className="absolute right-[18%] bottom-[20%] h-2 w-2 translate-x-1/2 rounded-full bg-[#67E8F9] shadow-[0_0_12px_rgba(103,232,249,0.8)]" />
          </div>

          <div className="absolute left-0 top-0 h-10 w-1 rounded-br-full bg-[#D4AF37]" />
          <div className="absolute bottom-0 right-0 h-10 w-1 rounded-tl-full bg-[#67E8F9]" />

          <div className="absolute bottom-9 right-9 z-20 flex items-center gap-3">
            <button
              onClick={onOpenAccessRequestModal}
              className="inline-flex items-center gap-2 rounded-xl border border-[#67E8F9] bg-[#67E8F9] px-5 py-3 text-[12px] font-semibold tracking-[0.14em] text-[#03070C] transition-all duration-200 hover:bg-transparent hover:text-[#67E8F9] cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>REQUEST ACCESS</span>
            </button>
          </div>
        </div>
      </div>

      {/* Top 4 Metric Overview: Trust Score, Risk Score, Status, Active Sessions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Trust Score */}
        <div
          className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/30 hover:bg-[#070C12] sm:p-6 lg:p-7`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] uppercase tracking-[0.2em] text-[#D4AF37]">
              TRUST SCORE
            </span>
            <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
          </div>
          <div className="text-3xl font-light tracking-tight sm:text-4xl text-current">
            {trustScore}{" "}
            <span className="text-sm font-mono text-[#A7B0BA]">/ 100</span>
          </div>
          <p className="mt-2 text-[13px] leading-5 text-[#A7B0BA]">
            Recorded trust standing from contextual policy assessments
          </p>
        </div>

        {/* Current Risk Score */}
        <div
          className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/30 hover:bg-[#070C12] sm:p-6 lg:p-7`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] uppercase tracking-[0.2em] text-[#D4AF37]">
              CURRENT RISK
            </span>
            <Activity className="w-4 h-4 text-[#D4AF37]" />
          </div>
          <div className="text-3xl font-light tracking-tight sm:text-4xl text-[#D4AF37]">
            {riskScore}{" "}
            <span className="text-sm font-mono text-[#A7B0BA]">/ 100</span>
          </div>
          <p className="mt-2 text-[13px] leading-5 text-[#A7B0BA]">
            Contextual risk; model evidence only when complete features are available
          </p>
        </div>

        {/* Security Status */}
        <div
          className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/30 hover:bg-[#070C12] sm:p-6 lg:p-7`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] uppercase tracking-[0.2em] text-[#D4AF37]">
              POLICY POSTURE
            </span>
            <Lock className="w-4 h-4 text-[#D4AF37]" />
          </div>
          <div className={`text-2xl font-light tracking-tight ${status.color}`}>
            {status.label}
          </div>
          <p className="mt-2 text-[13px] leading-5 text-[#A7B0BA]">
            Account state: {currentUser?.status || "ACTIVE"}
          </p>
        </div>

        {/* Active Sessions */}
        <div
          className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/30 hover:bg-[#070C12] sm:p-6 lg:p-7`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] uppercase tracking-[0.2em] text-[#D4AF37]">
              ACTIVE LOGIN SESSIONS
            </span>
            <Laptop className="w-4 h-4 text-[#D4AF37]" />
          </div>
          <div className="text-3xl font-light tracking-tight sm:text-4xl text-current">
            {sessionsLoading || sessionsError ? "—" : activeSessions.length}{" "}
<span className="text-sm font-mono text-[#A7B0BA]">
  Active Sessions
</span>
          </div>
          <p className="mt-2 text-[13px] leading-5 text-[#A7B0BA]">
            Valid, non-expired login sessions. Registered devices are listed separately.
          </p>
        </div>
      </div>

      {/* 4 Required Charts: Risk Trend, Trust Trend, Login Activity, Activity Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Risk Trend & Trust Trend (8 cols) */}
        <div
          className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/30 hover:bg-[#070C12] sm:p-6 lg:p-7 lg:col-span-8`}
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <span className="text-[12px] uppercase tracking-[0.2em] text-[#D4AF37] block">
                BEHAVIORAL POSTURE
              </span>
              <h3 className="text-2xl font-light tracking-tight mt-1">
                Risk &amp; Trust Trend
              </h3>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono">
              <span className="flex items-center gap-1.5 text-[#67E8F9]">
                <span className="w-2.5 h-0.5 bg-[#67E8F9]" />
                Risk
              </span>
              <span className="flex items-center gap-1.5 text-[#A7B0BA]">
                <span className="w-2.5 h-0.5 bg-gray-400" />
                Trust
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="empRiskGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#67E8F9" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#67E8F9" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="time"
                  stroke={isDark ? "#4B5563" : "#9CA3AF"}
                  fontSize={12}
                  tickLine={false}
                  axisLine={{
                    stroke: isDark
                      ? "rgba(212,175,55,0.2)"
                      : "rgba(197,160,89,0.3)",
                  }}
                />
                <YAxis
                  stroke={isDark ? "#4B5563" : "#9CA3AF"}
                  fontSize={12}
                  domain={[0, 100]}
                  tickLine={false}
                  axisLine={{
                    stroke: isDark
                      ? "rgba(212,175,55,0.2)"
                      : "rgba(197,160,89,0.3)",
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? "#000000" : "#FFFFFF",
                    borderColor: "#67E8F9",
                    borderWidth: "1px",
                    borderRadius: "12px",
                    fontSize: "0.75rem",
                    fontFamily: "monospace",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="risk"
                  stroke="#67E8F9"
                  strokeWidth={1.75}
                  fillOpacity={1}
                  fill="url(#empRiskGrad)"
                  name="Risk Score"
                />
                <Area
                  type="monotone"
                  dataKey="trust"
                  stroke={isDark ? "#E5E7EB" : "#4B5563"}
                  strokeWidth={1.25}
                  fillOpacity={0}
                  name="Trust Score"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Activity Distribution (4 cols) */}
        <div
          className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/30 hover:bg-[#070C12] sm:p-6 lg:p-7 lg:col-span-4 flex flex-col justify-between`}
        >
          <div>
            <span className="text-[12px] uppercase tracking-[0.2em] text-[#D4AF37] block">
              BREAKDOWN
            </span>
            <h3 className="text-2xl font-light tracking-tight mt-1">
              Activity Distribution
            </h3>
          </div>

          <div className="h-44 my-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={activityDist}
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={68}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {activityDist.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.color}
                      stroke={isDark ? "#000" : "#FFF"}
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? "#000000" : "#FFFFFF",
                    borderColor: "#67E8F9",
                    borderWidth: "1px",
                    borderRadius: "12px",
                    fontSize: "0.75rem",
                    fontFamily: "monospace",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-2 pt-3 border-t border-white/10">
            {activityDist.map((d, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-xs font-mono"
              >
                <span className="flex items-center gap-2 text-[#A7B0BA]">
                  <span
                    className="w-2 h-2"
                    style={{ backgroundColor: d.color }}
                  />
                  {d.name}
                </span>
                <span className="font-semibold text-current">{d.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Login Activity Chart */}
      <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/30 hover:bg-[#070C12] sm:p-6 lg:p-7">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-[12px] uppercase tracking-[0.2em] text-[#D4AF37] block">
              AUTHENTICATION HISTORY
            </span>
            <h3 className="text-2xl font-light tracking-tight mt-1">
              Login Activity
            </h3>
          </div>
          <span className="text-[13px] uppercase tracking-wider text-[#7F8A96]">
            HOURLY LOGIN ATTEMPTS
          </span>
        </div>

        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={loginTrendData}>
              <XAxis
                dataKey="time"
                stroke={isDark ? "#4B5563" : "#9CA3AF"}
                fontSize={12}
                tickLine={false}
                axisLine={{
                  stroke: isDark
                    ? "rgba(212,175,55,0.2)"
                    : "rgba(197,160,89,0.3)",
                }}
              />
              <YAxis
                stroke={isDark ? "#4B5563" : "#9CA3AF"}
                fontSize={12}
                tickLine={false}
                axisLine={{
                  stroke: isDark
                    ? "rgba(212,175,55,0.2)"
                    : "rgba(197,160,89,0.3)",
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: isDark ? "#000000" : "#FFFFFF",
                  borderColor: "#67E8F9",
                  borderWidth: "1px",
                  borderRadius: "12px",
                  fontSize: "0.75rem",
                  fontFamily: "monospace",
                }}
              />
              <Line
                type="monotone"
                dataKey="logins"
                stroke="#67E8F9"
                strokeWidth={2}
                dot={{
                  stroke: "#D4AF37",
                  strokeWidth: 1.5,
                  r: 3,
                  fill: isDark ? "#000" : "#FFF",
                }}
                name="Logins"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Device Information & Active Sessions */}
      {/* Valid Login Sessions */}
<div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 sm:p-6 lg:p-7">
  <div className="flex items-center justify-between mb-6 pb-3 border-b border-white/10">
    <div>
      <span className="text-[12px] uppercase tracking-[0.2em] text-[#D4AF37] block">
        ACCOUNT SECURITY
      </span>
      <h3 className="text-2xl font-light tracking-tight mt-1">
        Valid Login Sessions
      </h3>
    </div>
    <span className="text-[12px] font-mono text-[#D4AF37] border border-cyan-300/25 px-2.5 py-0.5">
      {sessionsLoading || sessionsError ? "—" : activeSessions.length} SESSIONS
    </span>
  </div>

  {sessionsLoading ? (
    <p className="text-[#A7B0BA]">Loading sessions...</p>
  ) : sessionsError ? (
    <p role="alert" className="text-red-400">
      Unable to load login sessions.
    </p>
  ) : activeSessions.length === 0 ? (
    <p className="text-[#A7B0BA]">No valid login sessions found.</p>
  ) : (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {activeSessions.map((session) => {
        const isMobile = /Android|iPhone|Mobile/i.test(
          session.userAgent || ""
        );

        const browser = /Edg\//.test(session.userAgent || "")
          ? "Microsoft Edge"
          : /Chrome\//.test(session.userAgent || "")
            ? "Google Chrome"
            : /Firefox\//.test(session.userAgent || "")
              ? "Firefox"
              : "Unknown Browser";

        const os = /Android/i.test(session.userAgent || "")
          ? "Android"
          : /Windows/i.test(session.userAgent || "")
            ? "Windows"
            : /iPhone|iPad/i.test(session.userAgent || "")
              ? "iOS"
              : /Macintosh/i.test(session.userAgent || "")
                ? "macOS"
                : "Unknown OS";

        return (
          <div
            key={session.id}
            className="rounded-xl border border-white/10 bg-[#070C12] p-5"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 border border-cyan-300/25 flex items-center justify-center">
                {isMobile ? (
                  <Smartphone className="w-5 h-5 text-[#D4AF37]" />
                ) : (
                  <Laptop className="w-5 h-5 text-[#D4AF37]" />
                )}
              </div>

              <div>
                <div className="text-base font-medium">
                  {isMobile ? "Mobile Browser" : "Desktop Browser"}
                </div>
                <div className="text-xs text-[#A7B0BA]">
                  {os} • {browser}
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-white/10 text-xs font-mono text-[#A7B0BA] space-y-2">
              <p>IP: {session.ip || "Unknown"}</p>
              <p>
                Login: {new Date(session.createdAt).toLocaleString()}
              </p>
              <p>
                Expires: {new Date(session.expiresAt).toLocaleString()}
              </p>
              <p className="text-[#D4AF37]">
                VALID LOGIN SESSION
              </p>
            </div>
          </div>
        );
      })}
    </div>
  )}
</div>

      {/* Recent Activities & Security Events */}
      <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:border-[#67E8F9]/30 hover:bg-[#070C12] sm:p-6 lg:p-7">
        <div className="flex items-center justify-between mb-6 pb-3 border-b border-white/10">
          <div>
            <span className="text-[12px] uppercase tracking-[0.2em] text-[#D4AF37] block">
              USER AUDIT LOG
            </span>
            <h3 className="text-2xl font-light tracking-tight mt-1">
              Recent Activities &amp; Security Events
            </h3>
          </div>
          <span className="text-[13px] uppercase tracking-wider text-[#7F8A96]">
            RECORDED BY ZERO TRUST PDP
          </span>
        </div>

        <div className="space-y-3">
          {displayEvents.map((evt) => (
            <div
              key={evt.id}
              className={`rounded-xl p-4 border text-xs transition-all ${
                evt.isAnomalous ||
                (evt.riskContribution && evt.riskContribution >= 50)
                  ? "border-red-500/40 bg-red-500/5"
                  : "border-white/10 bg-[#070C12]"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">
                  {evt.eventType}{" "}
                  {evt.resourceName ? `→ ${evt.resourceName}` : ""}
                </span>
                <span className="text-[13px] uppercase tracking-wider text-[#7F8A96]">
                  {new Date(evt.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className="flex items-center justify-between text-[#A7B0BA] text-[13px] font-mono">
                <span>
                  Location / Device: {evt.ipAddress || "Corporate Intranet"}
                </span>
                <span className="text-[#D4AF37]">
                  Risk: {evt.riskContribution || 15}/100
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      {monitoringData && <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <section className="rounded-2xl border border-white/10 bg-[#050A10] p-5"><h2 className="mb-3 text-xl">Incidents</h2>{monitoringData.incidents?.length ? monitoringData.incidents.map(item=><p key={item.id} className="border-t border-white/10 py-2">{item.title} · {item.severity} · {item.status}</p>) : <p className="text-[#A7B0BA]">No incidents recorded for this employee.</p>}</section>
        <section className="rounded-2xl border border-white/10 bg-[#050A10] p-5"><h2 className="mb-3 text-xl">Access requests</h2>{monitoringData.accessRequests?.length ? monitoringData.accessRequests.map(item=><p key={item.id} className="border-t border-white/10 py-2">{item.resource?.name || 'Resource'} · {item.status} · {new Date(item.createdAt).toLocaleString()}</p>) : <p className="text-[#A7B0BA]">No access requests recorded for this employee.</p>}</section>
        <section className="rounded-2xl border border-white/10 bg-[#050A10] p-5"><h2 className="mb-3 text-xl">Audit history</h2>{monitoringData.auditEvents?.length ? monitoringData.auditEvents.map(item=><p key={item.id} className="border-t border-white/10 py-2">{item.action} · {item.severity} · {new Date(item.timestamp).toLocaleString()}</p>) : <p className="text-[#A7B0BA]">No audit activity available for this employee.</p>}</section>
      </div>}
    </div>
  );
};
