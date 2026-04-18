package ca.rmrobinson.meridian.data.remote

import android.util.Log
import meridian.v1.CreateEventRequest
import meridian.v1.Event
import meridian.v1.ListEventsRequest
import meridian.v1.ListLineFamiliesRequest
import meridian.v1.TimelineServiceGrpcKt
import meridian.v1.UpdateEventRequest
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "EventRemoteSource"

@Singleton
class EventRemoteSource @Inject constructor(
    private val grpcClient: GrpcClient,
) {
    private val stub: TimelineServiceGrpcKt.TimelineServiceCoroutineStub
        get() = grpcClient.timelineStub

    suspend fun listLineFamilies(): List<meridian.v1.LineFamilyConfig> {
        Log.d(TAG, "listLineFamilies: sending RPC")
        return try {
            val result = stub.listLineFamilies(ListLineFamiliesRequest.getDefaultInstance()).familiesList
            Log.d(TAG, "listLineFamilies: received ${result.size} families")
            result
        } catch (e: Exception) {
            Log.e(TAG, "listLineFamilies: RPC failed", e)
            throw e
        }
    }

    suspend fun listEvents(): List<Event> {
        Log.d(TAG, "listEvents: sending RPC")
        return try {
            val result = stub.listEvents(ListEventsRequest.getDefaultInstance()).eventsList
            Log.d(TAG, "listEvents: received ${result.size} events")
            result
        } catch (e: Exception) {
            Log.e(TAG, "listEvents: RPC failed", e)
            throw e
        }
    }

    /** Sends a CreateEvent RPC; returns the server-assigned [Event] or null if the response lacks one. */
    suspend fun createEvent(request: CreateEventRequest): Event? {
        Log.d(TAG, "createEvent: sending RPC lineKey=${request.lineKey}")
        return try {
            val response = stub.createEvent(request)
            val event = if (response.hasEvent()) response.event else null
            if (event == null) Log.w(TAG, "createEvent: response contained no event")
            else Log.d(TAG, "createEvent: success id=${event.id}")
            event
        } catch (e: Exception) {
            Log.e(TAG, "createEvent: RPC failed", e)
            throw e
        }
    }

    /** Sends an UpdateEvent RPC; returns the updated [Event] or null if the response lacks one. */
    suspend fun updateEvent(request: UpdateEventRequest): Event? {
        Log.d(TAG, "updateEvent: sending RPC id=${request.id}")
        return try {
            val response = stub.updateEvent(request)
            val event = if (response.hasEvent()) response.event else null
            if (event == null) Log.w(TAG, "updateEvent: response contained no event")
            else Log.d(TAG, "updateEvent: success id=${event.id}")
            event
        } catch (e: Exception) {
            Log.e(TAG, "updateEvent: RPC failed", e)
            throw e
        }
    }
}
