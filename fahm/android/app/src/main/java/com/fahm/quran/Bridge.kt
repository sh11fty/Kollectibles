package com.fahm.quran

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.view.HapticFeedbackConstants
import android.webkit.JavascriptInterface
import androidx.core.view.WindowCompat

/** Functions the web app can call as `Native.xxx(...)`. All run off the UI thread by default. */
class Bridge(private val a: MainActivity) {

    @JavascriptInterface
    fun versionName(): String = pkgInfo()?.versionName ?: "0"

    @JavascriptInterface
    fun versionCode(): Int = pkgInfo()?.let {
        if (Build.VERSION.SDK_INT >= 28) it.longVersionCode.toInt() else @Suppress("DEPRECATION") it.versionCode
    } ?: 0

    private fun pkgInfo() = try {
        a.packageManager.getPackageInfo(a.packageName, 0)
    } catch (e: PackageManager.NameNotFoundException) {
        null
    }

    /** kind: tick | ok | bad | big */
    @JavascriptInterface
    fun haptic(kind: String) {
        a.runOnUiThread {
            val c = when (kind) {
                "ok" -> if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY
                "bad" -> if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.LONG_PRESS
                "big" -> HapticFeedbackConstants.LONG_PRESS
                else -> HapticFeedbackConstants.CLOCK_TICK
            }
            a.webView.performHapticFeedback(c)
        }
    }

    /** Match status/navigation bar icons and background to the in-app theme. */
    @JavascriptInterface
    fun setTheme(dark: Boolean, bgHex: String) {
        a.runOnUiThread {
            val controller = WindowCompat.getInsetsController(a.window, a.window.decorView)
            controller.isAppearanceLightStatusBars = !dark
            controller.isAppearanceLightNavigationBars = !dark
            try {
                val bg = Color.parseColor(bgHex)
                a.window.decorView.setBackgroundColor(bg)
                (a.webView.parent as? android.view.View)?.setBackgroundColor(bg)
                a.webView.setBackgroundColor(bg)
            } catch (_: IllegalArgumentException) {
            }
        }
    }

    @JavascriptInterface
    fun share(title: String, text: String) {
        a.runOnUiThread {
            val send = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_SUBJECT, title)
                putExtra(Intent.EXTRA_TEXT, text)
            }
            a.startActivity(Intent.createChooser(send, title))
        }
    }

    @JavascriptInterface
    fun copy(text: String) {
        a.runOnUiThread {
            val cm = a.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            cm.setPrimaryClip(ClipData.newPlainText("Fahm", text))
        }
    }

    @JavascriptInterface
    fun openUrl(url: String) {
        val u = Uri.parse(url)
        if (u.scheme == "https") a.runOnUiThread { a.openExternal(u) }
    }

    @JavascriptInterface
    fun notificationsGranted(): Boolean = Reminders.canNotify(a)

    @JavascriptInterface
    fun requestNotifications() = a.requestNotificationPermission()

    /** json: {enabled, hour, minute, nudge, messages:[{t,b}]} */
    @JavascriptInterface
    fun setReminder(json: String) {
        Reminders.configure(a, json)
    }

    /** Tell native the daily goal is done for `day` (yyyy-MM-dd) so today's reminders are skipped. */
    @JavascriptInterface
    fun goalDone(day: String, streak: Int) {
        Reminders.markGoalDone(a, day, streak)
    }

    @JavascriptInterface
    fun canInstallUpdates(): Boolean = Updater.canInstall(a)

    @JavascriptInterface
    fun openInstallSettings() = Updater.openInstallSettings(a)

    @JavascriptInterface
    fun installUpdate(url: String) = Updater.downloadAndInstall(a, url)

    @JavascriptInterface
    fun keepScreenOn(on: Boolean) {
        a.runOnUiThread {
            if (on) a.window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            else a.window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    @JavascriptInterface
    fun exit() {
        a.runOnUiThread { a.finish() }
    }
}
