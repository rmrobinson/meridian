package ca.rmrobinson.meridian.domain.usecase

import ca.rmrobinson.meridian.data.EventRepository
import meridian.v1.UpdateEventRequest
import javax.inject.Inject

class UpdateEventUseCase @Inject constructor(
    private val repository: EventRepository,
) {
    /**
     * Sends an UpdateEvent RPC, then upserts the returned event to Room as SYNCED.
     * Throws on gRPC error — callers should handle.
     */
    suspend operator fun invoke(request: UpdateEventRequest) {
        val serverEntity = repository.updateEventRemote(request)
        if (serverEntity != null) {
            repository.saveLocal(serverEntity)
        }
    }
}
