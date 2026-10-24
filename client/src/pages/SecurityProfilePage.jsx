import {ConsoleHeader} from '../components/ConsoleHeader.jsx';
import React,{useEffect,useState,useCallback} from 'react';
import {LineChart,Line,XAxis,YAxis,Tooltip,ResponsiveContainer} from 'recharts';
import {requestApi} from '../services/api.js';
import {EndpointMonitor} from '../components/EndpointMonitor.jsx';

const adminRole=role=>['SECURITY_ADMIN','SYSTEM_ADMIN'].includes(role);
const employeeRole=role=>['EMPLOYEE','MANAGER'].includes(role);
const initialSelection=(currentUser,selectedEmployeeId)=>{
 const admin=adminRole(currentUser?.roleCode||currentUser?.role);
 if(!admin)return currentUser?.id||'';
 const requested=new URLSearchParams(window.location.search).get('employee')||selectedEmployeeId||'';
 return requested!==currentUser?.id?requested:'';
};

export function SecurityProfilePage({currentUser,users=[],selectedEmployeeId}){
 const role=currentUser?.roleCode||currentUser?.role,admin=adminRole(role);
 const [selected,setSelected]=useState(()=>initialSelection(currentUser,selectedEmployeeId));
 const [employeeRows,setEmployeeRows]=useState(()=>users.filter(user=>employeeRole(user.roleCode||user.role))),[listBusy,setListBusy]=useState(admin),[listError,setListError]=useState('');
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const target=admin?employeeRows.find(user=>user.id===selected&&employeeRole(user.roleCode||user.role)):selected===currentUser?.id?currentUser:null;
 useEffect(()=>{
   if(!admin)return;
   let cancelled=false;
   (async()=>{
     setListBusy(true);setListError('');
     try{
       const rows=[];
       for(let offset=0;offset<=100000;offset+=200){
         const page=await requestApi(`/api/users?limit=200&offset=${offset}`);
         if(!Array.isArray(page.users))throw new Error('The employee list response was invalid.');
         rows.push(...page.users.filter(user=>employeeRole(user.roleCode||user.role)));
         if(page.users.length<200)break;
       }
       if(!cancelled)setEmployeeRows(rows);
     }catch(err){if(!cancelled)setListError(err.message||'Unable to load the authorized employee list.');}
     finally{if(!cancelled)setListBusy(false);}
   })();
   return()=>{cancelled=true;};
 },[admin]);
 const clearSelection=useCallback(()=>{setSelected('');setData(null);setError('');history.replaceState(null,'','/security-profile');},[]);
 const selectEmployee=useCallback(id=>{
   if(!employeeRows.some(user=>user.id===id&&employeeRole(user.roleCode||user.role)))return;
   setData(null);setError('');setSelected(id);history.replaceState(null,'','/security-profile?employee='+encodeURIComponent(id));
 },[employeeRows]);
 const load=useCallback(async()=>{
   if(!selected||!target){setData(null);return;}
   setBusy(true);setError('');
   try{
     const path=admin?`/api/users/${encodeURIComponent(selected)}/monitoring`:`/api/users/${encodeURIComponent(selected)}`;
     const result=await requestApi(path);
     if(result.user?.id!==selected)throw new Error('The server returned monitoring data for a different employee.');
     setData(result);
   }catch(e){setData(null);setError(e.message);}finally{setBusy(false);}
 },[selected,target,admin]);
 useEffect(()=>{
   if(!target){setData(null);return;}
   load();const timer=setInterval(load,30000);return()=>clearInterval(timer);
 },[load,target]);
 async function action(actionPath){setError('');try{const d=await requestApi('/api/users/'+encodeURIComponent(selected)+'/'+actionPath,{method:'POST',body:{reason:'Security profile review'}});setNotice(d.message||'Historical baseline refreshed.');await load();}catch(e){setError(e.message);}}
 const u=data?.user;

 if(admin&&!selected)return <div className="p-6 space-y-6"><ConsoleHeader title="Employee Monitoring" description="Select an authorized employee to review their security posture and recorded activity." kind="security"/><section className="rounded-xl border border-cyan-900 p-5"><h2 className="text-xl mb-4">Employee List</h2>{listError&&<p role="alert">Unable to load the complete authorized employee list: {listError}</p>}{listBusy?<p role="status">Loading authorized employees…</p>:employeeRows.length?<div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th className="p-3">Name</th><th className="p-3">Employee ID</th><th className="p-3">Department</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3">Risk</th><th className="p-3">Trust</th></tr></thead><tbody>{employeeRows.map(user=><tr key={user.id} tabIndex={0} role="button" aria-label={`View ${user.name}`} onClick={()=>selectEmployee(user.id)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectEmployee(user.id);}}} className="cursor-pointer border-t border-white/10 hover:bg-white/5 focus-visible:outline focus-visible:outline-cyan-300"><td className="p-3">{user.name}</td><td className="p-3">{user.employeeId||'—'}</td><td className="p-3">{user.department||user.departmentCode||'—'}</td><td className="p-3">{user.roleCode||user.role}</td><td className="p-3">{user.status}</td><td className="p-3">{user.currentRiskScore??user.riskScore??'—'}</td><td className="p-3">{user.currentTrustScore??user.trustScore??'—'}</td></tr>)}</tbody></table></div>:<p role="status">No authorized employees available.</p>}</section></div>;

 return <div className="p-6 space-y-6"><ConsoleHeader title="Employee Monitoring" description={target?`Security monitoring for ${target.name}. All records below are scoped to this employee.`:'Select an employee to view monitoring details.'} kind="security"/>
   <div className="flex flex-wrap gap-3"><button type="button" onClick={admin?clearSelection:()=>history.back()} className="rounded border border-cyan-700 px-3 py-2">Employee List</button>{u&&<button type="button" disabled={busy} onClick={load}>{busy?'Loading…':'Refresh'}</button>}</div>
   {error&&<p role="alert" className="text-red-400">{error}</p>}{notice&&<p role="status" className="text-cyan-200">{notice}</p>}
   {busy&&!data&&<p role="status">Loading selected employee monitoring data…</p>}
   {!target&&!busy&&!error&&<p role="status">Select an employee from the Employee List.</p>}
   {target&&!busy&&!data&&!error&&<p role="status">No monitoring details are available for this employee.</p>}
   {u&&<><section className="rounded-xl border border-cyan-900 p-5 space-y-3"><h2 className="text-2xl">{u.name} · {u.employeeId}</h2><p>{u.email} · {u.department||u.departmentCode||'Department unavailable'} · {u.roleCode||u.role} · {u.status}</p><p>Risk {u.currentRiskScore}/100 ({u.currentRiskLevel}) · Trust {u.currentTrustScore}/100 · Policy posture: {u.currentRiskLevel||'NOT_ASSESSED'}</p><p>Baseline: {data.baseline?.available===false?data.baseline.reason:data.baseline?.statistics?.method||'Insufficient historical observations.'}</p>{admin&&employeeRole(u.roleCode||u.role)&&<div className="flex gap-4"><button onClick={()=>action(u.status==='ACTIVE'?'freeze':'unfreeze')}>{u.status==='ACTIVE'?'Freeze application account':'Restore application account'}</button><button onClick={()=>action('baseline/rebuild')}>Rebuild historical baseline</button></div>}</section>
   <section className="rounded-xl border border-cyan-900 p-5"><h2>Risk and trust trend</h2>{data.trustHistory?.length?<div className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.trustHistory.map(item=>({timestamp:item.timestamp,trustScore:item.trustScore,riskScore:item.riskScore}))}><XAxis dataKey="timestamp" hide/><YAxis domain={[0,100]} stroke="#aaa"/><Tooltip contentStyle={{background:'#0f172a'}}/><Line dataKey="trustScore" stroke="#67E8F9"/><Line dataKey="riskScore" stroke="#D4AF37"/></LineChart></ResponsiveContainer></div>:<p>No trust and risk trend available.</p>}</section>
   <section className="rounded-xl border border-cyan-900 p-5 space-y-2"><h2>Risk evidence and policy decisions</h2>{(data.riskHistory||[]).slice(-20).reverse().map(r=><details key={r.id}><summary>{new Date(r.timestamp).toLocaleString()} · {r.score}/100 · {r.level} · {r.policyAction||'Legacy assessment'}</summary><pre className="overflow-x-auto">{JSON.stringify(r.factors,null,2)}</pre></details>)}{!data.riskHistory?.length&&<p>No assessment history.</p>}</section>
   <EndpointMonitor key={u.id} employeeId={u.id} initialEventType=""/>
   <section className="rounded-xl border border-cyan-900 p-5"><h2>Logical browser sessions</h2>{(data.sessions||[]).length?(data.sessions||[]).map(session=><p key={session.id} className="border-b border-white/10 py-2">{session.status} · {session.userAgent||'Unknown browser'} · {session.ip} · Started {new Date(session.createdAt).toLocaleString()} · Expires {new Date(session.expiresAt).toLocaleString()}</p>):<p>No browser sessions recorded for this employee.</p>}</section>
   <section className="rounded-xl border border-cyan-900 p-5"><h2>Logical browser devices</h2>{(data.logicalDevices||data.devices||[]).length?(data.logicalDevices||data.devices).map(device=><p key={device.id} className="border-b border-white/10 py-2">{device.name} · {device.os} / {device.browser} · {device.status} · trust {device.trustScore} · last seen {new Date(device.lastSeen).toLocaleString()}</p>):<p>No logical browser devices recorded for this employee.</p>}</section>
   <section className="rounded-xl border border-cyan-900 p-5"><h2>Login and failed-login history</h2>{(data.loginHistory||[]).length?(data.loginHistory||[]).map(event=><p key={event.id} className="border-b border-white/10 py-2">{event.action} · {new Date(event.timestamp).toLocaleString()} · {event.severity}{event.ip?` · ${event.ip}`:''}</p>):<p>No login activity available.</p>}</section>
   <section className="rounded-xl border border-cyan-900 p-5"><h2>Resource-access activity</h2>{(data.events||[]).filter(event=>event.type==='RESOURCE_ACCESS').map(event=><p key={event.id} className="border-b border-white/10 py-2">{new Date(event.timestamp).toLocaleString()} · {event.resourceName||'Resource'} · {event.severity} · risk contribution {event.riskContribution}</p>)}{!(data.events||[]).some(event=>event.type==='RESOURCE_ACCESS')&&<p>No resource-access activity available.</p>}</section>
   <section className="rounded-xl border border-cyan-900 p-5"><h2>Employee-specific audit events</h2>{(data.auditEvents||[]).map(event=><p key={event.id} className="border-b border-white/10 py-2">{new Date(event.timestamp).toLocaleString()} · {event.action} · {event.severity}</p>)}{!data.auditEvents?.length&&<p>No audit events available.</p>}</section>
   <section className="rounded-xl border border-cyan-900 p-5"><h2>Incidents</h2>{(data.incidents||[]).map(i=><p key={i.id}>{i.title} · {i.severity} · {i.status} · {new Date(i.createdAt).toLocaleString()}</p>)}{!data.incidents?.length&&<p>No incidents recorded.</p>}</section>
   <section className="rounded-xl border border-cyan-900 p-5"><h2>Access requests</h2>{(data.accessRequests||[]).map(request=><p key={request.id}>{request.resource?.name||'Resource'} · {request.status} · {new Date(request.createdAt).toLocaleString()} · {request.justification}</p>)}{!data.accessRequests?.length&&<p>No access requests recorded.</p>}</section>
   <section className="rounded-xl border border-cyan-900 p-5"><h2>Application activity</h2>{(data.events||[]).map(event=><details key={event.id} className="py-2"><summary>{new Date(event.timestamp).toLocaleString()} · {event.eventType||event.type} · {event.resourceName||event.metadata?.source||'application'} · {event.severity}</summary><p>{event.metadata?.evaluation?.explanationText||'No assessment attached.'}</p></details>)}{!data.events?.length&&<p>No application activity.</p>}</section>
   </>}
 </div>;
}
