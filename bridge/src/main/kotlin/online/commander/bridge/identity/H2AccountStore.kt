package online.commander.bridge.identity

import java.io.File
import java.sql.Connection
import java.sql.DriverManager
import java.sql.ResultSet
import java.sql.SQLException
import java.util.UUID

class H2AccountStore(dataDir: File) : AccountStore, AutoCloseable {

    private val connection: Connection = run {
        dataDir.mkdirs()

        val url = "jdbc:h2:file:${File(dataDir, DB_NAME).absolutePath};DB_CLOSE_ON_EXIT=FALSE"
        DriverManager.getConnection(url)
    }

    init {
        synchronized(this) {
            connection.createStatement().use { statement ->
                statement.execute(CREATE_TABLE)
                statement.execute(CREATE_UX_PROVIDER_SUBJECT)
                statement.execute(CREATE_UX_HANDLE)
                statement.execute(ADD_PLAYER_NAME_COLUMN)
                statement.execute(BACKFILL_PLAYER_NAME)
                statement.execute(DROP_HANDLE_CHOSEN_COLUMN)
                statement.execute(CREATE_MIGRATIONS_TABLE)
            }
            regenerateOldHandles()
        }
    }

    private fun regenerateOldHandles() {
        connection.prepareStatement(
            "SELECT 1 FROM bridge_migration WHERE name = ?",
        ).use { statement ->
            statement.setString(1, MIGRATION_REGENERATE_HANDLES)
            statement.executeQuery().use { if (it.next()) return }
        }

        val ids = mutableListOf<String>()
        connection.createStatement().use { statement ->
            statement.executeQuery("SELECT id FROM account").use { rs ->
                while (rs.next()) ids += rs.getString("id")
            }
        }

        for (id in ids) {
            var applied = false
            for (attempt in 1..MAX_HANDLE_ATTEMPTS) {
                try {
                    connection.prepareStatement(
                        "UPDATE account SET handle = ? WHERE id = ?",
                    ).use { statement ->
                        statement.setString(1, Handles.generate())
                        statement.setString(2, id)
                        statement.executeUpdate()
                    }
                    applied = true
                    break
                } catch (e: SQLException) {
                    if (e.sqlState != DUPLICATE_KEY) throw e
                }
            }
            check(applied) {
                "could not regenerate a free handle for account $id after $MAX_HANDLE_ATTEMPTS tries"
            }
        }

        connection.prepareStatement("INSERT INTO bridge_migration (name) VALUES (?)").use { statement ->
            statement.setString(1, MIGRATION_REGENERATE_HANDLES)
            statement.executeUpdate()
        }
    }

    override fun byId(id: String): Account? = synchronized(this) {
        connection.prepareStatement("$SELECT_ALL WHERE id = ?").use { statement ->
            statement.setString(1, id)
            statement.executeQuery().use { it.firstAccount() }
        }
    }

    override fun byProviderSubject(provider: String, subject: String): Account? = synchronized(this) {
        connection.prepareStatement("$SELECT_ALL WHERE provider = ? AND subject = ?").use { statement ->
            statement.setString(1, provider)
            statement.setString(2, subject)
            statement.executeQuery().use { it.firstAccount() }
        }
    }

    override fun createFor(identity: ProviderIdentity, now: Long): Account = synchronized(this) {
        check(byProviderSubject(identity.provider, identity.subject) == null) {
            "an account already exists for ${identity.provider}/${identity.subject}"
        }

        val defaultPlayerName = identity.displayName?.takeIf { it.isNotBlank() } ?: "Player"
        repeat(MAX_HANDLE_ATTEMPTS) {
            val account = Account(
                id = UUID.randomUUID().toString(),
                provider = identity.provider,
                subject = identity.subject,
                handle = Handles.generate(),
                playerName = defaultPlayerName,
                displayName = identity.displayName,
                email = identity.email,
                createdAt = now,
                lastSeenAt = now,
            )

            if (tryInsert(account)) return account
        }
        throw IllegalStateException("could not generate a free handle after $MAX_HANDLE_ATTEMPTS tries")
    }

    override fun touch(id: String, displayName: String?, email: String?, now: Long): Account? =
        synchronized(this) {

            val existing = byId(id) ?: return null
            val updated = existing.copy(
                displayName = displayName ?: existing.displayName,
                email = email ?: existing.email,
                lastSeenAt = now,
            )

            connection.prepareStatement(
                "UPDATE account SET display_name = ?, email = ?, last_seen_at = ? WHERE id = ?",
            ).use { statement ->
                statement.setString(1, updated.displayName)
                statement.setString(2, updated.email)
                statement.setLong(3, updated.lastSeenAt)
                statement.setString(4, updated.id)
                statement.executeUpdate()
            }
            updated
        }

