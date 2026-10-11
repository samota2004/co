import React,{useEffect,useState} from 'react';
import {requestApi} from '../services/api.js';
export function MfaChallengeModal({isOpen,onClose,onSuccess,reason}){
 const[challenge,setChallenge]=useState(null),[code,setCode]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{if(isOpen){setChallenge(null);setCode('');setError('');}},[isOpen]);
 if(!isOpen)return null;
 async function send(){setBusy(true);setError('');try{setChallenge(await requestApi('/api/auth/mfa/challenge',{method:'POST',body:{}}));}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function verify(e){e.preventDefault();setBusy(true);setError('');try{const data=await requestApi('/api/auth/mfa/verify',{method:'POST',body:{challengeId:challenge.challengeId,otp:code}});localStorage.setItem('zero_trust_token',data.token);onSuccess?.();onClose?.();}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-5"><section role="dialog" aria-label="Email verification" className="w-full max-w-md rounded-xl border border-cyan-700 bg-[#050A10] p-6 space-y-4">
 <h2 className="text-xl">Verify resource access</h2><p>{reason||'Policy requires recent email MFA.'}</p>{error&&<p role="alert" className="text-red-400">{error}</p>}
 {!challenge?<button disabled={busy} onClick={send}>Send email code</button>:<form onSubmit={verify} className="space-y-4">{challenge.developmentOtp&&<p className="text-amber-300">Local development code: {challenge.developmentOtp}</p>}<label>Six-digit code<input required pattern="[0-9]{6}" maxLength={6} inputMode="numeric" value={code} onChange={e=>setCode(e.target.value)} className="block bg-slate-900 p-3"/></label><button disabled={busy}>{busy?'Verifying…':'Verify'}</button></form>}
 <button disabled={busy} onClick={onClose}>Cancel</button></section></div>;
}
