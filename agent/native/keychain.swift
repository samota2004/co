import Foundation
import Security
import Darwin
let input = FileHandle.standardInput.readDataToEndOfFile()
let r = try JSONSerialization.jsonObject(with: input) as! [String:String]
var query: [String:Any] = [kSecClass as String:kSecClassGenericPassword,
  kSecAttrService as String:"CYBERORBIT endpoint", kSecAttrAccount as String:r["account"]!]
// LaunchDaemon credentials belong in the System keychain, not an employee's
// locked login keychain. Root service only; no interactive unlock fallback.
guard getuid() == 0 else { exit(1) }
SecKeychainSetUserInteractionAllowed(false)
var systemKeychain: SecKeychain?
guard SecKeychainOpen("/Library/Keychains/System.keychain", &systemKeychain) == errSecSuccess,
      let keychain = systemKeychain else { exit(1) }
query[kSecMatchSearchList as String] = [keychain]
if r["action"] == "set" {
  let value = r["value"]!.data(using:.utf8)!
  let updated = SecItemUpdate(query as CFDictionary, [kSecValueData as String:value] as CFDictionary)
  if updated == errSecSuccess { exit(0) }
  guard updated == errSecItemNotFound else { exit(1) }
  var item = query
  item.removeValue(forKey:kSecMatchSearchList as String)
  item[kSecUseKeychain as String] = keychain
  item[kSecValueData as String] = value
  guard SecItemAdd(item as CFDictionary,nil) == errSecSuccess else { exit(1) }
} else {
  var q = query; q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
  var result:CFTypeRef?
  var status = SecItemCopyMatching(q as CFDictionary,&result)
  if status == errSecItemNotFound {
    // Preserve readability of existing root-keychain enrollments for migration.
    q.removeValue(forKey:kSecMatchSearchList as String)
    status = SecItemCopyMatching(q as CFDictionary,&result)
  }
  guard status == errSecSuccess else { exit(1) }
  FileHandle.standardOutput.write(result as! Data)
}
