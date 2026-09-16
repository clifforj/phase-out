package online.commander.bridge.identity

import java.util.UUID

class InMemoryAccountStore : AccountStore {

    private val accounts = LinkedHashMap<String, Account>()

    override fun byId(id: String): Account? = synchronized(this) { accounts[id] }

    override fun byProviderSubject(provider: String, subject: String): Account? =
        synchronized(this) {
            accounts.values.firstOrNull { it.provider == provider && it.subject == subject }
        }

    override fun createFor(identity: ProviderIdentity, now: Long): Account = synchronized(this) {
        check(byProviderSubject(identity.provider, identity.subject) == null) {
            "an account already exists for ${identity.provider}/${identity.subject}"
        }

        val taken = accounts.values.mapTo(HashSet()) { it.handle }
        var handle = Handles.generate()
        var attempts = 1
        while (handle in taken) {
            check(attempts < MAX_HANDLE_ATTEMPTS) {
                "could not generate a free handle after $MAX_HANDLE_ATTEMPTS tries"
            }
            handle = Handles.generate()
            attempts++
        }

        val account = Account(
            id = UUID.randomUUID().toString(),
            provider = identity.provider,
            subject = identity.subject,
            handle = handle,
            playerName = identity.displayName?.takeIf { it.isNotBlank() } ?: "Player",
            displayName = identity.displayName,
            email = identity.email,
            createdAt = now,
            lastSeenAt = now,
        )
        accounts[account.id] = account
        account
    }

    override fun byEmail(email: String): Account? = synchronized(this) {
        val matches = accounts.values.filter { it.email == email }
        matches.singleOrNull()
    }

    override fun migrateToProvider(id: String, provider: String, subject: String): Account? =
        synchronized(this) {
            val existing = accounts[id] ?: return null
            val updated = existing.copy(provider = provider, subject = subject)
            accounts[id] = updated
            updated
        }

    override fun touch(id: String, displayName: String?, email: String?, now: Long): Account? =
        synchronized(this) {
            val existing = accounts[id] ?: return null
            val updated = existing.copy(
                displayName = displayName ?: existing.displayName,
                email = email ?: existing.email,
                lastSeenAt = now,
            )
            accounts[id] = updated
            updated
        }

    override fun setPlayerName(id: String, playerName: String): Account? = synchronized(this) {
        val existing = accounts[id] ?: return null
        val updated = existing.copy(playerName = playerName)
        accounts[id] = updated
        updated
    }

    private companion object {
        const val MAX_HANDLE_ATTEMPTS = 10
    }
}
