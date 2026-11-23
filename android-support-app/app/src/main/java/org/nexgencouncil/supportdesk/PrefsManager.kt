package org.nexgencouncil.supportdesk

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class PrefsManager(context: Context) {
    private val prefs: SharedPreferences = try {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "nexgen_support_secure_prefs",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    } catch (_: Exception) {
        context.getSharedPreferences("nexgen_support_prefs_fallback", Context.MODE_PRIVATE)
    }

    var serverUrl: String
        get() = prefs.getString(KEY_SERVER_URL, BuildConfig.DEFAULT_SERVER_URL)?.trimEnd('/')
            ?: BuildConfig.DEFAULT_SERVER_URL
        set(value) {
            prefs.edit().putString(KEY_SERVER_URL, value.trim().trimEnd('/')).apply()
        }

    var authToken: String?
        get() = prefs.getString(KEY_TOKEN, null)
        set(value) {
            prefs.edit().putString(KEY_TOKEN, value).apply()
        }

    var agentName: String
        get() = prefs.getString(KEY_AGENT_NAME, "Coordinator") ?: "Coordinator"
        set(value) {
            prefs.edit().putString(KEY_AGENT_NAME, value).apply()
        }

    var agentRole: String
        get() = prefs.getString(KEY_AGENT_ROLE, "") ?: ""
        set(value) {
            prefs.edit().putString(KEY_AGENT_ROLE, value).apply()
        }

    fun isLoggedIn(): Boolean = !authToken.isNullOrBlank()

    fun clearSession() {
        prefs.edit()
            .remove(KEY_TOKEN)
            .remove(KEY_AGENT_NAME)
            .remove(KEY_AGENT_ROLE)
            .apply()
    }

    companion object {
        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_TOKEN = "auth_token"
        private const val KEY_AGENT_NAME = "agent_name"
        private const val KEY_AGENT_ROLE = "agent_role"
    }
}
