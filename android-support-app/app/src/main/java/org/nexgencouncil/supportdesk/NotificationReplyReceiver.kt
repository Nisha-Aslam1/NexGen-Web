package org.nexgencouncil.supportdesk

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.RemoteInput
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class NotificationReplyReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val remoteInput = RemoteInput.getResultsFromIntent(intent) ?: return
        val replyText = remoteInput.getCharSequence(SupportAlertHelper.KEY_DIRECT_REPLY)
            ?.toString()?.trim()
        if (replyText.isNullOrBlank()) return

        val conversationId = intent.getStringExtra(EXTRA_CONVERSATION_ID) ?: return
        val notifId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, conversationId.hashCode())
        val visitorName = intent.getStringExtra(EXTRA_VISITOR_NAME) ?: "Visitor"

        val prefs = PrefsManager(context)
        val token = prefs.authToken ?: return
        val pendingResult = goAsync()

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val res = SupportApiClient.sendReply(
                    serverUrl = prefs.serverUrl,
                    token = token,
                    conversationId = conversationId,
                    text = replyText
                )
                res.onSuccess { updated ->
                    SupportRealtimeBus.upsertConversation(updated)
                    val confirmation = NotificationCompat.Builder(
                        context,
                        SupportAlertHelper.CHANNEL_URGENT
                    )
                        .setSmallIcon(R.drawable.ic_stat_support)
                        .setContentTitle("Replied to $visitorName")
                        .setContentText("You: $replyText")
                        .setSilent(true)
                        .setAutoCancel(true)
                        .build()
                    try {
                        NotificationManagerCompat.from(context).notify(notifId, confirmation)
                    } catch (_: SecurityException) {
                    }
                }
            } finally {
                pendingResult.finish()
            }
        }
    }

    companion object {
        const val EXTRA_CONVERSATION_ID = "extra_conversation_id"
        const val EXTRA_NOTIFICATION_ID = "extra_notification_id"
        const val EXTRA_VISITOR_NAME = "extra_visitor_name"
    }
}
