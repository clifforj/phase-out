package online.commander.bridge.auth

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import online.commander.bridge.FailureCodes
import org.slf4j.LoggerFactory
import java.math.BigInteger
import java.net.HttpURLConnection
import java.net.URL
import java.security.KeyFactory
import java.security.PublicKey
import java.security.Signature
import java.security.spec.RSAPublicKeySpec
import java.time.Duration
import java.time.Instant
import java.util.Base64

class GoogleIdTokenVerifier(
    private val clientId: String,
    private val clock: () -> Instant = Instant::now,
    private val skew: Duration = Duration.ofSeconds(60),
    private val keySource: JwksKeySource = HttpJwksKeySource(),
) : TokenVerifier {

    private val log = LoggerFactory.getLogger("bridge.auth.google")

    override fun verify(token: String): VerifiedIdentity {
        if (token.length > MAX_TOKEN_CHARS) {
            reject("google token is ${token.length} characters, over the $MAX_TOKEN_CHARS limit")
        }

        val parts = token.split('.')
        if (parts.size != 3 || parts.any { it.isEmpty() }) {
            reject("a google token has three non-empty dot-separated parts, not ${parts.size}")
        }
        val header = parts[0].decodeJsonObject("header")
        val signature = parts[2].decodeBase64Url("signature")

        if (header.string("alg") != ALGORITHM_NAME) {
            reject("google token header alg ${header.string("alg")} is not $ALGORITHM_NAME")
        }
        val kid = header.string("kid") ?: reject("google token header has no kid")
        val key = keySource.key(kid) ?: reject("google token names kid $kid, which this project's JWKS does not have")

        val signingInput = (parts[0] + "." + parts[1]).toByteArray(Charsets.US_ASCII)
        if (!verifySignature(key, signingInput, signature)) {
            reject("google token signature does not verify against Google's published key")
        }

        val claims = parts[1].decodeJsonObject("payload")
        return checkClaims(claims)
    }

    private fun checkClaims(claims: JsonObject): VerifiedIdentity {
        val iss = claims.string("iss")
        if (iss != ISSUER && iss != ISSUER_NO_SCHEME) {
            reject("google token iss $iss is not a recognised Google issuer")
        }

        if (claims.string("aud") != clientId) {
            reject("google token aud is not this bridge's configured client id")
        }

        val now = clock()
        val exp = claims.epochSeconds("exp") ?: reject("google token has no usable exp")
        if (!now.minus(skew).isBefore(exp)) {
            throw AuthFailure(FailureCodes.AUTH_EXPIRED, "this session has expired; sign in again")
        }
        val iat = claims.epochSeconds("iat") ?: reject("google token has no usable iat")
        if (iat.isAfter(now.plus(skew))) {
            reject("google token iat is in the future")
        }

        val subject = claims.string("sub")?.takeIf { it.isNotBlank() }
            ?: reject("google token has no sub, and sub is the account key")

        val emailVerified = claims["email_verified"]?.let { it as? JsonPrimitive }?.content == "true"
        val email = claims.string("email")?.takeIf { it.isNotBlank() && emailVerified }?.lowercase()

        log.info("verified google token for sub {}", subject)
        return VerifiedIdentity(
            provider = PROVIDER,
            subject = subject,
            email = email,
            emailVerified = emailVerified,
            displayName = claims.string("name")?.takeIf { it.isNotBlank() },
        )
    }

    private fun verifySignature(key: PublicKey, signingInput: ByteArray, signature: ByteArray): Boolean =
        Signature.getInstance("SHA256withRSA").apply {
            initVerify(key)
            update(signingInput)
        }.verify(signature)

    private fun String.decodeBase64Url(what: String): ByteArray =
        try {
            DECODER.decode(this)
        } catch (e: IllegalArgumentException) {
            reject("google token $what is not base64url")
        }

    private fun String.decodeJsonObject(what: String): JsonObject =
        try {
            JSON.parseToJsonElement(String(decodeBase64Url(what), Charsets.UTF_8)) as? JsonObject
                ?: reject("google token $what is not a JSON object")
        } catch (e: kotlinx.serialization.SerializationException) {
            reject("google token $what is not JSON")
        }

    private fun reject(reason: String): Nothing {
        log.info("rejected a google token: {}", reason)
        throw AuthFailure(FailureCodes.AUTH_REJECTED, "this sign-in could not be verified")
    }

    private companion object {
        const val PROVIDER = "google"
        const val ALGORITHM_NAME = "RS256"
        const val ISSUER = "https://accounts.google.com"
        const val ISSUER_NO_SCHEME = "accounts.google.com"

        const val MAX_TOKEN_CHARS = 16 * 1024

        val JSON = Json { ignoreUnknownKeys = true }
        val DECODER: Base64.Decoder = Base64.getUrlDecoder()

        fun JsonObject.string(name: String): String? =
            (this[name] as? JsonPrimitive)?.takeIf { it.isString }?.content

        fun JsonObject.epochSeconds(name: String): Instant? =
            (this[name] as? JsonPrimitive)?.content?.toLongOrNull()?.let(Instant::ofEpochSecond)
    }
}

