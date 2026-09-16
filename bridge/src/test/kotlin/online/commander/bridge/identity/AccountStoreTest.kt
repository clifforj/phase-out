package online.commander.bridge.identity

import java.io.File
import java.nio.file.Files
import java.sql.DriverManager
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

abstract class AccountStoreTest {

    abstract fun newStore(): AccountStore

    private fun identity(
        subject: String,
        displayName: String? = "Example Player",
        email: String? = "jclifford@gmail.com",
        provider: String = "google",
    ) = ProviderIdentity(provider, subject, displayName, email)

    @Test
    fun `an account is found by id and by provider subject`() {
        val store = newStore()
        val created = store.createFor(identity("sub-1"))

        assertEquals(created, store.byId(created.id))
        assertEquals(created, store.byProviderSubject("google", "sub-1"))
    }

    @Test
    fun `an unknown account is null rather than an error`() {
        val store = newStore()

        assertNull(store.byId("no-such-id"))
        assertNull(store.byProviderSubject("google", "sub-1"))
        assertNull(store.touch("no-such-id", "New Name", "new@example.com"))
    }

    @Test
    fun `provider is part of the identity, not decoration`() {
        val store = newStore()
        val google = store.createFor(identity("shared-sub", provider = "google"))
        val apple = store.createFor(identity("shared-sub", provider = "apple"))

        assertNotEquals(google.id, apple.id)
        assertEquals(google, store.byProviderSubject("google", "shared-sub"))
        assertEquals(apple, store.byProviderSubject("apple", "shared-sub"))
    }

    @Test
    fun `a new account gets a generated handle and a player name seeded from the display name`() {
        val store = newStore()
        val created = store.createFor(identity("sub-1"), now = 1_700_000_000_000L)

        assertTrue(Handles.PATTERN.matches(created.handle), "'${created.handle}' is not a legal handle")
        assertEquals("Example Player", created.playerName)
        assertEquals("Example Player", created.displayName)
        assertEquals("jclifford@gmail.com", created.email)
        assertEquals(1_700_000_000_000L, created.createdAt)
        assertEquals(1_700_000_000_000L, created.lastSeenAt)
    }

    @Test
    fun `a new account with no display name gets a generic player name`() {
        val store = newStore()
        val created = store.createFor(identity("sub-1", displayName = null))

        assertEquals("Player", created.playerName)
    }

    @Test
    fun `two accounts never share a handle`() {
        val store = newStore()
        val first = store.createFor(identity("sub-1"))
        val second = store.createFor(identity("sub-2"))

        assertNotEquals(first.handle, second.handle)
    }

    @Test
    fun `creating an account twice for the same identity fails loudly`() {
        val store = newStore()
        store.createFor(identity("sub-1"))

        assertFailsWith<IllegalStateException> { store.createFor(identity("sub-1")) }
    }

    @Test
    fun `touch records the login and the fresh chrome`() {
        val store = newStore()
        val created = store.createFor(identity("sub-1"), now = 1_000L)

        val touched = store.touch(created.id, "John C", "john.c@gmail.com", now = 2_000L)

        assertEquals("John C", touched?.displayName)
        assertEquals("john.c@gmail.com", touched?.email)
        assertEquals(2_000L, touched?.lastSeenAt)
        assertEquals(1_000L, touched?.createdAt, "createdAt is not a login timestamp")
        assertEquals(touched, store.byId(created.id), "the update has to be persisted, not returned")
    }

    @Test
    fun `touch never nulls a stored display name or email`() {
        val store = newStore()
        val created = store.createFor(identity("sub-1", displayName = "Example Player", email = "j@x.com"))

        val touched = store.touch(created.id, null, null)

        assertEquals("Example Player", touched?.displayName)
        assertEquals("j@x.com", touched?.email)
        assertEquals("Example Player", store.byId(created.id)?.displayName)
        assertEquals("j@x.com", store.byId(created.id)?.email)
    }

    @Test
    fun `touch never moves the handle`() {
        val store = newStore()
        val created = store.createFor(identity("sub-1"))

        val touched = store.touch(created.id, "Somebody Else Entirely", "else@example.com")

        assertEquals(created.handle, touched?.handle)
    }

    @Test
    fun `setPlayerName updates the player name and leaves the handle untouched`() {
        val store = newStore()
        val created = store.createFor(identity("sub-1"))

        val updated = store.setPlayerName(created.id, "Banjo")

        assertEquals("Banjo", updated?.playerName)
        assertEquals(created.handle, updated?.handle)
        assertEquals("Banjo", store.byId(created.id)?.playerName, "the update has to be persisted")
    }

    @Test
    fun `setPlayerName may be called more than once`() {
        val store = newStore()
        val created = store.createFor(identity("sub-1"))

        store.setPlayerName(created.id, "Banjo")
        val updated = store.setPlayerName(created.id, "Kazooie")

        assertEquals("Kazooie", updated?.playerName)
    }

    @Test
    fun `two accounts may share a player name`() {
        val store = newStore()
        val first = store.createFor(identity("sub-1"))
        val second = store.createFor(identity("sub-2", displayName = "Someone Else", email = null))

        store.setPlayerName(first.id, "Same Name")
        store.setPlayerName(second.id, "Same Name")

        assertEquals("Same Name", store.byId(first.id)?.playerName)
        assertEquals("Same Name", store.byId(second.id)?.playerName)
        assertNotEquals(first.handle, second.handle, "handles are still what keeps them distinct")
    }

