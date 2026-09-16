package online.commander.bridge.auth

import java.time.Duration
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNotEquals

class SessionTicketsTest {

    private val secret = "correct horse battery staple"
    private val tickets = SessionTickets(secret)
    private val account = "8f14e45f-ceea-467a-9d0f-1a2b3c4d5e6f"
    private val now: Instant = Instant.parse("2026-07-31T12:00:00Z")

    @Test
    fun `a freshly minted ticket names the account that was minted into it`() {
        val verdict = tickets.verify(tickets.mint(account, now), now)
        assertEquals(SessionTickets.Verdict.Valid(account), verdict)
    }

    @Test
    fun `a ticket survives the whole thirty days and dies on the last second`() {
        val ticket = tickets.mint(account, now)
        assertIs<SessionTickets.Verdict.Valid>(tickets.verify(ticket, now.plus(Duration.ofDays(29))))
        assertEquals(
            SessionTickets.Verdict.Expired,
            tickets.verify(ticket, now.plus(Duration.ofDays(30))),
            "the boundary is the one moment worth pinning down",
        )
    }

    @Test
    fun `a payload edited to name a different account is rejected`() {
        val forged = repack(tickets.mint(account, now)) { it.replace(account, "victim-account-id") }
        assertEquals(SessionTickets.Verdict.Invalid, tickets.verify(forged, now))
    }

    @Test
    fun `a payload edited to extend the expiry is rejected`() {
        val ticket = tickets.mint(account, now)
        val forged = repack(ticket) { payload ->
            payload.substringBeforeLast(':') + ":" + now.plus(Duration.ofDays(3650)).epochSecond
        }
        assertNotEquals(ticket, forged, "the test is worthless if the payload came out unchanged")
        assertEquals(SessionTickets.Verdict.Invalid, tickets.verify(forged, now))
    }

    @Test
    fun `a tampered signature is rejected`() {
        val ticket = tickets.mint(account, now)
        val signature = ticket.substringAfter('.')
        val flipped = ticket.substringBefore('.') + "." +
            (if (signature.first() == 'A') 'B' else 'A') + signature.drop(1)
        assertEquals(SessionTickets.Verdict.Invalid, tickets.verify(flipped, now))
    }

    @Test
    fun `a ticket minted under a different secret is rejected`() {
        val theirs = SessionTickets("some other secret").mint(account, now)
        assertEquals(SessionTickets.Verdict.Invalid, tickets.verify(theirs, now))
        assertIs<SessionTickets.Verdict.Valid>(SessionTickets(secret).verify(tickets.mint(account, now), now))
    }

    @Test
    fun `garbage is rejected rather than thrown`() {
        val garbage = listOf(
            "",
            ".",
            "a.",
            ".a",
            "no-dot-at-all",
            "!!!.!!!",
            "1:$account:9999999999",
            tickets.mint(account, now).replace(".", ""),
        )
        for (text in garbage) {
            assertEquals(SessionTickets.Verdict.Invalid, tickets.verify(text, now), "'$text' was not rejected")
        }
    }

    @Test
    fun `minting is deterministic for a given account and second`() {
        assertEquals(tickets.mint(account, now), tickets.mint(account, now))
        assertNotEquals(tickets.mint(account, now), tickets.mint(account, now.plusSeconds(1)))
    }

    private fun repack(ticket: String, edit: (String) -> String): String {
        val decoder = java.util.Base64.getUrlDecoder()
        val encoder = java.util.Base64.getUrlEncoder().withoutPadding()
        val payload = String(decoder.decode(ticket.substringBefore('.')), Charsets.UTF_8)
        return encoder.encodeToString(edit(payload).toByteArray(Charsets.UTF_8)) +
            "." + ticket.substringAfter('.')
    }
}
