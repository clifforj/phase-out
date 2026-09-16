package online.commander.bridge.identity

import kotlin.random.Random

object Handles {

    val PATTERN = Regex("^[a-z0-9_]{3,14}$")

    private const val ALPHABET = "bcdfghjklmnpqrstvwxz0123456789"

    private const val LENGTH = 12

    fun generate(): String =
        (1..LENGTH).map { ALPHABET.random(Random) }.joinToString("")
}
