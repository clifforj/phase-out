package online.commander.bridge

import mage.ObjectColor
import mage.abilities.icon.CardIconImpl
import mage.abilities.icon.CardIconType
import mage.abilities.keyword.ImproviseAbility
import mage.constants.Rarity
import mage.constants.TableState
import mage.view.AbilityView
import mage.view.CardView
import mage.view.CardsView
import mage.view.GameClientMessage
import java.io.Serializable
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class ViewMappingTest {

    @Test
    fun `colours become one letter each, in XMage's own WUBRG order`() {
        assertEquals(listOf("B", "G"), ViewMapping.colorLetters(ObjectColor("BG")))

        assertEquals(listOf("B", "G"), ViewMapping.colorLetters(ObjectColor("GB")))
        assertEquals(listOf("W"), ViewMapping.colorLetters(ObjectColor.WHITE))
        assertEquals(
            listOf("W", "U", "B", "R", "G"),
            ViewMapping.colorLetters(ObjectColor("WUBRG")),
        )
    }

    @Test
    fun `colourless is an empty list, and so is a missing colour`() {
        assertEquals(emptyList(), ViewMapping.colorLetters(ObjectColor.COLORLESS))
        assertEquals(emptyList(), ViewMapping.colorLetters(ObjectColor()))
        assertEquals(emptyList(), ViewMapping.colorLetters(null))
    }

    @Test
    fun `the commander icon maps to a type a client can branch on`() {
        val icon = ViewMapping.cardIcon(CardIconImpl.COMMANDER)
        assertEquals("COMMANDER", icon.type)

        assertEquals("", icon.text)
        assertEquals("Card is commander", icon.hint)
    }

    @Test
    fun `an icon's text and hint both survive the mapping`() {
        val xCost = CardIconImpl(CardIconType.OTHER_COST_X, "Cost X value", "3")
        val mapped = ViewMapping.cardIcon(xCost)
        assertEquals("OTHER_COST_X", mapped.type)
        assertEquals("3", mapped.text)
        assertEquals("Cost X value", mapped.hint)
    }

    @Test
    fun `XMage enums that a client must not match on by name`() {
        assertEquals("DUELING", TableState.DUELING.name)
        assertEquals("Dueling", TableState.DUELING.toString())
        assertNotEquals(TableState.WAITING.name, TableState.WAITING.toString())
        assertEquals("Waiting for players", TableState.WAITING.toString())

        assertEquals("MYTHIC", Rarity.MYTHIC.name)
        assertEquals("Mythic", Rarity.MYTHIC.toString())
    }

    @Test
    fun `only DUELING is watchable, and the state codes are distinct`() {
        val codes = TableState.values().map { it.name }
        assertEquals(codes.size, codes.toSet().size, "duplicate TableState names")
        assertTrue("DUELING" in codes)
        assertEquals(1, codes.count { it == "DUELING" })
    }

    @Test
    fun `a null targets falls back to options possibleTargets, for a hidden-zone search`() {
        val landOne = UUID.randomUUID()
        val landTwo = UUID.randomUUID()
        val options: Map<String, Serializable> = mapOf(
            "possibleTargets" to (listOf(landOne, landTwo) as Serializable),
            "targetZone" to "LIBRARY",
        )
        val message = GameClientMessage(null, options, "Select a basic land card", null, null, false)

        val prompt = ViewMapping.prompt(PromptKind.GAME_TARGET, message)

        assertEquals(listOf(landOne.toString(), landTwo.toString()), prompt.selectableTargets)
        assertEquals("LIBRARY", prompt.targetZone)
    }

    @Test
    fun `an empty (not null) targets does not fall back, even if possibleTargets is present`() {
        val stray = UUID.randomUUID()
        val options: Map<String, Serializable> = mapOf("possibleTargets" to (listOf(stray) as Serializable))
        val message = GameClientMessage(null, options, "Select nothing in particular", null, emptySet(), false)

        val prompt = ViewMapping.prompt(PromptKind.GAME_TARGET, message)

        assertEquals(emptyList(), prompt.selectableTargets)
    }

    @Test
    fun `a blank message falls back to options header, for GAME_GET_MULTI_AMOUNT`() {
        val options: Map<String, Serializable> = mapOf(
            "title" to "Assign combat damage",
            "header" to "Assign combat damage among creatures blocking Bear, P/T: 2/2",
        )
        val message = GameClientMessage(null, options, emptyList(), 2, 2)

        val prompt = ViewMapping.prompt(PromptKind.GAME_GET_MULTI_AMOUNT, message)

        assertEquals("Assign combat damage among creatures blocking Bear, P/T: 2/2", prompt.message)
    }

    @Test
    fun `an explicit message is not overridden by options header`() {
        val options: Map<String, Serializable> = mapOf("header" to "some unrelated header")
        val message = GameClientMessage(null, options, "Do you want to do the thing?", null, null, false)

        val prompt = ViewMapping.prompt(PromptKind.GAME_ASK, message)

        assertEquals("Do you want to do the thing?", prompt.message)
    }

    @Test
    fun `a null targets with no possibleTargets option falls back to cardsView1, for trigger ordering`() {
        val cardsView = CardsView(listOf(CardView(true)))
        val message = GameClientMessage(
            null,
            emptyMap(),
            "Pick triggered ability (goes to the stack first)",
            cardsView,
            null,
            true,
        )

        val prompt = ViewMapping.prompt(PromptKind.GAME_TARGET, message)

        assertEquals(1, prompt.cards.size)
        assertEquals(1, prompt.selectableTargets.size)
    }

    @Test
    fun `secondMessage comes off the options map, for the assign-a-blocker prompt`() {
        val attacker = UUID.randomUUID()
        val options: Map<String, Serializable> = mapOf(
            "secondMessage" to "<font color='#20B2AA'>Flesh Carver</font>",
            "targetZone" to "BATTLEFIELD",
        )
        val message = GameClientMessage(null, options, "Select attacker to block", null, setOf(attacker), false)

        val prompt = ViewMapping.prompt(PromptKind.GAME_TARGET, message)

        assertEquals("Select attacker to block", prompt.message)
        assertEquals("<font color='#20B2AA'>Flesh Carver</font>", prompt.secondMessage)
        assertEquals(listOf(attacker.toString()), prompt.selectableTargets)
    }

    @Test
    fun `secondMessage is null when XMage names no object`() {
        val message = GameClientMessage(null, mapOf("secondMessage" to " "), "Select attackers", null, null, false)

        assertEquals(null, ViewMapping.prompt(PromptKind.GAME_SELECT, message).secondMessage)
        assertEquals(null, ViewMapping.prompt(PromptKind.GAME_SELECT, GameClientMessage(null, emptyMap(), "x")).secondMessage)
    }

    @Test
    fun `possibleTargets present but empty does not fall back to cardsView1`() {
        val cardsView = CardsView(listOf(CardView(true)))
        val options: Map<String, Serializable> = mapOf("possibleTargets" to (emptyList<UUID>() as Serializable))
        val message = GameClientMessage(null, options, "Select a basic land card", cardsView, null, false)

        val prompt = ViewMapping.prompt(PromptKind.GAME_TARGET, message)

        assertEquals(1, prompt.cards.size)
        assertEquals(emptyList(), prompt.selectableTargets)
    }

    @Test
    fun `combatStep comes off the option key's presence, not the list's contents`() {
        val attacker = UUID.randomUUID()
        val attacking = GameClientMessage(
            null,
            mapOf("possibleAttackers" to (listOf(attacker) as Serializable)),
            "Select attackers",
        )
        val blocking = GameClientMessage(
            null,
            mapOf("possibleBlockers" to (listOf(attacker) as Serializable)),
            "Select blockers",
        )

        val allDeclared = GameClientMessage(
            null,
            mapOf("possibleAttackers" to (emptyList<UUID>() as Serializable)),
            "Select attackers",
        )
        val priority = GameClientMessage(null, emptyMap(), "Select an ability to activate")

        assertEquals(CombatStep.DECLARE_ATTACKERS, ViewMapping.prompt(PromptKind.GAME_SELECT, attacking).combatStep)
        assertEquals(CombatStep.DECLARE_BLOCKERS, ViewMapping.prompt(PromptKind.GAME_SELECT, blocking).combatStep)

        val last = ViewMapping.prompt(PromptKind.GAME_SELECT, allDeclared)
        assertEquals(CombatStep.DECLARE_ATTACKERS, last.combatStep)
        assertEquals(emptyList(), last.possibleAttackers)

        assertEquals(null, ViewMapping.prompt(PromptKind.GAME_SELECT, priority).combatStep)
    }

    @Test
    fun `an ability maps as the card it came from, keeping its own id and text`() {
        val ability = ImproviseAbility()
        val sourceCard = CardView(true)
        val abilityView = AbilityView(ability, "Herald of Anguish", sourceCard)

        val mapped = ViewMapping.card(abilityView)

        assertTrue(mapped.isAbility, "an AbilityView must be flagged as an ability")

        assertEquals(ability.id.toString(), mapped.objectId)
        assertNotEquals("Ability", mapped.name)
        assertEquals(sourceCard.name, mapped.name)

        assertEquals(abilityView.rules, mapped.rules)
        assertTrue(mapped.rules.any { it.contains("improvise", ignoreCase = true) }, "got ${mapped.rules}")
    }

    @Test
    fun `an ordinary card is not an ability`() {
        val mapped = ViewMapping.card(CardView(true))

        assertEquals(false, mapped.isAbility)
    }

    @Test
    fun `a handle embedded in prose is swapped for the player name`() {
        assertEquals(
            "Ashwing vs AI",
            ViewMapping.substituteNames("bcdfghjklmn0 vs AI", mapOf("bcdfghjklmn0" to "Ashwing")),
        )
    }

    @Test
    fun `substitution leaves prose alone when there is nothing to swap`() {
        assertEquals("bridge table", ViewMapping.substituteNames("bridge table", emptyMap()))
        assertEquals(
            "same vs AI",
            ViewMapping.substituteNames("same vs AI", mapOf("same" to "same")),
        )
    }
}
