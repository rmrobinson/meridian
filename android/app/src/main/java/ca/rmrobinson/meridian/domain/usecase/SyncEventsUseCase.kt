package ca.rmrobinson.meridian.domain.usecase

import ca.rmrobinson.meridian.data.EventRepository
import javax.inject.Inject

class SyncEventsUseCase @Inject constructor(
    private val repository: EventRepository,
) {
    /**
     * Full sync cycle:
     * 1. Pull line-family config from the server and upsert into Room.
     * 2. Pull all events from the server and upsert into Room (LOCAL_ONLY and PENDING_UPDATE
     *    events are unaffected because their IDs don't collide with server IDs).
     * 3. Retry any LOCAL_ONLY events (created while offline) by re-submitting their
     *    CreateEvent RPCs.
     * 4. Retry any PENDING_UPDATE events (updated while offline or whose RPC was interrupted)
     *    by re-submitting their UpdateEvent RPCs.
     *
     * Throws on a top-level network / gRPC error (steps 1-2). Retry failures (steps 3-4) are
     * swallowed per-event so a single bad event doesn't block the rest.
     */
    suspend operator fun invoke() {
        repository.syncLineFamilies()
        repository.syncEvents()
        repository.retryLocalOnly()
        repository.retryPendingUpdates()
    }
}
