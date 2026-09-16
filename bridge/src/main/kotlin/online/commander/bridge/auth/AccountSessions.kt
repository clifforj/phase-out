package online.commander.bridge.auth

import online.commander.bridge.BridgeSession
import online.commander.bridge.Failure
import online.commander.bridge.FailureCodes
import org.slf4j.LoggerFactory
import java.util.concurrent.ConcurrentHashMap

class AccountSessions {

    private val log = LoggerFactory.getLogger("bridge.auth.sessions")

    private val live = ConcurrentHashMap<String, BridgeSession>()

    fun claim(accountId: String, session: BridgeSession): BridgeSession? {
        val previous = live.put(accountId, session)
        if (previous == null || previous === session) return null
        log.info(
            "account {} claimed by session {}; evicting session {}",
            accountId, session.id, previous.id,
        )
        previous.endWith(
            Failure(
                action = "login",
                reason = "this account was opened in another tab",
                code = FailureCodes.SESSION_TAKEN_OVER,
            )
        )
        return previous
    }

    fun release(session: BridgeSession) {
        live.entries.removeIf { it.value === session }
    }

    fun sessionFor(accountId: String): BridgeSession? = live[accountId]

    suspend fun holderHasActiveGame(accountId: String): Boolean =
        live[accountId]?.hasActiveGame() ?: false

    fun heldByAnother(accountId: String, session: BridgeSession): Boolean {
        val holder = live[accountId] ?: return false
        return holder !== session
    }

    val size: Int get() = live.size
}
