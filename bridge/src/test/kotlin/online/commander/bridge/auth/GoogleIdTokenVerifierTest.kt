package online.commander.bridge.auth

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import online.commander.bridge.FailureCodes
import java.security.KeyPairGenerator
import java.security.PrivateKey
import java.security.PublicKey
import java.security.Signature
import java.time.Instant
import java.util.Base64
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

class GoogleIdTokenVerifierTest {

    private var now: Instant = Instant.parse("2026-08-01T12:00:00Z")
    private val keyPair = KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair()
    private val otherKeyPair = KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair()

    private fun verifier(clientId: String = CLIENT_ID, keys: Map<String, PublicKey> = mapOf(KID to keyPair.public)) =
        GoogleIdTokenVerifier(clientId, clock = { now }, keySource = JwksKeySource { kid -> keys[kid] })

    @Test
    fun `a well-formed google token verifies`() {
        val identity = verifier().verify(token())

        assertEquals("google", identity.provider)
        assertEquals(SUBJECT, identity.subject)
        assertEquals("player@example.com", identity.email)
        assertTrue(identity.emailVerified)
        assertEquals("Example Player", identity.displayName)
    }

    @Test
    fun `a token with no email and no name still verifies`() {
        val identity = verifier().verify(
            token(claims = claims("email" to null, "email_verified" to null, "name" to null)),
        )
        assertEquals(SUBJECT, identity.subject)
        assertNull(identity.email)
        assertNull(identity.displayName)
    }

    @Test
    fun `an unverified email is dropped from the identity but does not itself refuse the sign-in`() {
        val identity = verifier().verify(token(claims = claims("email_verified" to JsonPrimitive(false))))

        assertEquals(false, identity.emailVerified)
        assertNull(identity.email, "an unverified address must never reach an allow-list check")
        assertEquals(SUBJECT, identity.subject)
    }

    @Test
    fun `a verified email is lowercased so an allow-list comparison is a set membership`() {
        val identity = verifier().verify(token(claims = claims("email" to JsonPrimitive("Player@Example.COM"))))
        assertEquals("player@example.com", identity.email)
    }

    @Test
    fun `an oversized token is refused before it is parsed`() {
        assertRejected("a".repeat(16 * 1024 + 1))
    }

    @Test
    fun `a token that is not three parts is refused`() {
        val good = token()
        assertRejected("")
        assertRejected(good.substringBeforeLast('.'))
        assertRejected("$good.extra")
        assertRejected(good.replaceFirst(".", ".."), "an empty middle part is not a payload")
    }

    @Test
    fun `a part that is not base64url is refused`() {
        val parts = token().split('.')
        assertRejected("!!!not-base64!!!.${parts[1]}.${parts[2]}")
        assertRejected("${parts[0]}.${parts[1]}.!!!not-base64!!!")
    }

    @Test
    fun `a header that decodes to something other than a json object is refused`() {
        val parts = token().split('.')
        assertRejected("${b64("[\"not\",\"an\",\"object\"]")}.${parts[1]}.${parts[2]}")
        assertRejected("${b64("not json at all")}.${parts[1]}.${parts[2]}")
    }

    @Test
    fun `alg none is refused`() {
        val head = b64(JsonObject(header("alg" to JsonPrimitive("none"))).toString())
        val body = b64(JsonObject(claims()).toString())
        assertRejected("$head.$body.")
        assertRejected("$head.$body.${b64("")}")
        assertRejected(token(header = header("alg" to JsonPrimitive("none"))))
    }

    @Test
    fun `a header alg other than RS256 is refused`() {
        assertRejected(token(header = header("alg" to JsonPrimitive("HS256"))))
        assertRejected(token(header = header("alg" to null)))
    }

    @Test
    fun `an unknown kid is refused`() {
        assertRejected(token(header = header("kid" to JsonPrimitive("some-other-kid"))))
        assertRejected(token(header = header("kid" to null)))
    }

    @Test
    fun `a signature under a different key is refused`() {
        assertRejected(token(sign = { input -> sign(input, otherKeyPair.private) }))
    }

    @Test
    fun `a payload swapped under a good signature is refused`() {
        val parts = token().split('.')
        val forged = b64(JsonObject(claims("sub" to JsonPrimitive("somebody-else"))).toString())
        assertRejected("${parts[0]}.$forged.${parts[2]}")
    }

    @Test
    fun `a re-serialised payload does not verify against the original signature`() {
        val parts = token().split('.')
        val original = String(Base64.getUrlDecoder().decode(parts[1]), Charsets.UTF_8)
        val respaced = original.replace(":", ": ")
        assertRejected("${parts[0]}.${b64(respaced)}.${parts[2]}")
    }

    @Test
    fun `both forms of google's issuer are accepted`() {
        assertEquals(SUBJECT, verifier().verify(token(claims = claims("iss" to JsonPrimitive("accounts.google.com")))).subject)
        assertEquals(
            SUBJECT,
            verifier().verify(token(claims = claims("iss" to JsonPrimitive("https://accounts.google.com")))).subject,
        )
    }

