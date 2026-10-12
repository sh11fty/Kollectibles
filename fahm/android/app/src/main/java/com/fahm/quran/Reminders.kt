package com.fahm.quran

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

/**
 * Local, offline reminders. The web app pushes its settings (and a handful of friendly messages)
 * here; alarms then keep working even if the app is never opened again. Reminders back off
 * automatically if they are ignored, and are skipped on days the daily goal is already done.
 */
object Reminders {
    const val CHANNEL_ID = "daily_reminder"
    private const val NOTIFICATION_ID = 4201
    private const val RC_MAIN = 4301
    private const val RC_NUDGE = 4302

    private fun prefs(ctx: Context): SharedPreferences =
        ctx.getSharedPreferences("fahm_native", Context.MODE_PRIVATE)

    fun ensureChannel(ctx: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = ctx.getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL_ID) == null) {
            nm.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_ID,
                    ctx.getString(R.string.channel_daily),
                    NotificationManager.IMPORTANCE_DEFAULT
                ).apply { description = ctx.getString(R.string.channel_daily_desc) }
            )
        }
    }

    fun canNotify(ctx: Context): Boolean {
        if (Build.VERSION.SDK_INT >= 33 &&
            ctx.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return false
        return NotificationManagerCompat.from(ctx).areNotificationsEnabled()
    }

    fun configure(ctx: Context, json: String) {
        val o = try { JSONObject(json) } catch (e: Exception) { return }
        prefs(ctx).edit()
            .putBoolean("enabled", o.optBoolean("enabled", false))
            .putInt("hour", o.optInt("hour", 19))
            .putInt("minute", o.optInt("minute", 0))
            .putBoolean("nudge", o.optBoolean("nudge", false))
            .putString("messages", (o.optJSONArray("messages") ?: JSONArray()).toString())
            .apply()
        rearm(ctx)
    }

    fun markOpened(ctx: Context) {
        prefs(ctx).edit().putInt("ignored", 0).apply()
    }

    fun markGoalDone(ctx: Context, day: String, streak: Int) {
        prefs(ctx).edit().putString("goalDay", day).putInt("streak", streak).apply()
    }

    private fun pending(ctx: Context, rc: Int, kind: String): PendingIntent =
        PendingIntent.getBroadcast(
            ctx, rc,
            Intent(ctx, ReminderReceiver::class.java).putExtra("kind", kind),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

    private fun nextTime(hour: Int, minute: Int): Long {
        val c = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, hour); set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
        }
        if (c.timeInMillis <= System.currentTimeMillis() + 60_000) c.add(Calendar.DAY_OF_YEAR, 1)
        return c.timeInMillis
    }

    fun rearm(ctx: Context) {
        val am = ctx.getSystemService(AlarmManager::class.java)
        am.cancel(pending(ctx, RC_MAIN, "main"))
        am.cancel(pending(ctx, RC_NUDGE, "nudge"))
        val p = prefs(ctx)
        if (!p.getBoolean("enabled", false)) return
        val hour = p.getInt("hour", 19)
        val minute = p.getInt("minute", 0)
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextTime(hour, minute), pending(ctx, RC_MAIN, "main"))
        if (p.getBoolean("nudge", false)) {
            // Evening "keep your streak" nudge, at least 90 minutes after the main reminder.
            val nudgeMinutes = maxOf(20 * 60 + 30, hour * 60 + minute + 90)
            if (nudgeMinutes < 23 * 60) {
                am.setAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    nextTime(nudgeMinutes / 60, nudgeMinutes % 60),
                    pending(ctx, RC_NUDGE, "nudge")
                )
            }
        }
    }

    fun onAlarm(ctx: Context, kind: String) {
        val p = prefs(ctx)
        val today = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(java.util.Date())
        val goalDoneToday = p.getString("goalDay", "") == today
        val ignored = p.getInt("ignored", 0)
        rearm(ctx) // always schedule the next one first

        if (goalDoneToday) return
        if (kind == "nudge" && p.getInt("streak", 0) < 2) return
        // Back off if the last few reminders were ignored: every 4th day after the third miss.
        if (ignored > 3 && ignored % 4 != 0) {
            if (kind == "main") p.edit().putInt("ignored", ignored + 1).apply()
            return
        }
        if (!canNotify(ctx)) return

        val msgs = try { JSONArray(p.getString("messages", "[]")) } catch (e: Exception) { JSONArray() }
        var title = "Time for your Quran words"
        var body = "A few minutes today keeps the words fresh."
        if (kind == "nudge") {
            title = "Keep your streak alive"
            body = "One short session and you're done for today."
        } else if (msgs.length() > 0) {
            val day = Calendar.getInstance().get(Calendar.DAY_OF_YEAR)
            val m = msgs.optJSONObject((day + ignored) % msgs.length())
            if (m != null) {
                title = m.optString("t", title)
                body = m.optString("b", body)
            }
        }
        ensureChannel(ctx)
        val open = PendingIntent.getActivity(
            ctx, 0,
            Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val n = NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_fahm)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(open)
            .setAutoCancel(true)
            .setColor(0xFF0F3D2E.toInt())
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()
        try {
            NotificationManagerCompat.from(ctx).notify(NOTIFICATION_ID + if (kind == "nudge") 1 else 0, n)
        } catch (_: SecurityException) {
            return
        }
        if (kind == "main") p.edit().putInt("ignored", ignored + 1).apply()
    }
}

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Reminders.onAlarm(context, intent.getStringExtra("kind") ?: "main")
    }
}

/** Re-arms alarms after reboot, app update, or a clock / time-zone change. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Reminders.rearm(context)
    }
}
