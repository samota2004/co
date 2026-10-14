// No content scripts, URLs, page bodies, cookies, keystrokes or private tabs.
// Title queries require a fresh agent control response confirming both approvals.
let port, busy=false, approvedUntil=0;
function connect() {
  if(port)return;
  try {
    port=chrome.runtime.connectNative('com.cyberorbit.browser');
    port.onDisconnect.addListener(()=>{void chrome.runtime.lastError;port=null;approvedUntil=0;busy=false;});
    port.onMessage.addListener(reply=>{
      approvedUntil=reply.accepted===true && reply.browserTitles===true?Date.now()+2000:0;
      if(busy) {busy=false;if(approvedUntil>Date.now())observeTitle();}
    });
  }catch{port=null;approvedUntil=0;}
}
function proof(value) {try{port?.postMessage({kind:'proof',...value});}catch{approvedUntil=0;}}
function observeTitle() {
  if(approvedUntil<=Date.now())return;
  chrome.windows.getLastFocused({},win=>{
    if(chrome.runtime.lastError || !win || win.incognito || !win.focused || win.type!=='normal') {
      proof({incognito:true,focused:false});return;
    }
    chrome.tabs.query({active:true,windowId:win.id},tabs=>{
      const tab=tabs?.[0];
      if(approvedUntil>Date.now() && !chrome.runtime.lastError && tab && tab.incognito===false && typeof tab.title==='string' && tab.title.length<=256) {
        proof({incognito:false,focused:true,title:tab.title});
      } else proof({incognito:true,focused:false});
    });
  });
}
function observe() {
  if(busy)return;connect();if(!port)return;
  busy=true;
  try{port.postMessage({kind:'control'});}catch{busy=false;approvedUntil=0;}
}
chrome.windows.onFocusChanged.addListener(()=>{approvedUntil=0;observe();});
chrome.tabs.onActivated.addListener(observe);
chrome.tabs.onUpdated.addListener((_id,change,tab)=>{if(tab.active && change.status==='complete')observe();});
chrome.alarms.create('reconnect',{periodInMinutes:1});
chrome.alarms.onAlarm.addListener(observe);
setInterval(observe,1000);observe();
