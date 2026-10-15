import Foundation
import AppKit
import CoreGraphics
import ApplicationServices
import Darwin
import SystemConfiguration

// Initialize a non-activating AppKit application and run its event loop below.
// NSRunningApplication properties require turns of the main/common run loop.
let application = NSApplication.shared
application.setActivationPolicy(.prohibited)

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
var workspaceActive: Bool? = nil
var displaySleeping = false
// Authenticated service replies are forwarded by the Node helper over stdin.
// If it exits, this child exits too; stale consent/proofs never enable titles.
DispatchQueue.global().async {
    while let line = readLine() {
        guard let bytes=line.data(using:.utf8), bytes.count<8192,
              let control=(try? JSONSerialization.jsonObject(with:bytes)) as? [String:Any] else {continue}
        DispatchQueue.main.async {
            let nextApp = control["activeApplication"] as? Bool == true
            if lastControl == Date.distantPast || nextApp != appEnabled {
                fputs("CYBERORBIT native controls: activeApplication=\(nextApp); revision=2\n", stderr)
            }
            titleEnabled = control["browserTitles"] as? Bool == true
            appEnabled = control["activeApplication"] as? Bool == true
            titleProofs = control["proofs"] as? [[String:Any]] ?? []
            lastControl = Date()
        }
    }
    exit(0)
}
var lockPath = "/tmp/cyberorbit-desktop-\(getuid()).lock"
// Native acceptance tests can observe the same employee GUI without stopping
// the enrolled agent. Isolate their lock in a private, owner-only test folder.
if let index = CommandLine.arguments.firstIndex(of:"--diagnostic-lock") {
    guard index+1 < CommandLine.arguments.count else {exit(1)}
    let target = CommandLine.arguments[index+1]
    var parentInfo = stat()
    let parent = (target as NSString).deletingLastPathComponent
    guard target.hasPrefix("/"), lstat(parent,&parentInfo) == 0,
          parentInfo.st_uid == getuid(), parentInfo.st_mode & 0o077 == 0,
          parentInfo.st_mode & mode_t(S_IFMT) == mode_t(S_IFDIR) else {exit(1)}
    lockPath = target
}
let fd = open(lockPath, O_CREAT | O_RDWR | O_NOFOLLOW, S_IRUSR | S_IWUSR)
guard fd >= 0, flock(fd, LOCK_EX | LOCK_NB) == 0 else { exit(1) }
var lockStat = stat()
guard fstat(fd, &lockStat) == 0, lockStat.st_uid == getuid(), lockStat.st_mode & 0o077 == 0,
      lockStat.st_mode & mode_t(S_IFMT) == mode_t(S_IFREG), lockStat.st_nlink == 1 else { exit(1) }
