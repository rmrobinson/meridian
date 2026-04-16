package ca.rmrobinson.meridian.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class IsbnValidatorTest {

    // -------------------------------------------------------------------------
    // ISBN-13 validation
    // -------------------------------------------------------------------------

    @Test
    fun `valid ISBN-13 passes`() {
        // Dune by Frank Herbert
        assertTrue(IsbnValidator.isValid("9780441013593"))
    }

    @Test
    fun `valid ISBN-13 with hyphens passes`() {
        assertTrue(IsbnValidator.isValid("978-0-441-01359-3"))
    }

    @Test
    fun `invalid ISBN-13 checksum fails`() {
        // Flip last digit
        assertFalse(IsbnValidator.isValid("9780441013594"))
    }

    @Test
    fun `ISBN-13 with wrong check digit fails`() {
        // 9780441013593 is valid; change last digit to 4 → invalid
        assertFalse(IsbnValidator.isValid("9780441013594"))
    }

    // -------------------------------------------------------------------------
    // ISBN-10 validation
    // -------------------------------------------------------------------------

    @Test
    fun `valid ISBN-10 passes`() {
        // The Pragmatic Programmer (old edition)
        assertTrue(IsbnValidator.isValid("020161622X"))
    }

    @Test
    fun `valid ISBN-10 with hyphens passes`() {
        assertTrue(IsbnValidator.isValid("0-201-61622-X"))
    }

    @Test
    fun `valid ISBN-10 without X check digit passes`() {
        assertTrue(IsbnValidator.isValid("0306406152"))
    }

    @Test
    fun `invalid ISBN-10 checksum fails`() {
        assertFalse(IsbnValidator.isValid("0306406151"))
    }

    // -------------------------------------------------------------------------
    // Edge cases
    // -------------------------------------------------------------------------

    @Test
    fun `empty string fails`() {
        assertFalse(IsbnValidator.isValid(""))
    }

    @Test
    fun `wrong length fails`() {
        assertFalse(IsbnValidator.isValid("97804410135"))  // 11 digits
    }

    @Test
    fun `non-numeric content fails`() {
        assertFalse(IsbnValidator.isValid("978044101359X"))  // X not valid in ISBN-13
    }

    // -------------------------------------------------------------------------
    // normalize()
    // -------------------------------------------------------------------------

    @Test
    fun `normalize returns ISBN-13 unchanged`() {
        assertEquals("9780441013593", IsbnValidator.normalize("9780441013593"))
    }

    @Test
    fun `normalize converts ISBN-10 to ISBN-13`() {
        // 0306406152 → 9780306406157
        assertEquals("9780306406157", IsbnValidator.normalize("0306406152"))
    }

    @Test
    fun `normalize strips hyphens before processing`() {
        assertEquals("9780441013593", IsbnValidator.normalize("978-0-441-01359-3"))
    }

    @Test
    fun `normalize returns null for invalid ISBN`() {
        assertNull(IsbnValidator.normalize("1234567890"))
    }
}
