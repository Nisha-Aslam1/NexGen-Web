package org.nexgencouncil.supportdesk

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

object SupportRealtimeBus {
    private val _conversations = MutableStateFlow<List<SupportConversation>>(emptyList())
    val conversations: StateFlow<List<SupportConversation>> = _conversations

    private val _wsConnected = MutableStateFlow(false)
    val wsConnected: StateFlow<Boolean> = _wsConnected

    var activeChatConversationId: String? = null

    fun setConnected(connected: Boolean) {
        _wsConnected.value = connected
    }

    fun setConversations(list: List<SupportConversation>) {
        _conversations.value = sortConversations(list)
    }

    fun upsertConversation(conv: SupportConversation) {
        val current = _conversations.value.toMutableList()
        val idx = current.indexOfFirst { it.id == conv.id || it.sessionId == conv.sessionId }
        if (idx >= 0) {
            current[idx] = conv
        } else {
            current.add(0, conv)
        }
        _conversations.value = sortConversations(current)
    }

    private fun sortConversations(list: List<SupportConversation>): List<SupportConversation> {
        return list.sortedWith(
            compareByDescending<SupportConversation> {
                when {
                    it.unreadByAgent > 0 -> 3
                    it.mode == "human" && it.status != "resolved" -> 2
                    it.escalatedToHuman -> 1
                    else -> 0
                }
            }.thenByDescending { it.updatedAt }
        )
    }
}
