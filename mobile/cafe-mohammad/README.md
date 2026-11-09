# Cafe Mohammad Android app

Native Android WebView wrapper for https://cafemohammad.tibasoft.ir/fa.
Package `ir.cafemohammad.app`, version 1.0.0 (5), Android 7+ (API 24), target/compile SDK 36.

## Build

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File mobile/cafe-mohammad/build.ps1
```

The build script uses the existing Unity AndroidPlayer Java 17 / Gradle 9.1 / Android SDK.
Pass `-AndroidToolsRoot` to use another complete AndroidPlayer tool directory. Java configuration
is restored afterwards; `local.properties`, Gradle caches and outputs are ignored by Git.
Gradle uses AGP 9.0.0 and the Myket Maven mirror with official repositories as fallbacks.
Sources: https://maven.myket.ir/ and https://en-mirror.ir/ (both responded to the AGP POM probe;
Myket was used for the successful Gradle build). No credentials are sent to these repositories.

Output: `exports/cafe-mohammad-debug.apk` (development signature; not a production release).
A production signing key and release distribution are separate steps. Keep the same production
key for future updates; do not use this development key for store delivery.

## Behavior

- Logo and native dark brown/orange animated launch overlay (logo pulse, steam and loading dots).
- Android 12+ system splash matches the brand before the custom overlay.
- Launches the public cafe domain in WebView; hides the overlay after the first visible page
  and at least 1.6 seconds. Main-page errors or a 20-second timeout show a Persian retry screen.
- Local JavaScript and DOM storage support the existing website. File/content access, mixed
  content and third-party cookies are disabled; SSL failures are cancelled.
- Cafe links stay inside the app. External web/mail links open suitable apps; phone links use
  the dialer. Only INTERNET permission is requested; no JavaScript/native bridge is exposed.
- The app loads the production Liara domain; local Docker/Matstack is not required. It requires internet.

## Verification, 2026-11-06

Gradle `assembleDebug` succeeded using Myket. APK signature and manifest/package were checked
with Android SDK tools. The public site and API returned HTTP 200 and menu/images were viewed
through the tunnel in the browser. No phone/emulator was attached: installation, splash motion,
WebView rendering and Android navigation have not been visually tested on Android yet.
The direct SDK build also succeeded during repository troubleshooting; the delivered APK is
from the successful standard Gradle build.

## Direct Instagram mode (0.3.0 / version code 3)

Shop settings now offer `shareTarget=instagram` and `instagramUsername` in addition to the
ordinary chooser. The cafe is configured for `_mehdi__hamze` as a test destination. Browser
copies then opens ig.me; Android copies natively and tries the Instagram package first, then
the web link if absent. User still pastes and sends manually. The owner confirmed that the
ig.me link opens the correct conversation on their phone. Updated APK install/copy/paste/send
is still awaiting phone verification. Public download: /downloads/cafe-mohammad-0.3.0.apk.

## Android inset correction (0.4.0 / version code 4)
Owner reported extra space below bottom navigation inside APK only. Activity now explicitly
owns edge-to-edge system insets and consumes them after applying root padding, preventing
WebView from reserving the same safe area again. IME bottom inset is included on Android 11+.
Gradle assembleDebug passed; download /downloads/cafe-mohammad-0.4.0.apk. No device was
attached; the owner must confirm the actual phone appearance. System navigation space remains.

## Signed production release (2026-11-08)

First store release: ir.cafemohammad.app, versionName1.0.0, versionCode5, SDK24–36.
Launch URL and internal navigation allowlist use https://cafemohammad.tibasoft.ir.
Unofficial native Instagram handoff removed; ordinary share handling remains.

Build: `powershell -NoProfile -ExecutionPolicy Bypass -File mobile/cafe-mohammad/build.ps1 -Release`.
Output exports/cafe-mohammad-release.apk; versioned delivery exports/cafe-mohammad-1.0.0-release.apk.
Signing identity lives in ignored var/android-signing/cafe-mohammad/: release.jks and signing.json.
The script passes passwords via environment, restores prior variables, and refuses missing signing
credentials. Never commit/upload these files to the app store; upload only the signed APK.
Keep a separate private backup of both files; reuse this key for every future version. On another
machine adjust signing.json.storeFile or pass -SigningConfig to a private configuration file.
Old debug APKs use another certificate and cannot be upgraded in place by this production APK.
Uninstalling a debug app removes its local WebView session; server-side records remain.
Store approval and actual Android runtime appearance require separate checks.

## Browser-like back — 1.0.1/code6
Back walks the WebView history (site pages and in-app navigation). Only at the first page does it
show a toast and exit on a second press within 2 seconds. Registered through OnBackInvokedDispatcher
on Android 13+ (targetSdk 36 no longer calls onBackPressed there) and onBackPressed on older versions.
Release build and signature verified; not yet tested on a device.
