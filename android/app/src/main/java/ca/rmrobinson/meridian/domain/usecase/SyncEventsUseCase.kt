package ca.rmrobinson.meridian.domain.usecase

import ca.rmrobinson.meridian.data.EventRepository
import javax.inject.Inject

class SyncEventsUseCase @Inject constructor(
    private val repository: EventRepository,
) {
    /**
     * Full sync cycle:
     * 1. Pull line-family config from the server and upsert into Room.
     * 2. Pull all events from the server and upsert into Room (LOCAL_ONLY events are
     *    unaffected because their IDs don't collide with server IDs).
     * 3. Retry any LOCAL_ONLY events (created while offline) by re-submitting their
     *    CreateEvent RPCs. Successes replace the local placeholder with the server entity;
     *    failures are swallowed so a bad event doesn't block the rest.
     *
     * Throws on a top-level network / gRPC error (steps 1-2). Retry failures (step 3) are
     * silent — callers need not handle them separately.
     */
    suspend operator fun invoke() {
        repository.syncLineFamilies()
        repository.syncEvents()
        repository.retryLocalOnly()
    }
}
