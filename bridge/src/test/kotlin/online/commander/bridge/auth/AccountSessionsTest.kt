package online.commander.bridge.auth

import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.yield
import online.commander.bridge.BridgeSession
import online.commander.bridge.Config
import online.commander.bridge.Failure
import online.commander.bridge.FailureCodes
import java.nio.file.Files
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertSame
import kotlin.test.assertTrue

class AccountSessionsTest {

    private val dir = Files.createTempDirectory("account-sessions-test").toFile()
    private val config = Config.fromEnv(
        mapOf(
            "BRIDGE_DECK_STORE" to dir.resolve("decks").path,
            "BRIDGE_DATA_DIR" to dir.resolve("data").path,
        )
    )
    private val sessions = AccountSessions()
    private val opened = mutableListOf<BridgeSession>()

    private val ada = "11111111-1111-4111-8111-111111111111"
    private val bo = "22222222-2222-4222-8222-222222222222"

    private fun session(id: String): BridgeSession =
        BridgeSession(id, config).also { opened += it }

    @AfterTest
    fun cleanUp() {
        opened.forEach { it.close() }
        dir.deleteRecursively()
    }

    @Test
    fun `the second tab takes the account and the first is told why`() {
        val first = session("first")
        val second = session("second")

        sessions.claim(ada, first)
        sessions.claim(ada, second)

        assertSame(second, sessions.sessionFor(ada), "the newcomer holds the account")
        val evicted = assertIs<Failure>(first.outbound.tryReceive().getOrNull())
        assertEquals(FailureCodes.SESSION_TAKEN_OVER, evicted.code)

        assertEquals("login", evicted.action)

        assertTrue(first.outbound.trySend(evicted).isFailure, "the evicted session's stream is over")
        assertTrue(second.outbound.trySend(evicted).isSuccess, "the winner's is not")
    }

    @Test
    fun `an evicted session's teardown leaves the winner holding the account`() {
        val first = session("first")
        val second = session("second")

        sessions.claim(ada, first)
        sessions.claim(ada, second)
        sessions.release(first)

        assertSame(second, sessions.sessionFor(ada))
    }

    @Test
    fun `releasing the holder frees the account`() {
        val only = session("only")

        sessions.claim(ada, only)
        sessions.release(only)

        assertNull(sessions.sessionFor(ada))
        assertEquals(0, sessions.size)
    }

    @Test
    fun `claiming twice from the same session evicts nothing`() {
        val only = session("only")

        sessions.claim(ada, only)
        sessions.claim(ada, only)

        assertSame(only, sessions.sessionFor(ada))
        assertNull(only.outbound.tryReceive().getOrNull(), "nothing was sent to itself")
    }

    @Test
    fun `two accounts hold their sessions independently`() {
        val hers = session("hers")
        val theirs = session("theirs")

        sessions.claim(ada, hers)
        sessions.claim(bo, theirs)

        assertEquals(2, sessions.size)
        assertNull(hers.outbound.tryReceive().getOrNull())
        assertNull(theirs.outbound.tryReceive().getOrNull())
    }

    @Test
    fun `heldByAnother is false for an account nobody holds`() {
        val newcomer = session("newcomer")

        assertTrue(!sessions.heldByAnother(ada, newcomer))
    }

    @Test
    fun `heldByAnother is true when a different session holds the account`() {
        val first = session("first")
        val second = session("second")

        sessions.claim(ada, first)

        assertTrue(sessions.heldByAnother(ada, second))

        assertNull(first.outbound.tryReceive().getOrNull())
    }

    @Test
    fun `heldByAnother is false for the session that already holds the account`() {
        val only = session("only")

        sessions.claim(ada, only)

        assertTrue(!sessions.heldByAnother(ada, only))
    }

    @Test
    fun `holderHasActiveGame is false for a session that never logged in`() = runBlocking {
        val only = session("only")
        sessions.claim(ada, only)

        assertTrue(!sessions.holderHasActiveGame(ada))
    }

    @Test
    fun `holderHasActiveGame is false when nobody holds the account`() = runBlocking {
        assertTrue(!sessions.holderHasActiveGame(ada))
    }

    @Test
    fun `claim returns the evicted session, or null when there was none to evict`() {
        val first = session("first")
        val second = session("second")

        assertNull(sessions.claim(ada, first), "nobody held the account yet")
        assertSame(first, sessions.claim(ada, second), "second evicted first")
    }

    @Test
    fun `awaitClosed resumes only after close runs`() = runBlocking {
        val only = session("only")
        var resumed = false

        val waiter = launch { only.awaitClosed(); resumed = true }
        yield()
        assertTrue(!resumed, "close() has not run yet")

        only.close()
        waiter.join()

        assertTrue(resumed)
    }

    @Test
    fun `rejoinKnownSeat before any login sends nothing`() {
        val only = session("only")

        only.rejoinKnownSeat()

        assertNull(only.outbound.tryReceive().getOrNull())
    }
}
