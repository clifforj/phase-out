package online.commander.bridge

object DeckList {

    enum class Section { MAIN, COMMANDER, SIDEBOARD }

    data class Entry(
        val lineNumber: Int,
        val text: String,
        val count: Int,
        val name: String,
        val printing: CardIndex.Printing?,
        val section: Section,
    )

    data class Skipped(val lineNumber: Int, val text: String, val reason: String)

    data class Parsed(
        val name: String?,
        val author: String?,
        val entries: List<Entry>,
        val skipped: List<Skipped>,
    ) {
        val commanders: List<Entry> get() = entries.filter { it.section == Section.COMMANDER }
        val cardCount: Int get() = entries.sumOf { it.count }
    }

    private val DCK_LINE = Regex("""^(SB:)?\s*(\d+)\s*\[([^\]:]+):([^\]:]+)]\s*(.*)$""")
    private val CARD_LINE = Regex("""^(SB:)?\s*(?:(\d+)\s*[xX]?\s+)?(\S.*)$""")
    private val TRAILING_PRINTING = Regex("""^(.*?)\s*\(([A-Za-z0-9_]{2,7})\)\s*([A-Za-z0-9★+\-]+)?$""")
    private val TRAILING_MARKER = Regex("""^(.*?)\s*\*[^*]*\*$""")
    private val TRAILING_TAG = Regex("""^(.*?)\s*\[[^\[\]]*]$""")
    private val CATEGORY_HEADING = Regex("""^[A-Za-z][A-Za-z '/-]*\s*\(\d+\)$""")

    private val HASH_HEADING = Regex("""^#+\s*(.*)$""")

    private val SECTION_HEADERS = mapOf(
        "deck" to Section.MAIN,
        "main" to Section.MAIN,
        "maindeck" to Section.MAIN,
        "main deck" to Section.MAIN,
        "mainboard" to Section.MAIN,
        "commander" to Section.COMMANDER,
        "commanders" to Section.COMMANDER,
        "sideboard" to Section.SIDEBOARD,
        "sb" to Section.SIDEBOARD,
        "companion" to Section.SIDEBOARD,
    )

    private val HEADER_DECORATION = Regex("""\s*[:(]\s*\d*\s*\)?\s*$""")

    fun parse(text: String): Parsed {
        var deckName: String? = null
        var author: String? = null
        var section = Section.MAIN
        val entries = mutableListOf<Entry>()
        val skipped = mutableListOf<Skipped>()

        text.split('\n').forEachIndexed { index, raw ->
            val lineNumber = index + 1
            val line = raw.trim().trimEnd('\r')
            if (line.isEmpty() || line.startsWith("//")) return@forEachIndexed

            when {
                line.startsWith("NAME:", ignoreCase = true) ->
                    deckName = line.substring(5).trim().takeIf { it.isNotEmpty() }

                line.startsWith("AUTHOR:", ignoreCase = true) ->
                    author = line.substring(7).trim().takeIf { it.isNotEmpty() }

                line.startsWith("LAYOUT", ignoreCase = true) -> Unit

                else -> {
                    val header = sectionHeader(line)
                    if (header != null) {
                        section = header
                        return@forEachIndexed
                    }

                    val entry = cardLine(lineNumber, line, section)
                    if (entry != null) entries += entry
                    else skipped += Skipped(lineNumber, line, "not a card line")
                }
            }
        }

        return Parsed(deckName, author, entries, skipped)
    }

    private fun sectionHeader(line: String): Section? {
        if (line.first().isDigit()) return null

        val hash = HASH_HEADING.matchEntire(line)
        val text = hash?.groupValues?.get(1)?.trim() ?: line
        val bare = HEADER_DECORATION.replace(text, "").trim().lowercase()
        SECTION_HEADERS[bare]?.let { return it }

        return if (hash != null || CATEGORY_HEADING.matches(line)) Section.MAIN else null
    }

    private fun cardLine(lineNumber: Int, line: String, section: Section): Entry? {
        DCK_LINE.matchEntire(line)?.let { match ->
            val (sideboardMark, count, setCode, cardNumber, name) = match.destructured
            return Entry(
                lineNumber = lineNumber,
                text = line,
                count = count.toIntOrNull() ?: return null,
                name = name.trim(),
                printing = CardIndex.Printing(setCode.trim(), cardNumber.trim()),
                section = if (sideboardMark.isEmpty()) section else Section.SIDEBOARD,
            )
        }

        val match = CARD_LINE.matchEntire(line) ?: return null
        val (sideboardMark, count, rest) = match.destructured
        val (name, printing) = stripTrailers(rest)
        if (name.isEmpty()) return null

        return Entry(
            lineNumber = lineNumber,
            text = line,
            count = count.toIntOrNull() ?: 1,
            name = name,
            printing = printing,
            section = if (sideboardMark.isEmpty()) section else Section.SIDEBOARD,
        )
    }

    private fun stripTrailers(text: String): Pair<String, CardIndex.Printing?> {
        var name = text.trim()
        var printing: CardIndex.Printing? = null

        while (name.isNotEmpty()) {
            val marker = TRAILING_MARKER.matchEntire(name)
            if (marker != null) {
                name = marker.groupValues[1].trim()
                continue
            }

            val tag = TRAILING_TAG.matchEntire(name)
            if (tag != null) {
                name = tag.groupValues[1].trim()
                continue
            }

            val withPrinting = if (printing == null) TRAILING_PRINTING.matchEntire(name) else null
            val head = withPrinting?.groupValues?.get(1)?.trim()
            if (withPrinting != null && !head.isNullOrEmpty()) {
                printing = CardIndex.Printing(withPrinting.groupValues[2], withPrinting.groupValues[3])
                name = head
                continue
            }
            break
        }
        return name to printing
    }
}