    override fun byEmail(email: String): Account? = synchronized(this) {
        connection.prepareStatement("$SELECT_ALL WHERE email = ?").use { statement ->
            statement.setString(1, email)
            statement.executeQuery().use { rs ->
                val first = rs.firstAccount() ?: return null

                if (rs.next()) null else first
            }
        }
    }

    override fun migrateToProvider(id: String, provider: String, subject: String): Account? =
        synchronized(this) {
            val existing = byId(id) ?: return null
            connection.prepareStatement(
                "UPDATE account SET provider = ?, subject = ? WHERE id = ?",
            ).use { statement ->
                statement.setString(1, provider)
                statement.setString(2, subject)
                statement.setString(3, id)
                statement.executeUpdate()
            }
            existing.copy(provider = provider, subject = subject)
        }

    override fun setPlayerName(id: String, playerName: String): Account? = synchronized(this) {
        val existing = byId(id) ?: return null
        val updated = existing.copy(playerName = playerName)

        connection.prepareStatement(
            "UPDATE account SET player_name = ? WHERE id = ?",
        ).use { statement ->
            statement.setString(1, updated.playerName)
            statement.setString(2, updated.id)
            statement.executeUpdate()
        }
        updated
    }

    override fun close() = synchronized(this) { connection.close() }

    private fun tryInsert(account: Account): Boolean {
        try {
            connection.prepareStatement(
                """
                INSERT INTO account
                  (id, provider, subject, handle, player_name, display_name, email,
                   created_at, last_seen_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """.trimIndent(),
            ).use { statement ->
                statement.setString(1, account.id)
                statement.setString(2, account.provider)
                statement.setString(3, account.subject)
                statement.setString(4, account.handle)
                statement.setString(5, account.playerName)
                statement.setString(6, account.displayName)
                statement.setString(7, account.email)
                statement.setLong(8, account.createdAt)
                statement.setLong(9, account.lastSeenAt)
                statement.executeUpdate()
            }
        } catch (e: SQLException) {
            if (e.sqlState != DUPLICATE_KEY) throw e
            return false
        }
        return true
    }

    private fun ResultSet.firstAccount(): Account? =
        if (next()) {
            Account(
                id = getString("id"),
                provider = getString("provider"),
                subject = getString("subject"),
                handle = getString("handle"),
                playerName = getString("player_name"),
                displayName = getString("display_name"),
                email = getString("email"),
                createdAt = getLong("created_at"),
                lastSeenAt = getLong("last_seen_at"),
            )
        } else {
            null
        }

    private companion object {

        const val DB_NAME = "accounts"

        const val DUPLICATE_KEY = "23505"

        const val MAX_HANDLE_ATTEMPTS = 10

        const val CREATE_TABLE = """
            CREATE TABLE IF NOT EXISTS account (
              id VARCHAR(36) PRIMARY KEY, provider VARCHAR(32) NOT NULL, subject VARCHAR(255) NOT NULL,
              handle VARCHAR(14) NOT NULL, player_name VARCHAR(60) NOT NULL,
              display_name VARCHAR(255), email VARCHAR(320),
              created_at BIGINT NOT NULL, last_seen_at BIGINT NOT NULL)
        """

        const val CREATE_UX_PROVIDER_SUBJECT =
            "CREATE UNIQUE INDEX IF NOT EXISTS ux_account_provider_subject ON account(provider, subject)"

        const val CREATE_UX_HANDLE =
            "CREATE UNIQUE INDEX IF NOT EXISTS ux_account_handle ON account(handle)"

        const val ADD_PLAYER_NAME_COLUMN =
            "ALTER TABLE account ADD COLUMN IF NOT EXISTS player_name VARCHAR(60)"

        const val BACKFILL_PLAYER_NAME =
            "UPDATE account SET player_name = handle WHERE player_name IS NULL"

        const val DROP_HANDLE_CHOSEN_COLUMN =
            "ALTER TABLE account DROP COLUMN IF EXISTS handle_chosen"

        const val CREATE_MIGRATIONS_TABLE =
            "CREATE TABLE IF NOT EXISTS bridge_migration (name VARCHAR(64) PRIMARY KEY)"

        const val MIGRATION_REGENERATE_HANDLES = "regenerate_handles_vowel_free_v1"

        const val SELECT_ALL =
            "SELECT id, provider, subject, handle, player_name, display_name, email, " +
                "created_at, last_seen_at FROM account"
    }
}
