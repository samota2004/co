import {isBrowser} from '../shared/app-identity.js';
// AX alone has no universal, documented incognito bit. A browser companion must
// confirm a foreground, non-private window. Keep confirmation in memory only.
export function acceptBrowserProof(proofs,s,now=Date.now()) {
  if(!isBrowser(s) || typeof s.appId!=='string' || s.appId.length>100) return false;
  proofs.delete(s.appId);
  if(s.incognito!==false || s.focused!==true || typeof s.title!=='string' || !s.title || s.title.length>256 || /[\x00-\x1f\x7f]/.test(s.title))return false;
  proofs.set(s.appId,{appId:s.appId,title:s.title,receivedAt:now});return true;
}
export function matchesNormalTitle(ax,title) {
  return typeof ax==='string' && typeof title==='string' && title.length>0 &&
    [title,...['Google Chrome','Chromium','Microsoft Edge','Brave','Mozilla Firefox','Safari'].map(app=>`${title} - ${app}`)].includes(ax);
}
export function titleAllowed(proofs,s,now=Date.now()) {
  const p=proofs.get(s.appId);
  return !!p && now>=p.receivedAt && now-p.receivedAt<4000 && matchesNormalTitle(s.browserTitle,p.title);
}
