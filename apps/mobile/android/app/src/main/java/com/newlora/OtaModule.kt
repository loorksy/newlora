package com.newlora

import android.content.Intent
import android.util.Base64
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager
import java.io.File

class OtaModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName() = "NewloraOta"

    private fun root() = OtaStore.root(reactApplicationContext)

    @ReactMethod
    fun readText(rel: String, promise: Promise) {
        try {
            val file = OtaStore.resolve(root(), rel)
            promise.resolve(if (file.isFile) file.readText() else null)
        } catch (_: Exception) {
            promise.reject("ota_path", "ota_path")
        }
    }

    @ReactMethod
    fun writeText(rel: String, text: String, promise: Promise) {
        try {
            if (text.length > 256_000) throw IllegalArgumentException("size")
            val file = OtaStore.resolve(root(), rel)
            val tmp = File(file.parentFile, file.name + ".tmp")
            tmp.writeText(text)
            if (!tmp.renameTo(file)) {
                tmp.copyTo(file, overwrite = true)
                tmp.delete()
            }
            promise.resolve(true)
        } catch (_: Exception) {
            promise.reject("ota_write", "ota_write")
        }
    }

    @ReactMethod
    fun writeBytes(rel: String, encoded: String, promise: Promise) {
        try {
            if (encoded.length > 28_000_000) throw IllegalArgumentException("size")
            val bytes = Base64.decode(encoded, Base64.DEFAULT)
            if (bytes.size > 20 * 1024 * 1024) throw IllegalArgumentException("size")
            val file = OtaStore.resolve(root(), rel)
            val tmp = File(file.parentFile, file.name + ".tmp")
            tmp.writeBytes(bytes)
            if (!tmp.renameTo(file)) {
                tmp.copyTo(file, overwrite = true)
                tmp.delete()
            }
            promise.resolve(true)
        } catch (_: Exception) {
            promise.reject("ota_write", "ota_write")
        }
    }

    @ReactMethod
    fun readBytes(rel: String, promise: Promise) {
        try {
            val file = OtaStore.resolve(root(), rel)
            if (!file.isFile) {
                promise.resolve(null)
                return
            }
            if (file.length() > 20L * 1024L * 1024L) throw IllegalArgumentException("size")
            promise.resolve(Base64.encodeToString(file.readBytes(), Base64.NO_WRAP))
        } catch (_: Exception) {
            promise.reject("ota_read", "ota_read")
        }
    }

    @ReactMethod
    fun rename(from: String, to: String, promise: Promise) {
        try {
            val source = OtaStore.resolve(root(), from)
            val target = OtaStore.resolve(root(), to)
            if (target.exists()) target.deleteRecursively()
            if (!source.renameTo(target)) throw IllegalStateException("rename")
            promise.resolve(true)
        } catch (_: Exception) {
            promise.reject("ota_rename", "ota_rename")
        }
    }

    @ReactMethod
    fun removeTree(rel: String, promise: Promise) {
        try {
            val file = OtaStore.resolve(root(), rel)
            if (file.exists()) file.deleteRecursively()
            promise.resolve(true)
        } catch (_: Exception) {
            promise.reject("ota_remove", "ota_remove")
        }
    }

    @ReactMethod
    fun reload(promise: Promise) {
        try {
            val intent = reactApplicationContext.packageManager.getLaunchIntentForPackage(
                reactApplicationContext.packageName,
            )
            intent?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
            android.os.Process.killProcess(android.os.Process.myPid())
        } catch (_: Exception) {
            promise.reject("ota_reload", "ota_reload")
        }
    }
}

class OtaPackage : ReactPackage {
    override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
        listOf(OtaModule(context))

    override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
