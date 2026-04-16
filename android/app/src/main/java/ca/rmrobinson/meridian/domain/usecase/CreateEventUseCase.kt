package ca.rmrobinson.meridian.domain.usecase

import ca.rmrobinson.meridian.data.EventRepository
import ca.rmrobinson.meridian.data.toEntity
import meridian.v1.CreateEventRequest
import meridian.v1.TimelineServiceGrpcKt
import javax.inject.Inject

class CreateEventUseCase @Inject constructor(
    private val repository: EventRepository,
    private val grpcClient: ca.rmrobinson.meridian.data.remote.GrpcClient,
) {
    /**
     * Sends a CreateEvent RPC, then persists the returned event to Room as SYNCED.
     * Throws on gRPC error — callers should handle.
     */
    suspend operator fun invoke(request: CreateEventRequest) {
        val stub: TimelineServiceGrpcKt.TimelineServiceCoroutineStub = grpcClient.timelineStub
        val response = stub.createEvent(request)
        if (response.hasEvent()) {
            repository.saveLocal(response.event.toEntity())
        }
    }
}