fun interface JwksKeySource {

    fun key(kid: String): PublicKey?
}

class HttpJwksKeySource(
    private val jwksUrl: String = DEFAULT_JWKS_URL,
    private val clock: () -> Instant = Instant::now,
    private val minRefetchInterval: Duration = Duration.ofMinutes(10),
) : JwksKeySource {

    private val log = LoggerFactory.getLogger("bridge.auth.google.jwks")
    @Volatile private var cached: Map<String, PublicKey> = emptyMap()
    @Volatile private var fetchedAt: Instant = Instant.EPOCH

    override fun key(kid: String): PublicKey? {
        val keys = cached
        if (kid in keys) return keys[kid]
        if (Duration.between(fetchedAt, clock()) < minRefetchInterval) return keys[kid]
        return synchronized(this) {
            if (Duration.between(fetchedAt, clock()) < minRefetchInterval) return@synchronized cached[kid]
            refetch()
            cached[kid]
        }
    }

    private fun refetch() {
        try {
            cached = fetchKeys()
            fetchedAt = clock()
        } catch (e: Exception) {

            log.warn("could not refresh Google's JWKS: {}", e.message)
            fetchedAt = clock()
        }
    }

    private fun fetchKeys(): Map<String, PublicKey> {
        val connection = URL(jwksUrl).openConnection() as HttpURLConnection
        connection.connectTimeout = CONNECT_TIMEOUT_MS
        connection.readTimeout = READ_TIMEOUT_MS
        val body = try {
            connection.inputStream.use { it.readBytes() }
        } finally {
            connection.disconnect()
        }
        val keys = (JSON.parseToJsonElement(String(body, Charsets.UTF_8)) as JsonObject)["keys"] as? JsonArray
            ?: return emptyMap()
        return keys.mapNotNull { it as? JsonObject }
            .mapNotNull { jwk ->
                val kid = jwk.string("kid") ?: return@mapNotNull null
                val key = jwk.toRsaPublicKey() ?: return@mapNotNull null
                kid to key
            }
            .toMap()
    }

    private fun JsonObject.toRsaPublicKey(): PublicKey? {
        val n = string("n") ?: return null
        val e = string("e") ?: return null
        val modulus = BigInteger(1, DECODER.decode(n))
        val exponent = BigInteger(1, DECODER.decode(e))
        return KeyFactory.getInstance("RSA").generatePublic(RSAPublicKeySpec(modulus, exponent))
    }

    private companion object {
        const val DEFAULT_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
        const val CONNECT_TIMEOUT_MS = 5_000
        const val READ_TIMEOUT_MS = 5_000

        val JSON = Json { ignoreUnknownKeys = true }
        val DECODER: Base64.Decoder = Base64.getUrlDecoder()

        fun JsonObject.string(name: String): String? =
            (this[name] as? JsonPrimitive)?.takeIf { it.isString }?.content
    }
}
