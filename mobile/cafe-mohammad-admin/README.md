# Cafe Mohammad management Android app

Separate WebView app for https://cafemohammad.tibasoft.ir/fa/admin.
Package ir.cafemohammad.admin, version1.0.1/code2, minSDK24/target36.
Display name: مدیریت کافه محمد. Installs alongside ir.cafemohammad.app with separate WebView
data/session. No embedded login details; server authentication/permissions remain required.
Internal /fa/admin and /admin paths stay in the app; other web links open externally. No native order/share
bridge. INTERNET is the only permission. SSL errors cancel navigation; mixed content/file access
and third-party cookies remain disabled.

Dedicated dark espresso/amber admin icon derived from cafe branding using imagegen.
Build: powershell -NoProfile -ExecutionPolicy Bypass -File mobile/cafe-mohammad-admin/build.ps1 -Release
Output: exports/cafe-mohammad-admin-release.apk. Signing reuses the cafe production certificate
from ignored var/android-signing/cafe-mohammad/signing.json; never replace that identity.
Private backup remains backups/android-signing/cafe-mohammad-release-key-20261108.zip.
Do not include key/config in distributable files. No connected Android device: runtime UI
verification remains with owner.

Version1.0.1: Persian launch path; production browser probe redirects to /fa/admin/login, html lang=fa and Persian login labels. Signed release rebuilt/verified; Android device check still pending.

## Browser-like back — 1.1.1/code4
Back walks the WebView history (site pages and in-app navigation). Only at the first page does it
show a toast and exit on a second press within 2 seconds. Registered through OnBackInvokedDispatcher
on Android 13+ (targetSdk 36 no longer calls onBackPressed there) and onBackPressed on older versions.
Release build and signature verified; not yet tested on a device.
