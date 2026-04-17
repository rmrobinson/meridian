package ca.rmrobinson.meridian.util

/**
 * Parser for IATA Resolution 792 Bar Coded Boarding Pass (BCBP) strings.
 *
 * Handles both single-leg and multi-leg boarding passes. The format starts with
 * a mandatory section followed by zero or more repeated leg sections.
 *
 * Mandatory section layout (all positions are 0-based):
 *   [0]     format code          1 char  ('M')
 *   [1]     number of legs       1 char  (ASCII digit '1'..'9')
 *   [2..21] passenger name       20 char (last/first, space-padded)
 *   [22]    electronic ticket    1 char
 *   [23..29] PNR                 7 char
 *   [30..32] origin IATA         3 char
 *   [33..35] destination IATA    3 char
 *   [36..38] operating carrier   3 char
 *   [39..43] flight number       5 char (numeric + optional suffix)
 *   [44..46] Julian date         3 char
 *   [47]    compartment code     1 char
 *   [48..51] seat number         4 char
 *   [52..56] sequence number     5 char
 *   [57]    passenger status     1 char
 *   [58..59] field size          2 char (hex) for conditional + airline data
 *
 * Repeated leg sections start at position 60 + conditional/airline size of leg 1.
 * Each repeated leg begins at a '>' marker and follows the same layout starting
 * at offsets 0..2 (origin/dest/carrier skipped — they follow immediately).
 *
 * This parser reads the mandatory section for leg 1 and repeated sections for
 * subsequent legs. Fields that are space-padded are trimmed.
 */
object BcbpParser {

    data class ParsedFlight(
        val passengerName: String,
        val operatingCarrierDesignator: String,
        val flightNumber: String,
        val originAirport: String,
        val destinationAirport: String,
        /** Day of year (1–366). Resolve to a calendar date with [julianToDate]. */
        val julianDate: Int,
        val compartmentCode: String,
        val seatNumber: String,
        val sequenceNumber: String,
    )

    /**
     * Parses [bcbp] and returns one [ParsedFlight] per leg, or null if the
     * string is too short or structurally invalid for the first leg.
     */
    fun parse(bcbp: String): List<ParsedFlight>? {
        if (bcbp.length < 60) return null

        val legCount = bcbp[1].digitToIntOrNull() ?: return null
        if (legCount < 1) return null

        val results = mutableListOf<ParsedFlight>()

        // --- Leg 1: mandatory section ---
        val leg1 = parseMandatorySection(bcbp) ?: return null
        results.add(leg1)

        if (legCount == 1) return results

        // Determine where leg 2+ starts: position 60 + conditional field size (hex at [58..59])
        val conditionalSizeHex = bcbp.substring(58, 60).trim()
        val conditionalSize = conditionalSizeHex.toIntOrNull(16) ?: 0
        var cursor = 60 + conditionalSize

        // --- Legs 2..N: repeated sections starting with '>' ---
        for (leg in 2..legCount) {
            if (cursor >= bcbp.length) break
            // Find the next '>' marker
            val markerIdx = bcbp.indexOf('>', cursor)
            if (markerIdx < 0) break
            val legStart = markerIdx + 1
            val repeated = parseRepeatedSection(bcbp, legStart, leg1.passengerName) ?: break
            results.add(repeated)
            // Advance cursor: mandatory repeated data is 30 chars; conditional size at [28..29]
            val repConditionalHex = safeSubstring(bcbp, legStart + 28, legStart + 30)?.trim() ?: "00"
            val repConditionalSize = repConditionalHex.toIntOrNull(16) ?: 0
            cursor = legStart + 30 + repConditionalSize
        }

        return results
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private fun parseMandatorySection(bcbp: String): ParsedFlight? {
        return try {
            ParsedFlight(
                passengerName              = bcbp.substring(2, 22).trim(),
                operatingCarrierDesignator = bcbp.substring(36, 39).trim(),
                flightNumber               = bcbp.substring(39, 44).trim(),
                originAirport              = bcbp.substring(30, 33).trim(),
                destinationAirport         = bcbp.substring(33, 36).trim(),
                julianDate                 = bcbp.substring(44, 47).trim().toInt(),
                compartmentCode            = bcbp.substring(47, 48).trim(),
                seatNumber                 = bcbp.substring(48, 52).trim(),
                sequenceNumber             = bcbp.substring(52, 57).trim(),
            )
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Repeated section layout (relative offsets from [start]):
     *   [0..2]  origin IATA         3 char
     *   [3..5]  destination IATA    3 char
     *   [6..8]  operating carrier   3 char
     *   [9..13] flight number       5 char
     *   [14..16] Julian date        3 char
     *   [17]    compartment code    1 char
     *   [18..21] seat number        4 char
     *   [22..26] sequence number    5 char
     *   [27]    passenger status    1 char
     *   [28..29] field size (hex)   2 char
     */
    private fun parseRepeatedSection(bcbp: String, start: Int, passengerName: String): ParsedFlight? {
        return try {
            ParsedFlight(
                passengerName              = passengerName,
                originAirport              = bcbp.substring(start, start + 3).trim(),
                destinationAirport         = bcbp.substring(start + 3, start + 6).trim(),
                operatingCarrierDesignator = bcbp.substring(start + 6, start + 9).trim(),
                flightNumber               = bcbp.substring(start + 9, start + 14).trim(),
                julianDate                 = bcbp.substring(start + 14, start + 17).trim().toInt(),
                compartmentCode            = bcbp.substring(start + 17, start + 18).trim(),
                seatNumber                 = bcbp.substring(start + 18, start + 22).trim(),
                sequenceNumber             = bcbp.substring(start + 22, start + 27).trim(),
            )
        } catch (_: Exception) {
            null
        }
    }

    private fun safeSubstring(s: String, from: Int, to: Int): String? =
        if (from >= 0 && to <= s.length && from < to) s.substring(from, to) else null
}
