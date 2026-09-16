package online.commander.bridge

import org.slf4j.LoggerFactory
import java.io.BufferedReader
import java.io.InputStreamReader
import java.text.Normalizer
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap

class CardIndex(
    private val byName: Map<String, Card>,

    private val splitFronts: Map<String, String>,
) {

    val size: Int get() = byName.size

    class Card(
        val name: String,
        private val line: String,

        val canBeCommander: Boolean = false,

        val colors: String = "",

        val category: String = TypeCategory.OTHER,

        val manaCost: String = "",

        val partner: PartnerTag? = null,
    ) {
        fun printings(): List<Printing> = line.split(' ').mapNotNull(Printing::parse)

        fun pairsWith(other: Card): Boolean {
            val a = partner
            val b = other.partner
            return when {
                a is PartnerTag.Plain && b is PartnerTag.Plain -> true
                a is PartnerTag.Variant && b is PartnerTag.Variant -> a.codes.any { it in b.codes }
                a is PartnerTag.With -> a.name.equals(other.name, ignoreCase = true)
                b is PartnerTag.With -> b.name.equals(name, ignoreCase = true)
                a is PartnerTag.ChoosesBackground && b is PartnerTag.IsBackground -> true
                a is PartnerTag.IsBackground && b is PartnerTag.ChoosesBackground -> true
                a is PartnerTag.DoctorsCompanion && b is PartnerTag.Doctor -> true
                a is PartnerTag.Doctor && b is PartnerTag.DoctorsCompanion -> true
                else -> false
            }
        }
    }

    sealed interface PartnerTag {
        object Plain : PartnerTag
        data class With(val name: String) : PartnerTag
        data class Variant(val codes: List<String>) : PartnerTag
        object ChoosesBackground : PartnerTag
        object IsBackground : PartnerTag
        object DoctorsCompanion : PartnerTag
        object Doctor : PartnerTag

        val label: String
            get() = when (this) {
                Plain -> "Partner"
                is With -> "Partner with $name"
                is Variant -> codes.firstOrNull()?.let(CardIndex::variantLabel) ?: "Partner"
                ChoosesBackground -> "Choose a Background"
                IsBackground -> "Background"
                DoctorsCompanion -> "Doctor's companion"
                Doctor -> "Doctor"
            }
    }

    fun find(name: String): Card? {
        val key = normalize(name)
        return byName[key]
            ?: splitFronts[key]?.let(byName::get)
            ?: key.substringBefore(SPLIT).takeIf { it != key }?.let(byName::get)
    }

    fun resolve(name: String, wanted: Printing? = null): Resolution {
        val card = find(name) ?: return resolveRenamed(name, wanted)
        val printings = card.printings()
        val preferred = printings.firstOrNull() ?: return resolveRenamed(name, wanted)
        if (wanted == null) return Resolution.Exact(card, preferred)
        val match = printings.firstOrNull { it.satisfies(wanted) }
        return if (match != null) {
            Resolution.Exact(card, match)
        } else {
            Resolution.Substituted(card, preferred, wanted)
        }
    }

    private fun resolveRenamed(name: String, wanted: Printing?): Resolution {
        if (wanted == null || wanted.cardNumber.isEmpty()) return Resolution.Unknown
        val realName = nameOf(wanted) ?: return Resolution.Unknown
        val card = find(realName) ?: return Resolution.Unknown
        val match = card.printings().firstOrNull { it.satisfies(wanted) } ?: return Resolution.Unknown
        return Resolution.Renamed(card, match, name)
    }

    fun nameOf(printing: Printing): String? {
        if (printing.setCode.isEmpty() || printing.cardNumber.isEmpty()) return null
        val found = nameByPrinting.computeIfAbsent(printing.key()) {
            byName.values.firstOrNull { card -> card.printings().any { it.matches(printing) } }?.name ?: ""
        }
        return found.takeIf { it.isNotEmpty() }
    }

    private val nameByPrinting = ConcurrentHashMap<String, String>()

    data class Printing(val setCode: String, val cardNumber: String) {
        override fun toString(): String = "$setCode:$cardNumber"

        fun satisfies(request: Printing): Boolean =
            setCode.equals(request.setCode, ignoreCase = true) &&
                (request.cardNumber.isEmpty() || cardNumber.equals(request.cardNumber, ignoreCase = true))

        fun matches(other: Printing): Boolean =
            setCode.equals(other.setCode, ignoreCase = true) &&
                cardNumber.equals(other.cardNumber, ignoreCase = true)

        fun key(): String = "${setCode.lowercase(Locale.ROOT)}:${cardNumber.lowercase(Locale.ROOT)}"

        companion object {
            fun parse(text: String): Printing? {
                val separator = text.indexOf(':')
                if (separator <= 0 || separator == text.length - 1) return null
                return Printing(text.substring(0, separator), text.substring(separator + 1))
            }
        }
    }

    object TypeCategory {
        const val CREATURE = "C"
        const val PLANESWALKER = "P"
        const val BATTLE = "B"
        const val LAND = "L"
        const val INSTANT = "I"
        const val SORCERY = "S"
        const val ARTIFACT = "A"
        const val ENCHANTMENT = "E"
        const val OTHER = "O"

        val ORDER = listOf(CREATURE, PLANESWALKER, BATTLE, INSTANT, SORCERY, ARTIFACT, ENCHANTMENT, LAND, OTHER)

        private val NAMES = mapOf(
            CREATURE to "Creatures",
            PLANESWALKER to "Planeswalkers",
            BATTLE to "Battles",
            LAND to "Lands",
            INSTANT to "Instants",
            SORCERY to "Sorceries",
            ARTIFACT to "Artifacts",
            ENCHANTMENT to "Enchantments",
            OTHER to "Other",
        )

        fun nameOf(category: String): String = NAMES[category] ?: NAMES.getValue(OTHER)
    }

    sealed interface Resolution {
        data class Exact(val card: Card, val printing: Printing) : Resolution
        data class Substituted(val card: Card, val printing: Printing, val wanted: Printing) : Resolution

        data class Renamed(val card: Card, val printing: Printing, val asName: String) : Resolution

        object Unknown : Resolution

        fun cardOrNull(): Card? = when (this) {
            is Exact -> card
            is Substituted -> card
            is Renamed -> card
            is Unknown -> null
        }
    }

    companion object {
        private val log = LoggerFactory.getLogger("bridge.cards")

        const val RESOURCE = "/card-index.txt"

        val bundled: CardIndex by lazy {
            val stream = CardIndex::class.java.getResourceAsStream(RESOURCE)
            if (stream == null) {
                log.warn(
                    "no {} on the classpath — deck import cannot resolve card names. " +
                        "Run `node tools/cards/build.mjs` and rebuild.",
                    RESOURCE,
                )
                return@lazy CardIndex(emptyMap(), emptyMap())
            }
            val index = stream.use {
                parse(BufferedReader(InputStreamReader(it, Charsets.UTF_8)).lineSequence())
            }
            log.info("card index loaded: {} card name(s)", index.size)
            index
        }

        fun parse(lines: Sequence<String>): CardIndex {
            val byName = HashMap<String, Card>(1 shl 16)
            val fronts = HashMap<String, String>()
            for (line in lines) {
                if (line.isEmpty() || line.startsWith("#")) continue

                val fields = line.split('\t')
                if (fields.size < 4 || fields[0].isEmpty()) continue
                val name = fields[0]
                val key = normalize(name)
                val flags = if (fields.size > 4) fields[4] else ""
                val extra = if (fields.size > 6) fields[6] else ""
                byName[key] = Card(
                    name = name,
                    line = fields[1],
                    category = fields[2],
                    manaCost = fields[3],
                    canBeCommander = COMMANDER_FLAG in flags,
                    colors = if (fields.size > 5) fields[5] else "",
                    partner = parsePartnerTag(flags, extra),
                )
                val split = key.indexOf(SPLIT)
                if (split > 0) fronts[key.substring(0, split)] = key
            }
            fronts.keys.removeAll(byName.keys)
            return CardIndex(byName, fronts)
        }

        private const val SPLIT = "//"

        private val VARIANT_LABELS = mapOf(
            "FATHER_AND_SON" to "Father & son",
            "FRIENDS_FOREVER" to "Friends forever",
            "SURVIVORS" to "Survivors",
            "CHARACTER_SELECT" to "Character select",
        )

        fun variantLabel(code: String): String = VARIANT_LABELS[code] ?: "Partner"

        private const val COMMANDER_FLAG = 'C'
        private const val PARTNER_FLAG = 'P'
        private const val PARTNER_WITH_FLAG = 'W'
        private const val PARTNER_VARIANT_FLAG = 'V'
        private const val CHOOSE_BACKGROUND_FLAG = 'K'
        private const val IS_BACKGROUND_FLAG = 'G'
        private const val DOCTORS_COMPANION_FLAG = 'N'
        private const val IS_DOCTOR_FLAG = 'T'

        private fun parsePartnerTag(flags: String, extra: String): PartnerTag? = when {
            PARTNER_FLAG in flags -> PartnerTag.Plain
            PARTNER_WITH_FLAG in flags -> PartnerTag.With(extra)
            PARTNER_VARIANT_FLAG in flags -> PartnerTag.Variant(extra.split(','))
            CHOOSE_BACKGROUND_FLAG in flags -> PartnerTag.ChoosesBackground
            IS_BACKGROUND_FLAG in flags -> PartnerTag.IsBackground
            DOCTORS_COMPANION_FLAG in flags -> PartnerTag.DoctorsCompanion
            IS_DOCTOR_FLAG in flags -> PartnerTag.Doctor
            else -> null
        }

        private val COMBINING = Regex("\\p{Mn}+")
        private val WHITESPACE = Regex("\\s+")
        private val SPLIT_SEPARATOR = Regex("\\s*/+\\s*")

        fun normalize(name: String): String {
            val unified = name.trim()
                .replace('\u2019', '\'')
                .replace('\u2018', '\'')
                .replace('\u2013', '-')
                .replace('\u2014', '-')
            val folded = COMBINING.replace(Normalizer.normalize(unified, Normalizer.Form.NFD), "")
            return WHITESPACE.replace(SPLIT_SEPARATOR.replace(folded, SPLIT), " ")
                .lowercase(Locale.ROOT)
                .trim()
        }
    }
}
