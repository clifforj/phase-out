package online.commander.bridge.auth

data class VerifiedIdentity(
    val provider: String,
    val subject: String,
    val email: String?,
    val emailVerified: Boolean,
    val displayName: String?,
)

interface TokenVerifier {

    fun verify(token: String): VerifiedIdentity
}
