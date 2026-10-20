import {request as httpsRequest} from 'node:https';

const groups={
  'tls-error':['CERT_HAS_EXPIRED','ERR_TLS_CERT_ALTNAME_INVALID','UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','SELF_SIGNED_CERT_IN_CHAIN','DEPTH_ZERO_SELF_SIGNED_CERT','ERR_TLS_HANDSHAKE_TIMEOUT','ERR_SSL_WRONG_VERSION_NUMBER'],
  'dns-error':['ENOTFOUND','EAI_AGAIN','EAI_FAIL'],
  'connection-refused':['ECONNREFUSED'],
  'network-unreachable':['ENETUNREACH','EHOSTUNREACH'],
  timeout:['ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT'],
  'connection-reset':['ECONNRESET','EPIPE','UND_ERR_SOCKET']
};
const knownCodes=new Set(Object.values(groups).flat());
const finalAttempt=Symbol('city final connection attempt');
function networkDetails(error) {
  // Node fetch may wrap AggregateError in cause. Never copy error.message,
  // stack, socket addresses, request details or arbitrary error.code values.
  const codes=new Set(),seen=new Set(),queue=[error];let timedOut=false,invalidResponse=false;
  for(let count=0;queue.length&&count<24;count++) {
    const value=queue.shift();if(!value||typeof value!=='object'||seen.has(value))continue;seen.add(value);
    if(knownCodes.has(value.code))codes.add(value.code);
    if(value instanceof SyntaxError)invalidResponse=true;
    if(['TimeoutError','AbortError'].includes(value.name))timedOut=true;
    if(value.cause)queue.push(value.cause);
    if(Array.isArray(value.errors))queue.push(...value.errors.slice(0,8));
  }
  return {codes,timedOut,invalidResponse};
}
export function cityNetworkFailure(error) {
  const all=networkDetails(error),{codes,timedOut,invalidResponse}=error?.[finalAttempt]?networkDetails(error[finalAttempt]):all;
  const networkCodes=[...all.codes].sort().slice(0,8);
  const reason=invalidResponse?'invalid-response':
    Object.keys(groups).find(key=>groups[key].some(code=>codes.has(code)))||(timedOut?'timeout':'network-error');
  return {reason,...(networkCodes.length?{networkCodes}:{})};
}
const retryable=new Set(['ENETUNREACH','EHOSTUNREACH','ENOTFOUND','EAI_AGAIN','ECONNREFUSED','UND_ERR_CONNECT_TIMEOUT']);
function providerUrl(value) {
  const url=new URL(value);
  if(url.protocol!=='https:'||!['api.ipapi.is','ipapi.co'].includes(url.hostname)||url.username||url.password||url.port)throw new Error('Provider origin is not allowed');
  return url;
}

export function createIpv4ProviderRequest({request=httpsRequest}={}) {
  return (value,options={})=>new Promise((resolve,reject)=>{
    const url=providerUrl(value);options.signal?.throwIfAborted();
    let completed=false;const chunks=[];let size=0;
    const fail=error=>{if(!completed){completed=true;reject(error);}};
    const req=request(url,{
      method:options.method||'GET',headers:options.headers,signal:options.signal,
      family:4,autoSelectFamily:false,agent:false,maxHeaderSize:8192,
      rejectUnauthorized:true,minVersion:'TLSv1.2',servername:url.hostname
    },res=>{
      res.on('error',fail);
      res.on('aborted',()=>fail(Object.assign(new Error('Provider response interrupted'),{code:'ECONNRESET'})));
      res.on('data',chunk=>{
        size+=chunk.length;
        if(size>65536){const error=new SyntaxError('Provider response limit');fail(error);req.destroy(error);return;}
        if(!completed)chunks.push(chunk);
      });
      res.on('end',()=>{
        if(completed)return;
        try{
          // Redirects are returned as errors by the caller, never followed.
          const headers=new Headers();
          for(const key of ['content-type','retry-after'])if(typeof res.headers[key]==='string')headers.set(key,res.headers[key]);
          const status=res.statusCode,body=[204,205,304].includes(status)?null:Buffer.concat(chunks);
          const response=new Response(body,{status,headers});completed=true;resolve(response);
        }catch(error){fail(error);}
      });
    });
    req.on('error',fail);req.end(options.body);
  });
}

export function createCityFetcher({fetcher=fetch,ipv4Request=createIpv4ProviderRequest(),warn=message=>console.warn(message),now=Date.now}={}) {
  let nextDiagnostic=0;
  return async(value,options={})=>{
    const url=providerUrl(value);
    try{return await fetcher(url,options);}
    catch(error){
      const failure=cityNetworkFailure(error),codes=failure.networkCodes||[];
      // Retry only connection/DNS failures before any HTTP response. Do not
      // retry TLS errors, authentication errors, quota refusals, response-body
      // failures, ambiguous socket resets, or a caller's expired deadline.
      if(options.signal?.aborted||!codes.length||codes.some(code=>!retryable.has(code)))throw error;
      if(now()>=nextDiagnostic){nextDiagnostic=now()+60000;warn('[endpoint-city-transport] '+JSON.stringify({action:'retry-ipv4',provider:url.hostname,networkCodes:codes}));}
      try{return await ipv4Request(url,options);}
      catch(retryError){const combined=new AggregateError([error,retryError],'Provider connection failed');combined[finalAttempt]=retryError;throw combined;}
    }
  };
}
export const cityFetcher=createCityFetcher();
