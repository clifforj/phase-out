package online.commander.bridge

class LookedAtWindows {

    private class Entry(val cards: List<CardView>, var refreshedThisStep: Boolean)

    private var at: Pair<Int, String?>? = null
    private val open = LinkedHashMap<String, Entry>()

    @Synchronized
    fun fold(state: GameStateView): GameStateView {
        val here = state.turn to state.step
        if (here != at) {
            at = here
            open.values.removeIf { !it.refreshedThisStep }
            open.values.forEach { it.refreshedThisStep = false }
        }
        for (window in state.lookedAt) {
            open[window.name] = Entry(window.cards, refreshedThisStep = true)
        }
        if (open.isEmpty()) return state
        return state.copy(lookedAt = open.map { (name, entry) -> LookedAtWindowView(name, entry.cards) })
    }
}
