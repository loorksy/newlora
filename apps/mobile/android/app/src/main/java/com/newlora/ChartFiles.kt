package com.newlora

import android.app.Activity
import android.content.Intent
import android.util.Base64
import androidx.core.content.FileProvider
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager
import java.io.File
import java.util.UUID

/** Scoped Android image export; no general filesystem or download capability. */
class ChartFiles(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    private var pending: Promise? = null
    private var pendingFile: File? = null
    private val requestCode = 9142
    override fun getName() = "NewloraChartFiles"

    init {
        context.addActivityEventListener(object : BaseActivityEventListener() {
            override fun onActivityResult(activity: Activity, request: Int, result: Int, data: Intent?) {
                if (request != requestCode) return
                val promise = pending ?: return
                val file = pendingFile
                pending = null
                pendingFile = null
                try {
                    val destination = data?.data
                    if (result == Activity.RESULT_OK && destination != null && file != null) {
                        val output = context.contentResolver.openOutputStream(destination) ?: error("unavailable")
                        output.use { out -> file.inputStream().use { input -> input.copyTo(out) } }
                        promise.resolve(true)
                    } else promise.resolve(false)
                } catch (_: Exception) {
                    promise.reject("image_export_failed", "image_export_failed")
                } finally { file?.delete() }
            }
        })
    }

    @ReactMethod
    fun exportImage(encoded: String, save: Boolean, title: String, promise: Promise) {
        try {
            if (pending != null) { promise.reject("image_export_busy", "image_export_busy"); return }
            val activity = reactApplicationContext.currentActivity ?: error("unavailable")
            require(encoded.length <= 20_000_000)
            val bytes = Base64.decode(encoded, Base64.DEFAULT)
            val signature = byteArrayOf(0x89.toByte(), 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
            require(bytes.size in 8..15_000_000 && bytes.take(8).toByteArray().contentEquals(signature))
            val directory = File(reactApplicationContext.cacheDir, "charts").apply { mkdirs() }
            directory.listFiles()?.filter { it.lastModified() < System.currentTimeMillis() - 3_600_000 }?.forEach { it.delete() }
            val file = File(directory, UUID.randomUUID().toString() + ".png")
            file.writeBytes(bytes)
            if (save) {
                pending = promise
                pendingFile = file
                val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "image/png"
                    putExtra(Intent.EXTRA_TITLE, "Newlora-chart.png")
                }
                activity.startActivityForResult(intent, requestCode)
            } else {
                val uri = FileProvider.getUriForFile(reactApplicationContext, reactApplicationContext.packageName + ".charts", file)
                val intent = Intent(Intent.ACTION_SEND).apply {
                    type = "image/png"
                    putExtra(Intent.EXTRA_STREAM, uri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                activity.startActivity(Intent.createChooser(intent, title))
                promise.resolve(true)
            }
        } catch (_: Exception) {
            pendingFile?.delete()
            pending = null
            pendingFile = null
            promise.reject("image_export_failed", "image_export_failed")
        }
    }
}

class ChartFilesPackage : ReactPackage {
    override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(ChartFiles(context))
    override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
