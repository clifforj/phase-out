package online.commander.bridge.identity

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class HandlesTest {

    @Test
    fun `every generated handle is a legal XMage username`() {
        repeat(1000) {
            val handle = Handles.generate()
            assertTrue(
                Handles.PATTERN.matches(handle),
                "generate() = '$handle' is outside ${Handles.PATTERN}",
            )
        }
    }

    @Test
    fun `every generated handle is exactly twelve characters`() {
        repeat(1000) {
            assertEquals(12, Handles.generate().length)
        }
    }

    @Test
    fun `no generated handle contains a vowel, y, underscore or hyphen`() {
        repeat(1000) {
            val handle = Handles.generate()
            for (forbidden in "aeiouy_-") {
                assertFalse(forbidden in handle, "'$handle' contains '$forbidden'")
            }
        }
    }

    @Test
    fun `repeated calls do not collide across ten thousand draws`() {
        val handles = (1..10_000).map { Handles.generate() }
        assertEquals(handles.size, handles.distinct().size, "an unexpected collision")
    }
}
