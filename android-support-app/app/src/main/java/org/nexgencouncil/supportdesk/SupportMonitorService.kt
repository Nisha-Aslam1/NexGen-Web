package org.nexgencouncil.supportdesk

import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import kotlin.math.min

class SupportMonitorService : Service() {
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var prefs: PrefsManager
    private var webSocket: WebSocket? = null
    private var reconnectJob: Job? = null
    private var reconnectAttempt = 0
    private var isDestroyedFlag = false

    override fun onCreate() {
        super.onCreate()
        prefs = PrefsManager(this)
        val initialNotification = SupportAlertHelper.buildServiceNotification(
            this,
            "Connecting to live support..."
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                initialNotification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            startForeground(NOTIFICATION_ID, initialNotification)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            isDestroyedFlag = true
            closeSocket()
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }

        if (!prefs.isLoggedIn()) {
            stopSelf()
            return START_NOT_STICKY
        }

        connectWebSocket()
        return START_STICKY
    }

    private fun updateServiceBanner(text: String) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIFICATION_ID, SupportAlertHelper.buildServiceNotification(this, text))
    }

    private fun connectWebSocket() {
        if (isDestroyedFlag || !prefs.isLoggedIn()) return
        reconnectJob?.cancel()
        closeSocket()

        val token = prefs.authToken ?: return
        val base = prefs.serverUrl
        val wsBase = when {
            base.startsWith("https://") -> "wss://${base.removePrefix("https://")}"
            base.startsWith("http://") -> "ws://${base.removePrefix("http://")}"
            else -> "wss://$base"
        }
        val wsUrl = "$wsBase/ws/support?role=agent"

        val request = Request.Builder()
            .url(wsUrl)
            .addHeader("Authorization", "Bearer $token")
            .build()

        webSocket = SupportApiClient.httpClient.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                reconnectAttempt = 0
                SupportRealtimeBus.setConnected(true)
                updateServiceBanner("Live • Listening for website visitor messages")
                serviceScope.launch {
                    val res = SupportApiClient.fetchConversations(prefs.serverUrl, token)
                    res.onSuccess { list -> SupportRealtimeBus.setConversations(list) }
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    val payload = JSONObject(text)
                    val type = payload.optString("type", "")
                    val convObj = payload.optJSONObject("conversation")
                    val conv = convObj?.let { SupportConversation.fromJson(it) }
                    if (conv != null) {
                        SupportRealtimeBus.upsertConversation(conv)
                    }

                    when (type) {
                        "support:new_message", "support:handoff" -> {
                            val msgObj = payload.optJSONObject("message")
                            val senderName = conv?.displayName()
                                ?: msgObj?.optString("senderName")?.takeIf { it.isNotBlank() }
                                ?: "Website Visitor"
                            val bodyText = msgObj?.optString("text")?.takeIf { it.isNotBlank() }
                                ?: "Visitor requested live human support."

                            // Alert coordinator even if screen locked, unless actively viewing this exact chat
                            if (conv == null || SupportRealtimeBus.activeChatConversationId != conv.id) {
                                SupportAlertHelper.showIncomingVisitorNotification(
                                    context = this@SupportMonitorService,
                                    conversationId = conv?.id,
                                    senderName = senderName,
                                    messageText = bodyText,
                                    isHandoff = type == "support:handoff"
                                )
                            } else {
                                // Still gently vibrate on active chat incoming message
                                SupportAlertHelper.vibrateStrong(this@SupportMonitorService)
                                serviceScope.launch {
                                    SupportApiClient.markRead(prefs.serverUrl, token, conv.id)
                                }
                            }
                        }

                        "support:new_ticket" -> {
                            val contact = payload.optJSONObject("contact")
                            val sender = contact?.optString("name", "Visitor") ?: "Visitor"
                            val subj = contact?.optString("subject", "New Support Form Inquiry")
                                ?: "New Support Form Inquiry"
                            SupportAlertHelper.showIncomingVisitorNotification(
                                context = this@SupportMonitorService,
                                conversationId = null,
                                senderName = sender,
                                messageText = subj,
                                isHandoff = true
                            )
                        }
                    }
                } catch (_: Exception) {
                }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                SupportRealtimeBus.setConnected(false)
                scheduleReconnect()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                SupportRealtimeBus.setConnected(false)
                if (response?.code == 401 || response?.code == 403) {
                    updateServiceBanner("Authentication expired — please sign in again")
                    return
                }
                scheduleReconnect()
            }
        })
    }

    private fun scheduleReconnect() {
        if (isDestroyedFlag || !prefs.isLoggedIn()) return
        reconnectAttempt += 1
        val delayMs = min(15000L, 1500L * reconnectAttempt)
        updateServiceBanner("Reconnecting to live support...")
        reconnectJob = serviceScope.launch {
            delay(delayMs)
            connectWebSocket()
        }
    }

    private fun closeSocket() {
        try {
            webSocket?.close(1000, "Service restarting or stopped")
        } catch (_: Exception) {
        }
        webSocket = null
    }

    override fun onDestroy() {
        isDestroyedFlag = true
        SupportRealtimeBus.setConnected(false)
        closeSocket()
        serviceScope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val NOTIFICATION_ID = 7001
        const val ACTION_STOP = "org.nexgencouncil.supportdesk.ACTION_STOP"

        fun start(context: Context) {
            val intent = Intent(context, SupportMonitorService::class.java)
            ContextCompat.startForegroundService(context, intent)
        }

        fun stop(context: Context) {
            val intent = Intent(context, SupportMonitorService::class.java).apply {
                action = ACTION_STOP
            }
            context.startService(intent)
        }
    }
}
