import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
const xml='<node><interface name="org.cyberorbit.Desktop"><method name="Sample"><arg type="b" direction="in"/><arg type="s" direction="out"/></method></interface></node>';
export default class DesktopMonitor extends Extension {
  enable() {
    this.object=Gio.DBusExportedObject.wrapJSObject(xml,{
      Sample(titles) {
        const locked=Main.screenShield.locked;
        const window=locked?null:global.display.focus_window;
        const app=window?Shell.WindowTracker.get_default().get_window_app(window):null;
        return JSON.stringify({pid:window?.get_pid() || 0,appId:app?.get_id() || window?.get_wm_class() || '',
          appName:app?.get_name() || '',locked,idleMilliseconds:Meta.IdleMonitor.get_core().get_idletime(),
          ...(titles && window?{browserTitle:(window.get_title() || '').slice(0,256)}:{})});
      },
    });
    this.object.export(Gio.DBus.session,'/org/cyberorbit/Desktop');
  }
  disable() {this.object?.unexport();this.object=null;}
}