    @Test
    fun `setPlayerName on an unknown account is null rather than throwing`() {
        assertNull(newStore().setPlayerName("no-such-id", "banjo"))
    }

    @Test
    fun `an identity with no name and no email is still storable`() {
        val store = newStore()
        val created = store.createFor(identity("sub-1", displayName = null, email = null))

        assertNull(created.displayName)
        assertNull(created.email)
        assertTrue(Handles.PATTERN.matches(created.handle), "'${created.handle}' is not a legal handle")
        assertEquals(created, store.byId(created.id))
    }

    @Test
    fun `byEmail finds the one account with that address`() {
        val store = newStore()
        val created = store.createFor(identity("sub-1", email = "j@x.com"))

        assertEquals(created, store.byEmail("j@x.com"))
    }

    @Test
    fun `byEmail is null with no match, and null rather than a guess with more than one`() {
        val store = newStore()
        assertNull(store.byEmail("nobody@example.com"))

        store.createFor(identity("sub-1", email = "shared@example.com"))
        store.createFor(identity("sub-2", email = "shared@example.com"))
        assertNull(store.byEmail("shared@example.com"), "an ambiguous match must not be picked for you")
    }

    @Test
    fun `byEmail matches across providers`() {
        val store = newStore()
        val created = store.createFor(identity("sub-1", email = "j@x.com", provider = "apple"))

        assertEquals(created, store.byEmail("j@x.com"))
    }

    @Test
    fun `migrateToProvider repoints an account without touching its handle or player name`() {
        val store = newStore()
        val created = store.createFor(identity("google-sub-1"))
        store.setPlayerName(created.id, "Banjo")

        val migrated = store.migrateToProvider(created.id, "supabase", "supabase-sub-1")

        assertEquals("supabase", migrated?.provider)
        assertEquals("supabase-sub-1", migrated?.subject)
        assertEquals(created.handle, migrated?.handle)
        assertEquals("Banjo", migrated?.playerName)
        assertNull(store.byProviderSubject("google", "google-sub-1"), "the old (provider, subject) must be gone")
        assertEquals(migrated, store.byProviderSubject("supabase", "supabase-sub-1"))
        assertEquals(migrated, store.byId(created.id), "the update has to be persisted")
    }

    @Test
    fun `migrateToProvider on an unknown account is null rather than throwing`() {
        assertNull(newStore().migrateToProvider("no-such-id", "supabase", "sub-1"))
    }
}

class InMemoryAccountStoreTest : AccountStoreTest() {
    override fun newStore(): AccountStore = InMemoryAccountStore()
}

class H2AccountStoreTest : AccountStoreTest() {

    private val stores = mutableListOf<H2AccountStore>()
    private val dirs = mutableListOf<File>()

    override fun newStore(): AccountStore {
        val dir = Files.createTempDirectory("h2-account-store-test").toFile()
        dirs += dir
        return H2AccountStore(dir).also { stores += it }
    }

    @AfterTest
    fun cleanUp() {

        stores.forEach { it.close() }
        dirs.forEach { it.deleteRecursively() }
    }

    @Test
    fun `accounts survive a reopen of the same file`() {
        val dir = Files.createTempDirectory("h2-account-store-reopen").toFile()
        dirs += dir

        val created = H2AccountStore(dir).use { it.createFor(ProviderIdentity("google", "sub-1", "Example Player", "j@x.com")) }

        H2AccountStore(dir).use { reopened ->
            assertEquals(created, reopened.byId(created.id))
            assertEquals(created, reopened.byProviderSubject("google", "sub-1"))
        }
    }

    @Test
    fun `an old-style handle from before the scheme changed is regenerated on open`() {
        val dir = Files.createTempDirectory("h2-account-store-legacy").toFile()
        dirs += dir

        DriverManager.getConnection("jdbc:h2:file:${File(dir, "accounts").absolutePath}").use { connection ->
            connection.createStatement().use { statement ->
                statement.execute(
                    """
                    CREATE TABLE account (
                      id VARCHAR(36) PRIMARY KEY, provider VARCHAR(32) NOT NULL, subject VARCHAR(255) NOT NULL,
                      handle VARCHAR(14) NOT NULL, handle_chosen BOOLEAN NOT NULL,
                      display_name VARCHAR(255), email VARCHAR(320),
                      created_at BIGINT NOT NULL, last_seen_at BIGINT NOT NULL)
                    """.trimIndent(),
                )
                statement.execute(
                    "INSERT INTO account VALUES " +
                        "('acct-1', 'google', 'sub-1', 'jclifford', TRUE, 'Example Player', 'j@x.com', 1000, 1000)",
                )
            }
        }

        val migrated = H2AccountStore(dir).use { it.byId("acct-1") }

        assertNotEquals("jclifford", migrated?.handle, "the old-style handle must not survive")
        assertTrue(Handles.PATTERN.matches(migrated?.handle ?: ""), "the new handle must still be legal")
        assertEquals("jclifford", migrated?.playerName, "the old handle becomes the starting player name")
        assertEquals("Example Player", migrated?.displayName, "nothing else about the row should change")

        val reopened = H2AccountStore(dir).use { it.byId("acct-1") }
        assertEquals(migrated?.handle, reopened?.handle, "the migration must not re-run")
    }
}
