import Foundation
import AppKit
import CoreGraphics
while true {
  if let app = NSWorkspace.shared.frontmostApplication {
    let data:[String:Any] = ["pid":app.processIdentifier,"name":app.bundleIdentifier ?? app.localizedName ?? "unknown",
      "identity":"uid:\(getuid())","sessionId":"desktop:\(getuid())",
      "idleMilliseconds":CGEventSource.secondsSinceLastEventType(.combinedSessionState,eventType:.null)*1000]
    if let encoded = try? JSONSerialization.data(withJSONObject:data), let line=String(data:encoded,encoding:.utf8) { print(line);fflush(stdout) }
  }
  Thread.sleep(forTimeInterval:2)
}
