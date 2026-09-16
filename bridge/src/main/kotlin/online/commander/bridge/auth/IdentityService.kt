package online.commander.bridge.auth

import online.commander.bridge.FailureCodes
import online.commander.bridge.Login
import online.commander.bridge.identity.Account
import online.commander.bridge.identity.AccountStore
import online.commander.bridge.identity.ProviderIdentity
import org.slf4j.LoggerFactory

class AuthFailure(val code: String, message: String) : Exception(message)

class IdentityService(
    private val mode: AuthMode,
    private val accounts: AccountStore,

    private val tickets: SessionTickets?,

    private val verifier: TokenVerifier? = null,

    private val allowedEmails: Set<String> = emptySet(),
) {

    private val log = LoggerFactory.getLogger("bridge.auth.identity")

    val requiresAccount: Boolean get() = mode == AuthMode.REQUIRED

    init {
        check(mode != AuthMode.REQUIRED || tickets != null) {
            "auth mode required needs a ticket secret; Config.authStartupError should have caught this"
        }
        check(mode != AuthMode.REQUIRED || verifier != null) {
            "auth mode required needs a token verifier; Config.authStartupError should have caught this"
        }
    }

    sealed interface Resolution {

        data class Anonymous(val name: String) : Resolution

        data class Authenticated(val account: Account, val sessionToken: String) : Resolution
    }

    fun resolve(login: Login, fallbackName: String): Resolution {
        if (mode == AuthMode.OFF) {
            return Resolution.Anonymous(login.userName?.takeIf { it.isNotBlank() } ?: fallbackName)
        }

        val googleToken = login.googleToken?.takeIf { it.isNotBlank() }
        val sessionToken = login.sessionToken?.takeIf { it.isNotBlank() }

        return when {
            googleToken != null -> fromIdToken(googleToken)
            sessionToken != null -> fromTicket(sessionToken)
            else -> throw AuthFailure(
                FailureCodes.AUTH_REQUIRED,
                "this bridge requires a signed-in account; send a googleToken or a sessionToken",
            )
        }
    }

    fun setPlayerName(accountId: String, playerName: String): Account? {
        val trimmed = playerName.trim()
        require(trimmed.isNotEmpty() && trimmed.length <= MAX_PLAYER_NAME_LENGTH) {
            "a player name must be 1-$MAX_PLAYER_NAME_LENGTH characters after trimming"
        }
        return accounts.setPlayerName(accountId, trimmed)
    }

    fun accountIdForTicket(ticket: String): String? {
        val signer = tickets ?: return null
        return (signer.verify(ticket) as? SessionTickets.Verdict.Valid)?.accountId
    }

    private fun fromTicket(ticket: String): Resolution {
        val signer = requireNotNull(tickets) { "no ticket secret" }
        val accountId = when (val verdict = signer.verify(ticket)) {
            is SessionTickets.Verdict.Valid -> verdict.accountId
            SessionTickets.Verdict.Expired -> throw AuthFailure(
                FailureCodes.AUTH_EXPIRED,
                "this session has expired; sign in again",
            )
            SessionTickets.Verdict.Invalid -> throw AuthFailure(
                FailureCodes.AUTH_REJECTED,
                "this session token is not one this bridge issued",
            )
        }

        val account = accounts.touch(accountId, null, null)
            ?: throw AuthFailure(
                FailureCodes.AUTH_REJECTED,
                "this session token names an account that no longer exists",
            )
        return authenticated(account)
    }

    private fun fromIdToken(idToken: String): Resolution {
        val verified = requireNotNull(verifier) {
            "no token verifier"
        }.verify(idToken)

        if (allowedEmails.isNotEmpty() && verified.email !in allowedEmails) {
            log.info(
                "refused {} sub {}: not on BRIDGE_ALLOWED_EMAILS (email verified: {})",
                verified.provider, verified.subject, verified.emailVerified,
            )
            throw AuthFailure(
                FailureCodes.AUTH_REJECTED,
                "this account is not on this bridge's allow-list",
            )
        }

        val existing = accounts.byProviderSubject(verified.provider, verified.subject)
        val account = if (existing == null) {

            val migratable = verified.email?.let(accounts::byEmail)
            if (migratable != null) {
                accounts.migrateToProvider(migratable.id, verified.provider, verified.subject)
                    ?.also { log.info("migrated account {} from google to {}", it.id, verified.provider) }
                    ?: throw AuthFailure(
                        FailureCodes.AUTH_REJECTED,
                        "this account no longer exists",
                    )
            } else {
                accounts.createFor(
                    ProviderIdentity(
                        provider = verified.provider,
                        subject = verified.subject,
                        displayName = verified.displayName,
                        email = verified.email,
                    ),
                ).also { log.info("created account {} with handle {}", it.id, it.handle) }
            }
        } else {
            accounts.touch(existing.id, verified.displayName, verified.email)
                ?: throw AuthFailure(
                    FailureCodes.AUTH_REJECTED,
                    "this account no longer exists",
                )
        }
        return authenticated(account)
    }

    private fun authenticated(account: Account): Resolution.Authenticated =
        Resolution.Authenticated(
            account = account,
            sessionToken = requireNotNull(tickets) { "no ticket secret" }.mint(account.id),
        )

    private companion object {
        const val MAX_PLAYER_NAME_LENGTH = 40
    }
}
