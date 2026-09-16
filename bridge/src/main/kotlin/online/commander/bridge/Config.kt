package online.commander.bridge

import online.commander.bridge.auth.AuthMode
import java.io.File
import java.time.Duration

data class Config(
    val bridgePort: Int,
    val bridgeHost: String,
    val xmageHost: String,
    val xmagePort: Int,
    val defaultGameType: String,
    val multiplayerGameType: String,
    val defaultDeckType: String,
    val decks: List<File>,
    val deckStoreDir: File,
    val playmatImageDir: File,
    val userNamePrefix: String,
    val maxPlayersPerTable: Int,
    val authMode: AuthMode,

    val googleClientId: String?,

    val authSecret: String?,
    val accountsDir: File,
    val ticketLifetime: Duration,

    val allowedEmails: Set<String>,
) {

    fun authStartupError(): String? {
        if (authMode != AuthMode.REQUIRED) return null
        val missing = listOfNotNull(
            "BRIDGE_AUTH_SECRET".takeIf { authSecret.isNullOrBlank() },
            "BRIDGE_GOOGLE_CLIENT_ID".takeIf { googleClientId.isNullOrBlank() },
        )
        if (missing.isEmpty()) return null
        return "BRIDGE_AUTH_MODE=required needs ${missing.joinToString(" and ")}. " +
            "Generate a ticket secret with: openssl rand -base64 32"
    }

    companion object {
        const val DEFAULT_GAME_TYPE = "Commander Two Player Duel"
        const val DEFAULT_MULTIPLAYER_GAME_TYPE = "Commander Free For All"
        const val DEFAULT_DECK_TYPE = "Variant Magic - Commander"

        const val DEFAULT_MAX_PLAYERS = 8

        val DECK_DIR_CANDIDATES = listOf("/opt/bridge/decks", "build/decks")

        const val FALLBACK_DECK = "vendor/xmage/Mage.Tests/CommanderDuel.dck"

        fun fromEnv(env: Map<String, String> = System.getenv()): Config {
            return Config(
                bridgePort = env["BRIDGE_PORT"]?.toIntOrNull() ?: 8080,
                bridgeHost = env["BRIDGE_HOST"] ?: "0.0.0.0",
                xmageHost = env["XMAGE_HOST"] ?: "localhost",
                xmagePort = env["XMAGE_PORT"]?.toIntOrNull() ?: 17171,
                defaultGameType = env["BRIDGE_GAME_TYPE"] ?: DEFAULT_GAME_TYPE,
                multiplayerGameType = env["BRIDGE_MULTIPLAYER_GAME_TYPE"]
                    ?: DEFAULT_MULTIPLAYER_GAME_TYPE,
                defaultDeckType = env["BRIDGE_DECK_TYPE"] ?: DEFAULT_DECK_TYPE,
                decks = findDecks(env["BRIDGE_DECK_FILE"], env["BRIDGE_DECK_DIR"]),
                deckStoreDir = writableDir(env["BRIDGE_DECK_STORE"], "decks-imported"),
                playmatImageDir = writableDir(env["BRIDGE_PLAYMAT_IMAGE_STORE"], "playmat-images"),
                userNamePrefix = env["BRIDGE_USER_PREFIX"] ?: "web",
                maxPlayersPerTable = env["BRIDGE_MAX_PLAYERS"]?.toIntOrNull() ?: DEFAULT_MAX_PLAYERS,
                authMode = AuthMode.parse(env["BRIDGE_AUTH_MODE"]),
                googleClientId = env["BRIDGE_GOOGLE_CLIENT_ID"]?.trim()?.ifEmpty { null },
                authSecret = env["BRIDGE_AUTH_SECRET"]?.ifEmpty { null },
                accountsDir = writableDir(env["BRIDGE_DATA_DIR"], "accounts"),
                ticketLifetime = Duration.ofDays(
                    env["BRIDGE_TICKET_DAYS"]?.toLongOrNull() ?: DEFAULT_TICKET_DAYS,
                ),
                allowedEmails = parseAllowedEmails(env["BRIDGE_ALLOWED_EMAILS"]),
            )
        }

        const val DEFAULT_TICKET_DAYS = 30L

        fun parseAllowedEmails(configured: String?): Set<String> =
            configured?.split(',')
                ?.map { it.trim().lowercase() }
                ?.filter { it.isNotEmpty() }
                ?.toSet()
                .orEmpty()

        const val WRITABLE_ROOT = "/opt/bridge"

        fun writableDir(configured: String?, name: String): File =
            configured?.let(::File)
                ?: File(WRITABLE_ROOT).takeIf { it.isDirectory }?.let { File(it, name) }
                ?: File(name)

        fun findDecks(deckFile: String?, deckDir: String?): List<File> {
            if (deckFile != null) return listOf(File(deckFile))
            val dirs = deckDir?.let(::listOf) ?: DECK_DIR_CANDIDATES
            val found = dirs.map(::File).firstOrNull { it.isDirectory }
                ?.listFiles { file -> file.isFile && file.name.endsWith(".dck") }
                ?.sortedBy { it.name }
                .orEmpty()
            return found.ifEmpty { listOf(File(FALLBACK_DECK)).filter { it.isFile } }
        }
    }
}
