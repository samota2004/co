import Foundation
import Security
let input = FileHandle.standardInput.readDataToEndOfFile()
let r = try JSONSerialization.jsonObject(with: input) as! [String:String]
let query: [String:Any] = [kSecClass as String:kSecClassGenericPassword,
  kSecAttrService as String:"CYBERORBIT endpoint", kSecAttrAccount as String:r["account"]!]
if r["action"] == "set" {
  SecItemDelete(query as CFDictionary)
  var item = query
  item[kSecValueData as String] = r["value"]!.data(using:.utf8)!
  item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
  guard SecItemAdd(item as CFDictionary,nil) == errSecSuccess else { exit(1) }
} else {
  var q = query; q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
  var result:CFTypeRef?
  guard SecItemCopyMatching(q as CFDictionary,&result) == errSecSuccess else { exit(1) }
  FileHandle.standardOutput.write(result as! Data)
}
