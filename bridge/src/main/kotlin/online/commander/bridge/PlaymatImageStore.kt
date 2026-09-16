package online.commander.bridge

import org.slf4j.LoggerFactory
import java.io.File
import java.io.IOException
import java.security.MessageDigest
import java.util.UUID

class PlaymatImageStore(val dir: File) {

    private val ownersDir = File(dir, "owners")

    data class Saved(val id: String, val file: File, val contentType: String)

    @Synchronized
    fun save(bytes: ByteArray, contentType: String, ownerKey: String): Saved {
        val extension = EXTENSIONS[contentType]
            ?: throw IllegalArgumentException(
                "unsupported image type '$contentType'; expected one of ${EXTENSIONS.keys}",
            )
        require(bytes.isNotEmpty()) { "empty upload" }
        require(bytes.size <= MAX_BYTES) {
            "image is ${bytes.size} bytes; the limit is ${MAX_BYTES / (1024 * 1024)} MB"
        }
        require(matchesSignature(bytes, contentType)) {
            "file content does not look like a $contentType image"
        }
        if (!dir.isDirectory && !dir.mkdirs()) {
            throw IOException("could not create the playmat image store at ${dir.absolutePath}")
        }
        if (!ownersDir.isDirectory && !ownersDir.mkdirs()) {
            throw IOException("could not create the playmat owner index at ${ownersDir.absolutePath}")
        }

        val id = UUID.randomUUID().toString().replace("-", "")
        val file = File(dir, "$id.$extension")
        val temp = File(dir, "$id.$extension.tmp")
        temp.writeBytes(bytes)
        if (!temp.renameTo(file)) {
            temp.delete()
            throw IOException("could not write ${file.absolutePath}")
        }

        val hash = pointOwnerAt(ownerKey, id)
        log.info("saved playmat image {} ({} bytes, {}) for owner {}", file.name, bytes.size, contentType, hash)
        evictOldest()
        return Saved(id, file, contentType)
    }

    @Synchronized
    fun find(id: String): Saved? {
        if (!ID.matches(id)) return null
        val file = files().firstOrNull { it.nameWithoutExtension == id } ?: return null
        val contentType = CONTENT_TYPES[file.extension] ?: return null
        return Saved(id, file, contentType)
    }

    @Synchronized
    fun currentImageId(ownerKey: String): String? {
        val pointer = File(ownersDir, ownerHash(ownerKey))
        val id = pointer.takeIf { it.isFile }?.readText()?.trim() ?: return null
        return id.takeIf { candidate -> files().any { it.nameWithoutExtension == candidate } }
    }

    private fun pointOwnerAt(ownerKey: String, id: String): String {
        val hash = ownerHash(ownerKey)
        val pointer = File(ownersDir, hash)
        val previousId = pointer.takeIf { it.isFile }?.readText()?.trim()
        if (previousId != null && previousId != id) {
            files().filter { it.nameWithoutExtension == previousId }.forEach { it.delete() }
        }
        val temp = File(ownersDir, "$hash.tmp")
        temp.writeText(id)
        if (!temp.renameTo(pointer)) {
            temp.delete()
            throw IOException("could not write ${pointer.absolutePath}")
        }
        return hash
    }

    private fun evictOldest() {
        val all = files().sortedBy { it.lastModified() }
        if (all.size <= MAX_IMAGES) return
        val evicted = all.take(all.size - MAX_IMAGES)
        evicted.forEach { it.delete() }
        log.info("evicted {} playmat image(s) past the {}-image cap", evicted.size, MAX_IMAGES)
    }

    private fun files(): List<File> = dir.listFiles { file -> file.isFile }.orEmpty().toList()

    companion object {
        private val log = LoggerFactory.getLogger("bridge.playmat-images")

        private val ID = Regex("^[a-f0-9]{32}$")

        val EXTENSIONS = mapOf(
            "image/png" to "png",
            "image/jpeg" to "jpg",
            "image/webp" to "webp",
        )
        val CONTENT_TYPES = EXTENSIONS.entries.associate { (type, ext) -> ext to type }

        const val MAX_BYTES = 6 * 1024 * 1024

        const val MAX_IMAGES = 2000

        private val PNG_SIGNATURE = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)
        private val JPEG_SIGNATURE = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte())
        private val RIFF_SIGNATURE = byteArrayOf('R'.code.toByte(), 'I'.code.toByte(), 'F'.code.toByte(), 'F'.code.toByte())
        private val WEBP_SIGNATURE = byteArrayOf('W'.code.toByte(), 'E'.code.toByte(), 'B'.code.toByte(), 'P'.code.toByte())

        private fun matchesSignature(bytes: ByteArray, contentType: String): Boolean = when (contentType) {
            "image/png" -> bytes.hasPrefix(PNG_SIGNATURE)
            "image/jpeg" -> bytes.hasPrefix(JPEG_SIGNATURE)

            "image/webp" -> bytes.hasPrefix(RIFF_SIGNATURE) &&
                bytes.size >= 12 && bytes.copyOfRange(8, 12).contentEquals(WEBP_SIGNATURE)
            else -> false
        }

        private fun ByteArray.hasPrefix(prefix: ByteArray): Boolean =
            size >= prefix.size && copyOfRange(0, prefix.size).contentEquals(prefix)

        private fun ownerHash(ownerKey: String): String =
            MessageDigest.getInstance("SHA-256").digest(ownerKey.toByteArray(Charsets.UTF_8))
                .joinToString("") { "%02x".format(it) }
    }
}
