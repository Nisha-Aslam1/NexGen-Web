package org.nexgencouncil.supportdesk

import android.os.Bundle
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.button.MaterialButton
import com.google.android.material.chip.Chip
import kotlinx.coroutines.launch

class ChatActivity : AppCompatActivity() {
    private lateinit var prefs: PrefsManager
    private lateinit var adapter: MessageAdapter
    private var conversationId: String = ""
    private var currentConv: SupportConversation? = null

    private val quickReplies = listOf(
        "Assalam-o-Alaikum! How can the Council Secretariat help you today?",
        "Please share your Application Reference Code (e.g. NG-XXXX).",
        "Our coordinator is reviewing your record right now.",
        "Thank you for contacting NexGen Council Support!"
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = PrefsManager(this)
        conversationId = intent.getStringExtra(EXTRA_CONVERSATION_ID) ?: ""
        val initialTitle = intent.getStringExtra(EXTRA_VISITOR_NAME) ?: "Support Chat"

        if (conversationId.isBlank() || !prefs.isLoggedIn()) {
            finish()
            return
        }

        setContentView(R.layout.activity_chat)

        val btnBack = findViewById<MaterialButton>(R.id.btnBack)
        val tvTitle = findViewById<TextView>(R.id.tvChatTitle)
        val tvSubtitle = findViewById<TextView>(R.id.tvChatSubtitle)
        val btnResolve = findViewById<MaterialButton>(R.id.btnResolveToggle)
        val recycler = findViewById<RecyclerView>(R.id.recyclerMessages)
        val layoutQuick = findViewById<LinearLayout>(R.id.layoutQuickReplies)
        val etReply = findViewById<EditText>(R.id.etReply)
        val btnSend = findViewById<MaterialButton>(R.id.btnSendReply)

        tvTitle.text = initialTitle

        adapter = MessageAdapter()
        val lm = LinearLayoutManager(this).apply { stackFromEnd = true }
        recycler.layoutManager = lm
        recycler.adapter = adapter

        quickReplies.forEach { quick ->
            val chip = Chip(this).apply {
                text = if (quick.length > 36) quick.take(36) + "…" else quick
                isClickable = true
                setOnClickListener { sendReplyText(quick, etReply, btnSend) }
            }
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { marginEnd = 12 }
            layoutQuick.addView(chip, lp)
        }

        btnBack.setOnClickListener { finish() }

        btnSend.setOnClickListener {
            val txt = etReply.text.toString().trim()
            if (txt.isNotEmpty()) {
                sendReplyText(txt, etReply, btnSend)
            }
        }

        btnResolve.setOnClickListener {
            val conv = currentConv ?: return@setOnClickListener
            val token = prefs.authToken ?: return@setOnClickListener
            val nextStatus = if (conv.status == "resolved") "open" else "resolved"
            lifecycleScope.launch {
                val res = SupportApiClient.updateStatus(prefs.serverUrl, token, conv.id, nextStatus)
                res.onSuccess { updated ->
                    SupportRealtimeBus.upsertConversation(updated)
                    Toast.makeText(
                        this@ChatActivity,
                        if (nextStatus == "resolved") "Marked Resolved" else "Conversation Reopened",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }
        }

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                SupportRealtimeBus.conversations.collect { list ->
                    val found = list.find { it.id == conversationId } ?: return@collect
                    currentConv = found
                    tvTitle.text = found.displayName()
                    val subParts = listOfNotNull(
                        found.visitorWhatsapp,
                        found.visitorEmail,
                        if (found.status == "resolved") "Resolved" else "Live"
                    ).joinToString(" • ")
                    tvSubtitle.text = subParts

                    btnResolve.text = if (found.status == "resolved") "Reopen" else "Resolve"
                    adapter.submit(found.messages, found.displayName())
                    if (found.messages.isNotEmpty()) {
                        recycler.scrollToPosition(found.messages.size - 1)
                    }
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        SupportRealtimeBus.activeChatConversationId = conversationId
        val token = prefs.authToken ?: return
        lifecycleScope.launch {
            SupportApiClient.markRead(prefs.serverUrl, token, conversationId)
        }
    }

    override fun onPause() {
        if (SupportRealtimeBus.activeChatConversationId == conversationId) {
            SupportRealtimeBus.activeChatConversationId = null
        }
        super.onPause()
    }

    private fun sendReplyText(text: String, etReply: EditText, btnSend: MaterialButton) {
        val token = prefs.authToken ?: return
        btnSend.isEnabled = false
        lifecycleScope.launch {
            val res = SupportApiClient.sendReply(prefs.serverUrl, token, conversationId, text)
            btnSend.isEnabled = true
            res.onSuccess { updated ->
                etReply.setText("")
                SupportRealtimeBus.upsertConversation(updated)
            }.onFailure { err ->
                Toast.makeText(
                    this@ChatActivity,
                    err.message ?: "Failed to deliver reply",
                    Toast.LENGTH_SHORT
                ).show()
            }
        }
    }

    private class MessageAdapter : RecyclerView.Adapter<MessageAdapter.VH>() {
        private var items: List<SupportMessage> = emptyList()
        private var visitorName: String = "Visitor"

        fun submit(newItems: List<SupportMessage>, vName: String) {
            items = newItems
            visitorName = vName
            notifyDataSetChanged()
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
            val view = LayoutInflater.from(parent.context)
                .inflate(R.layout.item_message, parent, false)
            return VH(view)
        }

        override fun onBindViewHolder(holder: VH, position: Int) {
            holder.bind(items[position], visitorName)
        }

        override fun getItemCount(): Int = items.size

        class VH(itemView: View) : RecyclerView.ViewHolder(itemView) {
            private val root = itemView.findViewById<LinearLayout>(R.id.msgRowRoot)
            private val tvMeta = itemView.findViewById<TextView>(R.id.tvSenderMeta)
            private val tvBody = itemView.findViewById<TextView>(R.id.tvMessageBody)

            fun bind(msg: SupportMessage, visitorDisplay: String) {
                val ctx = itemView.context
                val isVisitor = msg.role == "user"
                val isAgent = msg.role == "agent"

                root.gravity = if (isVisitor) Gravity.START else Gravity.END

                when {
                    isVisitor -> {
                        tvMeta.text = msg.senderName ?: visitorDisplay
                        tvMeta.setTextColor(ContextCompat.getColor(ctx, R.color.slate_600))
                        tvBody.setBackgroundResource(R.drawable.bg_bubble_visitor)
                        tvBody.setTextColor(ContextCompat.getColor(ctx, R.color.slate_900))
                    }
                    isAgent -> {
                        tvMeta.text = msg.senderName ?: "Coordinator"
                        tvMeta.setTextColor(ContextCompat.getColor(ctx, R.color.emerald_700))
                        tvBody.setBackgroundResource(R.drawable.bg_bubble_agent)
                        tvBody.setTextColor(ContextCompat.getColor(ctx, R.color.white))
                    }
                    else -> {
                        tvMeta.text = "AI Concierge"
                        tvMeta.setTextColor(ContextCompat.getColor(ctx, R.color.indigo_700))
                        tvBody.setBackgroundResource(R.drawable.bg_bubble_ai)
                        tvBody.setTextColor(ContextCompat.getColor(ctx, R.color.slate_900))
                    }
                }

                tvBody.text = msg.text
            }
        }
    }

    companion object {
        const val EXTRA_CONVERSATION_ID = "extra_conversation_id"
        const val EXTRA_VISITOR_NAME = "extra_visitor_name"
    }
}
