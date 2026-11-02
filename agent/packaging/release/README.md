# CYBERORBIT platform release packages

Build packages on their supported operating systems; do not relabel a build kit
or cross-platform source archive as an employee installer.

## Windows

From an elevated or ordinary PowerShell session with Node >=22 and the Windows
.NET Framework compiler available:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File agent/packaging/release/build-windows.ps1
```

The build creates a staging tree under the system temporary directory, compiles
the service host, includes the pinned host Node executable, validates the
allowlisted Windows package, runs release tests against the archive, then writes
`agent/dist/CYBERORBIT-Windows.zip`. It refuses to overwrite an existing output.

## macOS

Run on a logged-in supported Mac with Xcode Command Line Tools, the pinned Node
runtime from `agent/packaging/macos/node-runtime.json`, and verified official
runtime archives for both architectures. Set
`CYBERORBIT_MACOS_RUNTIME_ARCHIVES` to their directory if it is not
`agent/dist/macos-runtime-cache`, then run:

```sh
sh agent/packaging/release/build-macos.sh
```

The existing Mac builder compiles and validates both native payloads and runs
its native/privacy tests before the release wrapper validates the actual ZIP.
It then writes `agent/dist/CYBERORBIT-macOS.zip`. This Windows host cannot run
that build and must not create a pretend Mac package.

## Manifests and cleanup

The Windows ZIP contains `package-manifest.json` with UTC build time, platform,
agent version and SHA-256 checksums for each packaged file. Both build commands
print the final ZIP SHA-256. The Mac install kit contains its existing
`kit-manifest.json` and file inventory. Archive hashes cannot be embedded in the
same archive without a self-referential checksum; retain the command output in
the release record.

Release tests inspect the supplied ZIP archives, not extracted `dist` folders.
Do not remove old files until both new archives pass validation. A cleanup
should refuse reparse points and preserve any item whose ownership or purpose
is unclear.