func processOwnerStatus(_ pid: pid_t) -> String {
    var query: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, pid]
    var info = kinfo_proc()
    var size = MemoryLayout<kinfo_proc>.stride
    guard sysctl(&query, UInt32(query.count), &info, &size, nil, 0) == 0, size > 0 else {return "owner-query-failed"}
    return info.kp_eproc.e_ucred.cr_uid == getuid() ? "owned" : "other-user"
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
    let session = CGSessionCopyCurrentDictionary() as? [String: Any]
    let onConsole = session?[kCGSessionOnConsoleKey as String] as? Bool
    let sameUser = (session?[kCGSessionUserIDKey as String] as? NSNumber)?.uint32Value == getuid()
    var consoleUID = uid_t.max
    var consoleGID = gid_t.max
    let consoleName = SCDynamicStoreCopyConsoleUser(nil, &consoleUID, &consoleGID)
    let verifiedConsole = consoleName != nil ? consoleUID == getuid() : onConsole == true && sameUser
    let consoleActive = verifiedConsole && onConsole != false && workspaceActive != false && !displaySleeping
    // Never turn an absent OS lock indicator into an invented unlocked event.
    let lockIndicator = session?["CGSSessionScreenIsLocked"] as? Bool
    let sessionState = lockIndicator == true ? "locked" : lockIndicator == false && consoleActive ? "unlocked" : "unknown"
    let fresh = Date().timeIntervalSince(lastControl) < 5
    var foregroundStatus = "frontmost-unavailable"
    var source = "none"
    var app: NSRunningApplication? = nil
    if !fresh {foregroundStatus = "controls-stale"}
    else if !appEnabled {foregroundStatus = "controls-disabled"}
    else if sessionState == "locked" {foregroundStatus = "session-locked"}
    else if !consoleActive {foregroundStatus = "console-inactive"}
    else {
        var candidate = NSWorkspace.shared.frontmostApplication
        source = "frontmostApplication"
        if candidate == nil || candidate?.isActive != true {
            // Public AppKit fallback; never infer a foreground app from a
            // process list, launch order, window names or another user's app.
            let active = NSWorkspace.shared.runningApplications.filter {$0.isActive && !$0.isTerminated}
            candidate = active.count == 1 ? active.first : nil
            source = "activeRunningApplication"
        }
        if let active = candidate {
            foregroundStatus = processOwnerStatus(active.processIdentifier)
            if foregroundStatus == "owned" {
                if active.isActive && !active.isTerminated {app = active;foregroundStatus = "available"}
                else {foregroundStatus = "not-active"}
            }
        }
    }
    let name = app?.localizedName ?? app?.executableURL?.lastPathComponent ?? ""
    let idleSeconds = CGEventSource.secondsSinceLastEventType(.combinedSessionState,eventType:.null)
    let idleAvailable = idleSeconds.isFinite && idleSeconds >= 0
    var data: [String: Any] = ["pid": app?.processIdentifier ?? 0,"name":String(name.prefix(256)),
      "appName":String(name.prefix(256)),"appId":String((app?.bundleIdentifier ?? "").prefix(256)),"identitySource":"macos-bundle",
      "identity":"uid:\(getuid())","sessionId":"desktop:\(getuid())",
      "helperRevision":2,"controlActiveApplication":appEnabled,"controlFresh":fresh,"consoleActive":consoleActive,
      "sessionState":sessionState,"foregroundStatus":foregroundStatus,"foregroundSource":source,
      "foregroundOwned":app != nil,"activityEligible":app != nil && !name.isEmpty,
      "idleStateAvailable":idleAvailable,
      "idleMilliseconds":idleAvailable ? min(86400000,idleSeconds*1000) : 60000]
    if sessionState != "unknown" {data["locked"]=sessionState == "locked"}
    else {
        data["sessionStatus"]="lock-state-unavailable"
        // Foreground ownership is independently checked. Missing lock data
        // never produces an unlock event; inactive/non-owner apps are excluded.
    }
    let browsers = ["com.google.Chrome","org.chromium.Chromium","com.brave.Browser","com.microsoft.edgemac","org.mozilla.firefox","com.apple.Safari"]
    if titles && titleEnabled && sessionState != "unlocked" {data["browserTitleStatus"]="session-unverified"}
    // Unknown lock state may support independently verified own-app usage,
    // but never permits the more sensitive browser-title collector.
    if titles && titleEnabled && sessionState == "unlocked" && fresh {
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
for event in [NSWorkspace.sessionDidResignActiveNotification,NSWorkspace.sessionDidBecomeActiveNotification,NSWorkspace.didActivateApplicationNotification,NSWorkspace.screensDidSleepNotification,NSWorkspace.screensDidWakeNotification] {
    center.addObserver(forName:event,object:nil,queue:.main) {notice in
        if notice.name == NSWorkspace.sessionDidResignActiveNotification {workspaceActive=false}
        if notice.name == NSWorkspace.sessionDidBecomeActiveNotification {workspaceActive=true}
        if notice.name == NSWorkspace.screensDidSleepNotification {displaySleeping=true}
        if notice.name == NSWorkspace.screensDidWakeNotification {displaySleeping=false}
        sample()
    }
}
let timer=Timer(timeInterval:2,repeats:true) {_ in sample()}
RunLoop.main.add(timer,forMode:.common)
sample()
application.run()
