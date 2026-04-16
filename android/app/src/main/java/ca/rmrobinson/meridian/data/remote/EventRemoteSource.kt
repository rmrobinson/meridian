package ca.rmrobinson.meridian.data.remote

import meridian.v1.ListEventsRequest
import meridian.v1.ListLineFamiliesRequest
import meridian.v1.TimelineServiceGrpcKt
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
}
