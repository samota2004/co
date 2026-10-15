export function desktopControls(config,{revoked=false,stopping=false,proofs=[]}={}) {
  const enabled=!config.paused && !revoked && !stopping;
  return {activeApplication:enabled && config.activeApplication===true,
    browserTitles:enabled && config.activeApplication===true && config.browserTitles===true,
    proofs:enabled && config.activeApplication===true && config.browserTitles===true?proofs:[]};
}
export function nativeDesktopControl(reply) {
  return {activeApplication:reply.activeApplication===true,browserTitles:reply.browserTitles===true,proofs:Array.isArray(reply.proofs)?reply.proofs:[]};
}
