package org.nexgencouncil.supportdesk

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

object SupportApiClient {
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    val httpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(20, TimeUnit.SECONDS)
        .pingInterval(25, TimeUnit.SECONDS)
        .build()

    suspend fun login(serverUrl: String, username: String, password: String): LoginOutcome =
        withContext(Dispatchers.IO) {
            try {
                val payload = JSONObject()
                    .put("username", username)
                    .put("password", password)
                val req = Request.Builder()
                    .url("$serverUrl/api/auth/login")
                    .post(payload.toString().toRequestBody(jsonMediaType))
                    .build()

                httpClient.newCall(req).execute().use { res ->
                    val raw = res.body?.string() ?: "{}"
                    val json = JSONObject(raw)
                    if (!res.isSuccessful) {
                        return@withContext LoginOutcome.Failure(
                            json.optString("error", "Login failed (HTTP ${res.code})")
                        )
                    }
                    if (json.optBoolean("requires2FA", false)) {
                        return@withContext LoginOutcome.Requires2FA(json.optString("temp2faToken", ""))
                    }
                    val token = json.optString("token", "")
                    val user = json.optJSONObject("user")
                    val name = user?.optString("name", "Coordinator") ?: "Coordinator"
                    val role = user?.optString("role", "") ?: ""
                    if (token.isBlank()) {
                        return@withContext LoginOutcome.Failure("Server did not return a session token.")
                    }
                    LoginOutcome.Success(token, name, role)
                }
            } catch (e: Exception) {
                LoginOutcome.Failure(e.message ?: "Network error contacting server.")
            }
        }

    suspend fun verify2FA(serverUrl: String, temp2faToken: String, code: String): LoginOutcome =
        withContext(Dispatchers.IO) {
            try {
                val payload = JSONObject()
                    .put("temp2faToken", temp2faToken)
                    .put("code", code)
                val req = Request.Builder()
                    .url("$serverUrl/api/auth/2fa/verify-login")
                    .post(payload.toString().toRequestBody(jsonMediaType))
                    .build()

                httpClient.newCall(req).execute().use { res ->
                    val raw = res.body?.string() ?: "{}"
                    val json = JSONObject(raw)
                    if (!res.isSuccessful) {
                        return@withContext LoginOutcome.Failure(
                            json.optString("error", "2FA verification failed.")
                        )
                    }
                    val token = json.optString("token", "")
                    val user = json.optJSONObject("user")
                    val name = user?.optString("name", "Coordinator") ?: "Coordinator"
                    val role = user?.optString("role", "") ?: ""
                    if (token.isBlank()) {
                        return@withContext LoginOutcome.Failure("Invalid 2FA session response.")
                    }
                    LoginOutcome.Success(token, name, role)
                }
            } catch (e: Exception) {
                LoginOutcome.Failure(e.message ?: "Network error verifying 2FA.")
            }
        }

    suspend fun fetchConversations(serverUrl: String, token: String): Result<List<SupportConversation>> =
        withContext(Dispatchers.IO) {
            try {
                val req = Request.Builder()
                    .url("$serverUrl/api/support-live/conversations")
                    .addHeader("Authorization", "Bearer $token")
                    .get()
                    .build()

                httpClient.newCall(req).execute().use { res ->
                    val raw = res.body?.string() ?: "{}"
                    if (res.code == 401 || res.code == 403) {
                        return@withContext Result.failure(SecurityException("Session expired"))
                    }
                    if (!res.isSuccessful) {
                        return@withContext Result.failure(Exception("HTTP ${res.code}"))
                    }
                    val json = JSONObject(raw)
                    val arr = json.optJSONArray("conversations")
                    val out = ArrayList<SupportConversation>()
                    if (arr != null) {
                        for (i in 0 until arr.length()) {
                            arr.optJSONObject(i)?.let { out.add(SupportConversation.fromJson(it)) }
                        }
                    }
                    Result.success(out)
                }
            } catch (e: Exception) {
                Result.failure(e)
            }
        }

    suspend fun sendReply(
        serverUrl: String,
        token: String,
        conversationId: String,
        text: String
    ): Result<SupportConversation> = withContext(Dispatchers.IO) {
        try {
            val payload = JSONObject().put("text", text)
            val req = Request.Builder()
                .url("$serverUrl/api/support-live/conversations/$conversationId/reply")
                .addHeader("Authorization", "Bearer $token")
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build()

            httpClient.newCall(req).execute().use { res ->
                val raw = res.body?.string() ?: "{}"
                val json = JSONObject(raw)
                if (!res.isSuccessful) {
                    return@withContext Result.failure(
                        Exception(json.optString("error", "Reply failed (HTTP ${res.code})"))
                    )
                }
                val convJson = json.optJSONObject("conversation")
                    ?: return@withContext Result.failure(Exception("Missing conversation payload"))
                Result.success(SupportConversation.fromJson(convJson))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun markRead(serverUrl: String, token: String, conversationId: String) =
        withContext(Dispatchers.IO) {
            try {
                val emptyBody = "{}".toRequestBody(jsonMediaType)
                val req = Request.Builder()
                    .url("$serverUrl/api/support-live/conversations/$conversationId/read")
                    .addHeader("Authorization", "Bearer $token")
                    .patch(emptyBody)
                    .build()
                httpClient.newCall(req).execute().close()
            } catch (_: Exception) {
            }
        }

    suspend fun updateStatus(
        serverUrl: String,
        token: String,
        conversationId: String,
        status: String
    ): Result<SupportConversation> = withContext(Dispatchers.IO) {
        try {
            val payload = JSONObject().put("status", status)
            val req = Request.Builder()
                .url("$serverUrl/api/support-live/conversations/$conversationId/status")
                .addHeader("Authorization", "Bearer $token")
                .patch(payload.toString().toRequestBody(jsonMediaType))
                .build()

            httpClient.newCall(req).execute().use { res ->
                val raw = res.body?.string() ?: "{}"
                val json = JSONObject(raw)
                if (!res.isSuccessful) {
                    return@withContext Result.failure(Exception(json.optString("error", "Failed")))
                }
                val convJson = json.optJSONObject("conversation")
                    ?: return@withContext Result.failure(Exception("Missing conversation"))
                Result.success(SupportConversation.fromJson(convJson))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
