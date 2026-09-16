package online.commander.bridge

import mage.cards.decks.DeckCardInfo
import mage.cards.decks.DeckCardLists

object DeckImport {

    enum class Level { ERROR, WARNING }

    data class Note(
        val level: Level,
        val message: String,
        val lineNumber: Int? = null,
        val text: String? = null,
    )

    data class Report(
        val name: String,

        val deck: DeckCardLists?,
        val cardCount: Int,
        val mainCount: Int,

        val commanders: List<String>,
        val notes: List<Note>,
    ) {
        val ok: Boolean get() = deck != null
        val problems: List<Note> get() = notes.filter { it.level == Level.ERROR }
    }

    private const val DEFAULT_NAME = "Imported deck"

    private const val MAX_COPIES = 99

    private const val COMMANDER_DECK_SIZE = 100

    fun import(
        text: String,
        name: String? = null,
        index: CardIndex = CardIndex.bundled,

        commanderOverride: List<String>? = null,
    ): Report {
        val parsed = DeckList.parse(text)
        val deckName = name?.trim()?.takeIf { it.isNotEmpty() }
            ?: parsed.name
            ?: DEFAULT_NAME

        val notes = mutableListOf<Note>()
        val deck = DeckCardLists()
        deck.name = deckName
        parsed.author?.let { deck.author = it }

        for (skipped in parsed.skipped) {
            notes += Note(Level.ERROR, skipped.reason, skipped.lineNumber, skipped.text)
        }

        val commanders = mutableListOf<String>()
        var labelled = 0
        var mainCount = 0

        val overrideRemaining = commanderOverride
            ?.associateByTo(LinkedHashMap()) { CardIndex.normalize(it) }
            ?.toMutableMap()

        for (entry in parsed.entries) {

            if (entry.count > MAX_COPIES) {
                notes += Note(
                    Level.ERROR,
                    "${entry.count} copies is more than this server allows of one card ($MAX_COPIES)",
                    entry.lineNumber,
                    entry.text,
                )
                continue
            }

            val resolution = index.resolve(entry.name, entry.printing)
            val card = when (resolution) {
                is CardIndex.Resolution.Unknown -> {
                    notes += Note(
                        Level.ERROR,
                        "no card called \"${entry.name}\" in this server's card database",
                        entry.lineNumber,
                        entry.text,
                    )
                    null
                }

                is CardIndex.Resolution.Substituted -> {
                    notes += Note(
                        Level.WARNING,
                        "${resolution.card.name}: no ${resolution.wanted} in this server's card database, " +
                            "using ${resolution.printing}",
                        entry.lineNumber,
                        entry.text,
                    )
                    resolution.card
                }

                is CardIndex.Resolution.Renamed -> {
                    notes += Note(
                        Level.WARNING,
                        "\"${resolution.asName}\" is ${resolution.card.name} under a promotional name",
                        entry.lineNumber,
                        entry.text,
                    )
                    resolution.card
                }

                is CardIndex.Resolution.Exact -> resolution.card
            } ?: continue

            val displayName = (resolution as? CardIndex.Resolution.Renamed)?.asName ?: card.name
            val printing = when (resolution) {
                is CardIndex.Resolution.Exact -> resolution.printing
                is CardIndex.Resolution.Substituted -> resolution.printing
                is CardIndex.Resolution.Renamed -> resolution.printing
                is CardIndex.Resolution.Unknown -> continue
            }
            if (overrideRemaining != null) {
                val toSideboard = overrideRemaining.remove(CardIndex.normalize(displayName)) != null
                add(deck, entry, displayName, printing, toSideboard)
                if (toSideboard) repeat(entry.count) { commanders += displayName } else mainCount += entry.count
                continue
            }

            add(deck, entry, displayName, printing, entry.section != DeckList.Section.MAIN)

            when (entry.section) {
                DeckList.Section.COMMANDER -> {
                    labelled += entry.count
                    repeat(entry.count) { commanders += displayName }
                }
                DeckList.Section.SIDEBOARD -> repeat(entry.count) { commanders += displayName }
                DeckList.Section.MAIN -> mainCount += entry.count
            }
        }

        if (parsed.entries.isEmpty()) {
            notes += Note(Level.ERROR, "nothing in this text looks like a decklist")
        }

        overrideRemaining?.values?.forEach { missing ->
            notes += Note(Level.WARNING, "\"$missing\" was chosen as a commander but isn't in this list")
        }

        if (overrideRemaining != null) {
            val cardCount = DeckFile.cardCount(deck)
            val failed = notes.any { it.level == Level.ERROR }
            return Report(
                name = deckName,
                deck = if (failed) null else deck,
                cardCount = cardCount,
                mainCount = mainCount,
                commanders = commanders,
                notes = notes,
            )
        }

        if (labelled == 0 && deck.sideboard.isNotEmpty()) {
            notes += Note(
                Level.WARNING,
                "no \"Commander\" section: the ${deck.sideboard.sumOf { it.amount }} sideboard " +
                    "card(s) will be read as the commander in a Commander game",
            )
        }

        if (deck.sideboard.isEmpty()) {
            val promoted = promoteLeadingCommanders(deck, parsed, index)
            notes += if (promoted.isNotEmpty()) {
                commanders += promoted
                mainCount -= promoted.size
                val named = promoted.joinToString(" and ")
                val plural = if (promoted.size > 1) "commanders" else "commander"
                Note(
                    Level.WARNING,
                    "no \"Commander\" heading: using $named, the first ${if (promoted.size > 1) "two cards" else "card"} " +
                        "in the list and a legal $plural. Add a \"Commander\" heading to say so explicitly.",
                )
            } else {
                Note(
                    Level.WARNING,
                    "no commander: nothing in this list is marked as one and the first card is not " +
                        "a legal commander, so a Commander game will refuse this deck.",
                )
            }
        }

        val cardCount = DeckFile.cardCount(deck)
        val failed = notes.any { it.level == Level.ERROR }
        return Report(
            name = deckName,
            deck = if (failed) null else deck,
            cardCount = cardCount,
            mainCount = mainCount,
            commanders = commanders,
            notes = notes,
        )
    }

