import {ConsoleHeader} from '../components/ConsoleHeader.jsx';
import React,{useEffect,useState} from 'react';
import {requestApi} from '../services/api.js';
export function SettingsPage({currentUser,onLogout}){
 const[sessions,setSessions]=useState([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[form,setForm]=useState({currentPassword:'',newPassword:'',confirmPassword:''}),[alerts,setAlerts]=useState(()=>{try{return JSON.parse(localStorage.getItem('cyberorbit_preferences')||'{}').inAppAlerts!==false;}catch{return true;}});
 const load=()=>requestApi('/api/auth/sessions').then(d=>setSessions(d.sessions)).catch(e=>setError(e.message));
 const [sessionHistory, setSessionHistory] = useState([]);
const [historyError, setHistoryError] = useState('');

const loadHistory = () =>
  requestApi('/api/auth/sessions/history')
    .then(data => {
      setSessionHistory(data.sessions ?? []);
      setHistoryError('');
    })
    .catch(error => setHistoryError(error.message));

useEffect(() => {
  loadHistory();
}, []);
 useEffect(()=>{load();},[]);
 async function change(e){e.preventDefault();setError('');setNotice('');if(form.newPassword!==form.confirmPassword){setError('New passwords do not match.');return;}setBusy(true);try{const result=await requestApi('/api/auth/password/change',{method:'POST',body:{currentPassword:form.currentPassword,newPassword:form.newPassword}});setForm({currentPassword:'',newPassword:'',confirmPassword:''});setNotice(result.message);setTimeout(()=>onLogout?.(),1500);}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function revoke(id) {
  setError('');

  try {
    const result = await requestApi(
      '/api/auth/sessions/' + id + '/revoke',
      { method: 'POST', body: {} }
    );

    setNotice(result.message);

    await Promise.all([
      load(),
      loadHistory()
    ]);
  } catch (error) {
    setError(error.message);
  }
}
 return <div className="p-6 space-y-6"><ConsoleHeader title="Account settings" description="Manage your authentication, active sessions and notification preferences."/><p>{currentUser?.name} · Company-issued account</p>{error&&<p role="alert" className="text-red-400">{error}</p>}{notice&&<p role="status" className="text-cyan-200">{notice}</p>}
 <section className="border border-cyan-900 rounded-xl p-5 space-y-3"><h2 className="text-xl">Authentication policy</h2><p>Console access is restricted to administrators and requires email MFA. Employee sign-in is disabled. Resource access may require fresh MFA. Authentication requirements are controlled by company policy.</p></section>
 <form onSubmit={change} className="border border-cyan-900 rounded-xl p-5 space-y-4"><h2 className="text-xl">Change password</h2>{['currentPassword','newPassword','confirmPassword'].map(k=><label key={k} className="block">{k==='currentPassword'?'Current password':k==='newPassword'?'New password (12–128 characters)':'Confirm new password'}<input required type="password" minLength={k==='currentPassword'?1:12} maxLength={128} autoComplete={k==='currentPassword'?'current-password':'new-password'} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})} className="block w-full max-w-lg bg-slate-900 p-3 rounded mt-2"/></label>)}<button disabled={busy} className="rounded bg-cyan-900 p-3">{busy?'Updating…':'Change password and invalidate sessions'}</button></form>
 <section className="border border-cyan-900 rounded-xl p-5 space-y-3"><h2 className="text-xl">Active sessions</h2><button onClick={load}>Refresh sessions</button>{sessions.map(s=><div key={s.id} className="border-b border-cyan-900 py-3"><p>{s.userAgent||'Unknown browser'} · {s.ip}</p><p>Created {new Date(s.createdAt).toLocaleString()} · Expires {new Date(s.expiresAt).toLocaleString()}</p><button onClick={()=>revoke(s.id)}>Revoke this session</button></div>)}{!sessions.length&&<p>No persisted sessions. Sign in again to create a managed session.</p>}<button onClick={onLogout}>Sign out and invalidate all sessions</button></section>
 <section className="border border-cyan-900 rounded-xl p-5 space-y-3">
  <div className="flex items-center justify-between">
    <h2 className="text-xl">Session History</h2>
    <button type="button" onClick={loadHistory}>
      Refresh History
    </button>
  </div>

  {historyError && (
    <p role="alert" className="text-red-400">
      {historyError}
    </p>
  )}

  <div className="overflow-x-auto">
    <table className="w-full text-sm text-left">
      <thead>
        <tr className="border-b border-cyan-900">
          <th className="p-3">Browser / Device</th>
          <th className="p-3">IP Address</th>
          <th className="p-3">Login Time</th>
          <th className="p-3">Status</th>
        </tr>
      </thead>
      <tbody>
        {sessionHistory.map(session => (
          <tr key={session.id} className="border-b border-white/10">
            <td className="p-3">{session.userAgent || "Unknown"}</td>
            <td className="p-3">{session.ip}</td>
            <td className="p-3">
              {new Date(session.createdAt).toLocaleString()}
            </td>
            <td className="p-3 font-medium">
              {session.status}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>

  {!historyError && sessionHistory.length === 0 && (
    <p className="text-gray-400">No session history available.</p>
  )}
</section>
 <section className="border border-cyan-900 rounded-xl p-5 space-y-3"><h2 className="text-xl">This browser’s notifications</h2><label><input type="checkbox" checked={alerts} onChange={e=>{setAlerts(e.target.checked);localStorage.setItem('cyberorbit_preferences',JSON.stringify({inAppAlerts:e.target.checked}));}}/> Show routine in-app activity notices</label><p>Critical account/security notices remain visible. Email digests and hardware MFA are not implemented.</p></section>
 </div>;
}
