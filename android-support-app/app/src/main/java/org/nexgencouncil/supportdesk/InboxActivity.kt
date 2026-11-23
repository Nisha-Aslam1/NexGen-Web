package org.nexgencouncil.supportdesk

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.google.android.material.button.MaterialButton
import com.google.android.material.chip.ChipGroup
import kotlinx.coroutines.launch

class InboxActivity : AppCompatActivity() {
    private lateinit var prefs: PrefsManager
    private lateinit var adapter: ConversationAdapter
    private var currentFilter = "all"
    private var searchQuery = ""
    private var allConversations: List<SupportConversation> = emptyList()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = PrefsManager(this)
        if (!prefs.isLoggedIn()) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }

        SupportMonitorService.start(this)
        setContentView(R.layout.activity_inbox)

        val tvStatus = findViewById<TextView>(R.id.tvConnectionStatus)
        val btnTestAlert = findViewById<MaterialButton>(R.id.btnTestAlert)
        val btnLogout = findViewById<MaterialButton>(R.id.btnLogout)
        val etSearch = findViewById<EditText>(R.id.etSearch)
        val chipGroup = findViewById<ChipGroup>(R.id.chipGroupFilters)
        val swipeRefresh = findViewById<SwipeRefreshLayout>(R.id.swipeRefresh)
        val recycler = findViewById<RecyclerView>(R.id.recyclerConversations)
        val tvEmpty = findViewById<TextView>(R.id.tvEmptyInbox)

        adapter = ConversationAdapter { conv ->
            val intent = Intent(this, ChatActivity::class.java).apply {
                putExtra(ChatActivity.EXTRA_CONVERSATION_ID, conv.id)
                putExtra(ChatActivity.EXTRA_VISITOR_NAME, conv.displayName())
            }
            startActivity(intent)
        }
        recycler.layoutManager = LinearLayoutManager(this)
        recycler.adapter = adapter

        requestBatteryOptimizationExemptionIfNeeded()

        btnTestAlert.setOnClickListener {
            SupportAlertHelper.showIncomingVisitorNotification(
                context = this,
                conversationId = allConversations.firstOrNull()?.id,
                senderName = "Test Visitor Alert",
                messageText = "Real-time notification sound + hardware vibration test successful!",
                isHandoff = true
            )
        }

        btnLogout.setOnClickListener {
            SupportMonitorService.stop(this)
            prefs.clearSession()
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
        }

        etSearch.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                searchQuery = s?.toString()?.trim()?.lowercase() ?: ""
                renderList(tvEmpty)
            }
            override fun afterTextChanged(s: Editable?) = Unit
        })

        chipGroup.setOnCheckedStateChangeListener { _, checkedIds ->
            currentFilter = when (checkedIds.firstOrNull()) {
                R.id.chipHuman -> "human"
                R.id.chipUnread -> "unread"
                R.id.chipResolved -> "resolved"
                else -> "all"
            }
            renderList(tvEmpty)
        }

        swipeRefresh.setOnRefreshListener {
            refreshFromServer { swipeRefresh.isRefreshing = false }
        }

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                launch {
                    SupportRealtimeBus.wsConnected.collect { connected ->
                        tvStatus.text = if (connected) {
                            "● Live Connected (${prefs.agentName})"
                        } else {
                            "○ Reconnecting to server..."
                        }
                        tvStatus.setTextColor(
                            ContextCompat.getColor(
                                this@InboxActivity,
                                if (connected) R.color.amber_300 else R.color.white
                            )
                        )
                    }
                }
                launch {
                    SupportRealtimeBus.conversations.collect { list ->
                        allConversations = list
                        renderList(tvEmpty)
                    }
                }
            }
        }

        refreshFromServer()
    }

    private fun requestBatteryOptimizationExemptionIfNeeded() {
        try {
            val pm = getSystemService(POWER_SERVICE) as PowerManager
            if (!pm.isIgnoringBatteryOptimizations(packageName)) {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:$packageName")
                }
                startActivity(intent)
            }
        } catch (_: Exception) {
        }
    }

    private fun refreshFromServer(onDone: (() -> Unit)? = null) {
        val token = prefs.authToken ?: return
        lifecycleScope.launch {
            val res = SupportApiClient.fetchConversations(prefs.serverUrl, token)
            res.onSuccess { list -> SupportRealtimeBus.setConversations(list) }
            onDone?.invoke()
        }
    }

    private fun renderList(tvEmpty: TextView) {
        val filtered = allConversations.filter { conv ->
            val filterOk = when (currentFilter) {
                "human" -> conv.mode == "human" || conv.escalatedToHuman
                "unread" -> conv.unreadByAgent > 0
                "resolved" -> conv.status == "resolved"
                else -> true
            }
            if (!filterOk) return@filter false
            if (searchQuery.isBlank()) return@filter true
            conv.displayName().lowercase().contains(searchQuery) ||
                (conv.visitorWhatsapp?.lowercase()?.contains(searchQuery) == true) ||
                (conv.visitorEmail?.lowercase()?.contains(searchQuery) == true) ||
                conv.lastMessageText().lowercase().contains(searchQuery)
        }
        adapter.submit(filtered)
        tvEmpty.visibility = if (filtered.isEmpty()) View.VISIBLE else View.GONE
    }

    private class ConversationAdapter(
        private val onClick: (SupportConversation) -> Unit
    ) : RecyclerView.Adapter<ConversationAdapter.VH>() {
        private var items: List<SupportConversation> = emptyList()

        fun submit(newItems: List<SupportConversation>) {
            items = newItems
            notifyDataSetChanged()
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
            val view = LayoutInflater.from(parent.context)
                .inflate(R.layout.item_conversation, parent, false)
            return VH(view, onClick)
        }

        override fun onBindViewHolder(holder: VH, position: Int) {
            holder.bind(items[position])
        }

        override fun getItemCount(): Int = items.size

        class VH(
            itemView: View,
            private val onClick: (SupportConversation) -> Unit
        ) : RecyclerView.ViewHolder(itemView) {
            private val tvName = itemView.findViewById<TextView>(R.id.tvVisitorName)
            private val tvBadgeLive = itemView.findViewById<TextView>(R.id.tvBadgeLive)
            private val tvTime = itemView.findViewById<TextView>(R.id.tvTime)
            private val tvContact = itemView.findViewById<TextView>(R.id.tvContactInfo)
            private val tvLast = itemView.findViewById<TextView>(R.id.tvLastMessage)
            private val tvUnread = itemView.findViewById<TextView>(R.id.tvUnreadBadge)

            fun bind(conv: SupportConversation) {
                tvName.text = conv.displayName()
                tvBadgeLive.visibility =
                    if (conv.mode == "human" && conv.status != "resolved") View.VISIBLE else View.GONE
                tvTime.text = conv.updatedAt.takeLast(9).take(5)

                val contactParts = listOfNotNull(
                    conv.visitorWhatsapp?.let { "WhatsApp: $it" },
                    conv.visitorEmail
                ).joinToString(" • ")
                if (contactParts.isNotBlank()) {
                    tvContact.text = contactParts
                    tvContact.visibility = View.VISIBLE
                } else {
                    tvContact.visibility = View.GONE
                }

                tvLast.text = conv.lastMessageText()
                if (conv.unreadByAgent > 0) {
                    tvUnread.text = conv.unreadByAgent.toString()
                    tvUnread.visibility = View.VISIBLE
                } else {
                    tvUnread.visibility = View.GONE
                }

                itemView.setOnClickListener { onClick(conv) }
            }
        }
    }
}
