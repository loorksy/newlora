package com.newlora

import android.content.Context
import android.util.Base64
import android.util.Log
import org.bouncycastle.crypto.params.Ed25519PublicKeyParameters
import org.bouncycastle.crypto.signers.Ed25519Signer
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest

/**
 * Chooses the Hermes bundle before React Native starts.
 * A pending release is promoted only after JavaScript marks the shell healthy.
 * Two launches that never become healthy roll back to the last known-good bundle,
 * or to the embedded factory bundle when none exists.
 */
object OtaStore {
    private const val MAX_ATTEMPTS = 2
    private const val TAG = "NewloraOta"
    const val RUNTIME = "newlora-android-runtime-1"
    private const val PUBLIC_KEY_HEX =
        "21ddfa82c60db030840c3cf5592d43783fa0102f588343d42158a3c07441c580"

    @Volatile private var ready = false
    @Volatile private var bundlePath: String? = null

    fun root(context: Context): File = File(context.filesDir, "ota").apply { mkdirs() }

    fun prepare(context: Context): String? {
        if (ready) return bundlePath
        synchronized(this) {
            if (ready) return bundlePath
            val dir = root(context)
            val state = readState(dir)
            var source = "embedded"
            var id: String? = null
            val pending = state.optJSONObject("pending")
            var attempts = state.optInt("pendingAttempts", 0)
            if (pending != null && attempts >= MAX_ATTEMPTS) {
                state.remove("pending")
                state.put("pendingAttempts", 0)
                state.put("lastError", "rolledBack")
                Log.i(TAG, "OTA_ROLLBACK")
            } else if (pending != null) {
                val reason = failure(dir, pending)
                if (reason == null) {
                    attempts += 1
                    state.put("pendingAttempts", attempts)
                    source = "pending"
                    id = pending.getString("id")
                    Log.i(TAG, "OTA_BOOT_PENDING")
                } else {
                    state.remove("pending")
                    state.put("pendingAttempts", 0)
                    state.put("lastError", reason)
                    logReject(reason)
                }
            }
            if (source == "embedded") {
                val good = state.optJSONObject("good")
                if (good != null) {
                    val reason = failure(dir, good)
                    if (reason == null) {
                        source = "good"
                        id = good.getString("id")
                        Log.i(TAG, "OTA_BOOT_FROM_OTA")
                    } else {
                        state.put("previous", good)
                        state.remove("good")
                        state.put("lastError", reason)
                        logReject(reason)
                    }
                }
            }
            if (source == "embedded") Log.i(TAG, "OTA_BOOT_EMBEDDED")
            state.put("launchSource", source)
            if (id == null) state.put("launchedId", JSONObject.NULL) else state.put("launchedId", id)
            state.put("healthy", false)
            if (!state.has("channel")) state.put("channel", "preview")
            if (!state.has("runtimeVersion")) state.put("runtimeVersion", RUNTIME)
            if (!state.has("status")) state.put("status", "upToDate")
            writeState(dir, state)
            bundlePath = id?.let { File(dir, "releases/$it/bundle").absolutePath }
            ready = true
            return bundlePath
        }
    }

    fun resetPrepared() {
        ready = false
        bundlePath = null
    }

    private fun logReject(reason: String) {
        val event = when (reason) {
            "hash" -> "OTA_HASH_REJECTED"
            "runtime" -> "OTA_RUNTIME_REJECTED"
            else -> "OTA_SIGNATURE_REJECTED"
        }
        Log.i(TAG, event)
    }

