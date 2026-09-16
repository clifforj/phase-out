package online.commander.bridge

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PromptRulesTest {

    @Test
    fun `passing priority is only meaningful at a priority prompt`() {
        assertTrue(PromptRules.isLegal(PromptKind.GAME_SELECT, PromptRules.PASS_PRIORITY))
        assertFalse(PromptRules.isLegal(PromptKind.GAME_ASK, PromptRules.PASS_PRIORITY))
        assertFalse(PromptRules.isLegal(PromptKind.GAME_TARGET, PromptRules.PASS_PRIORITY))
    }

    @Test
    fun `a yes-no prompt takes an answer and nothing else`() {
        assertEquals(listOf(PromptRules.ANSWER), PromptRules.expects(PromptKind.GAME_ASK))
    }

    @Test
    fun `mana payment accepts a source, the pool or a special action`() {
        val expected = setOf(
            PromptRules.ACTIVATE,
            PromptRules.PAY_MANA_FROM_POOL,
            PromptRules.SPECIAL,
            PromptRules.CANCEL,
        )
        assertEquals(expected, PromptRules.expects(PromptKind.GAME_PLAY_MANA).toSet())
    }

    @Test
    fun `amount prompts take an integer, and multi-amount does not`() {
        assertTrue(PromptRules.isLegal(PromptKind.GAME_GET_AMOUNT, PromptRules.SET_AMOUNT))
        assertTrue(PromptRules.isLegal(PromptKind.GAME_PLAY_XMANA, PromptRules.SET_AMOUNT))

        assertFalse(PromptRules.isLegal(PromptKind.GAME_GET_MULTI_AMOUNT, PromptRules.SET_AMOUNT))
        assertTrue(PromptRules.isLegal(PromptKind.GAME_GET_MULTI_AMOUNT, PromptRules.SET_AMOUNTS))
    }

    @Test
    fun `no game action is legal when no prompt is outstanding`() {
        assertEquals(emptyList(), PromptRules.expects(PromptKind.NONE))
        for (action in listOf(
            PromptRules.ACTIVATE, PromptRules.ANSWER, PromptRules.CANCEL,
            PromptRules.CHOOSE_TARGET, PromptRules.SET_AMOUNT,
        )) {
            assertFalse(PromptRules.isLegal(PromptKind.NONE, action), action)
        }
    }

    @Test
    fun `a spectator, whose prompt kind is always NONE, can answer nothing`() {
        val answeringActions = listOf(
            PromptRules.ACTIVATE, PromptRules.CHOOSE_TARGET, PromptRules.CHOOSE_ABILITY,
            PromptRules.ANSWER, PromptRules.PASS_PRIORITY, PromptRules.CANCEL,
            PromptRules.SET_AMOUNT, PromptRules.SET_AMOUNTS, PromptRules.CHOOSE_VALUE,
            PromptRules.PAY_MANA_FROM_POOL, PromptRules.SPECIAL,
        )
        for (action in answeringActions) {
            assertFalse(
                PromptRules.isLegal(PromptKind.NONE, action),
                "$action would be forwarded for a session that never gets a prompt",
            )
            assertFalse(
                action in PromptRules.promptIndependentActions,
                "$action bypasses the prompt guard entirely",
            )
        }
        assertEquals(emptyList(), PromptRules.expects(PromptKind.NONE))
    }

    @Test
    fun `player actions and concede do not depend on a prompt`() {
        assertEquals(
            setOf(PromptRules.PLAYER_ACTION, PromptRules.CONCEDE),
            PromptRules.promptIndependentActions,
        )
    }

    @Test
    fun `every prompt kind has an entry, and every entry advertises itself`() {
        for (kind in PromptKind.values()) {
            val expects = PromptRules.expects(kind)
            if (kind == PromptKind.NONE) continue
            assertTrue(expects.isNotEmpty(), "$kind advertises no legal action")
            for (action in expects) {
                assertTrue(PromptRules.isLegal(kind, action), "$kind advertises $action but rejects it")
            }
        }
    }

    @Test
    fun `action type names match the wire discriminators`() {
        assertEquals(PromptRules.ACTIVATE, Activate("g", "o").actionType)
        assertEquals(PromptRules.PASS_PRIORITY, PassPriority("g").actionType)
        assertEquals(PromptRules.SET_AMOUNTS, SetAmounts("g", listOf(1, 2)).actionType)
        assertEquals(PromptRules.PAY_MANA_FROM_POOL, PayManaFromPool("g", "BLACK").actionType)
        assertEquals("watchTable", WatchTable("t").actionType)
        assertEquals("stopWatching", StopWatching("g").actionType)
    }
}
