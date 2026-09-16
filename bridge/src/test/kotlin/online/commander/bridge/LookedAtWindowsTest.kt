package online.commander.bridge

import kotlin.test.Test
import kotlin.test.assertEquals

class LookedAtWindowsTest {

    private val top = CardView(objectId = "top-1", name = "Forest")

    private fun frame(turn: Int, step: String, vararg windows: LookedAtWindowView) = GameStateView(
        turn = turn,
        step = step,
        isPlayer = true,
        specialActionAvailable = false,
        players = emptyList(),
        myHand = emptyList(),
        stack = emptyList(),
        combat = emptyList(),
        playable = emptyList(),
        lookedAt = windows.toList(),
    )

    private fun window(name: String = "Top card of your library", card: CardView = top) =
        LookedAtWindowView(name = name, cards = listOf(card))

    @Test
    fun `a window arriving on one frame is on the frames after it`() {
        val windows = LookedAtWindows()
        assertEquals(listOf(window()), windows.fold(frame(1, "Precombat Main", window())).lookedAt)

        assertEquals(listOf(window()), windows.fold(frame(1, "Precombat Main")).lookedAt)
        assertEquals(listOf(window()), windows.fold(frame(1, "Precombat Main")).lookedAt)
    }

    @Test
    fun `a refresh replaces the card, so a new top card is never shown as the old one`() {
        val windows = LookedAtWindows()
        windows.fold(frame(1, "Precombat Main", window()))
        val drawn = CardView(objectId = "top-2", name = "Traveling Chocobo")
        assertEquals(
            listOf(window(card = drawn)),
            windows.fold(frame(1, "Precombat Main", window(card = drawn))).lookedAt,
        )
    }

    @Test
    fun `a window crosses a step boundary, because a live effect refreshes it every step`() {
        val windows = LookedAtWindows()
        windows.fold(frame(1, "Precombat Main", window()))

        assertEquals(listOf(window()), windows.fold(frame(1, "Begin Combat")).lookedAt)
        assertEquals(listOf(window()), windows.fold(frame(1, "Begin Combat", window())).lookedAt)
    }

    @Test
    fun `a window not refreshed for a whole step expires`() {
        val windows = LookedAtWindows()
        windows.fold(frame(1, "Precombat Main", window()))

        assertEquals(listOf(window()), windows.fold(frame(1, "Begin Combat")).lookedAt)
        assertEquals(emptyList(), windows.fold(frame(1, "Declare Attackers")).lookedAt)
        assertEquals(emptyList(), windows.fold(frame(1, "Declare Blockers")).lookedAt)
    }

    @Test
    fun `the same step in a later turn is a new step`() {
        val windows = LookedAtWindows()
        windows.fold(frame(1, "Precombat Main", window()))
        assertEquals(listOf(window()), windows.fold(frame(2, "Precombat Main")).lookedAt)
        assertEquals(emptyList(), windows.fold(frame(3, "Precombat Main")).lookedAt)
    }

    @Test
    fun `windows are kept by name, so refreshing one does not close another`() {
        val windows = LookedAtWindows()
        val scry = window(name = "Scry", card = CardView(objectId = "scry-1", name = "Ponder"))
        windows.fold(frame(1, "Upkeep", scry))
        val both = windows.fold(frame(1, "Upkeep", window())).lookedAt
        assertEquals(listOf("Scry", "Top card of your library"), both.map { it.name })
    }

    @Test
    fun `a game with no windows is handed straight back`() {
        val windows = LookedAtWindows()
        val state = frame(1, "Upkeep")
        assertEquals(state, windows.fold(state))
    }
}
