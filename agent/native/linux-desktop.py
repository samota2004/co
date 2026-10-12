#!/usr/bin/python3
"""Session-local collector; no desktop content beyond opted-in window titles."""
import atexit, json, os, signal, subprocess, sys, time
from gi.repository import Gio, GLib

bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
titles = '--browser-titles' in sys.argv
root = os.path.dirname(os.path.abspath(__file__))
idle_child = None
idle_buffer = ''
idle_state = 'unknown'
idle_seen = 0
class DesktopUnavailable(Exception): pass

def close_idle():
    if idle_child is not None and idle_child.poll() is None: idle_child.terminate()
atexit.register(close_idle)
signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))

def kde_idle():
    global idle_child, idle_buffer, idle_state, idle_seen
    if idle_child is None or idle_child.poll() is not None:
        idle_state = 'unknown'
        idle_child = subprocess.Popen([os.path.join(root,'linux-idle-helper')],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
        os.set_blocking(idle_child.stdout.fileno(),False)
    try:
        chunk=os.read(idle_child.stdout.fileno(),4096).decode('ascii')
        idle_buffer+=chunk
        while '\n' in idle_buffer:
            value,idle_buffer=idle_buffer.split('\n',1)
            if value in ('active','idle','unknown'): idle_state=value;idle_seen=time.monotonic()
    except BlockingIOError: pass
    if idle_state=='unknown' or time.monotonic()-idle_seen>5: raise DesktopUnavailable('idle-state-unavailable')
    return 60000 if idle_state=='idle' else 0
def run(argv):
    return subprocess.run(argv, check=True, capture_output=True, text=True, timeout=3).stdout.strip()
def call(dest, path, interface, method, args=None):
    return bus.call_sync(dest,path,interface,method,args,None,Gio.DBusCallFlags.NONE,2500,None).unpack()
def session():
    props = dict(line.split('=',1) for line in run(['/usr/bin/loginctl','show-session',os.environ.get('XDG_SESSION_ID') or 'self',
        '-p','Id','-p','User','-p','Active','-p','LockedHint']).splitlines() if '=' in line)
    if props.get('User') != str(os.getuid()) or props.get('LockedHint') not in ('yes','no'):
        raise DesktopUnavailable('session-state-unavailable')
    return props['Id'],props.get('Active')!='yes' or props['LockedHint']=='yes'
kde_result = None
def submit(connection,sender,object_path,interface,method,parameters,invocation):
    global kde_result
    owner=call('org.freedesktop.DBus','/org/freedesktop/DBus','org.freedesktop.DBus','GetNameOwner',GLib.Variant('(s)',('org.kde.KWin',)))[0]
    if sender!=owner:
        invocation.return_dbus_error('org.cyberorbit.Denied','KWin only');return
    try:
        raw=parameters.unpack()[0]
        if len(raw)>4096: raise ValueError()
        kde_result=json.loads(raw);invocation.return_value(GLib.Variant('()',()))
    except Exception: invocation.return_dbus_error('org.cyberorbit.Invalid','Invalid sample')
interface=Gio.DBusNodeInfo.new_for_xml('<node><interface name="org.cyberorbit.Desktop"><method name="Submit"><arg type="s" direction="in"/></method></interface></node>')
registration=bus.register_object('/org/cyberorbit/Desktop',interface.interfaces[0],submit,None,None)
ownership=call('org.freedesktop.DBus','/org/freedesktop/DBus','org.freedesktop.DBus','RequestName',GLib.Variant('(su)',('org.cyberorbit.Desktop',4)))[0]
if ownership!=1: sys.exit('Desktop collector already running')
def kde_sample():
    global kde_result
    kde_result=None;name='cyberorbit-observation'
    try: call('org.kde.KWin','/Scripting','org.kde.kwin.Scripting','unloadScript',GLib.Variant('(s)',(name,)))
    except Exception: pass
    filename='kwin-titles.js' if titles else 'kwin.js'
    script_id=call('org.kde.KWin','/Scripting','org.kde.kwin.Scripting','loadScript',GLib.Variant('(ss)',(os.path.join(root,filename),name)))[0]
    if script_id<0: raise RuntimeError('KWin scripting unavailable')
    try:
        call('org.kde.KWin','/Scripting/Script'+str(script_id),'org.kde.kwin.Script','run')
        until=time.monotonic()+1
        while kde_result is None and time.monotonic()<until:
            while GLib.MainContext.default().pending(): GLib.MainContext.default().iteration(False)
            time.sleep(.01)
        if kde_result is None: raise RuntimeError('KWin sample unavailable')
        kde_result['idleMilliseconds']=kde_idle()
        return kde_result
    finally: call('org.kde.KWin','/Scripting','org.kde.kwin.Scripting','unloadScript',GLib.Variant('(s)',(name,)))
def sample():
    sid,locked=session();base=dict(identity='uid:'+str(os.getuid()),sessionId=sid,locked=locked)
    if locked: return dict(base,pid=0,name='',idleMilliseconds=0)
    desktop=os.environ.get('XDG_CURRENT_DESKTOP','').lower()
    gnome=call('org.freedesktop.DBus','/org/freedesktop/DBus','org.freedesktop.DBus','NameHasOwner',GLib.Variant('(s)',('org.gnome.Shell',)))[0]
    kde=call('org.freedesktop.DBus','/org/freedesktop/DBus','org.freedesktop.DBus','NameHasOwner',GLib.Variant('(s)',('org.kde.KWin',)))[0]
    if gnome and os.environ.get('XDG_SESSION_TYPE')=='wayland':
        data=json.loads(call('org.gnome.Shell','/org/cyberorbit/Desktop','org.cyberorbit.Desktop','Sample',GLib.Variant('(b)',(titles,)))[0])
        base['locked']=locked or data.get('locked',True)
    elif os.environ.get('XDG_SESSION_TYPE')=='wayland':
        if not kde: raise DesktopUnavailable('unsupported-compositor')
        data=kde_sample()
    else:
        import re
        window=re.search(r'0x[0-9a-fA-F]+',run(['/usr/bin/xprop','-root','_NET_ACTIVE_WINDOW']))
        if not window or window[0]=='0x0': return dict(base,pid=0,name='',idleMilliseconds=0)
        pid=int(run(['/usr/bin/xprop','-id',window[0],'_NET_WM_PID']).split('=')[-1].strip())
        classes=re.findall(r'"([^"\n]+)"',run(['/usr/bin/xprop','-id',window[0],'WM_CLASS']))
        data=dict(pid=pid,appId=classes[-1] if classes else '',idleMilliseconds=int(run(['/usr/bin/xprintidle'])))
        if titles: data['browserTitle']=run(['/usr/bin/xprop','-id',window[0],'_NET_WM_NAME']).partition('=')[2].strip().strip('"')
    pid=int(data.get('pid',0))
    if pid<=0 or base['locked']: return dict(base,pid=0,name='',idleMilliseconds=0)
    if os.stat('/proc/'+str(pid)).st_uid!=os.getuid(): raise RuntimeError('PID owner mismatch')
    with open('/proc/'+str(pid)+'/comm') as f: name=f.read().strip()
    data.update(base,pid=pid,name=name,identitySource='linux-desktop')
    browser=name.lower() in ('chrome','google-chrome','chromium','brave','brave-browser','msedge','microsoft-edge','firefox')
    if not titles or not browser: data.pop('browserTitle',None)
    data={k:v for k,v in data.items() if k in ('pid','name','identity','sessionId','locked','idleMilliseconds','appId','appName','identitySource','browserTitle')}
    for k in ('name','appId','appName','browserTitle'):
        if k in data: data[k]=str(data[k])[:256]
    return data
while True:
    started=time.monotonic()
    try: print(json.dumps(sample()),flush=True)
    except Exception as error:
        code=str(error) if isinstance(error,DesktopUnavailable) else 'desktop-query-failed'
        print(json.dumps(dict(identity='uid:'+str(os.getuid()),kind='desktop-status',status=code)),flush=True)
    time.sleep(max(.1,2-(time.monotonic()-started)))
