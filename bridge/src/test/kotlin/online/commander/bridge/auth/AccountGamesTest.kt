package online.commander.bridge.auth

import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class AccountGamesTest {

    private val ada = "ada"
    private val table = UUID.randomUUID()
    private val game = UUID.randomUUID()
    private val player = UUID.randomUUID()

    @Test
    fun `seat is null for an account nothing was ever recorded for`() {
        val games = AccountGames()

        assertNull(games.seat(ada))
    }

    @Test
    fun `record makes the seat retrievable`() {
        val games = AccountGames()

        games.record(ada, AccountGames.Seat(table, game, player))

        assertEquals(AccountGames.Seat(table, game, player), games.seat(ada))
    }

    @Test
    fun `record replaces a previous seat for the same account`() {
        val games = AccountGames()
        val laterGame = UUID.randomUUID()
        games.record(ada, AccountGames.Seat(table, game, player))

        games.record(ada, AccountGames.Seat(table, laterGame, player))

        assertEquals(laterGame, games.seat(ada)?.gameId)
    }

    @Test
    fun `forget clears the seat when the gameId matches`() {
        val games = AccountGames()
        games.record(ada, AccountGames.Seat(table, game, player))

        games.forget(ada, game)

        assertNull(games.seat(ada))
    }

    @Test
    fun `forget does not clear a seat recorded for a different game`() {
        val games = AccountGames()
        val staleGame = UUID.randomUUID()
        games.record(ada, AccountGames.Seat(table, game, player))

        games.forget(ada, staleGame)

        assertEquals(game, games.seat(ada)?.gameId)
    }

    @Test
    fun `forget on an account with no seat is a no-op`() {
        val games = AccountGames()

        games.forget(ada, game)

        assertNull(games.seat(ada))
    }
}
