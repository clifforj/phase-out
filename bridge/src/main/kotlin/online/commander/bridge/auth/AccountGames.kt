package online.commander.bridge.auth

import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

// Retain live seats across disconnects so returning accounts can reclaim them.
class AccountGames {

    data class Seat(val tableId: UUID, val gameId: UUID, val playerId: UUID)

    private val live = ConcurrentHashMap<String, Seat>()

    fun record(accountId: String, seat: Seat) {
        live[accountId] = seat
    }

    fun forget(accountId: String, gameId: UUID) {
        // A delayed end-game callback must not clear a newer seat.
        live.computeIfPresent(accountId) { _, current -> if (current.gameId == gameId) null else current }
    }

    fun seat(accountId: String): Seat? = live[accountId]
}
