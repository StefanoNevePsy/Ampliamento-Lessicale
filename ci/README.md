# CI signing key

`debug.keystore` is a **fixed Android debug keystore** used by the
`Build APK per tablet` workflow so that every CI build is signed with the
**same key**. This is what lets you install a freshly built APK *over* the app
on the tablet as an update — Android keeps all app data (patients, sessions,
cached models) only when the signature matches.

- Standard debug credentials: storepass `android`, keypass `android`,
  alias `androiddebugkey`. These match Gradle's default debug `signingConfig`,
  so `./gradlew assembleDebug` picks it up with no extra config once it is
  copied to `~/.android/debug.keystore`.
- This is a **debug** key with a publicly known password — it is not a secret
  and is intentionally committed for reproducible signing of an internal app.
  Do not use it to publish on the Play Store.

## Seamless first switch (optional, recommended)

The app currently on your tablet was signed by **your PC's** Android Studio
debug key, which differs from this one — so the very first CI APK cannot update
over it (Android will ask to uninstall, which wipes data).

To keep data even on that first switch, make CI sign with *your* key:

1. On the PC, base64-encode your debug keystore:
   - macOS/Linux: `base64 -w0 ~/.android/debug.keystore`
   - Windows PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("$env:USERPROFILE\.android\debug.keystore"))`
2. In the GitHub repo → Settings → Secrets and variables → Actions → New
   repository secret named `ANDROID_KEYSTORE_B64`, paste the string.

The workflow prefers that secret when present. (It must be a standard debug
keystore, i.e. password `android`.)

If you skip this: back up your data in-app first, install the CI APK once
(uninstalling the old one), then restore. Every build after that updates in
place with no data loss.
