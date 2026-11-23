package org.nexgencouncil.supportdesk

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.RemoteInput

object SupportAlertHelper {
    const val CHANNEL_SERVICE = "nexgen_support_service_v1"
    const val CHANNEL_URGENT = "nexgen_support_urgent_v1"
    const val KEY_DIRECT_REPLY = "key_live_reply"

    private val VIBRATION_PATTERN = longArrayOf(0, 350, 140, 350, 140, 500)

    fun ensureChannels(context: Context) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val serviceChannel = NotificationChannel(
            CHANNEL_SERVICE,
            context.getString(R.string.service_channel_name),
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Keeps live WebSocket support connection active in background"
            setShowBadge(false)
        }
        nm.createNotificationChannel(serviceChannel)

        val defaultSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        val audioAttrs = AudioAttributes.Builder()
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_COMMUNICATION_INSTANT)
            .build()

        val urgentChannel = NotificationChannel(
            CHANNEL_URGENT,
            context.getString(R.string.urgent_channel_name),
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "High-priority alerts with sound and vibration for live website visitor messages"
            enableVibration(true)
            vibrationPattern = VIBRATION_PATTERN
            enableLights(true)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            setShowBadge(true)
            setSound(defaultSound, audioAttrs)
        }
        nm.createNotificationChannel(urgentChannel)
    }

    fun vibrateStrong(context: Context) {
        try {
            val effect = VibrationEffect.createWaveform(VIBRATION_PATTERN, -1)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
                vm.defaultVibrator.vibrate(effect)
            } else {
                @Suppress("DEPRECATION")
                val v = context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
                v.vibrate(effect)
            }
        } catch (_: Exception) {
        }
    }

    fun playAlertTone(context: Context) {
        try {
            val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            val ringtone = RingtoneManager.getRingtone(context, uri)
            ringtone?.play()
        } catch (_: Exception) {
        }
    }

    fun buildServiceNotification(context: Context, statusText: String): Notification {
        ensureChannels(context)
        val openIntent = Intent(context, InboxActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pi = PendingIntent.getActivity(
            context,
            100,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(context, CHANNEL_SERVICE)
            .setSmallIcon(R.drawable.ic_stat_support)
            .setContentTitle("NexGen Live Support Active")
            .setContentText(statusText)
            .setContentIntent(pi)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .build()
    }

    fun showIncomingVisitorNotification(
        context: Context,
        conversationId: String?,
        senderName: String,
        messageText: String,
        isHandoff: Boolean
    ) {
        ensureChannels(context)
        vibrateStrong(context)
        playAlertTone(context)

        val notifId = conversationId?.hashCode() ?: (System.currentTimeMillis() and 0xFFFF).toInt()

        val tapIntent = if (!conversationId.isNullOrBlank()) {
            Intent(context, ChatActivity::class.java).apply {
                putExtra(ChatActivity.EXTRA_CONVERSATION_ID, conversationId)
                putExtra(ChatActivity.EXTRA_VISITOR_NAME, senderName)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
        } else {
            Intent(context, InboxActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
        }

        val tapPi = PendingIntent.getActivity(
            context,
            notifId,
            tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val title = if (isHandoff) {
            "Live Human Request: $senderName"
        } else {
            "Message from $senderName"
        }

        val builder = NotificationCompat.Builder(context, CHANNEL_URGENT)
            .setSmallIcon(R.drawable.ic_stat_support)
            .setContentTitle(title)
            .setContentText(messageText)
            .setStyle(NotificationCompat.BigTextStyle().bigText(messageText))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setDefaults(NotificationCompat.DEFAULT_SOUND or NotificationCompat.DEFAULT_LIGHTS)
            .setVibrate(VIBRATION_PATTERN)
            .setContentIntent(tapPi)

        // Direct Inline Reply directly from Android notification shade
        if (!conversationId.isNullOrBlank()) {
            val remoteInput = RemoteInput.Builder(KEY_DIRECT_REPLY)
                .setLabel(context.getString(R.string.reply_hint))
                .build()

            val replyIntent = Intent(context, NotificationReplyReceiver::class.java).apply {
                putExtra(NotificationReplyReceiver.EXTRA_CONVERSATION_ID, conversationId)
                putExtra(NotificationReplyReceiver.EXTRA_NOTIFICATION_ID, notifId)
                putExtra(NotificationReplyReceiver.EXTRA_VISITOR_NAME, senderName)
            }

            val mutableFlag = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                PendingIntent.FLAG_MUTABLE
            } else {
                0
            }

            val replyPi = PendingIntent.getBroadcast(
                context,
                notifId + 9001,
                replyIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or mutableFlag
            )

            val replyAction = NotificationCompat.Action.Builder(
                R.drawable.ic_stat_support,
                context.getString(R.string.reply_action_label),
                replyPi
            )
                .addRemoteInput(remoteInput)
                .setAllowGeneratedReplies(true)
                .build()

            builder.addAction(replyAction)
        }

        try {
            NotificationManagerCompat.from(context).notify(notifId, builder.build())
        } catch (_: SecurityException) {
            // POST_NOTIFICATIONS permission not granted yet on Android 13+
        }
    }
}
