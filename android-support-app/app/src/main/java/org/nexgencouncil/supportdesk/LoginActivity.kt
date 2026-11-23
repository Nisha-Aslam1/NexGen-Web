package org.nexgencouncil.supportdesk

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.google.android.material.button.MaterialButton
import com.google.android.material.textfield.TextInputEditText
import kotlinx.coroutines.launch

class LoginActivity : AppCompatActivity() {
    private lateinit var prefs: PrefsManager
    private var pending2faToken: String? = null

    private val requestNotifPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { _ -> }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = PrefsManager(this)
        SupportAlertHelper.ensureChannels(this)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.POST_NOTIFICATIONS
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                requestNotifPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }

        if (prefs.isLoggedIn()) {
            SupportMonitorService.start(this)
            startActivity(Intent(this, InboxActivity::class.java))
            finish()
            return
        }

        setContentView(R.layout.activity_login)

        val etServerUrl = findViewById<TextInputEditText>(R.id.etServerUrl)
        val etUsername = findViewById<TextInputEditText>(R.id.etUsername)
        val etPassword = findViewById<TextInputEditText>(R.id.etPassword)
        val etTwoFactor = findViewById<TextInputEditText>(R.id.etTwoFactor)
        val layoutCredentials = findViewById<View>(R.id.layoutCredentials)
        val layoutTwoFactor = findViewById<View>(R.id.layoutTwoFactor)
        val tvError = findViewById<TextView>(R.id.tvError)
        val btnLogin = findViewById<MaterialButton>(R.id.btnLogin)
        val progress = findViewById<ProgressBar>(R.id.progressLogin)

        etServerUrl.setText(prefs.serverUrl)

        btnLogin.setOnClickListener {
            tvError.visibility = View.GONE
            val serverUrl = etServerUrl.text?.toString()?.trim()?.trimEnd('/') ?: ""
            if (!serverUrl.startsWith("http://") && !serverUrl.startsWith("https://")) {
                tvError.text = "Server URL must start with https:// or http://"
                tvError.visibility = View.VISIBLE
                return@setOnClickListener
            }
            prefs.serverUrl = serverUrl

            val temp2fa = pending2faToken
            if (temp2fa == null) {
                val user = etUsername.text?.toString()?.trim() ?: ""
                val pass = etPassword.text?.toString() ?: ""
                if (user.isBlank() || pass.isBlank()) {
                    tvError.text = "Enter your staff username and password."
                    tvError.visibility = View.VISIBLE
                    return@setOnClickListener
                }

                btnLogin.isEnabled = false
                progress.visibility = View.VISIBLE
                lifecycleScope.launch {
                    val outcome = SupportApiClient.login(serverUrl, user, pass)
                    btnLogin.isEnabled = true
                    progress.visibility = View.GONE
                    when (outcome) {
                        is LoginOutcome.Requires2FA -> {
                            pending2faToken = outcome.temp2faToken
                            layoutCredentials.visibility = View.GONE
                            layoutTwoFactor.visibility = View.VISIBLE
                            btnLogin.text = "Verify 2FA Code"
                        }
                        is LoginOutcome.Success -> onAuthenticated(outcome)
                        is LoginOutcome.Failure -> {
                            tvError.text = outcome.error
                            tvError.visibility = View.VISIBLE
                        }
                    }
                }
            } else {
                val code = etTwoFactor.text?.toString()?.trim() ?: ""
                if (code.isBlank()) {
                    tvError.text = "Enter your 2FA verification code."
                    tvError.visibility = View.VISIBLE
                    return@setOnClickListener
                }

                btnLogin.isEnabled = false
                progress.visibility = View.VISIBLE
                lifecycleScope.launch {
                    val outcome = SupportApiClient.verify2FA(serverUrl, temp2fa, code)
                    btnLogin.isEnabled = true
                    progress.visibility = View.GONE
                    when (outcome) {
                        is LoginOutcome.Success -> onAuthenticated(outcome)
                        is LoginOutcome.Failure -> {
                            tvError.text = outcome.error
                            tvError.visibility = View.VISIBLE
                        }
                        is LoginOutcome.Requires2FA -> Unit
                    }
                }
            }
        }
    }

    private fun onAuthenticated(result: LoginOutcome.Success) {
        prefs.authToken = result.token
        prefs.agentName = result.name
        prefs.agentRole = result.role
        SupportMonitorService.start(this)
        startActivity(Intent(this, InboxActivity::class.java))
        finish()
    }
}
