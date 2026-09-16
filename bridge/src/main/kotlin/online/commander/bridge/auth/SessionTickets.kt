package online.commander.bridge.auth

import java.security.MessageDigest
import java.time.Duration
import java.time.Instant
import java.util.Base64
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

class SessionTickets(
    secret: String,
    private val lifetime: Duration = Duration.ofDays(30),
) {

    private val key = SecretKeySpec(secret.toByteArray(Charsets.UTF_8), ALGORITHM)

    sealed interface Verdict {
        data class Valid(val accountId: String) : Verdict
        object Expired : Verdict
        object Invalid : Verdict
    }

    fun mint(accountId: String, now: Instant = Instant.now()): String {
        val payload = "$VERSION$SEPARATOR$accountId$SEPARATOR${now.plus(lifetime).epochSecond}"
        val bytes = payload.toByteArray(Charsets.UTF_8)
        return encode(bytes) + DOT + encode(sign(bytes))
    }

    fun verify(ticket: String, now: Instant = Instant.now()): Verdict {
        val dot = ticket.indexOf(DOT)
        if (dot <= 0 || dot == ticket.length - 1) return Verdict.Invalid

        val payload = decode(ticket.substring(0, dot)) ?: return Verdict.Invalid
        val signature = decode(ticket.substring(dot + 1)) ?: return Verdict.Invalid
        if (!MessageDigest.isEqual(sign(payload), signature)) return Verdict.Invalid

        val parts = String(payload, Charsets.UTF_8).split(SEPARATOR)
        if (parts.size != 3 || parts[0] != VERSION) return Verdict.Invalid
        val accountId = parts[1].ifEmpty { return Verdict.Invalid }
        val expiry = parts[2].toLongOrNull() ?: return Verdict.Invalid

        return if (now.epochSecond >= expiry) Verdict.Expired else Verdict.Valid(accountId)
    }

    private fun sign(payload: ByteArray): ByteArray =
        Mac.getInstance(ALGORITHM).apply { init(key) }.doFinal(payload)

    private fun encode(bytes: ByteArray): String = ENCODER.encodeToString(bytes)

    private fun decode(text: String): ByteArray? =
        try {
            DECODER.decode(text)
        } catch (e: IllegalArgumentException) {
            null
        }

    private companion object {
        const val ALGORITHM = "HmacSHA256"
        const val VERSION = "1"
        const val SEPARATOR = ":"
        const val DOT = '.'

        val ENCODER: Base64.Encoder = Base64.getUrlEncoder().withoutPadding()
        val DECODER: Base64.Decoder = Base64.getUrlDecoder()
    }
}
