const transport=globalThis.fetch.bind(globalThis);
let refreshing;
export async function refreshSession(){
 if(!refreshing)refreshing=(async()=>{
  const response=await transport('/api/auth/refresh',{method:'POST',credentials:'same-origin',headers:{'x-cyberorbit-csrf':'1'},signal:AbortSignal.timeout(15000)});
  const data=await response.json();
  if(!response.ok||!data.token)throw new Error(data.error?.message||'Sign in again.');
  localStorage.setItem('zero_trust_token',data.token);return data;
 })().finally(()=>{refreshing=null;});
 return refreshing;
}
export function installSessionTransport(){
 globalThis.fetch=async(input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url,location.href);
  if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))return transport(input,options);
  const headers=new Headers(options.headers||{});
  const token=localStorage.getItem('zero_trust_token');
  if(token&&!headers.has('Authorization'))headers.set('Authorization','Bearer '+token);
  if(['/api/auth/refresh','/api/auth/logout'].includes(url.pathname))headers.set('x-cyberorbit-csrf','1');
  let response=await transport(input,{...options,headers,credentials:'same-origin'});
  const interactive=/^\/api\/auth\/(login|mfa\/verify|mfa\/resend|forgot-password|reset-password|refresh|logout)$/.test(url.pathname);
  if(response.status===401&&token&&!interactive){
   const error=await response.clone().json().catch(()=>null);
   if(error?.error?.code==='INCORRECT_PASSWORD')return response;
   try{const session=await refreshSession();headers.set('Authorization','Bearer '+session.token);response=await transport(input,{...options,headers,credentials:'same-origin'});}
   catch{window.dispatchEvent(new Event('cyberorbit-session-expired'));}
  }
  return response;
 };
}
