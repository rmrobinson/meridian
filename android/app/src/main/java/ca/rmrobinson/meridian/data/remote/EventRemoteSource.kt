package ca.rmrobinson.meridian.data.remote

import meridian.v1.CreateEventRequest
import meridian.v1.Event
import meridian.v1.ListEventsRequest
import meridian.v1.ListLineFamiliesRequest
import meridian.v1.TimelineServiceGrpcKt
import meridian.v1.UpdateEventRequest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class EventRemoteSource @Inject constructor(
    private val grpcClient: GrpcClient,
) {
    private val stub: TimelineServiceGrpcKt.TimelineServiceCoroutineStub
        get() = grpcClient.timelineStub

    suspend fun listLineFamilies() =
        stub.listLineFamilies(ListLineFamiliesRequest.getDefaultInstance()).familiesList

    suspend fun listEvents() =
        stub.listEvents(ListEventsRequest.getDefaultInstance()).eventsList

    /** Sends a CreateEvent RPC; returns the server-assigned [Event] or null if the response lacks one. */
    suspend fun createEvent(request: CreateEventRequest): Event? {
        val response = stub.createEvent(request)
        return if (response.hasEvent()) response.event else null
    }

    /** Sends an UpdateEvent RPC; returns the updated [Event] or null if the response lacks one. */
    suspend fun updateEvent(request: UpdateEventRequest): Event? {
        val response = stub.updateEvent(request)
        return if (response.hasEvent()) response.event else null
    }
}
