package ca.rmrobinson.meridian.util

/**
 * ISBN-10 and ISBN-13 checksum validation.
 *
 * Accepts raw strings with or without hyphens/spaces. Strips all non-digit characters
 * before computing the checksum. For ISBN-10 the final character may be 'X' (= 10).
 */
object IsbnValidator {

    /**
     * Returns true if [raw] is a valid ISBN-10 or ISBN-13. Leading/trailing whitespace
     * and embedded hyphens are ignored. Returns false for empty or unrecognized lengths.
     */
    fun isValid(raw: String): Boolean {
        val digits = raw.trim().replace("-", "").replace(" ", "")
        return when (digits.length) {
            10 -> isValidIsbn10(digits)
            13 -> isValidIsbn13(digits)
            else -> false
        }
    }

    /**
     * Normalises [raw] to a 13-digit ISBN-13 string, or returns null if invalid.
     * ISBN-10 inputs are converted to ISBN-13 (978 prefix + recalculated check digit).
     */
    fun normalize(raw: String): String? {
        val digits = raw.trim().replace("-", "").replace(" ", "")
        return when {
            digits.length == 13 && isValidIsbn13(digits) -> digits
            digits.length == 10 && isValidIsbn10(digits) -> isbn10ToIsbn13(digits)
            else -> null
        }
    }

    // -------------------------------------------------------------------------

    private fun isValidIsbn10(s: String): Boolean {
        if (s.length != 10) return false
        var sum = 0
        for (i in 0..8) {
            val d = s[i].digitToIntOrNull() ?: return false
            sum += d * (10 - i)
        }
        val checkChar = s[9]
        val check = if (checkChar == 'X' || checkChar == 'x') 10 else checkChar.digitToIntOrNull() ?: return false
        sum += check
        return sum % 11 == 0
    }

    private fun isValidIsbn13(s: String): Boolean {
        if (s.length != 13) return false
        var sum = 0
        for (i in 0..12) {
            val d = s[i].digitToIntOrNull() ?: return false
            sum += if (i % 2 == 0) d else d * 3
        }
        return sum % 10 == 0
    }

    private fun isbn10ToIsbn13(isbn10: String): String {
        val base = "978" + isbn10.substring(0, 9)
        var sum = 0
        for (i in 0..11) {
            val d = base[i].digitToInt()
            sum += if (i % 2 == 0) d else d * 3
        }
        val check = (10 - (sum % 10)) % 10
        return base + check.toString()
    }
}
