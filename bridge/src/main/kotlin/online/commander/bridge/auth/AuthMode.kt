package online.commander.bridge.auth

enum class AuthMode {

    OFF,

    REQUIRED,

    ;

    companion object {

        fun parse(text: String?): AuthMode {
            val trimmed = text?.trim().orEmpty()
            if (trimmed.isEmpty()) return OFF
            return values().firstOrNull { it.name.equals(trimmed, ignoreCase = true) }
                ?: throw IllegalArgumentException(
                    "BRIDGE_AUTH_MODE must be one of ${values().joinToString { it.name.lowercase() }}, " +
                        "not '$trimmed'",
                )
        }
    }
}
