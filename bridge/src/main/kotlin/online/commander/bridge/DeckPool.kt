package online.commander.bridge

import java.io.File
import java.util.UUID

class DeckPool(private val decks: List<File>) {

    val catalog: List<DeckStore.Saved> by lazy {
        decks.mapNotNull(DeckStore::describe).sortedByDescending { it.savedAt }
    }

    fun find(id: String): File? = catalog.firstOrNull { it.id == id }?.file

    private val dealt = object : LinkedHashMap<UUID, MutableSet<String>>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: Map.Entry<UUID, MutableSet<String>>): Boolean =
            size > MAX_TABLES
    }

    @Synchronized
    fun dealTo(tableId: UUID): File? {
        if (decks.isEmpty()) return null
        val taken = dealt.getOrPut(tableId) { mutableSetOf() }
        val remaining = decks.filterNot { it.name in taken }
        val choice = (remaining.ifEmpty { decks.also { taken.clear() } }).random()
        taken.add(choice.name)
        return choice
    }

    @Synchronized
    fun deal(count: Int): List<File> {
        if (decks.isEmpty() || count <= 0) return emptyList()
        val hand = mutableListOf<File>()
        while (hand.size < count) hand += decks.shuffled().take(count - hand.size)
        return hand
    }

    @Synchronized
    fun forget(tableId: UUID) {
        dealt.remove(tableId)
        announced.remove(tableId)
    }

    private val announced = object : LinkedHashMap<UUID, MutableMap<String, DeckSummary>>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: Map.Entry<UUID, MutableMap<String, DeckSummary>>): Boolean =
            size > MAX_TABLES
    }

    @Synchronized
    fun announce(tableId: UUID, seatName: String, deck: DeckSummary) {
        announced.getOrPut(tableId) { mutableMapOf() }[seatName] = deck
    }

    @Synchronized
    fun decksAt(tableId: UUID): Map<String, DeckSummary> = announced[tableId]?.toMap() ?: emptyMap()

    private companion object {
        const val MAX_TABLES = 256
    }
}
