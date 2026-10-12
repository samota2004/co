const window = workspace.activeWindow;
callDBus('org.cyberorbit.Desktop','/org/cyberorbit/Desktop','org.cyberorbit.Desktop','Submit',
    JSON.stringify(window ? {pid:window.pid,appId:String(window.desktopFileName || window.resourceClass || '')} : {pid:0}));
