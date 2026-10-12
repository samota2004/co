// OS-reported names/IDs only. Do not infer browser activity from window contents.
export function isBrowser(sample) {
  const name = String(sample?.name || '').toLowerCase().replace(/\.exe$/, '');
  return ['chrome','google chrome','google-chrome','google-chrome-stable','chromium','chromium-browser',
    'brave','brave-browser','brave browser','msedge','microsoft-edge','microsoft edge','firefox','safari'].includes(name) ||
    /^(com\.google\.Chrome(?:\.(?:beta|dev|canary))?|org\.chromium\.Chromium|com\.brave\.Browser|com\.microsoft\.edgemac|org\.mozilla\.firefox|com\.apple\.Safari|google-chrome|chromium|brave-browser|microsoft-edge|firefox)(\.desktop)?$/i.test(sample?.appId || '');
}
export const identitySources = ['process','hosted-process','windows-app-id','unresolved-host','linux-desktop','macos-bundle'];
