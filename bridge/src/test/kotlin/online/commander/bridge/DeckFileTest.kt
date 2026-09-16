package online.commander.bridge

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class DeckFileTest {

    private val sample = """
        NAME:Sworn to Darkness
        AUTHOR:someone
        1 [C14:54] Commander's Sphere
        20 [C14:326] Swamp
        # a comment
        LAYOUT MAIN:(1,2)|([C14:54])([C14:326])
        SB: 1 [C14:27] Ob Nixilis of the Black Oath
    """.trimIndent().lines()

    @Test
    fun `parses name, author, maindeck and sideboard`() {
        val deck = DeckFile.parse(sample)
        assertEquals("Sworn to Darkness", deck.name)
        assertEquals("someone", deck.author)
        assertEquals(2, deck.cards.size, "one entry per line, not per copy")
        assertEquals(1, deck.sideboard.size)
        assertEquals(22, DeckFile.cardCount(deck), "amounts must be summed, not counted")
    }

    @Test
    fun `set code and card number are not transposed`() {
        val card = DeckFile.parse(sample).cards.first { it.cardName == "Commander's Sphere" }
        assertEquals("C14", card.setCode)
        assertEquals("54", card.cardNumber)
        assertEquals(1, card.amount)
    }

    @Test
    fun `sideboard entry is the commander, and stays in the sideboard`() {
        val deck = DeckFile.parse(sample)
        val commander = deck.sideboard.single()
        assertEquals("Ob Nixilis of the Black Oath", commander.cardName)
        assertEquals("C14", commander.setCode)
        assertTrue(deck.cards.none { it.cardName == commander.cardName })
    }

    @Test
    fun `ignores comments, blank lines and deck editor layout state`() {
        val deck = DeckFile.parse(listOf("", "   ", "# nope", "LAYOUT MAIN:(1,1)|([X:1])"))
        assertEquals(0, DeckFile.cardCount(deck))
    }

    @Test
    fun `every deck shipped in the image is Commander-legal by size`() {

        val decks = Config.findDecks(deckFile = null, deckDir = "../build/decks")

        assertTrue(decks.isNotEmpty(), "no decks found in ../build/decks")
        for (file in decks) {
            val deck = DeckFile.read(file)
            assertEquals(100, DeckFile.cardCount(deck), "deck at ${file.path} is not 100 cards")
            assertEquals(1, deck.sideboard.size, "${file.name}: expected exactly one commander in the sideboard")
            assertTrue(deck.name.isNotBlank(), "${file.name}: no NAME: line, so the ack cannot name it")
        }
    }

    @Test
    fun `a pinned BRIDGE_DECK_FILE beats the pool, so a repro run is reproducible`() {
        val pinned = Config.findDecks(deckFile = "../build/decks/limit-break.dck", deckDir = "../build/decks")
        assertEquals(listOf("limit-break.dck"), pinned.map { it.name })
    }

    @Test
    fun `the fallback deck exists, so a bridge run from an empty tree still seats someone`() {

        val fallback = File("../${Config.FALLBACK_DECK}")
        assertTrue(fallback.isFile, "fallback deck missing at ${fallback.path}")
        assertEquals(100, DeckFile.cardCount(DeckFile.read(fallback)))
    }
}
