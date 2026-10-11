using System;
using System.ServiceProcess;
using System.Diagnostics;
using System.IO;
using System.Threading;
public class OrbitService : ServiceBase {
  Process worker; string config; string log; bool stopping;
  public OrbitService(string configFile) { ServiceName="CyberOrbitAgent"; config=configFile; log=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),"CYBERORBIT","service.log"); }
  void Write(string text) { if(text==null)return; lock(this) {try {if(File.Exists(log) && new FileInfo(log).Length>1048576) {if(File.Exists(log+".1"))File.Delete(log+".1");File.Move(log,log+".1");} File.AppendAllText(log,DateTime.UtcNow.ToString("o")+" "+text+Environment.NewLine);}catch{}} }
  protected override void OnStart(string[] args) {
    string root=AppDomain.CurrentDomain.BaseDirectory;
    worker=new Process(); worker.StartInfo=new ProcessStartInfo(Path.Combine(root,"runtime","node.exe"),"\""+Path.Combine(root,"src","cli.js")+"\" service \""+config+"\"");
    worker.StartInfo.UseShellExecute=false;worker.StartInfo.CreateNoWindow=true;worker.StartInfo.RedirectStandardOutput=true;worker.StartInfo.RedirectStandardError=true;
    worker.OutputDataReceived+=(s,e)=>Write(e.Data);worker.ErrorDataReceived+=(s,e)=>Write(e.Data);
    worker.EnableRaisingEvents=true;worker.Exited+=(s,e)=>{if(!stopping)Environment.Exit(1);};
    worker.Start();worker.BeginOutputReadLine();worker.BeginErrorReadLine();
  }
  protected override void OnStop() {
    stopping=true;
    if(worker!=null && !worker.HasExited) {
      var kill=Process.Start(new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"taskkill.exe"),"/PID "+worker.Id+" /T /F"){UseShellExecute=false,CreateNoWindow=true});
      kill.WaitForExit(10000);
    }
  }
  public static void Main(string[] args) { if(args.Length!=1 || !Path.IsPathRooted(args[0]))throw new ArgumentException("Absolute configuration path required"); ServiceBase.Run(new OrbitService(args[0])); }
}
