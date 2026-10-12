package com.fahm.quran

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * Self-updater. The web app finds a newer GitHub release; this downloads the APK and hands it to
 * Android's PackageInstaller. Because every build is signed with the same key, Android accepts it
 * as an in-place update and all progress is kept.
 */
object Updater {
    private const val TAG = "FahmUpdater"
    // Only ever download from this project's own releases.
    private const val ALLOWED_PREFIX = "https://github.com/sh11fty/Kollectibles/releases/download/"

    fun canInstall(ctx: Context): Boolean =
        Build.VERSION.SDK_INT < 26 || ctx.packageManager.canRequestPackageInstalls()

    fun openInstallSettings(a: MainActivity) {
        a.runOnUiThread {
            a.startActivity(
                Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${a.packageName}"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        }
    }

    private fun status(a: MainActivity, state: String, detail: String = "") {
        val safe = detail.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ")
        a.callJs("window.__native && window.__native.onUpdateStatus && window.__native.onUpdateStatus('$state','$safe')")
    }

    fun downloadAndInstall(a: MainActivity, url: String) {
        if (!url.startsWith(ALLOWED_PREFIX)) {
            status(a, "error", "Unexpected download address")
            return
        }
        if (!canInstall(a)) {
            status(a, "needs-permission")
            return
        }
        thread(name = "fahm-update") {
            try {
                status(a, "downloading", "0")
                val dir = File(a.cacheDir, "updates").apply { mkdirs() }
                dir.listFiles()?.forEach { it.delete() }
                val file = File(dir, "fahm-update.apk")
                val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 20_000
                    readTimeout = 30_000
                    instanceFollowRedirects = true
                    setRequestProperty("User-Agent", "Fahm-Updater")
                }
                if (conn.responseCode != 200) throw IllegalStateException("HTTP ${conn.responseCode}")
                val total = conn.contentLengthLong
                var done = 0L
                var lastPct = -1
                conn.inputStream.use { input ->
                    file.outputStream().use { out ->
                        val buf = ByteArray(64 * 1024)
                        while (true) {
                            val n = input.read(buf)
                            if (n < 0) break
                            out.write(buf, 0, n)
                            done += n
                            if (total > 0) {
                                val pct = (done * 100 / total).toInt()
                                if (pct != lastPct) { lastPct = pct; status(a, "downloading", pct.toString()) }
                            }
                        }
                    }
                }
                if (file.length() < 100_000) throw IllegalStateException("Download too small")
                status(a, "installing")
                install(a, file)
            } catch (e: Exception) {
                Log.w(TAG, "Update failed", e)
                status(a, "error", e.message ?: e.javaClass.simpleName)
            }
        }
    }

    private fun install(ctx: Context, apk: File) {
        val installer = ctx.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        if (Build.VERSION.SDK_INT >= 31) {
            params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        }
        val id = installer.createSession(params)
        installer.openSession(id).use { session ->
            apk.inputStream().use { input ->
                session.openWrite("fahm.apk", 0, apk.length()).use { out ->
                    input.copyTo(out)
                    session.fsync(out)
                }
            }
            val pi = PendingIntent.getBroadcast(
                ctx, id,
                Intent(ctx, InstallReceiver::class.java).setPackage(ctx.packageName),
                PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            session.commit(pi.intentSender)
        }
    }
}

class InstallReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -1)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val confirm = if (Build.VERSION.SDK_INT >= 33)
                    intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
                else intent.getParcelableExtra(Intent.EXTRA_INTENT)
                confirm?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                if (confirm != null) context.startActivity(confirm)
            }
            PackageInstaller.STATUS_SUCCESS -> Log.i("FahmUpdater", "Update installed")
            else -> Log.w(
                "FahmUpdater",
                "Install status ${intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -1)}: " +
                    intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
            )
        }
    }
}
