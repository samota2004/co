import React, { useEffect, useMemo, useState } from 'react';

import {

  Search,

  X,

  ShieldAlert,
  UserRound,

  Laptop,

  Clock,

  RefreshCw,

  Radar,

  ShieldCheck,



  Activity,

  Eye,


  FileSearch,

  Building2,

  Fingerprint,

  ExternalLink,

} from 'lucide-react';

import { requestApi } from '../services/api.js';

const panel =

  'rounded-2xl border border-white/10 bg-[#050A10] shadow-[0_18px_60px_rgba(0,0,0,0.18)]';

const normalizeValue = (value) => {

  if (value === null || value === undefined) {

    return '';

  }

  return String(value);

};

const getIncidentId = (incident) =>

  incident?.id || incident?.incidentId || incident?._id || '';

const getIncidentTitle = (incident) =>

  incident?.title ||

  incident?.eventType ||

  incident?.type ||

  'Security Incident';

const getUserDepartment = (user) =>

  user?.departmentName || user?.department || user?.departmentCode || '';

const getUserStatus = (user) =>

  user?.status ||

  user?.accountStatus ||

  (user?.isFrozen || user?.accountFrozen ? 'FROZEN' : 'ACTIVE');

const getUserRiskScore = (user) =>

  user?.riskScore ?? user?.currentRiskScore ?? null;

const getUserRiskLevel = (user) =>

  user?.riskLevel || user?.currentRiskLevel || '';

const getUserTrustScore = (user) =>

  user?.trustScore ?? user?.currentTrustScore ?? null;

const getSeverityStyle = (severity) => {

  switch (String(severity).toUpperCase()) {

    case 'CRITICAL':

      return 'border-red-400/30 text-red-300 bg-red-400/[0.08]';

    case 'HIGH':

      return 'border-orange-400/30 text-orange-300 bg-orange-400/[0.08]';

    case 'MEDIUM':

      return 'border-[#D4AF37]/30 text-[#D4AF37] bg-[#D4AF37]/[0.08]';

    case 'LOW':

      return 'border-[#67E8F9]/25 text-[#67E8F9] bg-[#67E8F9]/[0.07]';

    default:

      return 'border-white/15 text-[#A7B0BA] bg-white/[0.04]';

  }

};

const getStatusStyle = (status) => {

  switch (String(status).toUpperCase()) {

    case 'OPEN':

      return 'border-red-400/30 text-red-300 bg-red-400/[0.08]';

    case 'UNDER_REVIEW':

    case 'INVESTIGATING':

      return 'border-[#D4AF37]/30 text-[#D4AF37] bg-[#D4AF37]/[0.08]';

    case 'RESOLVED':

      return 'border-[#67E8F9]/25 text-[#67E8F9] bg-[#67E8F9]/[0.07]';

    default:

      return 'border-white/15 text-[#A7B0BA] bg-white/[0.04]';

  }

};

const formatDate = (value) => {

  if (!value) {

    return '—';

  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {

    return String(value);

  }

  return date.toLocaleString();

};

function SeverityBadge({ severity }) {

  return (

    <span

      className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${getSeverityStyle(

        severity

      )}`}

    >

      {severity || 'UNKNOWN'}

    </span>

  );

}

function StatusBadge({ status }) {

  return (

    <span

      className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${getStatusStyle(

        status

      )}`}

    >

      {String(status || 'UNKNOWN').replaceAll('_', ' ')}

    </span>

  );

}

function SummaryCard({ label, value, icon: Icon, accent = 'cyan' }) {

  const styles = {

    cyan: {

      icon: 'border-[#67E8F9]/20 bg-[#67E8F9]/[0.08] text-[#67E8F9]',

      value: 'text-[#67E8F9]',

    },

    gold: {

      icon: 'border-[#D4AF37]/20 bg-[#D4AF37]/[0.08] text-[#D4AF37]',

      value: 'text-[#D4AF37]',

    },

    red: {

      icon: 'border-red-400/20 bg-red-400/[0.07] text-red-300',

      value: 'text-red-300',

    },

  };

  const style = styles[accent];

  return (

    <article

      className={`${panel} p-5 transition-all duration-300 hover:border-[#67E8F9]/25 hover:bg-[#070C12]`}

    >

      <div className="flex items-center justify-between gap-3">

        <div>

          <p className="text-xs font-medium text-[#7F8A96]">{label}</p>

          <p className={`mt-3 text-3xl font-semibold tabular-nums ${style.value}`}>

            {value}

          </p>

        </div>

        <div

          className={`flex h-11 w-11 items-center justify-center rounded-xl border ${style.icon}`}

        >

          <Icon size={20} />

        </div>

      </div>

    </article>

  );

}

function DetailCard({ title, icon: Icon, children, accent = 'cyan' }) {

  const iconColor =

    accent === 'gold' ? 'text-[#D4AF37]' : 'text-[#67E8F9]';

  return (

    <section className="rounded-xl border border-white/[0.08] bg-[#050A10] p-4 transition-all duration-200 hover:border-[#67E8F9]/20">

      <div className={`mb-4 flex items-center gap-2 ${iconColor}`}>

        <Icon size={16} />

        <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em]">

          {title}

        </h3>

      </div>

      {children}

    </section>

  );

}

