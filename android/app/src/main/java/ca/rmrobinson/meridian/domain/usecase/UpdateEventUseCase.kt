package ca.rmrobinson.meridian.domain.usecase

import ca.rmrobinson.meridian.data.EventRepository
import ca.rmrobinson.meridian.data.toEntity
import meridian.v1.TimelineServiceGrpcKt
import meridian.v1.UpdateEventRequest
import javax.inject.Inject

class UpdateEventUseCase @Inject constructor(
    private val repository: EventRepository,
    private val grpcClient: ca.rmrobinson.meridian.data.remote.GrpcClient,
) {
    /**
     * Sends an UpdateEvent RPC, then upserts the returned event to Room as SYNCED.
     * Throws on gRPC error — callers should handle.
     */
    suspend operator fun invoke(request: UpdateEventRequest) {
        val stub: TimelineServiceGrpcKt.TimelineServiceCoroutineStub = grpcClient.timelineStub
        val response = stub.updateEvent(request)
        if (response.hasEvent()) {
            repository.saveLocal(response.event.toEntity())
        }
    }
}
