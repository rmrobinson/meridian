package ca.rmrobinson.meridian.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class BcbpParserTest {

    /**
     * Builds a minimal valid single-leg BCBP mandatory section (60 chars).
     * Fields are auto-padded / truncated to the required widths so tests
     * can pass short convenient values without counting spaces.
     */
    private fun buildLeg1(
        name: String = "DOE/JOHN",        // padded to 20
        eTicket: Char = 'E',
        pnr: String = "ABC1234",          // padded to 7
        origin: String = "YYZ",           // exactly 3
        dest: String = "LHR",             // exactly 3
        carrier: String = "AC",           // padded to 3
        flight: String = "0301",          // padded to 5
        julian: String = "165",           // exactly 3
        compartment: Char = 'Y',
        seat: String = "034A",            // exactly 4
        sequence: String = "00123",       // exactly 5
        paxStatus: Char = '0',
        conditionalSize: String = "00",   // exactly 2
        legCount: Char = '1',
    ): String {
        fun String.pad(len: Int) = padEnd(len).take(len)
        return "M$legCount" +
            name.pad(20) +
            eTicket +
            pnr.pad(7) +
            origin.pad(3) +
            dest.pad(3) +
            carrier.pad(3) +
            flight.pad(5) +
            julian.pad(3) +
            compartment +
            seat.pad(4) +
            sequence.pad(5) +
            paxStatus +
            conditionalSize.pad(2)
    }

    // -------------------------------------------------------------------------
    // Too-short / invalid inputs
    // -------------------------------------------------------------------------

    @Test
    fun `returns null for too-short string`() {
        assertNull(BcbpParser.parse("M1DOE/JOHN"))
    }

    @Test
    fun `returns null for string shorter than 60 chars`() {
        assertNull(BcbpParser.parse("M1" + "A".repeat(57)))
    }

    @Test
    fun `returns null when leg count is zero`() {
        assertNull(BcbpParser.parse("M0" + " ".repeat(58)))
    }

    // -------------------------------------------------------------------------
    // Single-leg parsing
    // -------------------------------------------------------------------------

    @Test
    fun `parses single-leg boarding pass`() {
        val bcbp = buildLeg1()
        val result = BcbpParser.parse(bcbp)
        assertNotNull(result)
        assertEquals(1, result!!.size)
        with(result[0]) {
            assertEquals("DOE/JOHN", passengerName)
            assertEquals("AC", operatingCarrierDesignator)
            assertEquals("0301", flightNumber)
            assertEquals("YYZ", originAirport)
            assertEquals("LHR", destinationAirport)
            assertEquals(165, julianDate)
            assertEquals("Y", compartmentCode)
            assertEquals("034A", seatNumber)
            assertEquals("00123", sequenceNumber)
        }
    }

    @Test
    fun `trims whitespace from padded fields`() {
        // Padding adds trailing spaces — parser must trim them
        val bcbp = buildLeg1(
            name    = "SMITH/JANE",
            flight  = "0042",
            carrier = "WS",
        )
        val result = BcbpParser.parse(bcbp)!!
        assertEquals("SMITH/JANE", result[0].passengerName)
        assertEquals("0042", result[0].flightNumber)
        assertEquals("WS", result[0].operatingCarrierDesignator)
    }

    @Test
    fun `handles julian date at year boundaries`() {
        val jan = buildLeg1(julian = "001")
        val dec = buildLeg1(julian = "366")
        assertEquals(1, BcbpParser.parse(jan)!![0].julianDate)
        assertEquals(366, BcbpParser.parse(dec)!![0].julianDate)
    }

    // -------------------------------------------------------------------------
    // Two-leg boarding pass
    // -------------------------------------------------------------------------

    @Test
    fun `parses two-leg boarding pass`() {
        // Build leg 1 with legCount=2 and conditional size 00
        val leg1 = buildLeg1(
            name     = "DOE/JOHN",
            origin   = "YYZ",
            dest     = "ORD",
            carrier  = "UA",
            flight   = "0500",
            julian   = "165",
            seat     = "034A",
            sequence = "00123",
            legCount = '2',
        )
        assertEquals(60, leg1.length)

        // Repeated section for leg 2 (30 chars): origin(3)+dest(3)+carrier(3)+
        // flight(5)+julian(3)+compartment(1)+seat(4)+seq(5)+paxStatus(1)+condSize(2)
        fun String.pad(len: Int) = padEnd(len).take(len)
        val leg2 = "ORD".pad(3) +
            "LHR".pad(3) +
            "UA".pad(3) +
            "0600".pad(5) +
            "165".pad(3) +
            "Y" +
            "012B".pad(4) +
            "00045".pad(5) +
            "0" +
            "00"

        val bcbp = "$leg1>$leg2"

        val result = BcbpParser.parse(bcbp)
        assertNotNull(result)
        assertEquals(2, result!!.size)

        with(result[0]) {
            assertEquals("YYZ", originAirport)
            assertEquals("ORD", destinationAirport)
            assertEquals("UA", operatingCarrierDesignator)
            assertEquals("0500", flightNumber)
        }
        with(result[1]) {
            assertEquals("DOE/JOHN", passengerName)  // inherited from leg 1
            assertEquals("ORD", originAirport)
            assertEquals("LHR", destinationAirport)
            assertEquals("UA", operatingCarrierDesignator)
            assertEquals("0600", flightNumber)
            assertEquals("012B", seatNumber)
        }
    }
}
