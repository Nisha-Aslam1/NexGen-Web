package org.nexgencouncil.supportdesk

import org.json.JSONArray
import org.json.JSONObject

data class SupportMessage(
    val id: String,
    val role: String,
    val senderName: String?,
    val text: String,
    val timestamp: String
) {
    companion object {
        fun fromJson(obj: JSONObject): SupportMessage {
            return SupportMessage(
                id = obj.optString("id", ""),
                role = obj.optString("role", "user"),
                senderName = obj.optString("senderName").takeIf { it.isNotBlank() && it != "null" },
                text = obj.optString("text", ""),
                timestamp = obj.optString("timestamp", "")
            )
        }
    }
}

data class SupportConversation(
    val id: String,
    val sessionId: String,
    val visitorName: String?,
    val visitorEmail: String?,
    val visitorWhatsapp: String?,
    val mode: String,
    val status: String,
    val escalatedToHuman: Boolean,
    val assignedAgentName: String?,
    val unreadByAgent: Int,
    val updatedAt: String,
    val messages: List<SupportMessage>
) {
    fun displayName(): String {
        return visitorName?.takeIf { it.isNotBlank() }
            ?: "Visitor (${sessionId.takeLast(5)})"
    }

    fun lastMessageText(): String {
        val last = messages.lastOrNull()?.text ?: return "No messages yet"
        return last
            .replace(Regex("\\[\\[NAV:[^|]+\\|([^\\]]+)\\]\\]"), "$1")
            .replace(Regex("\\*\\*([^*]+)\\*\\*"), "$1")
            .trim()
    }

    companion object {
        fun fromJson(obj: JSONObject): SupportConversation {
            val msgsJson = obj.optJSONArray("messages") ?: JSONArray()
            val parsedMessages = ArrayList<SupportMessage>(msgsJson.length())
            for (i in 0 until msgsJson.length()) {
                val item = msgsJson.optJSONObject(i) ?: continue
                parsedMessages.add(SupportMessage.fromJson(item))
            }
            return SupportConversation(
                id = obj.optString("id", ""),
                sessionId = obj.optString("sessionId", ""),
                visitorName = obj.optString("visitorName").takeIf { it.isNotBlank() && it != "null" },
                visitorEmail = obj.optString("visitorEmail").takeIf { it.isNotBlank() && it != "null" },
                visitorWhatsapp = obj.optString("visitorWhatsapp").takeIf { it.isNotBlank() && it != "null" },
                mode = obj.optString("mode", "ai"),
                status = obj.optString("status", "open"),
                escalatedToHuman = obj.optBoolean("escalatedToHuman", false),
                assignedAgentName = obj.optString("assignedAgentName").takeIf { it.isNotBlank() && it != "null" },
                unreadByAgent = obj.optInt("unreadByAgent", 0),
                updatedAt = obj.optString("updatedAt", ""),
                messages = parsedMessages
            )
        }
    }
}

sealed class LoginOutcome {
    data class Success(val token: String, val name: String, val role: String) : LoginOutcome()
    data class Requires2FA(val temp2faToken: String) : LoginOutcome()
    data class Failure(val error: String) : LoginOutcome()
}
