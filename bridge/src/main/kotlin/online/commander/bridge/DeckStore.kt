package online.commander.bridge

import mage.cards.decks.DeckCardLists
import org.slf4j.LoggerFactory
import java.io.File
import java.io.IOException
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.Locale
import java.util.UUID

class DeckStore(val dir: File) {

    data class Saved(
        val id: String,
        val name: String,
        val file: File,
        val cardCount: Int,
        val commanders: List<Commander>,

        val savedAt: Long,
    ) {

        data class Commander(val name: String, val printing: CardIndex.Printing)
    }

    @Synchronized
    fun save(owner: String?, deck: DeckCardLists): Saved {
        val dir = dirFor(owner)
        val existing = files(dir)
        check(existing.size < MAX_DECKS) {
            "you have $MAX_DECKS decks, which is the limit; delete one before importing another"
        }
        if (!dir.isDirectory && !dir.mkdirs()) {
            throw IOException("could not create the deck store at ${dir.absolutePath}")
        }

        val id = idFor(deck.name, existing.map { it.nameWithoutExtension }.toSet())
        val file = File(dir, "$id.dck")
        val temp = File(dir, "$id.dck.tmp")
        temp.writeText(DeckFile.write(deck))
        if (!temp.renameTo(file)) {
            temp.delete()
            throw IOException("could not write ${file.absolutePath}")
        }
        log.info("imported deck '{}' saved as {} for {}", deck.name, file.name, owner ?: "no account")
        return describe(file) ?: throw IOException("wrote ${file.name} but could not read it back")
    }

    @Synchronized
    fun list(owner: String?): List<Saved> =
        readableDirs(owner).flatMap(::files)
            .mapNotNull(Companion::describe)
            .sortedByDescending { it.savedAt }

    @Synchronized
    fun find(owner: String?, id: String): Saved? =
        readableDirs(owner).firstNotNullOfOrNull { fileFor(it, id) }?.let(Companion::describe)

    @Synchronized
    fun delete(owner: String?, id: String): Boolean {
        val file = fileFor(dirFor(owner), id) ?: return false
        return file.delete()
    }

    private fun dirFor(owner: String?): File {
        if (owner == null) return dir
        require(ID.matches(owner)) { "not an account id: '$owner'" }
        return File(dir, owner)
    }

    private fun readableDirs(owner: String?): List<File> =
        if (owner == null) listOf(dir) else listOf(dirFor(owner), dir)

    private fun fileFor(from: File, id: String): File? {
        if (!ID.matches(id)) return null
        val file = File(from, "$id.dck")
        if (!file.isFile) return null
        return file.takeIf { it.parentFile?.canonicalFile == from.canonicalFile }
    }

    private fun files(from: File): List<File> =
        from.listFiles { file: File -> file.isFile && file.name.endsWith(".dck") }
            .orEmpty()
            .toList()

    private fun idFor(name: String?, taken: Set<String>): String {
        val slug = SLUG_UNSAFE.replace(name.orEmpty().lowercase(Locale.ROOT), "-")
            .trim('-')
            .take(MAX_SLUG)
            .trim('-')
            .ifEmpty { "deck" }
        repeat(8) {
            val id = "$slug-${UUID.randomUUID().toString().take(6)}"
            if (id !in taken) return id
        }
        return "$slug-${UUID.randomUUID()}"
    }

    companion object {
        private val log = LoggerFactory.getLogger("bridge.decks")

        fun describe(file: File): Saved? {
            return try {
                val deck = DeckFile.read(file)
                val cardCount = DeckFile.cardCount(deck)
                if (cardCount == 0) return null
                Saved(
                    id = file.nameWithoutExtension,
                    name = deck.name ?: file.nameWithoutExtension,
                    file = file,
                    cardCount = cardCount,
                    commanders = deck.sideboard.flatMap { info ->
                        List(info.amount) {
                            Saved.Commander(
                                info.cardName,
                                CardIndex.Printing(info.setCode, info.cardNumber),
                            )
                        }
                    },
                    savedAt = releaseDate(file) ?: file.lastModified(),
                )
            } catch (t: Throwable) {
                log.warn("ignoring unreadable deck {}: {}", file.name, t.message)
                null
            }
        }

        private fun releaseDate(file: File): Long? {
            val line = file.useLines { lines -> lines.firstOrNull { it.startsWith("RELEASED:") } } ?: return null
            val date = line.removePrefix("RELEASED:").trim()
            return runCatching { LocalDate.parse(date).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli() }
                .getOrNull()
        }

        const val MAX_DECKS = 200

        private val ID = Regex("^[a-z0-9][a-z0-9-]{0,63}$")
        private val SLUG_UNSAFE = Regex("[^a-z0-9]+")
        private const val MAX_SLUG = 40
    }
}
