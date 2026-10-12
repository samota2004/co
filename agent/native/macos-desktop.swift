import Foundation
import AppKit
import CoreGraphics
import ApplicationServices
import Darwin

let titles = CommandLine.arguments.contains("--browser-titles")
let fd = open("/tmp/cyberorbit-desktop-\(getuid()).lock", O_CREAT | O_RDWR | O_NOFOLLOW, S_IRUSR | S_IWUSR)
guard fd >= 0, flock(fd, LOCK_EX | LOCK_NB) == 0 else { exit(1) }
var lockStat = stat()
guard fstat(fd, &lockStat) == 0, lockStat.st_uid == getuid() else { exit(1) }
var reportedPermission = false
func titleOf(_ pid: pid_t) -> String? {
    guard AXIsProcessTrusted() else {
        if !reportedPermission {
            fputs("Browser titles unavailable: grant Accessibility to CYBERORBIT desktop helper\n", stderr)
            reportedPermission = true
        }
        return nil
    }
    var window: CFTypeRef?
    guard AXUIElementCopyAttributeValue(AXUIElementCreateApplication(pid), kAXFocusedWindowAttribute as CFString, &window) == .success,
          let focused = window, CFGetTypeID(focused) == AXUIElementGetTypeID() else { return nil }
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(focused as! AXUIElement, kAXTitleAttribute as CFString, &value) == .success else { return nil }
    return (value as? String).map { String($0.prefix(256)) }
}
func sample() {
    guard let session = CGSessionCopyCurrentDictionary() as? [String: Any] else {
        fputs("Desktop session state unavailable\n",stderr); return
    }
    let onConsole = session[kCGSessionOnConsoleKey as String] as? Bool ?? false
    let locked = !onConsole || (session["CGSSessionScreenIsLocked"] as? Bool ?? false)
    let app = locked ? nil : NSWorkspace.shared.frontmostApplication
    var data: [String: Any] = ["pid": app?.processIdentifier ?? 0,"name":String((app?.localizedName ?? "").prefix(256)),
      "appName":String((app?.localizedName ?? "").prefix(256)),"appId":String((app?.bundleIdentifier ?? "").prefix(256)),"identitySource":"macos-bundle",
      "identity":"uid:\(getuid())","sessionId":"desktop:\(getuid())","locked":locked,
      "idleMilliseconds":CGEventSource.secondsSinceLastEventType(.combinedSessionState,eventType:.null)*1000]
    let browsers = ["com.google.Chrome","org.chromium.Chromium","com.brave.Browser","com.microsoft.edgemac","org.mozilla.firefox","com.apple.Safari"]
    if titles {data["browserTitleStatus"] = AXIsProcessTrusted() ? "not-browser" : "permission-required"}
    if titles, let active=app, browsers.contains(active.bundleIdentifier ?? ""), let title=titleOf(active.processIdentifier) {
        data["browserTitle"]=title
        data["browserTitleStatus"]=title.isEmpty ? "unavailable" : "available"
    }
    if let encoded=try? JSONSerialization.data(withJSONObject:data),let line=String(data:encoded,encoding:.utf8) {print(line);fflush(stdout)}
}
let center=NSWorkspace.shared.notificationCenter
for event in [NSWorkspace.sessionDidResignActiveNotification,NSWorkspace.sessionDidBecomeActiveNotification] {
    center.addObserver(forName:event,object:nil,queue:.main) {_ in sample()}
}
Timer.scheduledTimer(withTimeInterval:2,repeats:true) {_ in sample()}
sample()
RunLoop.main.run()