// Risk band used for risk-change alerts (matches default policy bands).
const riskBand = (score) =>
  score >= 80 ? 'CRITICAL' : score >= 60 ? 'HIGH' : score >= 40 ? 'MEDIUM' : 'LOW';

export const AlertsPage = ({

  users = [],

  incidents = [],


  notifications = [],


  onRefreshData,

  onSelectUser,

  onSelectIncident,

}) => {

  const [searchQuery, setSearchQuery] = useState('');

  const [severityFilter, setSeverityFilter] = useState('ALL');

  const [statusFilter, setStatusFilter] = useState('ALL');

  const [selectedAlert, setSelectedAlert] = useState(null);


  const [actionError, setActionError] = useState('');

  const [refreshing, setRefreshing] = useState(false);

  const [notificationPermission, setNotificationPermission] = useState(() =>

    typeof window !== 'undefined' && 'Notification' in window

      ? Notification.permission

      : 'unsupported'

  );

  const [investigatingId, setInvestigatingId] = useState(null);

  useEffect(() => {

    if (!selectedAlert) return;

    const previous = document.activeElement;

    document

      .querySelector('[aria-label="Close alert details"]')

      ?.focus();

    const close = (event) => {

      if (event.key === 'Escape') {

        setSelectedAlert(null);

      }

    };

    window.addEventListener('keydown', close);

    return () => {

      window.removeEventListener('keydown', close);

      previous?.focus?.();

    };

  }, [selectedAlert?.id]);

const userMap = useMemo(() => {

    const map = new Map();

    users.forEach((user) => {

      if (!user) return;

      if (user.id !== undefined && user.id !== null) {

        map.set(String(user.id), user);

      }

      if (user._id !== undefined && user._id !== null) {

        map.set(String(user._id), user);

      }

      if (user.email) {

        map.set(`email:${String(user.email).toLowerCase()}`, user);

      }

    });

    return map;

  }, [users]);

  const getIncidentUser = (incident) => {

    if (!incident) return null;

    const userId = incident.userId;

    if (userId !== undefined && userId !== null) {

      const user =

        userMap.get(String(userId)) ||

        userMap.get(`email:${String(userId).toLowerCase()}`);

      if (user) return user;

    }

    if (incident.userEmail) {

      return (

        userMap.get(`email:${String(incident.userEmail).toLowerCase()}`) ||

        null

      );

    }

    return null;

  };

  const incidentAlerts = useMemo(() => {

    return incidents.filter(Boolean).map((incident) => {

      const user = getIncidentUser(incident);

      return {

        incident,

        source: 'INCIDENT',

        user,

        id: getIncidentId(incident),

        severity: incident.severity || 'UNKNOWN',

        type: getIncidentTitle(incident),

        employeeName:

          user?.name ||

          incident.user?.name ||

          incident.userName ||

          'Unknown Employee',

        employeeEmail: user?.email || incident.userEmail || '',

        employeeId: user?.employeeId || incident.employeeId || '',

        userId: incident.userId || user?.id || user?._id || '',

        department:

          getUserDepartment(user) || incident.userDepartment || '',

        device:

          incident.deviceName ||

          incident.deviceId ||

          incident.device ||

          'Unknown Device',

        riskScore: incident.riskScore ?? incident.risk ?? null,

        detectedAt:

          incident.detectedAt ||

          incident.createdAt ||

          incident.timestamp ||

          null,

        status: incident.status || 'OPEN',

        details:

          incident.description ||

          incident.details ||

          'No incident description available.',

        recommendedAction: incident.recommendedAction || '',

        contributingFactors: Array.isArray(incident.contributingFactors)

          ? incident.contributingFactors

          : [],

        accountStatus: getUserStatus(user),

        riskLevel: getUserRiskLevel(user),

        userRiskScore: getUserRiskScore(user),

        trustScore: getUserTrustScore(user),

      };

    });

  }, [incidents, userMap]);

  // Risk changes from each employee's trust history (only rows where risk > 0
  // or trust actually moved; quiet hourly 0-risk checks are skipped).
  const [riskChanges, setRiskChanges] = useState([]);
  const employeeIds = useMemo(
    () =>
      users
        .filter((u) => ['EMPLOYEE', 'MANAGER'].includes(u?.roleCode || u?.role))
        .map((u) => u.id)
        .filter(Boolean),
    [users]
  );
  const employeeKey = employeeIds.join(',');

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      employeeIds.map((id) =>
        requestApi(`/api/trust/${encodeURIComponent(id)}/history?limit=200`)
          .then((res) => (res.history || []).map((row) => ({ ...row, userId: row.userId || id })))
          .catch(() => [])
      )
    ).then((lists) => {
      if (cancelled) return;
      setRiskChanges(
        lists.flat().filter((row) => Number(row.riskScore) > 0 || Number(row.delta) !== 0)
      );
    });
    return () => {
      cancelled = true;
    };
  }, [employeeKey, incidents.length, notifications.length]);

  const alerts = useMemo(() => {
    const userFor = (id) => (id ? userMap.get(String(id)) : null);
    const base = (user, userId) => ({
      user,
      userId: userId || '',
      employeeName: user?.name || 'Unknown Employee',
      employeeEmail: user?.email || '',
      employeeId: user?.employeeId || '',
      department: getUserDepartment(user) || '',
      accountStatus: getUserStatus(user),
      riskLevel: getUserRiskLevel(user),
      userRiskScore: getUserRiskScore(user),
      trustScore: getUserTrustScore(user),
      recommendedAction: '',
      contributingFactors: [],
    });

    const riskAlerts = riskChanges.map((row) => {
      const user = userFor(row.userId);
      const score = Math.round(Number(row.riskScore) || 0);
      const after = Number(row.trustScore);
      const delta = Number(row.delta) || 0;
      const before = Math.round((after - delta) * 100) / 100;
      const trustChange = `Trust ${before} → ${after} (${delta > 0 ? '+' : ''}${delta})`;
      return {
        ...base(user, row.userId),
        source: 'RISK_CHANGE',
        id: `risk-${row.id}`,
        severity: riskBand(score),
        type: 'Risk change',
        device: 'Endpoint activity',
        riskScore: score,
        trustChange,
        detectedAt: row.timestamp,
        status: 'NOTICE',
        details: `${trustChange}. ${row.reason || 'Recorded risk assessment.'}`,
      };
    });

    // SECURITY_INCIDENT notifications are skipped: those incidents are already listed.
    const endpointAlerts = notifications
      .filter((n) => n && n.type !== 'SECURITY_INCIDENT')
      .map((n) => {
        const user = userFor(n.targetUserId);
        return {
          ...base(user, n.targetUserId),
          ...(user ? {} : { employeeName: 'Device-level alert' }),
          source: 'ENDPOINT',
          id: `notice-${n.id}`,
          severity: String(n.severity || 'MEDIUM').toUpperCase(),
          type: n.title || n.type,
          device: n.metadata?.deviceName || '—',
          riskScore: n.metadata?.riskScore ?? null,
          detectedAt: n.createdAt,
          status: 'NOTICE',
          details: n.message || '',
        };
      });

    return [...incidentAlerts, ...riskAlerts, ...endpointAlerts].sort(
      (a, b) => new Date(b.detectedAt || 0) - new Date(a.detectedAt || 0)
    );
  }, [incidentAlerts, riskChanges, notifications, userMap]);

  const severityOptions = useMemo(() => {

    const values = new Set();

    incidents.forEach((incident) => {

      if (incident?.severity) {

        values.add(String(incident.severity).toUpperCase());

      }

    });

    ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].forEach((value) => {

      values.add(value);

    });

    return Array.from(values);

  }, [incidents]);

  const statusOptions = useMemo(() => {

    const values = new Set();

    incidents.forEach((incident) => {

      if (incident?.status) {

        values.add(String(incident.status).toUpperCase());

      }

    });

    ['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'NOTICE'].forEach((value) => {

      values.add(value);

    });

    return Array.from(values);

  }, [incidents]);

  const filteredAlerts = useMemo(() => {

    const query = searchQuery.trim().toLowerCase();

    return alerts.filter((alert) => {

      const searchableValues = [

        alert.id,

        alert.type,

        alert.employeeName,

        alert.employeeEmail,

        alert.employeeId,

        alert.department,

        alert.device,

        alert.severity,

        alert.status,

        alert.details,

        alert.recommendedAction,

      ];

      const matchesSearch =

        !query ||

        searchableValues.some((value) =>

          normalizeValue(value).toLowerCase().includes(query)

        );

      const matchesSeverity =

        severityFilter === 'ALL' ||

        String(alert.severity).toUpperCase() === severityFilter;

      const matchesStatus =

        statusFilter === 'ALL' ||

        String(alert.status).toUpperCase() === statusFilter;

      return matchesSearch && matchesSeverity && matchesStatus;

    });

  }, [alerts, searchQuery, severityFilter, statusFilter]);

  const totalCount = alerts.length;

  const criticalCount = incidentAlerts.filter(

    (alert) =>

      String(alert.severity).toUpperCase() === 'CRITICAL' &&

      String(alert.status).toUpperCase() !== 'RESOLVED'

  ).length;

  const openCount = incidentAlerts.filter(

    (alert) => String(alert.status).toUpperCase() === 'OPEN'

  ).length;

  const unresolvedCount = incidentAlerts.filter(

    (alert) => String(alert.status).toUpperCase() !== 'RESOLVED'

  ).length;

  const handleRefresh = async () => {

    if (!onRefreshData) return;

    try {

      setRefreshing(true);

      setActionError('');

      await onRefreshData();

    } catch (error) {

      console.error('Failed to refresh alerts:', error);

      setActionError(error.message || 'Failed to refresh alerts.');

    } finally {

      setRefreshing(false);

    }

  };

  const handleOpenAlert = (alert) => {

    setActionError('');

    setSelectedAlert(alert);

  };

  const enableNotifications = async () => {

    if (!('Notification' in window)) {

      setNotificationPermission('unsupported');

      return;

    }

    const permission = await Notification.requestPermission();

    setNotificationPermission(permission);

  };

  const acknowledgeAlert = async (alert) => {

    const id = getIncidentId(alert);

    if (!id) return;

    setActionError('');

    setInvestigatingId(id);

    try {

      const result = await requestApi(

        `/api/incidents/${encodeURIComponent(id)}`,

        {

          method: 'PATCH',

          body: {

            status: 'INVESTIGATING',

            notes: 'Acknowledged from the security alert inbox.',

          },

        }

      );

      setSelectedAlert((current) =>

        current

          ? {

              ...current,

              ...result.incident,

              status: 'INVESTIGATING',

            }

          : current

      );

      await onRefreshData?.();

    } catch (error) {

      setActionError(

        error.message || 'Unable to acknowledge this incident.'

      );

    } finally {

      setInvestigatingId(null);

    }

  };

  const accountStatusStyle =

    selectedAlert?.accountStatus === 'FROZEN'

      ? 'border-red-400/25 bg-red-400/[0.06] text-red-300'

      : selectedAlert?.accountStatus === 'ACTIVE'

        ? 'border-[#67E8F9]/25 bg-[#67E8F9]/[0.06] text-[#67E8F9]'

        : 'border-white/10 bg-white/[0.03] text-[#A7B0BA]';

  return (

    <div className="mx-auto w-full max-w-[1500px] space-y-6 px-5 pb-10 pt-5 text-[#F4F7FA] sm:px-8 lg:px-12">

      {/* Hero */}

      <section className="group relative min-h-[250px] overflow-hidden rounded-2xl border border-[#67E8F9]/55 bg-[#050A10] shadow-[0_18px_60px_rgba(0,0,0,0.28)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/85 hover:shadow-[0_22px_70px_rgba(103,232,249,0.12)]">

        <div className="pointer-events-none absolute inset-0 opacity-70">

          <div className="absolute inset-0 bg-[linear-gradient(rgba(103,232,249,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(103,232,249,0.035)_1px,transparent_1px)] bg-[size:34px_34px]" />

          <div className="absolute right-0 top-0 h-full w-[52%] bg-[radial-gradient(circle_at_center,rgba(103,232,249,0.09),transparent_48%)]" />

        </div>

        <div className="pointer-events-none absolute right-10 top-1/2 hidden h-52 w-[52%] -translate-y-1/2 lg:block">

          <div className="absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#67E8F9]/15" />

          <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#D4AF37]/25" />

          <div className="absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl border border-[#67E8F9]/55 bg-[#070C12]/90 shadow-[0_0_35px_rgba(103,232,249,0.12)]">

            <Radar className="h-9 w-9 text-[#67E8F9]" />

          </div>

          <div className="absolute left-[24%] top-[28%] h-2 w-2 rounded-full bg-[#67E8F9] shadow-[0_0_14px_rgba(103,232,249,0.9)]" />

          <div className="absolute right-[22%] top-[25%] h-2 w-2 rounded-full bg-[#D4AF37] shadow-[0_0_14px_rgba(212,175,55,0.85)]" />

          <div className="absolute bottom-[24%] left-[30%] h-2 w-2 rounded-full bg-[#67E8F9] shadow-[0_0_14px_rgba(103,232,249,0.9)]" />

          <div className="absolute bottom-[20%] right-[28%] h-2 w-2 rounded-full bg-[#D4AF37] shadow-[0_0_14px_rgba(212,175,55,0.85)]" />

          <div className="absolute left-1/2 top-1/2 h-px w-48 -translate-x-1/2 bg-gradient-to-r from-transparent via-[#67E8F9]/35 to-transparent" />

          <div className="absolute left-1/2 top-1/2 h-48 w-px -translate-y-1/2 bg-gradient-to-b from-transparent via-[#67E8F9]/25 to-transparent" />

          <div className="absolute right-0 top-1/2 -translate-y-1/2 rounded-lg border border-[#67E8F9]/20 bg-[#050A10]/85 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-[#7F8A96]">

            LIVE TRIAGE

          </div>

        </div>

        <div className="relative z-10 flex min-h-[250px] items-center px-6 py-7 sm:px-8 lg:px-9">

          <div className="max-w-full lg:max-w-[74%]">

            <div className="flex flex-wrap items-center gap-3">

              <span className="flex items-center gap-2 text-[12px] uppercase tracking-[0.22em] text-[#D4AF37]">

                <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.75)]" />

                SOC Alert Inbox

              </span>

              <span className="text-[13px] uppercase tracking-wider text-[#7F8A96]">

                Real-Time Threat Triage

              </span>

            </div>

            <h1 className="mt-3 text-4xl font-light leading-[0.98] tracking-tight text-[#F4F7FA] sm:text-5xl lg:text-6xl">

              Security Alerts &amp; Behavioral

              <span className="block text-[#67E8F9]">Warnings</span>

            </h1>

            <p className="mt-4 max-w-2xl text-sm leading-6 text-[#A7B0BA]">

              Security alerts are generated dynamically from persisted incident

              records and current employee risk state.

            </p>

            <div className="mt-5 flex flex-wrap items-center gap-2.5">

              <span className="rounded-full border border-[#67E8F9]/25 bg-[#67E8F9]/[0.05] px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-[#67E8F9]">

                Threat Triage

              </span>

              <span className="rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/[0.05] px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-[#D4AF37]">

                Behavioral Risk

              </span>

              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-[#7F8A96]">

                {unresolvedCount} Active

              </span>

              <button

                type="button"

                onClick={enableNotifications}

                disabled={

                  notificationPermission === 'granted' ||

                  notificationPermission === 'unsupported'

                }

                className="rounded-full border border-[#67E8F9]/25 px-3 py-1.5 text-[11px] text-[#67E8F9] transition hover:bg-[#67E8F9]/[0.08] disabled:cursor-not-allowed disabled:opacity-50"

              >

                {notificationPermission === 'granted'

                  ? 'Browser notifications enabled'

                  : notificationPermission === 'denied'

                    ? 'Browser notifications blocked'

                    : notificationPermission === 'unsupported'

                      ? 'Notifications unavailable'

                      : 'Enable browser notifications'}

              </button>

            </div>

          </div>

          <div className="absolute bottom-7 right-7 hidden items-center gap-3 lg:flex">

            <div className="rounded-xl border border-[#D4AF37]/25 bg-[#070C12]/90 px-4 py-2.5">

              <div className="text-[10px] uppercase tracking-[0.16em] text-[#7F8A96]">

                Active Unresolved

              </div>

              <div className="mt-1 text-lg font-medium text-[#D4AF37]">

                {unresolvedCount}

              </div>

            </div>

            <button

              type="button"

              onClick={handleRefresh}

              disabled={refreshing}

              className="flex items-center gap-2 rounded-xl border border-[#67E8F9]/35 bg-[#67E8F9]/[0.06] px-4 py-2.5 text-[12px] font-medium uppercase tracking-[0.12em] text-[#67E8F9] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/70 hover:bg-[#67E8F9]/10 disabled:cursor-not-allowed disabled:opacity-50"

            >

              <RefreshCw

                className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}

              />

              {refreshing ? 'Refreshing...' : 'Refresh'}

            </button>

          </div>

        </div>

      </section>

      {/* Summary cards */}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">

        <SummaryCard

          label="Total alerts"

          value={totalCount}

          icon={Radar}

          accent="cyan"

        />

        <SummaryCard

          label="Critical unresolved"

          value={criticalCount}

          icon={ShieldAlert}

          accent="red"

        />

        <SummaryCard

          label="Open incidents"

          value={openCount}

          icon={Activity}

          accent="gold"

        />

        <SummaryCard

          label="Active unresolved"

          value={unresolvedCount}

          icon={Clock}

          accent="cyan"

        />

      </section>

      {/* Search and filters */}

      <section className={`${panel} flex flex-col items-center justify-between gap-4 p-4 transition-all duration-300 hover:border-white/15 sm:p-5 md:flex-row`}>

        <div className="relative w-full md:max-w-md">

          <input

            type="text"

            value={searchQuery}

            onChange={(event) => setSearchQuery(event.target.value)}

            placeholder="Search incident ID, employee, device..."

            aria-label="Search alerts"

            className="w-full rounded-xl border border-white/10 bg-[#070C12] py-3 pl-10 pr-4 text-sm text-[#F4F7FA] outline-none transition placeholder:text-[#59636E] hover:border-[#67E8F9]/30 focus:border-[#67E8F9]/60 focus:ring-2 focus:ring-[#67E8F9]/10"

          />

          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#67E8F9]" />

        </div>

        <div className="flex w-full flex-wrap items-center gap-3 md:w-auto">

          <label className="flex items-center gap-2 text-xs text-[#7F8A96]">

            <span>SEVERITY</span>

            <select

              value={severityFilter}

              onChange={(event) => setSeverityFilter(event.target.value)}

              className="rounded-xl border border-white/10 bg-[#070C12] px-3 py-2.5 text-xs text-[#F4F7FA] outline-none transition hover:border-[#67E8F9]/30 focus:border-[#67E8F9]/60"

            >

              <option value="ALL">All Severities</option>

              {severityOptions.map((severity) => (

                <option key={severity} value={severity}>

                  {severity.replaceAll('_', ' ')}

                </option>

              ))}

            </select>

          </label>

          <label className="flex items-center gap-2 text-xs text-[#7F8A96]">

            <span>STATUS</span>

            <select

              value={statusFilter}

              onChange={(event) => setStatusFilter(event.target.value)}

              className="rounded-xl border border-white/10 bg-[#070C12] px-3 py-2.5 text-xs text-[#F4F7FA] outline-none transition hover:border-[#67E8F9]/30 focus:border-[#67E8F9]/60"

            >

              <option value="ALL">All Statuses</option>

              {statusOptions.map((status) => (

                <option key={status} value={status}>

                  {status.replaceAll('_', ' ')}

                </option>

              ))}

            </select>

          </label>

          <span className="rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/[0.05] px-3 py-1.5 text-[11px] font-semibold text-[#D4AF37]">

            {totalCount} TOTAL

          </span>

          <span className="rounded-full border border-red-400/30 bg-red-400/[0.05] px-3 py-1.5 text-[11px] font-semibold text-red-300">

            {criticalCount} CRITICAL

          </span>

          <span className="rounded-full border border-orange-400/30 bg-orange-400/[0.05] px-3 py-1.5 text-[11px] font-semibold text-orange-300">

            {openCount} OPEN

          </span>

        </div>

      </section>

      {/* Incident table */}

      <section className={`${panel} overflow-hidden transition-all duration-300 hover:border-white/15`}>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-4">

          <div>

            <h2 className="text-base font-semibold text-[#F4F7FA]">

              Security incident records

            </h2>

            <p className="mt-1 text-xs text-[#7F8A96]">

              Showing {filteredAlerts.length} of {totalCount} incidents

            </p>

          </div>

          <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-[#67E8F9]">

            <span className="h-1.5 w-1.5 rounded-full bg-[#67E8F9]" />

            Incident monitoring

          </span>

        </div>

        <div className="overflow-x-auto">

          <table className="w-full min-w-[1050px] text-left text-sm">

            <thead className="border-b border-white/10 bg-[#070C12] text-[10px] uppercase tracking-[0.16em] text-[#D4AF37]">

              <tr>

                <th className="px-4 py-4 text-center">Severity</th>

                <th className="px-4 py-4">Incident</th>

                <th className="px-4 py-4">Employee</th>

                <th className="px-4 py-4">Device</th>

                <th className="px-4 py-4 text-center">Risk</th>

                <th className="px-4 py-4">Detected</th>

                <th className="px-4 py-4 text-center">Account</th>

                <th className="px-4 py-4 text-center">Status</th>

                <th className="px-4 py-4 text-right">Action</th>

              </tr>

            </thead>

            <tbody className="divide-y divide-white/[0.06]">

              {filteredAlerts.length > 0 ? (

                filteredAlerts.map((alert) => (

                  <tr

                    key={alert.id || `${alert.type}-${alert.detectedAt}`}

                    className="transition-all duration-200 hover:bg-[#67E8F9]/[0.04] hover:shadow-[inset_3px_0_0_#67E8F9]"

                  >

                    <td className="px-4 py-4 text-center">

                      <SeverityBadge severity={alert.severity} />

                    </td>

                    <td className="px-4 py-4">

                      <span className="block text-sm font-semibold text-[#F4F7FA]">

                        {alert.type}

                      </span>

                      <span className="mt-1 block max-w-[160px] truncate font-mono text-[10px] text-[#7F8A96]">

                        {alert.source === 'INCIDENT'
                          ? alert.id || '—'
                          : alert.source === 'RISK_CHANGE'
                            ? 'Risk change'
                            : 'Endpoint alert'}

                      </span>

                      {alert.trustChange && (
                        <span className="mt-1 block text-[11px] font-semibold text-[#D4AF37]">
                          {alert.trustChange}
                        </span>
                      )}

                    </td>

                    <td className="px-4 py-4">

                      <span className="block text-sm text-[#F4F7FA]">

                        {alert.employeeName}

                      </span>

                      <span className="mt-1 block text-[11px] text-[#7F8A96]">

                        {alert.employeeEmail || '—'}

                      </span>

                      <span className="mt-1 block text-[10px] text-[#59636E]">

                        {alert.department || '—'}

                      </span>

                    </td>

                    <td className="px-4 py-4 text-xs text-[#A7B0BA]">

                      <div className="flex items-center gap-2">

                        <Laptop className="h-3.5 w-3.5 shrink-0 text-[#67E8F9]" />

                        <span>{alert.device}</span>

                      </div>

                    </td>

                    <td className="px-4 py-4 text-center">

                      <span className="font-semibold tabular-nums text-[#D4AF37]">

                        {alert.riskScore ?? '—'}

                      </span>

                      {alert.riskScore !== null &&

                        alert.riskScore !== undefined && (

                          <span className="text-[11px] text-[#7F8A96]">

                            /100

                          </span>

                        )}

                    </td>

                    <td className="px-4 py-4 text-xs text-[#A7B0BA]">

                      <div className="flex items-center gap-2">

                        <Clock className="h-3.5 w-3.5 shrink-0 text-[#7F8A96]" />

                        {formatDate(alert.detectedAt)}

                      </div>

                    </td>

                    <td className="px-4 py-4 text-center">

                      <span

                        className={`inline-flex rounded-lg border px-2.5 py-1 text-[10px] font-semibold uppercase ${alert.accountStatus === 'FROZEN'

                          ? 'border-red-400/30 bg-red-400/[0.07] text-red-300'

                          : alert.accountStatus === 'ACTIVE'

                            ? 'border-[#67E8F9]/25 bg-[#67E8F9]/[0.06] text-[#67E8F9]'

                            : 'border-white/10 text-[#A7B0BA]'

                          }`}

                      >

                        {alert.accountStatus || 'UNKNOWN'}

                      </span>

                    </td>

                    <td className="px-4 py-4 text-center">

                      <StatusBadge status={alert.status} />

                    </td>

                    <td className="px-4 py-4 text-right">

                      <button

                        type="button"

                        onClick={() => handleOpenAlert(alert)}

                        className="rounded-xl border border-[#67E8F9]/30 px-4 py-2 text-[11px] font-semibold tracking-wider text-[#67E8F9] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#67E8F9]/65 hover:bg-[#67E8F9]/[0.08]"

                      >

                        REVIEW

                      </button>

                    </td>

                  </tr>

                ))

              ) : (

                <tr>

                  <td colSpan={9} className="px-4 py-16 text-center">

                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-[#7F8A96]">

                      <Search size={21} />

                    </div>

                    <p className="mt-4 text-sm font-medium text-[#C5CDD5]">

                      No matching incidents

                    </p>

                    <p className="mt-1 text-xs text-[#7F8A96]">

                      Try changing your search term or filters.

                    </p>

                  </td>

                </tr>

              )}

            </tbody>

          </table>

        </div>

      </section>

      {/* Investigation drawer */}

      {selectedAlert && (

        <div

          role="dialog"

          aria-modal="true"

          aria-label="Alert investigation"

          className="fixed inset-0 z-50 flex justify-end bg-[#03070C]/75 backdrop-blur-md"

        >

          <div className="h-full w-full max-w-xl overflow-y-auto border-l border-[#67E8F9]/15 bg-[#03070C] p-5 text-[#F4F7FA] shadow-[-24px_0_80px_rgba(0,0,0,0.35)] sm:p-7">

            {/* Drawer header */}

            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">

              <div className="min-w-0">

                <span className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-[#67E8F9]">

                  <ShieldCheck size={14} />

                  INCIDENT INVESTIGATION

                </span>

                <h2 className="mt-2 break-words text-2xl font-semibold tracking-tight text-[#F4F7FA]">

                  {selectedAlert.type}

                </h2>

                <span className="mt-2 block break-all font-mono text-[11px] text-[#7F8A96]">

                  {selectedAlert.id || '—'}

                </span>

              </div>

              <button

                type="button"

                aria-label="Close alert details"

                onClick={() => setSelectedAlert(null)}

                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 text-[#A7B0BA] transition hover:border-[#67E8F9]/40 hover:bg-[#67E8F9]/[0.06] hover:text-[#67E8F9]"

              >

                <X size={19} />

              </button>

            </div>

            <div className="mt-6 space-y-5">

              {/* Incident actions */}

              <div className="flex flex-wrap gap-2">

                {selectedAlert.source === 'INCIDENT' &&
                  selectedAlert.status !== 'INVESTIGATING' &&

                  selectedAlert.status !== 'RESOLVED' && (

                    <button

                      type="button"

                      disabled={

                        investigatingId === getIncidentId(selectedAlert)

                      }

                      className="inline-flex items-center gap-2 rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/[0.06] px-3.5 py-2.5 text-xs font-semibold text-[#D4AF37] transition hover:bg-[#D4AF37]/[0.12] disabled:opacity-50"

                      onClick={() => acknowledgeAlert(selectedAlert)}

                    >

                      <Eye size={14} />

                      {investigatingId === getIncidentId(selectedAlert)

                        ? 'Acknowledging...'

                        : 'Acknowledge & investigate'}

                    </button>

                  )}

                {selectedAlert.source === 'INCIDENT' && (

                <button

                  type="button"

                  className="inline-flex items-center gap-2 rounded-xl border border-[#67E8F9]/25 px-3.5 py-2.5 text-xs font-semibold text-[#67E8F9] transition hover:bg-[#67E8F9]/[0.07]"

                  onClick={() => onSelectIncident?.(selectedAlert.id)}

                >

                  <ExternalLink size={14} />

                  Open incident

                </button>

                )}

                <button

                  type="button"

                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3.5 py-2.5 text-xs font-semibold text-[#C5CDD5] transition hover:border-white/25 hover:bg-white/[0.04]"

                  onClick={() => onSelectUser?.(selectedAlert.userId)}

                >

                  <UserRound size={14} />

                  Employee profile

                </button>

              </div>

              {/* Severity and status */}

              <div className="flex flex-wrap items-center gap-2">

                <SeverityBadge severity={selectedAlert.severity} />

                <StatusBadge status={selectedAlert.status} />

              </div>

              {/* Risk summary */}

              <div className="grid grid-cols-2 gap-3">

                <div className="rounded-xl border border-white/[0.08] bg-[#050A10] p-4 transition hover:border-[#D4AF37]/30">

                  <span className="mb-2 block text-[10px] uppercase tracking-[0.15em] text-[#7F8A96]">

                    Incident risk

                  </span>

                  <span className="text-3xl font-semibold tabular-nums text-[#D4AF37]">

                    {selectedAlert.riskScore ?? '—'}

                  </span>

                  {selectedAlert.riskScore !== null &&

                    selectedAlert.riskScore !== undefined && (

                      <span className="ml-1 text-xs text-[#7F8A96]">

                        /100

                      </span>

                    )}

                </div>

                <div className="rounded-xl border border-white/[0.08] bg-[#050A10] p-4 transition hover:border-[#67E8F9]/30">

                  <span className="mb-2 block text-[10px] uppercase tracking-[0.15em] text-[#7F8A96]">

                    Account risk

                  </span>

                  <span className="text-3xl font-semibold tabular-nums text-[#67E8F9]">

                    {selectedAlert.userRiskScore ?? '—'}

                  </span>

                  {selectedAlert.userRiskScore !== null &&

                    selectedAlert.userRiskScore !== undefined && (

                      <span className="ml-1 text-xs text-[#7F8A96]">

                        /100

                      </span>

                    )}

                </div>

              </div>

              {/* Employee information */}

              <DetailCard

                title="Employee information"

                icon={UserRound}

                accent="gold"

              >

                <div className="grid grid-cols-2 gap-x-4 gap-y-4 text-xs">

                  <div className="min-w-0">

                    <span className="mb-1 block text-[#7F8A96]">Name</span>

                    <span className="break-words text-[#F4F7FA]">

                      {selectedAlert.employeeName || '—'}

                    </span>

                  </div>

                  <div className="min-w-0">

                    <span className="mb-1 block text-[#7F8A96]">

                      Employee ID

                    </span>

                    <span className="break-words text-[#F4F7FA]">

                      {selectedAlert.employeeId || '—'}

                    </span>

                  </div>

                  <div className="min-w-0">

                    <span className="mb-1 block text-[#7F8A96]">Email</span>

                    <span className="break-all text-[#F4F7FA]">

                      {selectedAlert.employeeEmail || '—'}

                    </span>

                  </div>

                  <div className="min-w-0">

                    <span className="mb-1 block text-[#7F8A96]">

                      Department

                    </span>

                    <span className="break-words text-[#F4F7FA]">

                      {selectedAlert.department || '—'}

                    </span>

                  </div>

                </div>

              </DetailCard>

              {/* Account security state */}

              <DetailCard

                title="Account security state"

                icon={Fingerprint}

                accent="gold"

              >

                <div>
                  <span className="mb-2 block text-xs text-[#7F8A96]">
                    Current account status
                  </span>
                  <span
                    className={`inline-flex rounded-lg border px-3 py-1.5 text-xs font-semibold ${accountStatusStyle}`}
                  >
                    {selectedAlert.accountStatus || 'UNKNOWN'}
                  </span>
                </div>

              </DetailCard>

              {/* Action errors */}

              {actionError && (

                <div

                  role="alert"

                  className="flex gap-3 rounded-xl border border-red-400/25 bg-red-400/[0.06] p-4 text-sm leading-6 text-red-300"

                >

                  <ShieldAlert size={17} className="mt-0.5 shrink-0" />

                  <span>{actionError}</span>

                </div>

              )}

              {/* Incident description */}

              <DetailCard

                title="Incident description"

                icon={FileSearch}

                accent="gold"

              >

                <p className="whitespace-pre-wrap break-words text-sm leading-7 text-[#C5CDD5]">

                  {selectedAlert.details}

                </p>

              </DetailCard>

              {/* Recommended action */}

              {selectedAlert.recommendedAction && (

                <DetailCard

                  title="Recommended action"

                  icon={ShieldCheck}

                  accent="cyan"

                >

                  <p className="whitespace-pre-wrap break-words text-sm leading-7 text-[#C5CDD5]">

                    {selectedAlert.recommendedAction}

                  </p>

                </DetailCard>

              )}

              {/* Contributing factors */}

              {selectedAlert.contributingFactors.length > 0 && (

                <DetailCard

                  title="Contributing factors"

                  icon={Activity}

                  accent="gold"

                >

                  <div className="space-y-2">

                    {selectedAlert.contributingFactors.map(

                      (factor, index) => (

                        <div

                          key={`${selectedAlert.id}-${index}`}

                          className="flex items-start gap-3 rounded-lg border border-white/[0.07] bg-[#03070C]/70 p-3 text-sm text-[#C5CDD5] transition hover:border-[#D4AF37]/25"

                        >

                          <span className="mt-0.5 text-[10px] font-semibold text-[#D4AF37]">

                            {String(index + 1).padStart(2, '0')}

                          </span>

                          <span className="break-words">{factor}</span>

                        </div>

                      )

                    )}

                  </div>

                </DetailCard>

              )}

              {/* Incident metadata */}

              <section className="rounded-xl border border-[#D4AF37]/20 bg-[#050A10] p-4">

                <div className="mb-4 flex items-center gap-2 text-[#D4AF37]">

                  <Building2 size={15} />

                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em]">

                    Incident metadata

                  </span>

                </div>

                <div className="space-y-3 text-xs">

                  {[

                    {

                      label: 'Detected',

                      value: formatDate(selectedAlert.detectedAt),

                    },

                    {

                      label: 'Risk level',

                      value: selectedAlert.riskLevel || '—',

                    },

                    {

                      label: 'Trust score',

                      value: selectedAlert.trustScore ?? '—',

                    },

                    {

                      label: 'Device',

                      value: selectedAlert.device || '—',

                    },

                  ].map((item) => (

                    <div

                      key={item.label}

                      className="flex items-start justify-between gap-4 border-b border-white/[0.06] pb-3 last:border-0 last:pb-0"

                    >

                      <span className="text-[#7F8A96]">{item.label}</span>

                      <span className="break-words text-right font-medium text-[#C5CDD5]">

                        {item.value}

                      </span>

                    </div>

                  ))}

                </div>

              </section>

            </div>

          </div>

        </div>

      )}

    </div>

  );

};