    private fun failure(dir: File, release: JSONObject): String? {
        return try {
            val id = release.getString("id")
            if (!id.matches(Regex("^[A-Za-z0-9._-]{8,80}$"))) return "signature"
            val manifestFile = File(dir, "releases/$id/manifest.json")
            val bundle = File(dir, "releases/$id/bundle")
            if (!manifestFile.isFile || !bundle.isFile) return "signature"
            if (bundle.length() <= 0L || bundle.length() > 20L * 1024L * 1024L) return "signature"
            val manifest = JSONObject(manifestFile.readText())
            if (manifest.optString("id") != id) return "signature"
            if (manifest.optString("runtimeVersion") != RUNTIME) return "runtime"
            val declared = manifest.getJSONObject("bundle").getString("sha256")
            val digest = sha256(bundle.readBytes())
            if (digest != declared || digest != release.optString("sha256")) return "hash"
            if (!signatureValid(manifest)) return "signature"
            null
        } catch (_: Exception) {
            "signature"
        }
    }

    fun signatureValid(manifest: JSONObject): Boolean {
        val signature = Base64.decode(manifest.optString("signature"), Base64.DEFAULT)
        if (signature.size != 64) return false
        val key = hexToBytes(PUBLIC_KEY_HEX)
        val verifier = Ed25519Signer()
        verifier.init(false, Ed25519PublicKeyParameters(key, 0))
        val message = canonical(manifest)
        verifier.update(message, 0, message.size)
        return verifier.verifySignature(signature)
    }

    fun canonical(manifest: JSONObject): ByteArray {
        val bundle = manifest.getJSONObject("bundle")
        val lines = mutableListOf(
            "newlora-ota-v1",
            "id=${manifest.getString("id")}",
            "channel=${manifest.getString("channel")}",
            "platform=android",
            "version=${manifest.getString("version")}",
            "runtimeVersion=${manifest.getString("runtimeVersion")}",
            "createdAt=${manifest.getString("createdAt")}",
            "gitSha=${manifest.optString("gitSha")}",
            "bundleUrl=${bundle.getString("url")}",
            "bundleSha256=${bundle.getString("sha256")}",
            "bundleSize=${bundle.getLong("size")}",
            "contentType=${bundle.getString("contentType")}",
            "notes=${manifest.optString("notes")}",
        )
        val assets = manifest.optJSONArray("assets") ?: JSONArray()
        val rows = mutableListOf<String>()
        for (index in 0 until assets.length()) {
            val asset = assets.getJSONObject(index)
            rows.add(
                "asset=${asset.getString("path")}|${asset.getString("sha256")}|${asset.getLong("size")}|${asset.getString("url")}",
            )
        }
        rows.sort()
        lines.addAll(rows)
        return lines.joinToString("\n").toByteArray(Charsets.UTF_8)
    }

    fun resolve(root: File, rel: String): File {
        if (!rel.matches(Regex("^[A-Za-z0-9._/-]{1,180}$")) || rel.contains("..")) {
            throw IllegalArgumentException("path")
        }
        val file = File(root, rel)
        file.parentFile?.mkdirs()
        val base = root.canonicalPath
        val target = file.canonicalPath
        if (target != base && !target.startsWith(base + File.separator)) {
            throw IllegalArgumentException("path")
        }
        return file
    }

    fun readState(dir: File): JSONObject {
        val file = File(dir, "state.json")
        if (!file.isFile) return JSONObject()
        return try {
            JSONObject(file.readText())
        } catch (_: Exception) {
            JSONObject()
        }
    }

    fun writeState(dir: File, state: JSONObject) {
        val tmp = File(dir, "state.json.tmp")
        tmp.writeText(state.toString())
        if (!tmp.renameTo(File(dir, "state.json"))) {
            tmp.copyTo(File(dir, "state.json"), overwrite = true)
            tmp.delete()
        }
    }

    private fun sha256(bytes: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
        return digest.joinToString("") { "%02x".format(it) }
    }

    private fun hexToBytes(hex: String): ByteArray {
        val out = ByteArray(hex.length / 2)
        var index = 0
        while (index < out.size) {
            out[index] = hex.substring(index * 2, index * 2 + 2).toInt(16).toByte()
            index += 1
        }
        return out
    }
}
