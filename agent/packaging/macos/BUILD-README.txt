CYBERORBIT macOS Build Kit -- FOR THE ADMINISTRATOR/BUILDER

This ZIP is NOT the employee installer. It contains current agent sources, tests,
double-click installer templates, and SHA-256-verified official Node v22.23.3
archives for both architectures. There are no compiled Mac helpers yet.
It contains no enrollment token, employee credentials, .env file or live queue.

ONE MAC BUILD
1. Transfer this ZIP and its trusted company checksum to a Mac and extract it.
2. Use a logged-in build account with Apple Xcode Command Line Tools installed.
   If unavailable, provision them through Apple's normal installation process
   (xcode-select --install) or your company's software management.
3. Double-click Build-Mac-Install-Kit.command. It uses the included Node runtime,
   compiles Swift helpers for arm64 and x86_64, validates both executable types,
   runs native/privacy tests on the build Mac, and preserves execute bits in ZIP.
   Employees do NOT need these development tools.
4. Output, relative to the extracted build folder:
   output/CYBERORBIT-macOS-Install-Kit.zip
   output/CYBERORBIT-macOS-Install-Kit.zip.sha256
5. Validate on an Apple Silicon and an Intel Mac using disposable assignments.
   Browser-title granted/denied/private-window testing remains a manual real-Mac
   acceptance gate. The build does not claim those browser tests passed.
6. Distribute ONLY that output employee ZIP, plus its checksum, to employees.
   They extract it and double-click Install-CYBERORBIT.command.

The builder can cross-compile both architectures on one supported Mac. Native
tests execute only the build Mac's architecture. Runtime acceptance on the other
architecture must still pass. The runtime version/checksums are pinned in
agent/packaging/macos/node-runtime.json. Native helpers target macOS 13.

Signing: optionally run the build command from Terminal with your organization's
CYBERORBIT_SIGNING_IDENTITY environment variable. It signs the custom helpers.
Company signing/notarization of the complete distribution is a release step;
unsigned development builds may need ordinary macOS approval. Never disable
Gatekeeper/TCC/SIP/FileVault. The build does not deploy the backend or enroll a
production device. Use the reviewed backend/frontend already deployed by IT.

Existing build output is refused. If a build fails, preserve its diagnostics and
extract the kit into a new folder for another build; no existing enrollment is
ever deleted by the builder. There is no sudo step in the employee installation.

Repository commands for future builds:
  node agent/packaging/macos/prepare-build-kit.js
  (creates this source/runtime build ZIP on Windows, Linux or macOS)
  node agent/packaging/macos/build-install-kit.js --runtime-archives DIR --output DIR
  (Mac-only; use the bundled pinned Node runtime)

See MACOS-VERIFICATION.md for previously executed tests and platform limitations.
