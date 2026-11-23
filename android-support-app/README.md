# NexGen Live Support Desk — Native Android Coordinator App

Native Kotlin Android application engineered for **real-time visitor widget support** with persistent background WebSocket monitoring, **high-priority Android heads-up notifications**, **custom hardware vibration**, notification sound, and **inline reply directly from the notification shade**.

## Features Included
- **Persistent Background Foreground Service** (`SupportMonitorService`): Keeps an encrypted WebSocket (`wss://.../ws/support?role=agent`) open even when minimized or locked, and restarts automatically after phone reboot.
- **High-Priority Native Alerts & Vibration** (`SupportAlertHelper`): Uses Android `IMPORTANCE_HIGH` NotificationChannel with waveform vibration (`[0, 350, 140, 350, 140, 500]`), instant ringtone alert, and lock-screen heads-up banners.
- **Direct Inline Notification Reply** (`NotificationReplyReceiver`): Reply straight from the Android notification bar without even opening the app.
- **Staff Security**: Encrypted token storage (`EncryptedSharedPreferences`) + 2FA Google Authenticator support.

---

## How to Generate the `.apk` File (2 Easy Ways)

### Option A — 1-Click Cloud Build via GitHub Actions (No Android Studio Needed)
1. Upload the contents of this `android-support-app` folder to a new GitHub repository.
2. Open the **Actions** tab on GitHub and run **Build NexGen Support Android APK** (it also runs automatically on push).
3. Download **`NexGen-Live-Support-APK`** from the workflow run Artifacts and install the `.apk` on your Android phone.

### Option B — Local Build in Android Studio
1. Open the `android-support-app` folder in **Android Studio** (JDK 17).
2. Wait for Gradle sync to finish.
3. Click **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
4. Grab the generated APK at `app/build/outputs/apk/debug/app-debug.apk`.
