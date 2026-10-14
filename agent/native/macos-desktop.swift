import Foundation
import AppKit
import CoreGraphics
import ApplicationServices
import Darwin

if CommandLine.arguments.contains("--request-accessibility") {
    let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String:true] as CFDictionary
    print(AXIsProcessTrustedWithOptions(options) ? "Accessibility granted" : "Accessibility permission required; use System Settings > Privacy & Security > Accessibility")
    exit(0)
}

let titles = CommandLine.arguments.contains("--browser-titles")
var titleEnabled = false
var appEnabled = false
var titleProofs: [[String:Any]] = []
var lastControl = Date.distantPast
// Authenticated service replies are forwarded by the Node helper over stdin.
// If it exits, this child exits too; stale consent/proofs never enable titles.
DispatchQueue.global().async {
    while let line = readLine() {
        guard let bytes=line.data(using:.utf8), bytes.count<8192,
              let control=(try? JSONSerialization.jsonObject(with:bytes)) as? [String:Any] else {continue}
        DispatchQueue.main.async {
            titleEnabled = control["browserTitles"] as? Bool == true
            appEnabled = control["activeApplication"] as? Bool == true
            titleProofs = control["proofs"] as? [[String:Any]] ?? []
            lastControl = Date()
        }
    }
    exit(0)
}
let fd = open("/tmp/cyberorbit-desktop-\(getuid()).lock", O_CREAT | O_RDWR | O_NOFOLLOW, S_IRUSR | S_IWUSR)
guard fd >= 0, flock(fd, LOCK_EX | LOCK_NB) == 0 else { exit(1) }
var lockStat = stat()
guard fstat(fd, &lockStat) == 0, lockStat.st_uid == getuid() else { exit(1) }
func ownedProcess(_ pid: pid_t) -> Bool {
    var query: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, pid]
    var info = kinfo_proc()
    var size = MemoryLayout<kinfo_proc>.stride
    return sysctl(&query, UInt32(query.count), &info, &size, nil, 0) == 0
        && size > 0 && info.kp_eproc.e_ucred.cr_uid == getuid()
}
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
        print("{\"kind\":\"desktop-status\",\"status\":\"session-state-unavailable\",\"identity\":\"uid:\(getuid())\"}");fflush(stdout); return
    }
    let onConsole = session[kCGSessionOnConsoleKey as String] as? Bool ?? false
    let sameUser = (session[kCGSessionUserIDKey as String] as? NSNumber)?.uint32Value == getuid()
    // Never turn an absent OS lock indicator into an invented unlocked event.
    let lockIndicator = session["CGSSessionScreenIsLocked"] as? Bool
    let locked = !onConsole || !sameUser || lockIndicator == true
    let foreground = locked || !appEnabled || Date().timeIntervalSince(lastControl)>=5 ? nil : NSWorkspace.shared.frontmostApplication
    let app = foreground.flatMap { ownedProcess($0.processIdentifier) ? $0 : nil }
    var data: [String: Any] = ["pid": app?.processIdentifier ?? 0,"name":String((app?.localizedName ?? "").prefix(256)),
      "appName":String((app?.localizedName ?? "").prefix(256)),"appId":String((app?.bundleIdentifier ?? "").prefix(256)),"identitySource":"macos-bundle",
      "identity":"uid:\(getuid())","sessionId":"desktop:\(getuid())",
      "idleMilliseconds":CGEventSource.secondsSinceLastEventType(.combinedSessionState,eventType:.null)*1000]
    if lockIndicator != nil || !onConsole || !sameUser {data["locked"]=locked}
    else {
        data["sessionStatus"]="lock-state-unavailable"
        // Foreground ownership is independently checked. Missing lock data
        // never produces an unlock event; inactive/non-owner apps are excluded.
    }
    let browsers = ["com.google.Chrome","org.chromium.Chromium","com.brave.Browser","com.microsoft.edgemac","org.mozilla.firefox","com.apple.Safari"]
    if titles && titleEnabled && !locked && Date().timeIntervalSince(lastControl)<5 {
        data["browserTitleStatus"] = AXIsProcessTrusted() ? "not-browser" : "permission-required"
        if let active=app, browsers.contains(active.bundleIdentifier ?? ""), AXIsProcessTrusted() {
            data["browserTitleStatus"] = active.bundleIdentifier == "com.apple.Safari" ? "privacy-unsupported" : "privacy-unverified"
            let now=Date().timeIntervalSince1970*1000
            if let proof=titleProofs.first(where:{p in
                guard let at=p["receivedAt"] as? Double else {return false}
                return p["appId"] as? String == active.bundleIdentifier && now>=at && now-at<4000
            }), let normalTitle=proof["title"] as? String {
                // Exact title matching prevents a race to a different/private
                // window from disclosing text absent from the normal window.
                if let axTitle=titleOf(active.processIdentifier) {
                    let allowed=[normalTitle]+["Google Chrome","Chromium","Microsoft Edge","Brave","Mozilla Firefox","Safari"].map {normalTitle+" - "+$0}
                    if allowed.contains(axTitle) && !axTitle.isEmpty {
                        data["browserTitle"]=axTitle;data["browserTitleStatus"]="available"
                    }
                } else {data["browserTitleStatus"]="unavailable"}
            }
        }
    }
    if let encoded=try? JSONSerialization.data(withJSONObject:data),let line=String(data:encoded,encoding:.utf8) {print(line);fflush(stdout)}
}
let center=NSWorkspace.shared.notificationCenter
for event in [NSWorkspace.sessionDidResignActiveNotification,NSWorkspace.sessionDidBecomeActiveNotification,NSWorkspace.didActivateApplicationNotification] {
    center.addObserver(forName:event,object:nil,queue:.main) {_ in sample()}
}
Timer.scheduledTimer(withTimeInterval:2,repeats:true) {_ in sample()}
sample()
RunLoop.main.run()