    @Test
    fun `an issuer that is not google is refused`() {
        assertRejected(token(claims = claims("iss" to JsonPrimitive("https://evil.example.com"))))
        assertRejected(token(claims = claims("iss" to null)))
    }

    @Test
    fun `an aud for a different oauth client is refused`() {
        assertRejected(token(claims = claims("aud" to JsonPrimitive("some-other-client.apps.googleusercontent.com"))))
        assertRejected(token(claims = claims("aud" to null)))
    }

    @Test
    fun `an expired token is refused as expired, not rejected`() {
        val expired = token(claims = claims("exp" to JsonPrimitive(now.minusSeconds(3600).epochSecond)))
        assertEquals(FailureCodes.AUTH_EXPIRED, assertFailsWith<AuthFailure> { verifier().verify(expired) }.code)
    }

    @Test
    fun `a token expiring inside the skew window is still accepted`() {
        val justExpired = token(claims = claims("exp" to JsonPrimitive(now.minusSeconds(30).epochSecond)))
        assertEquals(SUBJECT, verifier().verify(justExpired).subject)

        val wellExpired = token(claims = claims("exp" to JsonPrimitive(now.minusSeconds(90).epochSecond)))
        assertEquals(
            FailureCodes.AUTH_EXPIRED,
            assertFailsWith<AuthFailure> { verifier().verify(wellExpired) }.code,
            "the skew is a minute, not an hour",
        )
    }

    @Test
    fun `a token issued in the future is refused`() {
        assertRejected(token(claims = claims("iat" to JsonPrimitive(now.plusSeconds(3600).epochSecond))))
        assertRejected(token(claims = claims("iat" to null)))
        assertRejected(token(claims = claims("exp" to null)))
        assertRejected(token(claims = claims("exp" to JsonPrimitive("not a number"))))
    }

    @Test
    fun `a token with no sub is refused`() {
        assertRejected(token(claims = claims("sub" to null)))
        assertRejected(token(claims = claims("sub" to JsonPrimitive(""))))
        assertRejected(token(claims = claims("sub" to JsonPrimitive("   "))))
    }

    @Test
    fun `an email is never a substitute for a sub`() {
        assertRejected(token(claims = claims("sub" to null, "email" to JsonPrimitive("player@example.com"))))
    }

    @Test
    fun `the verifier has no allow-list of its own`() {
        val identity = verifier().verify(token(claims = claims("email" to JsonPrimitive("stranger@nowhere.test"))))
        assertEquals("stranger@nowhere.test", identity.email)
    }

    private fun assertRejected(token: String, message: String? = null) {
        val failure = assertFailsWith<AuthFailure>(message) { verifier().verify(token) }
        assertEquals(FailureCodes.AUTH_REJECTED, failure.code, message ?: "should be authRejected")
        assertTrue(
            token.isEmpty() || token !in (failure.message ?: ""),
            "a failure message must never carry the token back",
        )
    }

    private fun header(vararg overrides: Pair<String, JsonElement?>) =
        mutableMapOf<String, JsonElement>(
            "alg" to JsonPrimitive("RS256"),
            "typ" to JsonPrimitive("JWT"),
            "kid" to JsonPrimitive(KID),
        ).applyOverrides(overrides)

    private fun claims(vararg overrides: Pair<String, JsonElement?>) =
        mutableMapOf<String, JsonElement>(
            "iss" to JsonPrimitive("https://accounts.google.com"),
            "aud" to JsonPrimitive(CLIENT_ID),
            "sub" to JsonPrimitive(SUBJECT),
            "email" to JsonPrimitive("player@example.com"),
            "email_verified" to JsonPrimitive(true),
            "name" to JsonPrimitive("Example Player"),
            "iat" to JsonPrimitive(now.epochSecond),
            "exp" to JsonPrimitive(now.plusSeconds(3600).epochSecond),
        ).applyOverrides(overrides)

    private fun MutableMap<String, JsonElement>.applyOverrides(
        overrides: Array<out Pair<String, JsonElement?>>,
    ): Map<String, JsonElement> {
        for ((name, value) in overrides) {
            if (value == null) remove(name) else put(name, value)
        }
        return this
    }

    private fun token(
        header: Map<String, JsonElement> = header(),
        claims: Map<String, JsonElement> = claims(),
        sign: (ByteArray) -> ByteArray = { input -> sign(input, keyPair.private) },
    ): String {
        val signingInput = b64(JsonObject(header).toString()) + "." + b64(JsonObject(claims).toString())
        return signingInput + "." + b64ofBytes(sign(signingInput.toByteArray(Charsets.US_ASCII)))
    }

    private companion object {
        const val CLIENT_ID = "client-1.apps.googleusercontent.com"
        const val KID = "kid-1"
        const val SUBJECT = "108234982374982374982"

        fun sign(input: ByteArray, key: PrivateKey): ByteArray =
            Signature.getInstance("SHA256withRSA").apply {
                initSign(key)
                update(input)
            }.sign()

        fun b64(text: String): String = b64ofBytes(text.toByteArray(Charsets.UTF_8))

        fun b64ofBytes(bytes: ByteArray): String =
            Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }
}
