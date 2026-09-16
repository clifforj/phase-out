package online.commander.bridge

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class CardIndexTest {

    private val index = CardIndex.parse(
        """
        # a comment, as the generator writes
        # sets=3 names=6 printings=9
        Sol Ring	MSC:211 SOC:128 LTC:284	A	{1}
        Fire // Ice	DMR:215 APC:128	I	{R}
        Brazen Borrower	SOC:190 ELD:39	C	{1}{U}
        Márton Stromgald	ME4:126	C	{2}{R}
        Urza's Bauble	ULG:132	A	{0}
        Aethergeode Miner	M3C:163 AER:4 PAER:4s	A	{4}
        Tidus, Yuna's Guardian	FIC:5 FIC:187	C	{2}{R}{G}	C	WUG
        Kozilek, Butcher of Truth	2X2:2 UMA:6	C	{10}	C
        Command Tower	LTC:401 CMR:331	L	
        """.trimIndent().lineSequence(),
    )

    @Test
    fun `a commander carries its colour identity, and a colourless one carries none`() {
        val tidus = assertNotNull(index.find("Tidus, Yuna's Guardian"))
        assertTrue(tidus.canBeCommander)
        assertEquals("WUG", tidus.colors)

        val kozilek = assertNotNull(index.find("Kozilek, Butcher of Truth"))
        assertTrue(kozilek.canBeCommander)
        assertEquals("", kozilek.colors)
    }

    @Test
    fun `a card with no columns beyond its mana cost is neither a commander nor coloured`() {
        val solRing = assertNotNull(index.find("Sol Ring"))
        assertTrue(!solRing.canBeCommander)
        assertEquals("", solRing.colors)
    }

    @Test
    fun `mana cost is read for every card, not just possible commanders`() {
        assertEquals("{1}", assertNotNull(index.find("Sol Ring")).manaCost)
        assertEquals("{2}{R}{G}", assertNotNull(index.find("Tidus, Yuna's Guardian")).manaCost)
    }

    @Test
    fun `a land's mana cost is empty, and the empty column is not mistaken for a missing one`() {
        val tower = assertNotNull(index.find("Command Tower"))
        assertEquals("", tower.manaCost)
        assertEquals("", tower.colors)
        assertTrue(!tower.canBeCommander)
    }

    @Test
    fun `resolves a name to its most preferred printing`() {
        val resolved = assertNotNull(index.resolve("Sol Ring") as? CardIndex.Resolution.Exact)
        assertEquals("Sol Ring", resolved.card.name)
        assertEquals(printing("MSC", "211"), resolved.printing, "the first printing in the line wins")
    }

    @Test
    fun `a card the pinned build has never heard of is Unknown, not a guess`() {
        assertEquals(CardIndex.Resolution.Unknown, index.resolve("Definitely Not A Card"))
    }

    @Test
    fun `case and stray whitespace do not make a different card`() {
        assertNotNull(index.find("  sol   RING "))
    }

    @Test
    fun `the typographic apostrophe Moxfield writes matches the plain one`() {
        assertNotNull(index.find("Urza’s Bauble"))
    }

    @Test
    fun `an accent stripped out by a paste still finds the card`() {
        assertNotNull(index.find("Marton Stromgald"))
        assertNotNull(index.find("Márton Stromgald"))
    }

    @Test
    fun `every spelling of a split card's separator is the same card`() {
        for (name in listOf("Fire // Ice", "Fire//Ice", "Fire / Ice")) {
            assertEquals("Fire // Ice", index.find(name)?.name, "failed for '$name'")
        }
    }

    @Test
    fun `a split card is also findable by its front face alone`() {
        assertEquals("Fire // Ice", index.find("Fire")?.name)
    }

    @Test
    fun `an adventure card written with both faces resolves to XMage's front-face name`() {
        assertEquals("Brazen Borrower", index.find("Brazen Borrower // Petty Theft")?.name)
    }

    @Test
    fun `a printing the list named is used rather than the preferred one`() {
        val resolved = index.resolve("Sol Ring", printing("LTC", "284"))
        assertEquals(printing("LTC", "284"), (resolved as CardIndex.Resolution.Exact).printing)
    }

    @Test
    fun `the set code and collector number are matched case-insensitively`() {
        val resolved = index.resolve("Sol Ring", printing("ltc", "284"))
        assertEquals(printing("LTC", "284"), (resolved as CardIndex.Resolution.Exact).printing)
    }

    @Test
    fun `a set with no collector number picks that set's best printing`() {
        val resolved = index.resolve("Sol Ring", printing("SOC", ""))
        assertEquals(printing("SOC", "128"), (resolved as CardIndex.Resolution.Exact).printing)
    }

    @Test
    fun `a printing this build lacks falls back to the preferred one, and says so`() {
        val resolved = index.resolve("Sol Ring", printing("ZZZ", "1"))
        val substituted = assertNotNull(resolved as? CardIndex.Resolution.Substituted)
        assertEquals(printing("MSC", "211"), substituted.printing)
        assertEquals(printing("ZZZ", "1"), substituted.wanted)
    }

    @Test
    fun `a printing sold under a promotional name resolves to the card it actually is`() {
        val resolved = index.resolve("Miku, Song of the People", printing("MSC", "211"))
        val renamed = assertNotNull(resolved as? CardIndex.Resolution.Renamed)
        assertEquals("Sol Ring", renamed.card.name)
        assertEquals(printing("MSC", "211"), renamed.printing)
        assertEquals("Miku, Song of the People", renamed.asName)
    }

    @Test
    fun `an unknown name with no printing is still Unknown, not a guess at a rename`() {
        assertEquals(CardIndex.Resolution.Unknown, index.resolve("Definitely Not A Card"))
    }

    @Test
    fun `an unknown name naming a printing this build has never heard of is still Unknown`() {
        assertEquals(CardIndex.Resolution.Unknown, index.resolve("Definitely Not A Card", printing("ZZZ", "1")))
    }

    @Test
    fun `a printing resolves back to the card it is`() {
        assertEquals("Sol Ring", index.nameOf(printing("SOC", "128")))
        assertEquals("Fire // Ice", index.nameOf(printing("APC", "128")), "same number, different set")
        assertEquals("Aethergeode Miner", index.nameOf(printing("PAER", "4s")), "a non-numeric number")
    }

    @Test
    fun `the reverse lookup is case-insensitive, as the forward one is`() {
        assertEquals("Sol Ring", index.nameOf(printing("soc", "128")))
        assertEquals("Aethergeode Miner", index.nameOf(printing("paer", "4S")))
    }

    @Test
    fun `a printing with half of it missing names nothing rather than the wrong card`() {
        assertEquals(null, index.nameOf(printing("SOC", "")))
        assertEquals(null, index.nameOf(printing("", "128")))
    }

    @Test
    fun `a printing the index has never heard of is null, twice`() {
        assertEquals(null, index.nameOf(printing("ZZZ", "1")))
        assertEquals(null, index.nameOf(printing("ZZZ", "1")))
    }

    @Test
    fun `the bundled index is on the classpath and holds the whole card pool`() {
        val bundled = CardIndex.bundled
        assertTrue(bundled.size > 30_000, "only ${bundled.size} names; is card-index.txt stale?")
        assertNotNull(bundled.find("Sol Ring"), "the bundled index cannot find Sol Ring")
        assertNotNull(bundled.find("Forest"))
    }

    @Test
    fun `every card in the shipped decks is in the bundled index`() {
        val missing = mutableListOf<String>()
        for (file in Config.findDecks(deckFile = null, deckDir = "../decks")) {
            val deck = DeckFile.read(file)
            for (card in deck.cards + deck.sideboard) {
                if (CardIndex.bundled.find(card.cardName) == null) missing += "${file.name}: ${card.cardName}"
            }
        }
        assertTrue(missing.isEmpty(), "not in card-index.txt: ${missing.take(5)}")
    }

    private fun printing(setCode: String, cardNumber: String) = CardIndex.Printing(setCode, cardNumber)

    private val partnerIndex = CardIndex.parse(
        """
        Plain Partner A	CMR:1	C	{1}{R}	CP	R
        Named Partner A	CMR:3	C	{1}{W}	CW	W	Named Partner B
        Named Partner B	CMR:4	C	{1}{U}	C	U
        Choose Background	CMR:5	C	{1}{B}	CK	B
        A Background	CMR:6	E	{1}{G}	G	G
        Companion A	CMR:7	C	{1}{W}	CN	W
        A Doctor	CMR:8	C	{1}{R}	CT	R
        Friends Forever A	CMR:9	C	{1}{G}	CV	G	FRIENDS_FOREVER
        Friends Forever B	CMR:10	C	{1}{U}	CV	U	FRIENDS_FOREVER
        Character Select A	CMR:11	C	{1}{B}	CV	B	CHARACTER_SELECT
        Ordinary Legend	CMR:12	C	{2}{U}	C	U
        """.trimIndent().lineSequence(),
    )

    private fun tagged(name: String) = assertNotNull(partnerIndex.find(name))

    @Test
    fun `plain Partner pairs with itself and with nothing untagged`() {
        val a = tagged("Plain Partner A")
        assertTrue(a.pairsWith(a))
        assertTrue(!a.pairsWith(tagged("Ordinary Legend")))
    }

    @Test
    fun `Partner with names one specific card, and the name-holder can be on either side`() {
        val a = tagged("Named Partner A")
        val b = tagged("Named Partner B")
        assertTrue(a.pairsWith(b))
        assertTrue(b.pairsWith(a), "the named side has to work both ways round")
        assertTrue(!a.pairsWith(tagged("Ordinary Legend")))
    }

    @Test
    fun `Choose a Background pairs only with an actual Background`() {
        val chooser = tagged("Choose Background")
        assertTrue(chooser.pairsWith(tagged("A Background")))
        assertTrue(!chooser.pairsWith(tagged("Ordinary Legend")))

        assertTrue(!tagged("A Background").pairsWith(tagged("A Background")))
    }

    @Test
    fun `Doctor's companion pairs only with an eligible Doctor`() {
        val companion = tagged("Companion A")
        assertTrue(companion.pairsWith(tagged("A Doctor")))
        assertTrue(!companion.pairsWith(tagged("Ordinary Legend")))
    }

    @Test
    fun `a partner-variant pairing needs a shared variant code`() {
        assertTrue(tagged("Friends Forever A").pairsWith(tagged("Friends Forever B")))
        assertTrue(!tagged("Friends Forever A").pairsWith(tagged("Character Select A")))
    }

    @Test
    fun `partner labels are human-readable`() {
        assertEquals("Partner", tagged("Plain Partner A").partner?.label)
        assertEquals("Partner with Named Partner B", tagged("Named Partner A").partner?.label)
        assertEquals("Choose a Background", tagged("Choose Background").partner?.label)
        assertEquals("Background", tagged("A Background").partner?.label)
        assertEquals("Doctor's companion", tagged("Companion A").partner?.label)
        assertEquals("Doctor", tagged("A Doctor").partner?.label)
        assertEquals("Friends forever", tagged("Friends Forever A").partner?.label)
    }

    @Test
    fun `a known real Partner pair resolves and pairs in the bundled index`() {
        val tana = assertNotNull(CardIndex.bundled.find("Tana, the Bloodsower"))
        val tymna = assertNotNull(CardIndex.bundled.find("Tymna the Weaver"))
        assertTrue(tana.pairsWith(tymna))
    }
}