    private const val LEADING_SCAN = 4

    private fun promoteLeadingCommanders(
        deck: DeckCardLists,
        parsed: DeckList.Parsed,
        index: CardIndex,
    ): List<String> {
        if (DeckFile.cardCount(deck) != COMMANDER_DECK_SIZE) return emptyList()
        val leading = parsed.entries.take(LEADING_SCAN).mapNotNull { entry ->
            val resolution = index.resolve(entry.name, entry.printing)
            val card = resolution.cardOrNull() ?: return@mapNotNull null
            val displayName = (resolution as? CardIndex.Resolution.Renamed)?.asName ?: card.name
            Triple(entry, card, displayName)
        }

        for (i in leading.indices) {
            val (entryA, cardA, nameA) = leading[i]
            if (entryA.count != 1) continue
            for (j in leading.indices) {
                if (j == i) continue
                val (entryB, cardB, nameB) = leading[j]
                if (entryB.count != 1) continue
                if (!cardA.pairsWith(cardB)) continue
                val infoA = deck.cards.firstOrNull { it.cardName == nameA } ?: continue
                val infoB = deck.cards.firstOrNull { it.cardName == nameB } ?: continue
                deck.cards.remove(infoA)
                deck.cards.remove(infoB)
                deck.sideboard.add(infoA)
                deck.sideboard.add(infoB)
                return listOf(infoA.cardName, infoB.cardName)
            }
        }

        val first = parsed.entries.firstOrNull() ?: return emptyList()
        if (first.count != 1) return emptyList()
        if (index.resolve(first.name, first.printing).cardOrNull()?.canBeCommander != true) return emptyList()

        val info = deck.cards.firstOrNull() ?: return emptyList()
        if (info.amount != 1) return emptyList()
        deck.cards.remove(info)
        deck.sideboard.add(info)
        return listOf(info.cardName)
    }

    private fun add(
        deck: DeckCardLists,
        entry: DeckList.Entry,
        displayName: String,
        printing: CardIndex.Printing,
        toSideboard: Boolean,
    ) {

        val info = DeckCardInfo(displayName, printing.cardNumber, printing.setCode, entry.count)
        if (toSideboard) deck.sideboard.add(info) else deck.cards.add(info)
    }
}
