package online.commander.bridge

import mage.cards.decks.DeckCardInfo
import mage.cards.decks.DeckCardLists
import java.io.File

// Parse without opening XMage's card database, which the server holds exclusively.
object DeckFile {

    private val cardLine = Regex("""^(SB:)?\s*(\d+)\s*\[([^\]:]+):([^\]:]+)]\s*(.*)$""")

    fun read(file: File): DeckCardLists {
        require(file.isFile) { "deck file not found: ${file.absolutePath}" }
        return parse(file.readLines(), fallbackName = file.nameWithoutExtension)
    }

    fun parse(lines: List<String>, fallbackName: String = "deck"): DeckCardLists {
        val deck = DeckCardLists()
        deck.name = fallbackName

        for (raw in lines) {
            val line = raw.trim()
            if (line.isEmpty() || line.startsWith("#")) continue

            when {
                line.startsWith("NAME:") -> deck.name = line.removePrefix("NAME:").trim()
                line.startsWith("AUTHOR:") -> deck.author = line.removePrefix("AUTHOR:").trim()
                line.startsWith("LAYOUT") -> Unit
                else -> {
                    val match = cardLine.matchEntire(line) ?: continue
                    val (sideboardMark, amount, setCode, cardNumber, cardName) = match.destructured

                    // XMage identifies a printing by set and number, not its display name.
                    val info = DeckCardInfo(
                        cardName.trim(),
                        cardNumber.trim(),
                        setCode.trim(),
                        amount.toInt(),
                    )
                    if (sideboardMark.isEmpty()) deck.cards.add(info) else deck.sideboard.add(info)
                }
            }
        }
        return deck
    }

    fun cardCount(deck: DeckCardLists): Int =
        deck.cards.sumOf { it.amount } + deck.sideboard.sumOf { it.amount }

    fun write(deck: DeckCardLists): String = buildString {
        append("NAME:").append(deck.name ?: "deck").append('\n')
        deck.author?.takeIf { it.isNotBlank() }?.let { append("AUTHOR:").append(it).append('\n') }
        for (card in deck.cards) append(line(card, sideboard = false))
        for (card in deck.sideboard) append(line(card, sideboard = true))
    }

    private fun line(card: DeckCardInfo, sideboard: Boolean): String =
        "${if (sideboard) "SB: " else ""}${card.amount} [${card.setCode}:${card.cardNumber}] ${card.cardName}\n"
}
