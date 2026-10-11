using System;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using System.Security.Principal;
public class OrbitDesktop {
  delegate bool EnumWindowCallback(IntPtr window, IntPtr parameter);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr window, EnumWindowCallback callback, IntPtr parameter);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern int GetApplicationUserModelId(IntPtr process,ref uint length,System.Text.StringBuilder id);
  public static string AppId(int pid) {
    IntPtr handle=OpenProcess(0x1000,false,pid);
    if(handle==IntPtr.Zero)return "";
    try {uint length=512;var id=new System.Text.StringBuilder(512);return GetApplicationUserModelId(handle,ref length,id)==0?id.ToString():"";}
    finally {CloseHandle(handle);}
  }
  // Resolve only visible child windows in this foreground frame and desktop
  // session. Ambiguous/inaccessible candidates retain the host instead of guessing.
  public static uint HostedPid(uint expectedPid) {
    IntPtr window=GetForegroundWindow();uint owner;
    GetWindowThreadProcessId(window,out owner);if(owner!=expectedPid)return 0;
    var candidates=new HashSet<uint>();
    int session=System.Diagnostics.Process.GetCurrentProcess().SessionId;
    EnumChildWindows(window,delegate(IntPtr child,IntPtr parameter) {
      uint pid;GetWindowThreadProcessId(child,out pid);
      if(pid==0 || pid==expectedPid || !IsWindowVisible(child))return true;
      try {using(var process=System.Diagnostics.Process.GetProcessById((int)pid)) {
        if(process.SessionId==session)candidates.Add(pid);
      }}catch{}
      return true;
    },IntPtr.Zero);
    if(GetForegroundWindow()!=window || candidates.Count!=1)return expectedPid;
    foreach(uint pid in candidates)return pid;
    return expectedPid;
  }
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, System.Text.StringBuilder text, int count);
  public static string BrowserTitle(uint expectedPid) {
    IntPtr window=GetForegroundWindow(); uint pid;
    GetWindowThreadProcessId(window,out pid);
    if(pid!=expectedPid) return "";
    var text=new System.Text.StringBuilder(257);
    GetWindowText(window,text,text.Capacity);
    return text.ToString();
  }
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
  [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr h);
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO info);
  [StructLayout(LayoutKind.Sequential)] struct LASTINPUTINFO { public uint size; public uint tick; }
  public static uint ForegroundPid() { uint pid; GetWindowThreadProcessId(GetForegroundWindow(),out pid); return pid; }
  public static bool Locked() { int state=OrbitSessions.LockState(System.Diagnostics.Process.GetCurrentProcess().SessionId); if(state<0)throw new Exception("Session lock state unavailable");return state==0; }
  public static uint IdleMilliseconds() { var i=new LASTINPUTINFO(); i.size=(uint)Marshal.SizeOf(i); return GetLastInputInfo(ref i) ? unchecked((uint)Environment.TickCount-i.tick) : uint.MaxValue; }
}
public class OrbitSessions {
  [DllImport("wtsapi32.dll", SetLastError=true)] static extern bool WTSLogoffSession(IntPtr server,int sessionId,bool wait);
  public static void LogoffIdentity(string sid) {
    foreach(var session in Snapshot()) {
      if(session.identity!=sid) continue;
      int id=int.Parse(session.sessionId);
      // Re-query immediately before acting; never log off by username alone.
      string user=Query(id,5),domain=Query(id,7);
      if(user=="")continue;
      string current=((SecurityIdentifier)new NTAccount(domain,user).Translate(typeof(SecurityIdentifier))).Value;
      if(current==sid && !WTSLogoffSession(IntPtr.Zero,id,false)) throw new Exception("Session logoff failed");
    }
  }
  [StructLayout(LayoutKind.Sequential)] struct WTS_SESSION_INFO { public int id; public IntPtr name; public int state; }
  [DllImport("wtsapi32.dll")] static extern bool WTSEnumerateSessions(IntPtr h,int r,int v,out IntPtr p,out int count);
  [DllImport("wtsapi32.dll", CharSet=CharSet.Unicode)] static extern bool WTSQuerySessionInformation(IntPtr h,int id,int c,out IntPtr p,out int bytes);
  [DllImport("wtsapi32.dll")] static extern void WTSFreeMemory(IntPtr p);
  public static int LockState(int id) {
    IntPtr p; int bytes;
    if(!WTSQuerySessionInformation(IntPtr.Zero,id,25,out p,out bytes)) return -1;
    // WTSINFOEX contains a union aligned to 8 bytes: Level is at 0,
    // SessionId at 8, SessionState at 12, and SessionFlags at 16.
    // Offset 12 is WTSActive (0), which would falsely label every active
    // interactive session as locked.
    try { return bytes>=20 && Marshal.ReadInt32(p)==1 ? Marshal.ReadInt32(p,16) : -1; } finally {WTSFreeMemory(p);}
  }
  public class Session { public string sessionId; public string state; public string identity; }
  static string Query(int id,int kind) { IntPtr p; int n; if(!WTSQuerySessionInformation(IntPtr.Zero,id,kind,out p,out n)) return ""; try{return Marshal.PtrToStringUni(p) ?? "";}finally{WTSFreeMemory(p);} }
  public static Session[] Snapshot() {
    IntPtr p; int count; if(!WTSEnumerateSessions(IntPtr.Zero,0,1,out p,out count)) throw new Exception("WTS sessions unavailable");
    var result=new List<Session>();
    try { for(int i=0;i<count;i++) {
      var s=(WTS_SESSION_INFO)Marshal.PtrToStructure(IntPtr.Add(p,i*Marshal.SizeOf(typeof(WTS_SESSION_INFO))),typeof(WTS_SESSION_INFO));
      string user=Query(s.id,5), domain=Query(s.id,7); if(user=="") continue;
      string sid=null; try { sid=((SecurityIdentifier)new NTAccount(domain,user).Translate(typeof(SecurityIdentifier))).Value; }catch{}
      result.Add(new Session{sessionId=s.id.ToString(),state=s.state.ToString(),identity=sid});
    } }finally{WTSFreeMemory(p);} return result.ToArray();
  }
}
public class OrbitProcesses {
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access,bool inherit,int id);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr h,uint access,out IntPtr token);
  [DllImport("advapi32.dll",SetLastError=true)] static extern bool GetTokenInformation(IntPtr token,int kind,IntPtr data,int size,out int needed);
  public class Observation { public int pid; public string name; public string startedAt; public string sessionId; public string identity; public string appId; }
  static string Owner(int id) {
    IntPtr h=OpenProcess(0x1000,false,id),token=IntPtr.Zero,data=IntPtr.Zero;
    if(h==IntPtr.Zero)return null;
    try {
      if(!OpenProcessToken(h,8,out token))return null;
      int bytes;GetTokenInformation(token,1,IntPtr.Zero,0,out bytes);if(bytes<=0)return null;
      data=Marshal.AllocHGlobal(bytes);if(!GetTokenInformation(token,1,data,bytes,out bytes))return null;
      return new SecurityIdentifier(Marshal.ReadIntPtr(data)).Value;
    } finally {if(data!=IntPtr.Zero)Marshal.FreeHGlobal(data);if(token!=IntPtr.Zero)CloseHandle(token);CloseHandle(h);}
  }
  public static Observation[] Snapshot() {
    var result=new List<Observation>();
    foreach(var p in System.Diagnostics.Process.GetProcesses()) {
      try {
        string start="";try{start=p.StartTime.ToUniversalTime().ToString("o");}catch{}
        result.Add(new Observation{pid=p.Id,name=p.ProcessName,startedAt=start,sessionId=p.SessionId.ToString(),identity=Owner(p.Id),appId=OrbitDesktop.AppId(p.Id)});
      } catch {} finally {p.Dispose();}
    } return result.ToArray();
  }
}
