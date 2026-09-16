package online.commander.bridge.identity

data class ProviderIdentity(
    val provider: String,
    val subject: String,
    val displayName: String?,
    val email: String?,
)

interface AccountStore {

    fun byId(id: String): Account?

    fun byProviderSubject(provider: String, subject: String): Account?

    fun byEmail(email: String): Account?

    fun migrateToProvider(id: String, provider: String, subject: String): Account?

    fun createFor(identity: ProviderIdentity, now: Long = System.currentTimeMillis()): Account

    fun touch(
        id: String,
        displayName: String?,
        email: String?,
        now: Long = System.currentTimeMillis(),
    ): Account?

    fun setPlayerName(id: String, playerName: String): Account?
}
