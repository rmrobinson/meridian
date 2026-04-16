package ca.rmrobinson.meridian.domain.usecase

import ca.rmrobinson.meridian.data.EventRepository
import javax.inject.Inject

class SyncEventsUseCase @Inject constructor(
    private val repository: EventRepository,
) {
    /**
     * Pulls line-family config then all events from the gRPC server and upserts
     * both into Room. Throws on network / gRPC error — callers should catch and
     * surface as a UI error state.
     */
    suspend operator fun invoke() {
        repository.syncLineFamilies()
        repository.syncEvents()
    }
}
