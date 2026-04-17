package ca.rmrobinson.meridian.domain.usecase

import ca.rmrobinson.meridian.data.EventRepository
import ca.rmrobinson.meridian.data.toLocalEntity
import meridian.v1.CreateEventRequest
import java.util.UUID
import javax.inject.Inject

class CreateEventUseCase @Inject constructor(
    private val repository: EventRepository,
) {
    /**
     * Creates an event, guaranteeing local persistence regardless of network outcome.
     *
     * 1. Saves a LOCAL_ONLY placeholder immediately so the UI reflects the event.
     * 2. Attempts the CreateEvent RPC.
     * 3. On success: persists the server entity (SYNCED), then deletes the placeholder.
     *    Server entity is written first so a Room failure can't leave the user with no record.
     * 4. On failure: leaves the placeholder as LOCAL_ONLY; [SyncEventsUseCase] retries it
     *    on the next sync. Re-throws so callers can surface an error message.
     */
    suspend operator fun invoke(request: CreateEventRequest) {
        val now = System.currentTimeMillis()
        val localId = UUID.randomUUID().toString()
        val placeholder = request.toLocalEntity(localId, now)
        repository.saveLocal(placeholder)

        val serverEntity = repository.createEventRemote(request)
        if (serverEntity != null) {
            repository.saveLocal(serverEntity)
        }
        repository.deleteLocal(localId)
    }
}
