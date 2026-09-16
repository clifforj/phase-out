package online.commander.bridge

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class DeckImportTest {

    private val index = CardIndex.parse(
        """
        Sol Ring	MSC:211 SOC:128 LTC:284	A	{1}
        Arcane Signet	MSC:191 FIC:333	A	{2}
        Cultivate	FDN:187 C21:189	S	{2}{G}
        Rampant Growth	MSC:400	S	{1}{G}
        Forest	MSH:285 FIC:396	L	
        Tidus, Yuna's Guardian	FIC:1	C	{2}{R}{G}	C
        Tifa Lockhart	FIN:391	C	{2}{R}{G}	C
        Fire // Ice	DMR:215	I	{R}
        Plain Partner A	CMR:1	C	{1}{R}	CP	R
        Plain Partner B	CMR:2	C	{1}{G}	CP	G
        Named Partner A	CMR:3	C	{1}{W}	CW	W	Named Partner B
        Named Partner B	CMR:4	C	{1}{U}	C	U
        Not A Partner	CMR:5	C	{1}{B}	C	B
        """.trimIndent().lineSequence(),
    )

    private fun unlabelledCommanderDeck(first: String) = "1 $first\n1 Sol Ring\n98 Forest"

    private fun import(text: String, name: String? = null, commanderOverride: List<String>? = null) =
        DeckImport.import(text, name, index, commanderOverride)

    @Test
    fun `reads the union of the exporters' formats`() {
        val report = import(
            """
            Commander
            1 Tidus, Yuna's Guardian (FIC) 1

            Deck (5)
            1x Sol Ring
            1 Arcane Signet (FIC) 333
            1 Cultivate (C21) 189 *F*
            1 Rampant Growth [Ramp]
            Forest
            """.trimIndent(),
        )

        assertTrue(report.ok, "not imported: ${report.problems.map { it.message }}")
        assertEquals(6, report.cardCount)
        assertEquals(5, report.mainCount)
        assertEquals(listOf("Tidus, Yuna's Guardian"), report.commanders)
    }

    @Test
    fun `a count is optional, and defaults to one`() {
        val report = import("Sol Ring\nForest")
        assertTrue(report.ok)
        assertEquals(2, report.cardCount)
    }

    @Test
    fun `an XMage dck round-trips`() {
        val original = import("Commander\n1 Tidus, Yuna's Guardian\n\nDeck\n99 Forest", "Round Trip")
        val text = DeckFile.write(assertNotNull(original.deck))

        val reimported = import(text)
        assertTrue(reimported.ok, reimported.problems.joinToString { it.message })
        assertEquals("Round Trip", reimported.name, "the NAME: line survives")
        assertEquals(100, reimported.cardCount)
        assertEquals(listOf("Tidus, Yuna's Guardian"), reimported.commanders)
    }

    @Test
    fun `comments, blank lines and category headings are not cards`() {
        val report = import(
            """
            # my deck
            // also a comment

            Creatures (1)
            1 Sol Ring
            Lands (1)
            Forest
            """.trimIndent(),
        )
        assertTrue(report.ok, report.problems.joinToString { it.message })
        assertEquals(2, report.cardCount)
    }

    @Test
    fun `the Commander section becomes the sideboard, which is where XMage looks`() {
        val deck = assertNotNull(import("Commander\n1 Tidus, Yuna's Guardian\n\nDeck\n1 Sol Ring").deck)
        assertEquals(listOf("Tidus, Yuna's Guardian"), deck.sideboard.map { it.cardName })
        assertEquals(listOf("Sol Ring"), deck.cards.map { it.cardName })
    }

    @Test
    fun `a hash-marked Commander heading is a section, not a comment`() {
        val report = import(
            """
            # Commander
            1 Tidus, Yuna's Guardian (FIC) 1

            # other
            1 Sol Ring
            1 Forest
            """.trimIndent(),
        )

        assertTrue(report.ok, report.problems.joinToString { it.message })
        assertEquals(listOf("Tidus, Yuna's Guardian"), report.commanders)
        assertEquals(2, report.mainCount, "'# other' has to put the rest back in the main deck")
    }

    @Test
    fun `an unrecognised heading ends the section it follows`() {
        val report = import("Commander\n1 Tidus, Yuna's Guardian\n\nCreatures (2)\n1 Sol Ring\n1 Forest")

        assertEquals(1, report.commanders.size)
        assertEquals(2, report.mainCount)
    }

    @Test
    fun `a 100-card list with no headings takes its first card as the commander`() {
        val report = import(unlabelledCommanderDeck("Tidus, Yuna's Guardian"))

        assertTrue(report.ok, report.problems.joinToString { it.message })
        assertEquals(listOf("Tidus, Yuna's Guardian"), report.commanders)
        assertEquals(99, report.mainCount)
        val deck = assertNotNull(report.deck)
        assertEquals(listOf("Tidus, Yuna's Guardian"), deck.sideboard.map { it.cardName })
        assertTrue(deck.cards.none { it.cardName == "Tidus, Yuna's Guardian" })
        assertEquals(100, DeckFile.cardCount(deck), "promoting must not change the deck's size")
    }

    @Test
    fun `the promotion is reported`() {
        val note = import(unlabelledCommanderDeck("Tifa Lockhart")).notes.single()
        assertEquals(DeckImport.Level.WARNING, note.level)
        assertTrue("Tifa Lockhart" in note.message, note.message)
    }

    @Test
    fun `a first card that cannot be a commander is left where it is`() {
        val report = import(unlabelledCommanderDeck("Sol Ring"))

        assertTrue(report.commanders.isEmpty())
        assertEquals(100, report.mainCount)
        assertTrue(
            report.notes.any { "no commander" in it.message },
            "expected a no-commander warning, got ${report.notes.map { it.message }}",
        )
    }

    @Test
    fun `a deck that is not 100 cards is never promoted`() {
        val report = import("1 Tidus, Yuna's Guardian\n1 Sol Ring\n58 Forest")

        assertTrue(report.commanders.isEmpty())
        assertEquals(60, report.mainCount)
    }

    @Test
    fun `an explicit heading always wins over the guess`() {
        val report = import("1 Sol Ring\n97 Forest\n\nCommander\n1 Tidus, Yuna's Guardian\n1 Tifa Lockhart")

        assertEquals(listOf("Tidus, Yuna's Guardian", "Tifa Lockhart"), report.commanders)
        assertEquals(98, report.mainCount, "Sol Ring stays in the main deck")
    }

    @Test
    fun `a 100-card list opening with a legal partner pair promotes both`() {
        val report = import("1 Plain Partner A\n1 Plain Partner B\n1 Sol Ring\n97 Forest")

        assertTrue(report.ok, report.problems.joinToString { it.message })
        assertEquals(listOf("Plain Partner A", "Plain Partner B"), report.commanders)
        assertEquals(98, report.mainCount)
        val deck = assertNotNull(report.deck)
        assertEquals(setOf("Plain Partner A", "Plain Partner B"), deck.sideboard.map { it.cardName }.toSet())
        assertTrue(deck.cards.none { it.cardName in report.commanders })
    }

    @Test
    fun `the pair does not have to be adjacent, only both within the leading cards`() {
        val report = import("1 Plain Partner A\n1 Sol Ring\n1 Plain Partner B\n97 Forest")

        assertEquals(listOf("Plain Partner A", "Plain Partner B"), report.commanders)
        assertTrue(assertNotNull(report.deck).cards.any { it.cardName == "Sol Ring" }, "Sol Ring stays in main")
    }

    @Test
    fun `a Partner-with pair is recognised even though only one side carries the ability`() {
        val report = import("1 Named Partner A\n1 Named Partner B\n1 Sol Ring\n97 Forest")
        assertEquals(listOf("Named Partner A", "Named Partner B"), report.commanders)
    }

    @Test
    fun `two unrelated legal commanders are not both promoted -- only the first`() {
        val report = import("1 Not A Partner\n1 Plain Partner A\n1 Sol Ring\n97 Forest")

        assertEquals(listOf("Not A Partner"), report.commanders)
        assertEquals(99, report.mainCount, "Plain Partner A, unpaired, stays in the main deck")
    }

    @Test
    fun `an override names exactly the commanders, regardless of the guess`() {
        val report = import(
            "1 Sol Ring\n1 Plain Partner A\n1 Plain Partner B\n97 Forest",
            commanderOverride = listOf("Plain Partner A", "Plain Partner B"),
        )

        assertTrue(report.ok, report.problems.joinToString { it.message })
        assertEquals(setOf("Plain Partner A", "Plain Partner B"), report.commanders.toSet())
        assertEquals(98, report.mainCount)
        val deck = assertNotNull(report.deck)
        assertEquals(setOf("Plain Partner A", "Plain Partner B"), deck.sideboard.map { it.cardName }.toSet())
    }

    @Test
    fun `an override can demote the guessed commander back into the main deck`() {

        val report = import(unlabelledCommanderDeck("Plain Partner A"), commanderOverride = emptyList())

        assertTrue(report.commanders.isEmpty())
        assertEquals(100, report.mainCount)
        assertTrue(assertNotNull(report.deck).sideboard.isEmpty())
    }

    @Test
    fun `an override name absent from the list is reported rather than ignored`() {
        val report = import("1 Sol Ring\n99 Forest", commanderOverride = listOf("Nobody Here"))

        assertTrue(
            report.notes.any { it.level == DeckImport.Level.WARNING && "Nobody Here" in it.message },
            "expected a warning naming the missing override, got ${report.notes.map { it.message }}",
        )
        assertTrue(report.commanders.isEmpty())
    }

    @Test
    fun `an unlabelled sideboard is flagged, because in a Commander game it is the commander`() {
        val report = import("Deck\n1 Sol Ring\n\nSideboard\n1 Tidus, Yuna's Guardian")
        assertTrue(report.ok)
        assertTrue(
            report.notes.any { it.level == DeckImport.Level.WARNING && "Commander" in it.message },
            "expected a warning about the unlabelled sideboard, got ${report.notes.map { it.message }}",
        )
    }

    @Test
    fun `one unresolvable card refuses the whole deck, naming the line`() {
        val report = import("1 Sol Ring\n1 Blastoderm Of Antioch\n1 Forest")

        assertFalse(report.ok)
        assertNull(report.deck, "nothing may be saved when a line did not resolve")
        val problem = report.problems.single()
        assertEquals(2, problem.lineNumber)
        assertTrue("Blastoderm Of Antioch" in problem.message)
    }

    @Test
    fun `an empty paste is refused rather than saved as an empty deck`() {
        val report = import("   \n\n# nothing here\n")
        assertFalse(report.ok)
        assertTrue(report.problems.isNotEmpty())
    }

    @Test
    fun `a mistyped count is reported rather than thrown`() {
        val report = import("1000 Forest")
        assertFalse(report.ok)
        assertEquals(1, report.problems.single().lineNumber)
    }

    @Test
    fun `an unknown printing is a warning and the deck still imports`() {
        val report = import("1 Sol Ring (ZZZ) 999")

        assertTrue(report.ok)

        val note = assertNotNull(report.notes.singleOrNull { it.lineNumber == 1 })
        assertEquals(DeckImport.Level.WARNING, note.level)
        assertTrue("ZZZ:999" in note.message && "MSC:211" in note.message, note.message)
        assertEquals("MSC", assertNotNull(report.deck).cards.single().setCode)
    }

    @Test
    fun `an explicit name beats a NAME line, which beats the default`() {
        assertEquals("Chosen", import("NAME:In The Text\n1 Sol Ring", "Chosen").name)
        assertEquals("In The Text", import("NAME:In The Text\n1 Sol Ring").name)
        assertEquals("Imported deck", import("1 Sol Ring").name)
    }

    @Test
    fun `the deck is written with XMage's own card names`() {
        val deck = assertNotNull(import("1 fire / ice").deck)
        assertEquals("Fire // Ice", deck.cards.single().cardName)
    }

    @Test
    fun `set code and card number are not transposed on the way in`() {
        val card = assertNotNull(import("1 Arcane Signet (FIC) 333").deck).cards.single()
        assertEquals("FIC", card.setCode)
        assertEquals("333", card.cardNumber)
    }

    @Test
    fun `a promotional printing's own name is what gets saved, and the swap is reported`() {
        val report = import("1 Not The Real Name (MSC) 211\n1 Forest")

        assertTrue(report.ok, report.problems.joinToString { it.message })
        val card = assertNotNull(report.deck).cards.single { it.setCode == "MSC" }
        assertEquals("Not The Real Name", card.cardName)
        assertEquals("211", card.cardNumber)

        val note = assertNotNull(report.notes.singleOrNull { it.lineNumber == 1 })
        assertEquals(DeckImport.Level.WARNING, note.level)
        assertTrue("Not The Real Name" in note.message && "Sol Ring" in note.message, note.message)
    }

    @Test
    fun `a labelled commander under a promotional name is reported by that name`() {
        val report = import("Commander\n1 Not Tidus (FIC) 1\n\nDeck\n99 Forest")

        assertTrue(report.ok, report.problems.joinToString { it.message })
        assertEquals(listOf("Not Tidus"), report.commanders)
    }

    @Test
    fun `an unlabelled commander under a promotional name is still recognised as one`() {
        val report = import(unlabelledCommanderDeck("Not Tidus (FIC) 1"))

        assertTrue(report.ok, report.problems.joinToString { it.message })
        assertEquals(listOf("Not Tidus"), report.commanders)
        val deck = assertNotNull(report.deck)
        assertEquals(listOf("Not Tidus"), deck.sideboard.map { it.cardName })
    }
}
