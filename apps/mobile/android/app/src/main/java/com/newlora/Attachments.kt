package com.newlora

import android.app.Activity
import android.content.Intent
import android.provider.OpenableColumns
import com.facebook.react.bridge.*

/** Only user-selected content URIs; no arbitrary path API or storage permission. */
class Attachments(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    private var pending: Promise? = null
    override fun getName() = "NewloraAttachments"
    init {
        context.addActivityEventListener(object : BaseActivityEventListener() {
            override fun onActivityResult(activity: Activity, request: Int, result: Int, data: Intent?) {
                if (request != 9143) return
                val promise = pending ?: return
                pending = null
                try {
                    val uri = data?.data
                    if (result != Activity.RESULT_OK || uri == null) { promise.resolve(null); return }
                    val mime = context.contentResolver.getType(uri) ?: "application/octet-stream"
                    require(mime in listOf("image/png", "image/jpeg", "image/webp", "application/pdf", "text/plain", "text/csv"))
                    var name = "attachment"
                    var size = -1L
                    context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
                        if (cursor.moveToFirst()) { name = cursor.getString(0) ?: name; size = cursor.getLong(1) }
                    }
                    require(size in 1..8_000_000)
                    val value = Arguments.createMap().apply { putString("uri", uri.toString()); putString("name", name.take(120)); putString("type", mime); putDouble("size", size.toDouble()) }
                    promise.resolve(value)
                } catch (_: Exception) { promise.reject("attachment_invalid", "attachment_invalid") }
            }
        })
    }
    @ReactMethod
    fun claimNotification(id: String, promise: Promise) {
        val preferences = reactApplicationContext.getSharedPreferences("notification-receipts", 0)
        synchronized(this) {
            if (preferences.contains(id)) { promise.resolve(false); return }
            val editor = preferences.edit()
            val cutoff = System.currentTimeMillis() - 7 * 24 * 3600_000L
            preferences.all.filter { (_, value) -> value is Long && value < cutoff }.keys.forEach { editor.remove(it) }
            editor.putLong(id.take(180), System.currentTimeMillis()).commit()
            promise.resolve(true)
        }
    }
    @ReactMethod
    fun pick(promise: Promise) {
        if (pending != null) { promise.reject("attachment_busy", "attachment_busy"); return }
        try {
            val activity = reactApplicationContext.currentActivity ?: error("unavailable")
            pending = promise
            activity.startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "*/*"
                putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("image/png", "image/jpeg", "image/webp", "application/pdf", "text/plain", "text/csv"))
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }, 9143)
        } catch (_: Exception) { pending = null; promise.reject("attachment_invalid", "attachment_invalid") }
    }
}
