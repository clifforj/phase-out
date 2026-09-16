package online.commander.bridge.auth

import online.commander.bridge.FailureCodes
import online.commander.bridge.Login
import online.commander.bridge.identity.Handles
import online.commander.bridge.identity.InMemoryAccountStore
import online.commander.bridge.identity.ProviderIdentity
import java.time.Duration
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertIs
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class IdentityServiceTest {

    private val secret = "correct horse battery staple"
    private val tickets = SessionTickets(secret)
    private val fallback = "web-a3f9c2"

    private class FakeVerifier(private val answer: (String) -> VerifiedIdentity) : TokenVerifier {
        var calls = 0
            private set

        override fun verify(token: String): VerifiedIdentity {
            calls++
            return answer(token)
        }
    }

    private fun googleIdentity(
        subject: String = "sub-1",
        email: String? = "j@x.com",
        emailVerified: Boolean = true,
        displayName: String? = "Example Player",
    ) = VerifiedIdentity("google", subject, email, emailVerified, displayName)

    private val verifier = FakeVerifier { googleIdentity() }

    private fun service(
        mode: AuthMode,
        accounts: InMemoryAccountStore = InMemoryAccountStore(),
        signer: SessionTickets? = tickets,
        tokens: TokenVerifier? = verifier,
        allowedEmails: Set<String> = emptySet(),
    ) = IdentityService(mode, accounts, signer, tokens, allowedEmails)

    private fun account(accounts: InMemoryAccountStore, subject: String = "sub-1") =
        accounts.createFor(ProviderIdentity("google", subject, "Example Player", "j@x.com"))

    @Test
    fun `off mode resolves the name on the frame, exactly as v1`() {
        val resolved = service(AuthMode.OFF).resolve(Login(userName = "alice"), fallback)

        assertEquals(IdentityService.Resolution.Anonymous("alice"), resolved)
    }

    @Test
    fun `off mode falls back to the generated name when the frame carries none`() {
        val service = service(AuthMode.OFF)

        assertEquals(
            IdentityService.Resolution.Anonymous(fallback),
            service.resolve(Login(), fallback),
        )
        assertEquals(
            IdentityService.Resolution.Anonymous(fallback),
            service.resolve(Login(userName = "   "), fallback),
            "a blank name is no name; v1 treated it that way and so must this",
        )
    }

    @Test
    fun `off mode ignores a perfectly good ticket rather than half-honouring it`() {
        val accounts = InMemoryAccountStore()
        val existing = account(accounts)
        val service = service(AuthMode.OFF, accounts)

        val resolved = service.resolve(
            Login(userName = "alice", sessionToken = tickets.mint(existing.id)),
            fallback,
        )

        assertEquals(IdentityService.Resolution.Anonymous("alice"), resolved)
    }

    @Test
    fun `off mode needs neither a ticket secret nor a verifier`() {
        val service = service(AuthMode.OFF, signer = null, tokens = null)

        assertEquals(
            IdentityService.Resolution.Anonymous("alice"),
            service.resolve(Login(userName = "alice"), fallback),
        )
    }

    @Test
    fun `required mode refuses a login carrying no credential`() {
        val failure = assertFailsWith<AuthFailure> {
            service(AuthMode.REQUIRED).resolve(Login(userName = "alice"), fallback)
        }

        assertEquals(FailureCodes.AUTH_REQUIRED, failure.code)
    }

    @Test
    fun `a good ticket resolves to its account`() {
        val accounts = InMemoryAccountStore()
        val existing = account(accounts)

        val resolved = service(AuthMode.REQUIRED, accounts)
            .resolve(Login(sessionToken = tickets.mint(existing.id)), fallback)

        val authenticated = assertIs<IdentityService.Resolution.Authenticated>(resolved)
        assertEquals(existing.id, authenticated.account.id)
        assertEquals(existing.handle, authenticated.account.handle)
    }

    @Test
    fun `every login mints a fresh ticket`() {
        val accounts = InMemoryAccountStore()
        val existing = account(accounts)
        val service = service(AuthMode.REQUIRED, accounts)
        val old = tickets.mint(existing.id, Instant.now().minus(Duration.ofDays(20)))

        val resolved = assertIs<IdentityService.Resolution.Authenticated>(
            service.resolve(Login(sessionToken = old), fallback),
        )

        assertNotEquals(old, resolved.sessionToken)
        assertIs<SessionTickets.Verdict.Valid>(tickets.verify(resolved.sessionToken))
        assertIs<SessionTickets.Verdict.Expired>(

            tickets.verify(old, Instant.now().plus(Duration.ofDays(11))),
        )
    }

    @Test
    fun `required mode ignores the userName on the frame`() {
        val accounts = InMemoryAccountStore()
        val existing = account(accounts)

        val resolved = assertIs<IdentityService.Resolution.Authenticated>(
            service(AuthMode.REQUIRED, accounts).resolve(
                Login(userName = "someone_else", password = "hunter2", sessionToken = tickets.mint(existing.id)),
                fallback,
            ),
        )

        assertEquals(existing.handle, resolved.account.handle)
        assertNotEquals("someone_else", resolved.account.handle)
    }

    @Test
    fun `an expired ticket is authExpired, not authRejected`() {
        val accounts = InMemoryAccountStore()
        val existing = account(accounts)
        val stale = tickets.mint(existing.id, Instant.now().minus(Duration.ofDays(31)))

        val failure = assertFailsWith<AuthFailure> {
            service(AuthMode.REQUIRED, accounts).resolve(Login(sessionToken = stale), fallback)
        }

        assertEquals(
            FailureCodes.AUTH_EXPIRED,
            failure.code,
            "the two codes are opposite instructions to a reconnect loop, so they must not blur",
        )
    }

    @Test
    fun `a forged ticket is authRejected`() {
        val accounts = InMemoryAccountStore()
        val existing = account(accounts)
        val theirs = SessionTickets("some other secret").mint(existing.id)

        for (bad in listOf(theirs, "garbage", "not.aticket")) {
            val failure = assertFailsWith<AuthFailure>("'$bad' was not rejected") {
                service(AuthMode.REQUIRED, accounts).resolve(Login(sessionToken = bad), fallback)
            }
            assertEquals(FailureCodes.AUTH_REJECTED, failure.code)
        }
    }

    @Test
    fun `a ticket for an account that no longer exists is rejected`() {
        val failure = assertFailsWith<AuthFailure> {
            service(AuthMode.REQUIRED).resolve(
                Login(sessionToken = tickets.mint("deleted-account-id")),
                fallback,
            )
        }

        assertEquals(FailureCodes.AUTH_REJECTED, failure.code)
    }

    @Test
    fun `a first sign-in creates the account and returns a usable ticket`() {
        val accounts = InMemoryAccountStore()

        val resolved = assertIs<IdentityService.Resolution.Authenticated>(
            service(AuthMode.REQUIRED, accounts).resolve(Login(googleToken = "good.id.token"), fallback),
        )

        assertEquals("google", resolved.account.provider)
        assertEquals("sub-1", resolved.account.subject)
        assertTrue(Handles.PATTERN.matches(resolved.account.handle))
        assertEquals("Example Player", resolved.account.playerName, "seeded from the Google display name")
        assertEquals("j@x.com", resolved.account.email)
        assertIs<SessionTickets.Verdict.Valid>(tickets.verify(resolved.sessionToken))
        assertEquals(resolved.account.id, accounts.byProviderSubject("google", "sub-1")?.id)
    }

    @Test
    fun `a returning sign-in touches the same account and never regenerates the handle`() {
        val accounts = InMemoryAccountStore()
        val renamed = FakeVerifier { googleIdentity(displayName = "Someone Else Entirely") }
        val first = assertIs<IdentityService.Resolution.Authenticated>(
            service(AuthMode.REQUIRED, accounts).resolve(Login(googleToken = "good.id.token"), fallback),
        )

        val second = assertIs<IdentityService.Resolution.Authenticated>(
            service(AuthMode.REQUIRED, accounts, tokens = renamed)
                .resolve(Login(googleToken = "good.id.token"), fallback),
        )

        assertEquals(first.account.id, second.account.id, "a second row was created")
        assertEquals(first.account.handle, second.account.handle)
        assertEquals(
            "Someone Else Entirely",
            second.account.displayName,
            "touch should still refresh the chrome it is there to refresh",
        )
    }

    @Test
    fun `a google sign-in adopts the matching account left over from a retired provider, by email`() {
        val accounts = InMemoryAccountStore()
        val legacy = accounts.createFor(ProviderIdentity("supabase", "supabase-sub-1", "John", "j@x.com"))
        accounts.setPlayerName(legacy.id, "Banjo")

        val resolved = assertIs<IdentityService.Resolution.Authenticated>(
            service(AuthMode.REQUIRED, accounts).resolve(Login(googleToken = "good.id.token"), fallback),
        )

        assertEquals(legacy.id, resolved.account.id, "a new account was created instead of adopting the old one")
        assertEquals(legacy.handle, resolved.account.handle)
        assertEquals("Banjo", resolved.account.playerName)
        assertEquals("google", resolved.account.provider)
        assertEquals("sub-1", resolved.account.subject)
        assertEquals(null, accounts.byProviderSubject("supabase", "supabase-sub-1"), "the old row should be gone, not duplicated")
    }

    @Test
    fun `an ambiguous email match creates a fresh account rather than guessing`() {
        val accounts = InMemoryAccountStore()
        accounts.createFor(ProviderIdentity("supabase", "supabase-sub-1", "John", "j@x.com"))
        accounts.createFor(ProviderIdentity("supabase", "supabase-sub-2", "John Two", "j@x.com"))

        val resolved = assertIs<IdentityService.Resolution.Authenticated>(
            service(AuthMode.REQUIRED, accounts).resolve(Login(googleToken = "good.id.token"), fallback),
        )

        assertEquals("google", resolved.account.provider)
        assertEquals("sub-1", resolved.account.subject)
        assertEquals(2, listOf("supabase-sub-1", "supabase-sub-2").count {
            accounts.byProviderSubject("supabase", it) != null
        }, "both retired-provider rows should be untouched")
    }

    @Test
    fun `a token the verifier refuses is refused, and writes nothing`() {
        val accounts = InMemoryAccountStore()
        val verifier = FakeVerifier { throw AuthFailure(FailureCodes.AUTH_REJECTED, "no") }

        val failure = assertFailsWith<AuthFailure> {
            service(AuthMode.REQUIRED, accounts, tokens = verifier)
                .resolve(Login(googleToken = "bad.id.token"), fallback)
        }

        assertEquals(FailureCodes.AUTH_REJECTED, failure.code)
        assertEquals(null, accounts.byProviderSubject("google", "sub-1"), "a refused token created a row")
    }

    @Test
    fun `an expired idToken keeps its code`() {
        val verifier = FakeVerifier { throw AuthFailure(FailureCodes.AUTH_EXPIRED, "stale") }

        val failure = assertFailsWith<AuthFailure> {
            service(AuthMode.REQUIRED, tokens = verifier).resolve(Login(googleToken = "old.id.token"), fallback)
        }

        assertEquals(FailureCodes.AUTH_EXPIRED, failure.code)
    }

    @Test
    fun `an idToken wins over a ticket when both arrive`() {
        val accounts = InMemoryAccountStore()

        val other = accounts.createFor(ProviderIdentity("google", "sub-other", "Someone Else", "someone-else@x.com"))

        val resolved = assertIs<IdentityService.Resolution.Authenticated>(
            service(AuthMode.REQUIRED, accounts).resolve(
                Login(googleToken = "good.id.token", sessionToken = tickets.mint(other.id)),
                fallback,
            ),
        )

        assertNotEquals(other.id, resolved.account.id, "the ticket branch answered")
        assertEquals("sub-1", resolved.account.subject)
        assertEquals(1, verifier.calls)
    }

    @Test
    fun `off mode never calls the verifier`() {
        val verifier = FakeVerifier { error("the off path must not verify anything") }

        val resolved = service(AuthMode.OFF, tokens = verifier)
            .resolve(Login(userName = "alice", googleToken = "good.id.token"), fallback)

        assertEquals(IdentityService.Resolution.Anonymous("alice"), resolved)
        assertEquals(0, verifier.calls)
    }

    @Test
    fun `an allow-listed address signs in`() {
        val resolved = service(AuthMode.REQUIRED, allowedEmails = setOf("j@x.com", "friend@y.com"))
            .resolve(Login(googleToken = "good.id.token"), fallback)

        assertIs<IdentityService.Resolution.Authenticated>(resolved)
    }

    @Test
    fun `an address off the allow-list is rejected, and no account is created`() {
        val accounts = InMemoryAccountStore()

        val failure = assertFailsWith<AuthFailure> {
            service(AuthMode.REQUIRED, accounts, allowedEmails = setOf("friend@y.com"))
                .resolve(Login(googleToken = "good.id.token"), fallback)
        }

        assertEquals(FailureCodes.AUTH_REJECTED, failure.code)
        assertEquals(null, accounts.byProviderSubject("google", "sub-1"))
    }

    @Test
    fun `the allow-list is not consulted before the signature`() {
        val verifier = FakeVerifier { throw AuthFailure(FailureCodes.AUTH_REJECTED, "bad signature") }

        val failure = assertFailsWith<AuthFailure> {
            service(AuthMode.REQUIRED, tokens = verifier, allowedEmails = setOf("j@x.com"))
                .resolve(Login(googleToken = "forged.id.token"), fallback)
        }

        assertEquals(1, verifier.calls, "the allow-list answered before the verifier ran")
        assertTrue(failure.message!!.contains("bad signature"))
    }

    @Test
    fun `an unverified email cannot pass an allow-list`() {
        val verifier = FakeVerifier { googleIdentity(email = null, emailVerified = false) }

        val failure = assertFailsWith<AuthFailure> {
            service(AuthMode.REQUIRED, tokens = verifier, allowedEmails = setOf("j@x.com"))
                .resolve(Login(googleToken = "good.id.token"), fallback)
        }

        assertEquals(FailureCodes.AUTH_REJECTED, failure.code)
    }

    @Test
    fun `an unverified email is not itself a reason to refuse`() {
        val verifier = FakeVerifier { googleIdentity(email = null, emailVerified = false) }

        val resolved = service(AuthMode.REQUIRED, tokens = verifier)
            .resolve(Login(googleToken = "good.id.token"), fallback)

        val authenticated = assertIs<IdentityService.Resolution.Authenticated>(resolved)
        assertEquals(null, authenticated.account.email)
        assertEquals("sub-1", authenticated.account.subject)
    }

    @Test
    fun `resolving a ticket records the login`() {
        val accounts = InMemoryAccountStore()
        val existing = accounts.createFor(
            ProviderIdentity("google", "sub-1", "Example Player", "j@x.com"),
            now = 1_000L,
        )

        service(AuthMode.REQUIRED, accounts).resolve(Login(sessionToken = tickets.mint(existing.id)), fallback)

        assertTrue(
            accounts.byId(existing.id)!!.lastSeenAt > 1_000L,
            "lastSeenAt was not moved by a login",
        )
        assertEquals("Example Player", accounts.byId(existing.id)?.displayName)
        assertEquals("j@x.com", accounts.byId(existing.id)?.email, "a ticket says nothing new, and must erase nothing")
    }

    @Test
    fun `setPlayerName passes a trimmed name through to the store`() {
        val accounts = InMemoryAccountStore()
        val existing = account(accounts)

        val updated = service(AuthMode.REQUIRED, accounts).setPlayerName(existing.id, "  Banjo  ")

        assertEquals("Banjo", updated?.playerName)
        assertEquals("Banjo", accounts.byId(existing.id)?.playerName)
    }

    @Test
    fun `setPlayerName may be called more than once`() {
        val accounts = InMemoryAccountStore()
        val existing = account(accounts)
        val service = service(AuthMode.REQUIRED, accounts)

        service.setPlayerName(existing.id, "Banjo")
        val second = service.setPlayerName(existing.id, "Kazooie")

        assertEquals("Kazooie", second?.playerName)
    }

    @Test
    fun `setPlayerName refuses a blank or overlong name`() {
        val accounts = InMemoryAccountStore()
        val existing = account(accounts)
        val service = service(AuthMode.REQUIRED, accounts)

        val illegal = listOf("", "   ", "x".repeat(41))
        for (name in illegal) {
            assertFailsWith<IllegalArgumentException>("'$name' was accepted") {
                service.setPlayerName(existing.id, name)
            }
        }
        assertEquals(
            existing.playerName,
            accounts.byId(existing.id)?.playerName,
            "nothing should have been written",
        )
    }
}
