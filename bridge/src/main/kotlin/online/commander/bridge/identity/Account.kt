package online.commander.bridge.identity

data class Account(
    val id: String,
    val provider: String,
    val subject: String,
    val handle: String,
    val playerName: String,
    val displayName: String?,
    val email: String?,
    val createdAt: Long,
    val lastSeenAt: Long,
)
