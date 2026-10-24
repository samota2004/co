import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { requestApi } from '../services/api.js';
import {EndpointCity} from './EndpointCity.jsx';
const request = (path,method='GET',body) => requestApi(`/api/endpoint${path}`, { method, body });
const isDeviceUuid = value => typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function DeviceUuid({deviceId}) {
  const [copyState,setCopyState]=useState('');
  const copy=async()=>{
    setCopyState('copying');
    try {
      await navigator.clipboard.writeText(deviceId);
      setCopyState('copied');
    } catch {setCopyState('failed');}
  };
  if(!isDeviceUuid(deviceId))return <p role="status">Assigned device UUID unavailable. Refresh the device list.</p>;
  return <div className="space-y-1">
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span>Assigned device UUID: <code aria-label="Assigned device UUID" className="break-all select-all">{deviceId}</code></span>
      <button type="button" disabled={copyState==='copying'} onClick={copy} className="text-cyan-300 disabled:opacity-50">{copyState==='copied'?'Copied UUID':'Copy Device UUID'}</button>
    </div>
    <p className="text-xs text-slate-400">Enter this UUID at the macOS installer's “Assigned Mac device UUID” prompt. Enter the enrollment token separately at its hidden token prompt.</p>
    <p role="status" className={copyState==='failed'?'text-sm text-amber-200':'text-sm text-emerald-300'}>{copyState==='failed'?'Clipboard unavailable. Select and copy the displayed device UUID manually.':copyState==='copied'?'Device UUID copied.':''}</p>
  </div>;
}
export const formatEndpointEvent = e => ({...e, timestamp:e.occurredAt,eventType:e.type});
const applicationKey = name => typeof name==='string'?name.toLowerCase():'';
const applicationLabel = name => ({chrome:'Chrome',brave:'Brave',msedge:'Microsoft Edge',firefox:'Mozilla Firefox',notepad:'Notepad',code:'Visual Studio Code',powershell:'PowerShell',windowsterminal:'Windows Terminal'})[applicationKey(name)] || name || 'Unknown application';
const eventAppKey = e => e.metadata?.appId ? `app:${e.metadata.appId.toLowerCase()}` : applicationKey(e.metadata?.name);
const eventAppLabel = e => e.metadata?.appName && e.metadata.appName!==e.metadata.name ? e.metadata.appName : applicationLabel(e.metadata?.name);
const usageDuration = seconds => {
  const value=Math.max(0,Number(seconds)||0);
  if(value<60)return `${value.toLocaleString(undefined,{maximumFractionDigits:2})} seconds`;
  const minutes=Math.floor(value/60), remaining=Math.floor(value%60);
  return minutes<60?`${minutes} min ${remaining} sec`:`${Math.floor(minutes/60)} hr ${minutes%60} min ${remaining} sec`;
};
export const EndpointMonitor = forwardRef(function EndpointMonitor({ employeeId, administrator=false }, ref) {
  const [data,setData]=useState({devices:[],employees:[],events:[],incidents:[],ml:{available:false}});
  const [error,setError]=useState(''), [refreshError,setRefreshError]=useState(''), [notice,setNotice]=useState('');
  const [token,setToken]=useState(null), [copied,setCopied]=useState(false), [refreshing,setRefreshing]=useState(false), [pending,setPending]=useState('');
  const [assignment,setAssignment]=useState({deviceId:'',userId:'',name:'',platform:'win32',mappedIdentity:''}), [savedDevice,setSavedDevice]=useState(null);
  const [eventType,setEventType]=useState('APPLICATION_USAGE');
  const [application,setApplication]=useState('');
  const [appSearch,setAppSearch]=useState('');
  const [lastRefreshed,setLastRefreshed]=useState(null);
  const [selectedDeviceId,setSelectedDeviceId]=useState('');
  const [readinessDate,setReadinessDate]=useState(()=>new Date().toISOString().slice(0,10));
  const timelineList=useRef(null);
  const applications=useMemo(()=>{
    const groups=new Map();
    for(const e of data.events)if((eventType==='APPLICATION_ACTIVITY'?(e.type.startsWith('APPLICATION_')||e.type.startsWith('PROCESS_')):eventType==='PROCESS_ACTIVITY'?e.type.startsWith('PROCESS_'):e.type==='APPLICATION_USAGE')&&e.metadata?.name){
      const key=eventAppKey(e),group=groups.get(key)||{key,name:eventAppLabel(e),seconds:0,count:0,usageCount:0,lastForeground:null,first:e.occurredAt,last:e.occurredAt};
      if(e.metadata.appName)group.name=eventAppLabel(e);
      if(e.type.startsWith('APPLICATION_')&&(!group.lastForeground||Date.parse(e.occurredAt)>Date.parse(group.lastForeground)))group.lastForeground=e.occurredAt;
      if(Date.parse(e.occurredAt)<Date.parse(group.first))group.first=e.occurredAt;
      if(Date.parse(e.occurredAt)>Date.parse(group.last))group.last=e.occurredAt;
      if(e.type==='APPLICATION_USAGE')group.usageCount++;
      group.seconds+=Number(e.metadata.durationSeconds)||0;group.count++;groups.set(key,group);
    }
    return [...groups.values()].sort((a,b)=>Number(Boolean(b.lastForeground))-Number(Boolean(a.lastForeground)) || Date.parse(b.lastForeground||b.last)-Date.parse(a.lastForeground||a.last) || applicationLabel(a.name).localeCompare(applicationLabel(b.name)));
  },[data.events,eventType]);
  const matchingApplications=applications.filter(a=>`${a.name} ${a.key}`.toLowerCase().includes(appSearch.trim().toLowerCase()));
  const latestForeground=data.events.filter(e=>e.type.startsWith('APPLICATION_')).reduce((latest,e)=>!latest||Date.parse(e.occurredAt)>Date.parse(latest.occurredAt)?e:latest,null);
  const visibleEvents=eventType&&application?data.events.filter(e=>eventAppKey(e)===application):data.events;
  const applicationDetails=applications.find(a=>a.key===application);
  const showRecords=!eventType||Boolean(application);
  useEffect(()=>{setApplication('');setAppSearch('');},[employeeId,selectedDeviceId]);
  useEffect(()=>{if(timelineList.current)timelineList.current.scrollTop=0;},[application,eventType]);
  const sequence=useRef(0), mounted=useRef(true);
  const refresh=useCallback(async({notify=false}={})=>{
    const id=++sequence.current; setRefreshing(true); setRefreshError('');
    try {
      const query=new URLSearchParams();if(employeeId)query.set('userId',employeeId);if(eventType)query.set('eventType',eventType);if(selectedDeviceId)query.set('deviceId',selectedDeviceId);query.set('readinessDate',readinessDate);
      const result=await request(`/dashboard${query.size?`?${query}`:''}`);
      if(!Array.isArray(result.devices) || !Array.isArray(result.employees) || !Array.isArray(result.events) || !Array.isArray(result.incidents)) throw new Error('The backend returned an invalid device list.');
      if(mounted.current && id===sequence.current){setData(result);setLastRefreshed(new Date());if(notify)setNotice('Device list refreshed.');}
      return result;
    }catch(e){if(mounted.current && id===sequence.current)setRefreshError(e.message);throw e;}
    finally{if(mounted.current && id===sequence.current)setRefreshing(false);}
  },[employeeId,eventType,selectedDeviceId,readinessDate]);
  useImperativeHandle(ref,()=>({refresh:()=>refresh()}),[refresh]);
  useEffect(()=>{
    mounted.current=true;const run=()=>refresh().catch(()=>{});run();
    const t=setInterval(run,15000);window.addEventListener('cyberorbit-endpoint-updated',run);
    return()=>{mounted.current=false;sequence.current++;clearInterval(t);window.removeEventListener('cyberorbit-endpoint-updated',run);};
  },[refresh]);
  const selectedDevice=data.devices.find(d=>d.id===assignment.deviceId) || (savedDevice?.id===assignment.deviceId?savedDevice:null);
  const timelineDevice=data.devices.find(d=>d.id===selectedDeviceId);
  const latestUsageAt=eventType==='APPLICATION_USAGE'&&data.events.length?data.events.reduce((latest,e)=>new Date(e.occurredAt)>new Date(latest)?e.occurredAt:latest,data.events[0].occurredAt):null;
  const usageIsStale=latestUsageAt&&Date.now()-new Date(latestUsageAt).getTime()>5*60*1000;
  const chooseDevice=id=>{
    const device=data.devices.find(d=>d.id===id);setToken(null);setCopied(false);setError('');setNotice('');
    setAssignment(device?{deviceId:device.id,userId:device.userId,name:device.name,platform:device.platform,mappedIdentity:device.mappedIdentity || ''}:{deviceId:'',userId:'',name:'',platform:'win32',mappedIdentity:''});
  };
  const assign=async e=>{
    e.preventDefault();setError('');setNotice('');
    if(!data.employees.some(u=>u.id===assignment.userId)){setError('Select an active employee from your company.');return;}
    if(!assignment.name.trim()){setError('Select a device or enter a laptop name to register one.');return;}
    if(assignment.deviceId && !selectedDevice){setError('Selected device is no longer available. Refresh and try again.');return;}
    setPending('assign');setToken(null);setCopied(false);
    try{
      const {deviceId,...fields}=assignment;
      const result=await request('/assign','POST',{...fields,name:fields.name.trim(),...(deviceId?{deviceId}:{}),issueEnrollmentToken:false});
      if(!isDeviceUuid(result.deviceId) || result.userId!==assignment.userId)throw new Error('The backend returned an invalid assignment confirmation. Refresh to check the saved device.');
      setSavedDevice({id:result.deviceId,userId:result.userId,name:result.name,platform:assignment.platform,mappedIdentity:assignment.mappedIdentity});
      setAssignment(current=>({...current,deviceId:result.deviceId}));
      setNotice(`Assigned ${result.name} to ${data.employees.find(u=>u.id===result.userId).name}.`);
      await refresh().catch(()=>{});
    }catch(err){setError(err.message);}finally{setPending('');}
  };
  const issueToken=async()=>{
    setError('');setNotice('');
    if(!selectedDevice){setError('Assign a device before issuing an enrollment token.');return;}
    if(selectedDevice.userId!==assignment.userId){setError('Save the employee assignment before issuing a token.');return;}
    if(selectedDevice.name!==assignment.name.trim() || selectedDevice.platform!==assignment.platform || (selectedDevice.mappedIdentity || '')!==assignment.mappedIdentity){setError('Save changes to the assignment before issuing a token.');return;}
    setPending('token');setToken(null);setCopied(false);
    try{
      const result=await request(`/${encodeURIComponent(selectedDevice.id)}/enrollment-token`,'POST',{});
      if(!isDeviceUuid(result.deviceId) || result.deviceId!==selectedDevice.id || !/^[A-Za-z0-9_-]{43}$/.test(result.enrollmentToken || '') || !Number.isFinite(Date.parse(result.expiresAt))) throw new Error('The backend returned an invalid enrollment token.');
      setToken(result);setNotice('Enrollment token issued. Copy it now; it cannot be retrieved later.');
    }catch(err){setError(err.message);}finally{setPending('');}
  };
  const action=async(id,kind,body)=>{
    setPending(`${kind}:${id}`);setError('');setNotice('');
    try{await request(`/${encodeURIComponent(id)}/${kind}`,kind==='config'?'PUT':'POST',body ?? {});setNotice(kind==='revoke'?'Device credential revoked.':kind==='city-estimate'?'City estimate setting saved. Enabled devices update at their next heartbeat.':'Collector configuration saved.');await refresh().catch(()=>{});}
    catch(e){setError(e.message);}finally{setPending('');}
  };
  return <section className="rounded-2xl border border-cyan-300/25 bg-[#050A10] p-5 text-[#F4F7FA] space-y-4" aria-label="Installed endpoint agents" aria-busy={refreshing}>
    <div className="flex justify-between"><h2 className="font-semibold">Installed endpoint agents</h2><button type="button" onClick={()=>refresh({notify:true}).catch(()=>{})} disabled={refreshing || Boolean(pending)} className="text-cyan-300 disabled:opacity-50">{refreshing?'Refreshing…':'Refresh'}</button></div>
    {refreshError&&<p role="alert" className="text-red-300">{refreshError}</p>}
    {refreshError&&!lastRefreshed&&<p role="status" className="text-sm text-amber-200">The saved device list could not be loaded. This does not mean devices were deleted. Resolve the backend error and refresh; do not enroll existing laptops again.</p>}
    {error&&<p role="alert" className="text-red-300">{error}</p>}
    {notice&&<p role="status" className="text-emerald-300">{notice}</p>}
    {administrator&&<form noValidate className="flex flex-wrap gap-3" onSubmit={assign}>
      <fieldset disabled={Boolean(pending)||Boolean(refreshError)} className="contents">
      <select className="bg-slate-900 p-2 rounded" aria-label="Device" value={assignment.deviceId} onChange={e=>chooseDevice(e.target.value)}><option value="">Register a new laptop</option>{data.devices.map(d=><option key={d.id} value={d.id}>{d.name} — {d.user.name}</option>)}{savedDevice?.id===assignment.deviceId&&!data.devices.some(d=>d.id===savedDevice.id)&&<option value={savedDevice.id}>{savedDevice.name}</option>}</select>
      <select required disabled={!data.employees.length} className="bg-slate-900 p-2 rounded disabled:opacity-60" aria-label="Employee" value={assignment.userId} onChange={e=>{setAssignment({...assignment,userId:e.target.value,mappedIdentity:''});setToken(null);setCopied(false);}}><option value="">{data.employees.length?'Assign employee':refreshing?'Loading employees...':refreshError?'Employee list unavailable':'No active employees'}</option>{data.employees.map(u=><option key={u.id} value={u.id}>{u.name} ({u.employeeId})</option>)}</select>
      <input required maxLength={100} aria-label="Laptop name" className="bg-slate-900 p-2 rounded" placeholder="Laptop name" value={assignment.name} onChange={e=>setAssignment({...assignment,name:e.target.value})}/>
      <select className="bg-slate-900 p-2 rounded" aria-label="Platform" disabled={Boolean(assignment.deviceId)} value={assignment.platform} onChange={e=>setAssignment({...assignment,platform:e.target.value,mappedIdentity:''})}><option value="win32">Windows</option><option value="linux">Linux</option><option value="darwin">macOS</option></select>
      <input aria-label="Verified OS identity" required={assignment.platform==='darwin'} className="bg-slate-900 p-2 rounded" placeholder={assignment.platform==='darwin'?'Required: uid from employee identity command':'Verified OS SID / uid:number (optional)'} value={assignment.mappedIdentity} onChange={e=>setAssignment({...assignment,mappedIdentity:e.target.value})}/>
      <button type="submit" className="rounded bg-cyan-900 px-3 py-2">{pending==='assign'?'Assigning…':'Assign'}</button>
      <button type="button" onClick={issueToken} className="rounded bg-cyan-900 px-3 py-2">{pending==='token'?'Issuing…':'Issue Enrollment Token'}</button>
      </fieldset>
      {!refreshing&&!refreshError&&!data.employees.length&&<p role="status" className="w-full text-sm text-amber-200">No active employees in your company. Add or activate an employee in Employee Management, then Refresh.</p>}
      <p className="w-full text-sm text-slate-400">Verify the employee's OS identity on the laptop before mapping it. Without a mapping, observations remain unattributed.</p>
    </form>}
    {administrator&&selectedDevice&&<div aria-label="Selected device assignment" className="rounded border border-cyan-300/25 p-3 space-y-2"><p className="font-medium">Saved device: {selectedDevice.name}</p><DeviceUuid key={selectedDevice.id} deviceId={selectedDevice.id}/></div>}
    {token&&<div aria-label="Enrollment details" className="rounded border border-amber-500/30 p-3 space-y-3"><DeviceUuid key={token.deviceId} deviceId={token.deviceId}/><p>Single-use enrollment token; expires {new Date(token.expiresAt).toLocaleString()}. Enter this at the hidden enrollment-token prompt after the device UUID. Issuing another token invalidates the previous one.</p><div><code aria-label="Enrollment token" className="break-all select-all">{token.enrollmentToken}</code><button type="button" className="ml-4 text-cyan-300" onClick={async()=>{try{await navigator.clipboard.writeText(token.enrollmentToken);setCopied(true);}catch{setError('Clipboard copy failed. Select and copy the displayed token.');}}}>{copied?'Copied':'Copy token'}</button><button type="button" className="ml-4 text-cyan-300" onClick={()=>{setToken(null);setCopied(false);}}>Dismiss token</button></div></div>}
    {refreshing&&<p className="text-slate-400">Loading devices…</p>}
    {!refreshing&&!refreshError&&!data.devices.length&&<p role="status" className="text-slate-400">{employeeId?'No endpoint agent assigned to this employee.':'No laptops assigned.'}</p>}
    {data.devices.map(d=><article key={d.id} className="rounded border border-white/10 p-3 space-y-2">
      <p><strong>{d.name}</strong> · {d.user.name} · {d.connectionStatus}</p>
      <p className="text-sm text-slate-300">{d.platform} · agent {d.agentVersion || 'not enrolled'} · last seen {d.lastSeen?new Date(d.lastSeen).toLocaleString():'never'} · OS mapping {d.mappedIdentity || 'unverified'}</p>
      <DeviceUuid deviceId={d.id}/><p className="text-sm">Queue {d.health?.queueEvents ?? 'unknown'} events / {d.health?.queueBytes ?? 'unknown'} bytes · dropped {d.health?.droppedEvents ?? 'unknown'} · {d.health?.paused?'paused':'monitoring configuration active'}</p>
      <p className="text-sm text-slate-400">{Object.entries(d.health?.collectors || {}).map(([k,v])=>`${k}: ${v}`).join(' · ') || 'Collector health not yet reported'}</p>
      <EndpointCity device={d} administrator={administrator} pending={Boolean(pending)} onChange={action}/>
      <p className="text-sm">Existing pipeline risk {d.user.riskScore} · trust {d.user.trustScore} · {d.user.riskLevel}</p>
      <p className="text-sm text-slate-300">OS sign-in control: {d.health?.collectors?.accountControl || d.health?.collectors?.windowsAccount || 'not enabled / not reported'}. Last report: {d.lastSeen?new Date(d.lastSeen).toLocaleString():'never'}. Offline reports are not current confirmation.</p>
      {administrator&&!d.revokedAt&&<fieldset disabled={Boolean(pending)} className="flex flex-wrap gap-4"><button type="button" className="text-red-300" onClick={()=>action(d.id,'revoke')}>Revoke credential</button><button type="button" className="text-cyan-300" onClick={()=>action(d.id,'config',{config:{...d.config,paused:!d.config.paused}})}>{d.config.paused?'Resume':'Pause'} collectors</button><button type="button" className="text-cyan-300" onClick={()=>{const text=window.prompt('Approved directory paths, one per line. Local approval is also required.',(d.config.approvedDirectories||[]).join('\n'));if(text!==null)action(d.id,'config',{config:{...d.config,approvedDirectories:text.split('\n').map(s=>s.trim()).filter(Boolean)}});}}>Approved directories</button><button type="button" className="text-cyan-300" onClick={()=>action(d.id,'config',{config:{...d.config,network:!d.config.network}})}>{d.config.network?'Disable':'Enable'} TCP metadata</button></fieldset>}
      {administrator&&!d.revokedAt&&<div className="space-y-1"><button type="button" disabled={Boolean(pending)} className="text-cyan-300" onClick={()=>action(d.id,'config',{config:{...d.config,browserTitles:!d.config.browserTitles}})}>{d.config.browserTitles?'Disable':'Enable'} browser titles</button><p className="text-xs text-slate-400">Optional active-tab window titles only. Requires local browserTitles approval and an updated agent with desktop permissions. Titles may contain sensitive page names or search terms. macOS requires non-private window confirmation from the browser companion; unsupported browsers report unavailable. No page contents or browsing history.</p></div>}
    </article>)}
    <p className="text-sm text-amber-200">Endpoint ML assessment unavailable: {data.ml.reason || 'incomplete model feature coverage'}. Existing application risk, trust and incidents remain available. FREEZE also controls the mapped local OS account only on devices with locally approved account control; check the device report for confirmation.</p>
    {data.ml.dataReadiness&&<details className="rounded-lg border border-amber-300/20 p-3"><summary>ML feature readiness ({data.ml.dataReadiness.version})</summary><p className="mt-2 text-sm">Selected UTC day: <strong>{data.ml.dataReadiness.window?.date}</strong> ({data.ml.dataReadiness.window?.state}). Readiness is scoped to enrolled devices visible to this account. {data.ml.dataReadiness.compatibleFeatureCount} of {data.ml.dataReadiness.featureCount} model features have compatible live sources; no RF inference is performed from current endpoint events.</p><div className="mt-2 space-y-2">{(data.ml.dataReadiness.scopes||[]).map(scope=><p key={scope.deviceId} className="text-sm"><strong>{data.devices.find(d=>d.id===scope.deviceId)?.name||'Assigned device'}:</strong> {scope.status.replaceAll('_',' ').toLowerCase()}, {scope.attributedEventCount} employee-attributed observations, {scope.unattributedEventCount} unattributed; calendar {scope.derivableCalendarValues.day_of_week}/{scope.derivableCalendarValues.is_weekend}. Endpoint event counts are diagnostics only.</p>)}</div><p className="mt-2 text-sm">The calendar fields can be derived from the declared UTC day; source-specific logon/device/file/HTTP/email features remain unavailable.</p><ul className="mt-2 list-disc pl-5 text-sm">{data.ml.dataReadiness.features.filter(feature=>feature.status==='MISSING_COMPATIBLE_SOURCE').map(feature=><li key={feature.name}><code>{feature.name}</code> — {feature.source}</li>)}</ul><p className="mt-2 text-xs text-slate-400">No missing values are zero-filled. Endpoint process, USB, file-change, and network-connection events are not treated as CERT logon, device, file/content, HTTP, or email records. Raw event metadata is not used for readiness.</p></details>}
    <h3 className="font-semibold">Real activity timeline</h3>
    <div className="rounded-lg border border-cyan-300/20 bg-slate-900/50 p-3 space-y-1" aria-live="polite">
      <p className="text-sm">Dashboard refreshed: {lastRefreshed?lastRefreshed.toLocaleTimeString():'waiting for first response'} ? Auto-refresh every 15 seconds</p>
      {latestForeground&&<p className="text-sm text-cyan-200">Latest recorded foreground activity: {eventAppLabel(latestForeground)} ? {new Date(latestForeground.occurredAt).toLocaleString()}</p>}
      <p className="text-xs text-slate-400">Recorded observations, not a live screen. Foreground duration stops after 60 seconds without input; leaving an app open does not continuously add active usage.</p>
    </div>
    {eventType.startsWith('APPLICATION_')&&data.devices.filter(d=>!d.revokedAt&&(!selectedDeviceId||d.id===selectedDeviceId)).map(d=><div key={`browser-titles:${d.id}`} className="rounded-lg border border-cyan-300/30 bg-cyan-950/20 p-4 space-y-2" aria-label={`Browser titles for ${d.name}`}>
      <p className="font-semibold">Browser tab titles: {d.name} — {d.user.name}</p>
      {!d.config.browserTitles?<>
        <p className="text-sm text-amber-200">Browser titles are OFF in the dashboard configuration. Updating the agent or enabling its local setting does not turn on this setting.</p>
        {administrator&&<button type="button" disabled={Boolean(pending)||refreshing} className="rounded bg-cyan-800 px-4 py-2 disabled:opacity-50" onClick={()=>action(d.id,'config',{config:{...d.config,browserTitles:true}})}>{pending===`config:${d.id}`?'Saving...':`Enable browser titles for ${d.name}`}</button>}
      </>:<>
        <p className="text-sm text-emerald-200">Dashboard setting is ON. The agent receives changes at its next heartbeat, normally within 30 seconds.</p>
        <p className="text-sm text-slate-300">Agent report: {d.health?.collectors?.browserTitles||'Browser-title status not yet reported. Requires agent 1.1.0 on Linux/macOS (1.0.5+ on Windows), desktop permissions and local browserTitles approval.'}</p>
        {!data.events.some(e=>e.deviceId===d.id&&e.metadata?.browserTitle)&&<p className="text-sm text-amber-200">No title in the loaded events for this device yet. Use an active browser tab, then switch tabs. Once received, its title appears beneath the browser name in the new usage entry.</p>}
      </>}
      <p className="text-xs text-slate-400">Active browser window titles only. macOS excludes titles without non-private window confirmation and retains titles for seven days. Other open tabs and page contents are not collected. Previous events cannot gain titles.</p>
    </div>)}
    {eventType==='APPLICATION_USAGE'&&error&&<p role="alert" className="text-red-300">{error}</p>}
    {eventType==='APPLICATION_USAGE'&&notice&&<p role="status" className="text-emerald-300">{notice}</p>}
    <div className="flex flex-wrap gap-4">
      <label className="flex items-center gap-3 text-sm">Show activity<select aria-label="Activity type" value={eventType} disabled={refreshing} className="bg-slate-900 rounded p-2" onChange={e=>{setApplication('');setData(d=>({...d,events:[],timeline:undefined}));setEventType(e.target.value);}}><option value="">All activity</option><option value="APPLICATION_USAGE">Application usage</option><option value="PROCESS_ACTIVITY">Background use</option></select></label>
      {data.devices.length>1&&<label className="flex items-center gap-3 text-sm">Device<select aria-label="Activity device" value={selectedDeviceId} disabled={refreshing} className="bg-slate-900 rounded p-2" onChange={e=>{setData(d=>({...d,events:[],timeline:undefined}));setSelectedDeviceId(e.target.value);}}><option value="">All assigned devices</option>{data.devices.map(d=><option key={d.id} value={d.id}>{d.name} — {d.user.name}</option>)}</select></label>}
      <label className="flex items-center gap-3 text-sm">ML readiness day (UTC)<input aria-label="ML readiness day (UTC)" type="date" max={new Date().toISOString().slice(0,10)} value={readinessDate} disabled={refreshing} className="bg-slate-900 rounded p-2" onChange={e=>setReadinessDate(e.target.value)}/></label>
      {eventType&&<label className="flex items-center gap-3 text-sm">Application<select aria-label="Application filter" value={application} className="bg-slate-900 rounded p-2" onChange={e=>setApplication(e.target.value)}><option value="">All applications</option>{applications.map(a=><option key={a.key} value={a.key}>{applicationLabel(a.name)}</option>)}{application&&!applications.some(a=>a.key===application)&&<option value={application}>{applicationLabel(application)}</option>}</select></label>}
    </div>
    {!selectedDeviceId&&data.devices.some(d=>d.revokedAt)&&<p className="text-sm text-slate-400">All assigned devices is selected, so older activity from revoked laptops remains in this timeline. Select a device to view only its events.</p>}
    {eventType==='APPLICATION_USAGE'&&!refreshError&&lastRefreshed&&!refreshing&&(!latestUsageAt||usageIsStale)&&<p className="text-sm text-amber-200">{latestUsageAt?`Latest foreground usage received ${new Date(latestUsageAt).toLocaleString()}. No application-usage event has arrived in the last 5 minutes.`:'No application-usage events were returned for this selection.'} {timelineDevice?`Device last seen: ${timelineDevice.lastSeen?new Date(timelineDevice.lastSeen).toLocaleString():'never'}; desktop collector: ${timelineDevice.health?.collectors?.desktop||'not reported'}.`:'Select one assigned device to check its last contact and desktop collector status.'}</p>}
    {timelineDevice?.revokedAt&&<p role="status" className="text-sm text-amber-200">{timelineDevice.name} is assigned to {timelineDevice.user.name}, but its agent credential was revoked {new Date(timelineDevice.revokedAt).toLocaleString()}. It cannot send new activity.</p>}
    {timelineDevice&&!timelineDevice.revokedAt&&timelineDevice.connectionStatus!=='CONNECTED'&&<p role="status" className="text-sm text-amber-200">{timelineDevice.name} last contacted the server {timelineDevice.lastSeen?new Date(timelineDevice.lastSeen).toLocaleString():'never'} ({timelineDevice.connectionStatus.toLowerCase()}).</p>}
    {!eventType&&<p className="text-sm text-slate-400">All activity combines heartbeats, process observations and application usage in one latest-150 list. Use Application usage to see its independently filtered latest events, or select a device to avoid mixing activity from other assigned laptops.</p>}
    {eventType==='PROCESS_ACTIVITY'&&<p className="text-sm text-slate-400">Observed process activity, including background processes. Start/stop changes are polled; running snapshots are reported about every 5 minutes. These observations do not prove active employee use or measure background duration. Processes can also be foreground applications; the latest observation is not a live running-state guarantee.</p>}
    {eventType==='APPLICATION_ACTIVITY'&&<p className="text-sm text-slate-400">Shows foreground observations and process activity, including background/system processes. Foreground is sampled about every 2 seconds; process changes follow the device polling interval. Brief activity can be missed. Process start is not proof a window was opened. Select an app for its timestamped records.</p>}
    {eventType==='APPLICATION_USAGE'&&<p className="text-sm text-slate-400">Foreground usage is sampled every 2 seconds and uploaded on application switch or after about 30 seconds. Locked sessions, sampling gaps and idle time of 60 seconds or more are excluded. OS application identities are resolved where available. Older host-only records cannot be identified retrospectively.</p>}
    {eventType&&applications.length>0&&!application&&<div aria-label="Application usage summary" className="space-y-3"><p className="text-sm text-slate-400">Recently used applications appear first. One card per application. Open a card to view its usage records and browser titles. Totals cover the {data.events.length} loaded events{!selectedDeviceId?' across the selected devices':''}.</p><label className="block text-sm">Find an application<input type="search" aria-label="Find an application" value={appSearch} onChange={e=>setAppSearch(e.target.value)} placeholder="Search app name, e.g. Microsoft Edge" className="mt-1 block w-full rounded border border-white/15 bg-slate-900 p-2"/></label>{!matchingApplications.length&&<p className="text-sm text-slate-400">No matching app in the loaded records. Clear the search or check another activity filter.</p>}<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">{matchingApplications.map(a=><button type="button" key={a.key} aria-label={`Show ${applicationLabel(a.name)} usage`} onClick={()=>setApplication(a.key)} className="rounded-xl border border-white/10 bg-slate-900/50 p-4 text-left transition-colors hover:border-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"><strong className="block text-lg text-cyan-200">{applicationLabel(a.name)}</strong>{eventType!=='PROCESS_ACTIVITY'&&<span className="block mt-2 text-xl font-semibold">{a.usageCount?usageDuration(a.seconds):'No foreground usage recorded'}</span>}<span className="block mt-1 text-sm text-slate-400">{a.count} recorded observations</span><span className="block mt-2 text-xs text-slate-400">Last observed: {new Date(a.last).toLocaleString()}</span><span className="block mt-3 text-sm text-cyan-300">View details →</span></button>)}</div></div>}
    {eventType&&application&&<div className="rounded-xl border border-cyan-300/25 bg-slate-900/50 p-4 space-y-3" aria-label="Application details">
      <button type="button" className="text-sm text-cyan-300" onClick={()=>setApplication('')}>← All applications</button>
      <h4 className="text-xl font-semibold text-cyan-200">{applicationLabel(applicationDetails?.name||application)}</h4>
      {applicationDetails&&<dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
        <div><dt className="text-slate-400">{eventType!=='PROCESS_ACTIVITY'?'Recorded foreground usage':'Recorded process observations'}</dt><dd className="mt-1 text-lg">{eventType!=='PROCESS_ACTIVITY'?(applicationDetails.usageCount?usageDuration(applicationDetails.seconds):'Not recorded'):applicationDetails.count}</dd></div>
        <div><dt className="text-slate-400">First observation in loaded records</dt><dd className="mt-1">{new Date(applicationDetails.first).toLocaleString()}</dd></div>
        <div><dt className="text-slate-400">Latest observation</dt><dd className="mt-1">{new Date(applicationDetails.last).toLocaleString()}</dd></div>
      </dl>}
      <p className="text-xs text-slate-400">These timestamps show recorded observations, not the exact time the application was opened or closed. Usage excludes idle and locked time. Records below retain device, employee and browser-title details.</p>
    </div>}
    {!refreshError&&lastRefreshed&&!refreshing&&!visibleEvents.length&&<p className="text-slate-400">{application?'No usage for this application in the loaded events.':eventType==='PROCESS_ACTIVITY'?'No process observations received yet.':eventType?'No application observations received yet.':'No activity received yet.'}</p>}
    {data.timeline?.hasMore&&<p className="text-sm text-amber-200">Showing up to {data.timeline.limit} {data.timeline.eventType==='APPLICATION_ACTIVITY'?'application and process activity (150 per category)':data.timeline.eventType==='PROCESS_ACTIVITY'?'process activity':data.timeline.eventType?'application usage':'activity'} events. Older events remain stored.</p>}
    {showRecords&&<ol ref={timelineList} aria-label="Endpoint activity timeline" className="max-h-96 overflow-auto space-y-3">{visibleEvents.map(e=><li key={e.id} data-event-id={e.eventId} className="border-b border-white/10 pb-3 text-sm">
      {e.type==='APPLICATION_FOREGROUND'&&<p className="mb-1 text-cyan-200"><strong>{eventAppLabel(e)}</strong> ? Foreground observed at {new Date(e.occurredAt).toLocaleString()}</p>}
      {e.type==='APPLICATION_USAGE'&&<p className="mb-1"><strong className="text-base text-cyan-200">{eventAppLabel(e)}</strong><span className="ml-3 text-slate-200">{usageDuration(e.metadata.durationSeconds)} foreground usage</span></p>}
      {e.type.startsWith('APPLICATION_')&&<p className="text-xs text-slate-400 mb-2">Process: {e.metadata.name} ? PID {e.metadata.pid}{e.metadata.hostName?` ? Host: ${e.metadata.hostName}`:''} ? Identification: {e.metadata.identitySource||'process only (legacy record)'}{e.metadata.appId?` ? App ID: ${e.metadata.appId}`:''}{e.metadata.identitySource==='unresolved-host'?' ? App inside this host could not be identified.':''}</p>}
      {e.type==='APPLICATION_USAGE'&&e.metadata.browserTitle&&<p className="mb-2 break-words text-slate-200"><span className="text-slate-400">Active browser title: </span>{e.metadata.browserTitle}</p>}
      <p className="text-slate-300"><time>{new Date(e.occurredAt).toLocaleString()}</time> · {e.type} · {data.devices.find(d=>d.id===e.deviceId)?.name || e.deviceId} · {e.userId?(data.devices.find(d=>d.id===e.deviceId)?.user?.name || 'Employee'):'Unattributed activity'} · {e.userId?'verified employee identity':'device / unmapped session'}</p>
      {e.type.startsWith('PROCESS_')&&<p className="font-medium mt-1 text-cyan-200">{eventAppLabel(e)} ? {{PROCESS_RUNNING:'Already running when observed',PROCESS_START:'Process start observed',PROCESS_STOP:'Process stop observed'}[e.type]} ? PID {e.metadata.pid}</p>}
      {e.type.startsWith('PROCESS_')&&e.metadata.startedAt&&Number.isFinite(Date.parse(e.metadata.startedAt))&&<p className="text-xs text-slate-400">OS-reported process start: {new Date(e.metadata.startedAt).toLocaleString()}</p>}
      {!e.type.startsWith('APPLICATION_')&&!e.type.startsWith('PROCESS_')&&e.metadata.name&&<p className="font-medium mt-1">{e.metadata.name}</p>}
      <details className="mt-1 text-xs text-slate-400"><summary className="cursor-pointer">Technical details</summary><pre className="whitespace-pre-wrap break-all mt-1">{JSON.stringify(e.metadata)}</pre></details>
    </li>)}</ol>}
    {data.incidents.length>0&&<details><summary>Existing incidents ({data.incidents.length})</summary>{data.incidents.map(i=><p key={i.id}>{i.title} · {i.severity} · {i.status}</p>)}</details>}
  </section>;
});
