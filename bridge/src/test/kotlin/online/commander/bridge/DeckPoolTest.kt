package online.commander.bridge

import java.io.File
import java.nio.file.Files
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class DeckPoolTest {

    private val four = listOf("a", "b", "c", "d").map(::File)

    private fun namesDealtTo(pool: DeckPool, tableId: UUID, seats: Int) =
        List(seats) { pool.dealTo(tableId)?.name }

    @Test
    fun `a pod of four draws four different decks`() {
        val table = UUID.randomUUID()

        repeat(50) {
            val pool = DeckPool(four)
            val dealt = namesDealtTo(pool, table, 4)
            assertEquals(setOf("a", "b", "c", "d"), dealt.toSet(), "dealt $dealt")
        }
    }

    @Test
    fun `two tables are dealt independently`() {
        val pool = DeckPool(four)
        val first = UUID.randomUUID()
        val second = UUID.randomUUID()

        val a = pool.dealTo(first)?.name
        val b = pool.dealTo(second)?.name
        val c = pool.dealTo(first)?.name
        assertTrue(a != c, "the same table must not repeat: $a then $c")

        assertEquals(setOf("a", "b", "c", "d"), (1..3).mapNotNull { pool.dealTo(second)?.name }
            .plus(b).toSet(), "the second table can still reach every deck")
    }

    @Test
    fun `a pod larger than the pool refills instead of failing`() {
        val pool = DeckPool(four)
        val dealt = namesDealtTo(pool, UUID.randomUUID(), 6)
        assertEquals(6, dealt.filterNotNull().size, "every seat gets a deck")
        assertEquals(4, dealt.take(4).toSet().size, "the first round is still distinct")
    }

    @Test
    fun `a pinned pool of one deals that deck to everyone`() {
        val pool = DeckPool(listOf(File("only")))
        assertEquals(List(4) { "only" }, namesDealtTo(pool, UUID.randomUUID(), 4))
    }

    @Test
    fun `an empty pool deals nothing rather than throwing`() {

        val pool = DeckPool(emptyList())
        assertNull(pool.dealTo(UUID.randomUUID()))
        assertEquals(emptyList(), pool.deal(3))
    }

    @Test
    fun `a batch deal is distinct up to the size of the pool`() {
        repeat(50) {
            assertEquals(setOf("a", "b", "c", "d"), DeckPool(four).deal(4).map { it.name }.toSet())
        }
        assertEquals(6, DeckPool(four).deal(6).size, "and still fills a larger table")
    }

    private fun writeDeck(dir: File, fileName: String, deckName: String, released: String? = null) =
        File(dir, fileName).apply {
            writeText(
                buildString {
                    append("NAME:$deckName\n")
                    released?.let { append("RELEASED:$it\n") }
                    append("1 [C14:326] Swamp\n")
                    append("SB: 1 [C14:27] Ob Nixilis of the Black Oath\n")
                },
            )
        }

    private fun poolOf(vararg decks: Triple<String, String, String?>): DeckPool {
        val dir = Files.createTempDirectory("deck-pool-test").toFile()
        dir.deleteOnExit()
        return DeckPool(decks.map { (file, name, released) -> writeDeck(dir, file, name, released) })
    }

    private fun poolOf(vararg decks: Pair<String, String>): DeckPool =
        poolOf(*decks.map { (file, name) -> Triple(file, name, null as String?) }.toTypedArray())

    @Test
    fun `the catalog describes each pooled deck, newest release first`() {
        val pool = poolOf(
            Triple("limit-break.dck", "Limit Break", "2025-06-13"),
            Triple("counter-blitz.dck", "Counter Blitz", "2011-06-17"),
        )

        assertEquals(listOf("Limit Break", "Counter Blitz"), pool.catalog.map { it.name })
        assertEquals(listOf("limit-break", "counter-blitz"), pool.catalog.map { it.id })
        val limitBreak = pool.catalog.single { it.id == "limit-break" }
        assertEquals(2, limitBreak.cardCount, "the commander counts, as it does in the store")
        assertEquals(listOf("Ob Nixilis of the Black Oath"), limitBreak.commanders.map { it.name })

        assertEquals(listOf("C14:27"), limitBreak.commanders.map { it.printing.toString() })
    }

    @Test
    fun `a catalogued deck can be found by id, and nothing else can`() {
        val pool = poolOf("limit-break.dck" to "Limit Break")

        assertEquals("limit-break.dck", pool.find("limit-break")?.name)
        assertNull(pool.find("no-such-deck"))

        assertNull(pool.find("limit-break.dck"))
        assertNull(pool.find("../limit-break"))
        assertNull(pool.find(""))
    }

    @Test
    fun `a file that is not a deck is left out of the catalog rather than failing it`() {
        val dir = Files.createTempDirectory("deck-pool-test").toFile()
        dir.deleteOnExit()
        val prose = File(dir, "notes.dck").apply { writeText("some notes about decks\n") }
        val real = writeDeck(dir, "limit-break.dck", "Limit Break")

        val pool = DeckPool(listOf(prose, real, File(dir, "gone.dck")))
        assertEquals(listOf("limit-break"), pool.catalog.map { it.id })
    }

    @Test
    fun `an empty pool has an empty catalog`() {
        assertEquals(emptyList(), DeckPool(emptyList()).catalog)
        assertNull(DeckPool(emptyList()).find("limit-break"))
    }

    @Test
    fun `forgetting a table frees its decks`() {
        val pool = DeckPool(four)
        val table = UUID.randomUUID()
        namesDealtTo(pool, table, 4)
        pool.forget(table)
        assertEquals(4, namesDealtTo(pool, table, 4).toSet().size, "a fresh deal, fully distinct")
    }
}
