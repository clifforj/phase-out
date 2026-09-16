package online.commander.bridge

import java.util.UUID

class PlaymatPool {

    private val announced = object : LinkedHashMap<UUID, MutableMap<String, String>>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: Map.Entry<UUID, MutableMap<String, String>>): Boolean =
            size > MAX_TABLES
    }

    @Synchronized
    fun announce(tableId: UUID, seatName: String, playmatId: String?) {
        if (playmatId == null) return
        announced.getOrPut(tableId) { mutableMapOf() }[seatName] = playmatId
    }

    @Synchronized
    fun at(tableId: UUID): Map<String, String> = announced[tableId]?.toMap() ?: emptyMap()

    private companion object {
        const val MAX_TABLES = 256
    }
}
