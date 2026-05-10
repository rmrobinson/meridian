package ca.rmrobinson.meridian.domain.usecase

import ca.rmrobinson.meridian.data.EventRepository
import ca.rmrobinson.meridian.data.local.EventEntity
import ca.rmrobinson.meridian.data.local.SyncState
import javax.inject.Inject

class DeleteEventUseCase @Inject constructor(
    private val repository: EventRepository,
) {
    /**
     * Deletes the event locally, then sends a DeleteEvent RPC if the event has been synced
     * to the server. LOCAL_ONLY events are deleted locally without a remote call since the
     * server has no record of them.
     * Throws on gRPC error — callers should handle.
     */
    suspend operator fun invoke(event: EventEntity) {
        repository.deleteLocal(event.id)
        if (event.syncState != SyncState.LOCAL_ONLY) {
            repository.deleteEventRemote(event.id)
        }
    }
}
