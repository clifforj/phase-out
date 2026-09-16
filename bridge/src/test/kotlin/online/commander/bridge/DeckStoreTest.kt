package online.commander.bridge

import java.io.File
import java.nio.file.Files
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class DeckStoreTest {

    private val dir: File = Files.createTempDirectory("deck-store-test").toFile()
    private val store = DeckStore(dir)

    private val index = CardIndex.parse(
        """
        Sol Ring	MSC:211	A	{1}
        Forest	MSH:285	L	
        Tidus, Yuna's Guardian	FIC:1	C	{2}{R}{G}
        """.trimIndent().lineSequence(),
    )

    @AfterTest
    fun cleanUp() {
        dir.deleteRecursively()
    }

    private val ada = "11111111-1111-4111-8111-111111111111"
    private val bo = "22222222-2222-4222-8222-222222222222"

    private fun save(
        name: String,
        owner: String? = null,
        text: String = "Commander\n1 Tidus, Yuna's Guardian\n\nDeck\n1 Sol Ring",
    ) = store.save(owner, assertNotNull(DeckImport.import(text, name, index).deck))

    @Test
    fun `a saved deck comes back with everything a picker needs`() {
        val saved = save("Limit Break")

        assertEquals("Limit Break", saved.name)
        assertEquals(2, saved.cardCount)
        assertEquals(listOf("Tidus, Yuna's Guardian"), saved.commanders.map { it.name })
        assertTrue(saved.file.isFile)
    }

    @Test
    fun `a fresh store over the same directory sees the same decks`() {
        val saved = save("Limit Break")

        val reopened = DeckStore(dir).list(null)
        assertEquals(listOf(saved.id), reopened.map { it.id })
        assertEquals("Limit Break", reopened.single().name)
        assertEquals(listOf("Tidus, Yuna's Guardian"), reopened.single().commanders.map { it.name })
    }

    @Test
    fun `the id is readable, so a log line naming it says which deck it was`() {
        assertTrue(save("Limit Break").id.startsWith("limit-break-"))
    }

    @Test
    fun `two decks of the same name are two decks`() {
        val first = save("Limit Break")
        val second = save("Limit Break")

        assertTrue(first.id != second.id)
        assertEquals(2, store.list(null).size)
    }

    @Test
    fun `a name with nothing usable in it still produces an id`() {
        assertTrue(save("★ ☆ ★").id.startsWith("deck-"))
    }

    @Test
    fun `find returns the deck, and delete removes it`() {
        val saved = save("Limit Break")

        assertEquals(saved.id, assertNotNull(store.find(null, saved.id)).id)
        assertTrue(store.delete(null, saved.id))
        assertNull(store.find(null, saved.id))
        assertFalse(store.delete(null, saved.id), "deleting twice is not a success")
    }

    @Test
    fun `an id that is not this store's shape resolves to nothing`() {
        val outside = File(dir.parentFile, "outside.dck")
        outside.writeText("NAME:Outside\n1 [MSC:211] Sol Ring\n")
        try {
            for (id in listOf("../outside", "..\\outside", "/etc/passwd", "a/b", "Limit-Break", "")) {
                assertNull(store.find(null, id), "'$id' must not resolve")
                assertFalse(store.delete(null, id), "'$id' must not delete anything")
            }
        } finally {
            outside.delete()
        }
    }

    @Test
    fun `an unparsable file is skipped rather than failing the listing`() {
        val saved = save("Limit Break")
        File(dir, "junk.dck").writeText("this is not a deck")

        assertEquals(listOf(saved.id), store.list(null).map { it.id })
    }

    @Test
    fun `newest first, so the deck you just imported is at the top`() {
        val first = save("First")

        first.file.setLastModified(System.currentTimeMillis() - 60_000)
        val second = save("Second")

        assertEquals(listOf(second.id, first.id), store.list(null).map { it.id })
    }

    @Test
    fun `one account cannot see or delete another's decks`() {
        val hers = save("Ada's Deck", owner = ada)
        val his = save("Bo's Deck", owner = bo)

        assertEquals(listOf(hers.id), store.list(ada).map { it.id })
        assertEquals(listOf(his.id), store.list(bo).map { it.id })

        assertNull(store.find(ada, his.id), "Ada must not be able to use Bo's deck")
        assertFalse(store.delete(ada, his.id), "Ada must not be able to delete Bo's deck")
        assertTrue(his.file.isFile, "and it must still be there afterwards")
    }

    @Test
    fun `unowned decks in the root are readable by every account and deletable by none`() {
        val legacy = save("Legacy")
        val hers = save("Ada's Deck", owner = ada)

        assertEquals(setOf(hers.id, legacy.id), store.list(ada).map { it.id }.toSet())
        assertEquals(setOf(legacy.id), store.list(bo).map { it.id }.toSet())
        assertEquals(legacy.id, assertNotNull(store.find(bo, legacy.id)).id)

        assertFalse(store.delete(ada, legacy.id), "an unowned deck is nobody's to delete")
        assertTrue(legacy.file.isFile)
    }

    @Test
    fun `the same id under two owners is two decks`() {
        val hers = save("Limit Break", owner = ada)
        val his = save("Limit Break", owner = bo)

        assertTrue(hers.file.absolutePath != his.file.absolutePath)
        assertEquals(hers.id, assertNotNull(store.find(ada, hers.id)).id)
        assertTrue(store.delete(ada, hers.id))
        assertNotNull(store.find(bo, his.id), "deleting hers must not touch his")
    }

    @Test
    fun `an owner that is not an account id shape is refused`() {
        for (owner in listOf("../..", "a/b", "Ada", "")) {
            assertFailsWith<IllegalArgumentException>("'$owner' must not resolve") {
                store.list(owner)
            }
        }
    }
}
