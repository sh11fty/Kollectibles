package com.fahm.quran

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader

/**
 * Thin native shell: hosts the offline web app (../web, packaged as assets) in a WebView and
 * exposes a small bridge for reminders, haptics, sharing and self-updates.
 */
class MainActivity : ComponentActivity() {

    lateinit var webView: WebView
        private set
    private lateinit var container: FrameLayout

    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) Reminders.rearm(this)
            callJs("window.__native && window.__native.onNotificationPermission && window.__native.onNotificationPermission($granted)")
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        Reminders.ensureChannel(this)

        val bg = getColor(R.color.app_bg)
        container = FrameLayout(this).apply { setBackgroundColor(bg) }
        webView = buildWebView(bg)
        container.addView(
            webView,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        )
        setContentView(container)

        ViewCompat.setOnApplyWindowInsetsListener(container) { v, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
            WindowInsetsCompat.CONSUMED
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript("(window.__onBack ? window.__onBack() : false)") { handled ->
                    if (handled != "true") {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                    }
                }
            }
        })
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun buildWebView(bg: Int): WebView {
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        return WebView(this).apply {
            setBackgroundColor(bg)
            overScrollMode = View.OVER_SCROLL_NEVER
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                allowFileAccess = false
                allowContentAccess = false
                mediaPlaybackRequiresUserGesture = false
                setSupportZoom(false)
                builtInZoomControls = false
            }
            addJavascriptInterface(Bridge(this@MainActivity), "Native")
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest
                ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    if (request.url.host == WebViewAssetLoader.DEFAULT_DOMAIN) return false
                    openExternal(request.url)
                    return true
                }

                override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                    Log.w(TAG, "WebView render process gone (crashed=${detail.didCrash()}); recreating")
                    recreate()
                    return true
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(m: android.webkit.ConsoleMessage): Boolean {
                    Log.d(TAG, "${m.message()} (${m.sourceId()}:${m.lineNumber()})")
                    return true
                }
            }
            loadUrl(START_URL)
        }
    }

    fun openExternal(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: Exception) {
            Log.w(TAG, "No app to open $uri", e)
        }
    }

    fun callJs(script: String) {
        runOnUiThread { if (::webView.isInitialized) webView.evaluateJavascript(script, null) }
    }

    fun requestNotificationPermission() {
        runOnUiThread {
            if (android.os.Build.VERSION.SDK_INT >= 33) {
                notificationPermission.launch(android.Manifest.permission.POST_NOTIFICATIONS)
            } else {
                callJs("window.__native && window.__native.onNotificationPermission && window.__native.onNotificationPermission(true)")
            }
        }
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        Reminders.markOpened(this)
    }

    override fun onPause() {
        callJs("window.__onPause && window.__onPause()")
        webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        container.removeAllViews()
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val TAG = "Fahm"
        const val START_URL = "https://appassets.androidplatform.net/assets/index.html"
    }
}
