package online.commander.bridge

import java.io.File
import java.nio.file.Files
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotEquals
import kotlin.test.assertNull

class PlaymatImageStoreTest {

    private val dir: File = Files.createTempDirectory("playmat-image-store-test").toFile()
    private val store = PlaymatImageStore(dir)

    @AfterTest
    fun cleanUp() {
        dir.deleteRecursively()
    }

    private val png = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3)
    private val jpeg = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 1, 2, 3)
    private val webp = "RIFF????WEBP????".toByteArray(Charsets.US_ASCII)

    @Test
    fun `a saved image comes back by its own id`() {
        val saved = store.save(png, "image/png", ownerKey = "alice")

        val found = store.find(saved.id)
        assertNotEquals(null, found)
        assertEquals("image/png", found?.contentType)
    }

    @Test
    fun `content that does not match the declared type is refused`() {
        assertFailsWith<IllegalArgumentException> { store.save(jpeg, "image/png", ownerKey = "alice") }
    }

    @Test
    fun `webp signature is accepted`() {
        val saved = store.save(webp, "image/webp", ownerKey = "alice")
        assertEquals("image/webp", store.find(saved.id)?.contentType)
    }

    @Test
    fun `a second upload from the same owner replaces the first`() {
        val first = store.save(png, "image/png", ownerKey = "alice")
        val second = store.save(jpeg, "image/jpeg", ownerKey = "alice")

        assertNotEquals(first.id, second.id)
        assertNull(store.find(first.id))
        assertEquals("image/jpeg", store.find(second.id)?.contentType)
    }

    @Test
    fun `two different owners each keep their own image`() {
        val alice = store.save(png, "image/png", ownerKey = "alice")
        val bob = store.save(jpeg, "image/jpeg", ownerKey = "bob")

        assertEquals("image/png", store.find(alice.id)?.contentType)
        assertEquals("image/jpeg", store.find(bob.id)?.contentType)
    }

    @Test
    fun `an empty upload is refused`() {
        assertFailsWith<IllegalArgumentException> { store.save(ByteArray(0), "image/png", ownerKey = "alice") }
    }

    @Test
    fun `an oversized upload is refused`() {
        val oversized = ByteArray(PlaymatImageStore.MAX_BYTES + 1)
        png.copyInto(oversized)
        assertFailsWith<IllegalArgumentException> { store.save(oversized, "image/png", ownerKey = "alice") }
    }

    @Test
    fun `an unsupported content type is refused`() {
        assertFailsWith<IllegalArgumentException> { store.save(png, "image/gif", ownerKey = "alice") }
    }

    @Test
    fun `currentImageId reports the owner's latest upload`() {
        assertNull(store.currentImageId("alice"))

        val first = store.save(png, "image/png", ownerKey = "alice")
        assertEquals(first.id, store.currentImageId("alice"))

        val second = store.save(jpeg, "image/jpeg", ownerKey = "alice")
        assertEquals(second.id, store.currentImageId("alice"))
        assertNull(store.currentImageId("bob"))
    }

    @Test
    fun `a fresh store over the same directory still resolves saved images and owners`() {
        val saved = store.save(png, "image/png", ownerKey = "alice")

        val reopened = PlaymatImageStore(dir)
        assertEquals("image/png", reopened.find(saved.id)?.contentType)

        val replacement = reopened.save(jpeg, "image/jpeg", ownerKey = "alice")
        assertNull(reopened.find(saved.id))
        assertEquals("image/jpeg", reopened.find(replacement.id)?.contentType)
    }
}
