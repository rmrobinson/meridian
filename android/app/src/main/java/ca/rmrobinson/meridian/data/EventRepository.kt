package ca.rmrobinson.meridian.data

import ca.rmrobinson.meridian.data.local.EventDao
import ca.rmrobinson.meridian.data.local.EventEntity
import ca.rmrobinson.meridian.data.local.LineFamilyDao
import ca.rmrobinson.meridian.data.local.LineFamilyEntity
import ca.rmrobinson.meridian.data.local.SyncState
import ca.rmrobinson.meridian.data.remote.EventRemoteSource
import kotlinx.coroutines.flow.Flow
import meridian.v1.CreateEventRequest
import meridian.v1.UpdateEventRequest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class EventRepository @Inject constructor(
    private val eventDao: EventDao,
    private val lineFamilyDao: LineFamilyDao,
    private val remote: EventRemoteSource,
) {
    // --- Local reads ---

    fun observeEvents(): Flow<List<EventEntity>> = eventDao.observeAll()

    fun observeOpenSpans(): Flow<List<EventEntity>> = eventDao.observeOpenSpans()

    fun observeLineFamilies(): Flow<List<LineFamilyEntity>> = lineFamilyDao.observeAll()

    suspend fun getEvent(id: String): EventEntity? = eventDao.getById(id)

    suspend fun getLineKeysByFamilyId(familyId: String): Set<String> =
        eventDao.getLineKeysByFamilyId(familyId).toSet()

    // --- Sync (pull from server) ---

    suspend fun syncLineFamilies() {
        val families = remote.listLineFamilies().map { it.toEntity() }
        lineFamilyDao.upsertAll(families)
    }

    suspend fun syncEvents() {
        val now = System.currentTimeMillis()
        val events = remote.listEvents().map { it.toEntity(now) }
        eventDao.upsertAll(events)
    }

    // --- Remote write operations ---

    /**
     * Sends a CreateEvent RPC and returns the server-assigned entity (SYNCED), or null
     * if the server response contained no event.
     */
    suspend fun createEventRemote(request: CreateEventRequest): EventEntity? {
        val event = remote.createEvent(request) ?: return null
        return event.toEntity()
    }

    /**
     * Sends an UpdateEvent RPC and returns the updated entity (SYNCED), or null
     * if the server response contained no event.
     */
    suspend fun updateEventRemote(request: UpdateEventRequest): EventEntity? {
        val event = remote.updateEvent(request) ?: return null
        return event.toEntity()
    }

    // --- Retry queue ---

    /**
     * Attempts to push all LOCAL_ONLY events to the server.
     * On success for each event: deletes the local placeholder, saves the server entity.
     * Failures are swallowed per-event so a single failure doesn't block the rest.
     */
    suspend fun retryLocalOnly() {
        val localOnly = eventDao.getLocalOnly()
        for (entity in localOnly) {
            try {
                val serverEntity = createEventRemote(entity.toCreateRequest()) ?: continue
                // Write the server entity before deleting the placeholder so a Room failure
                // can't leave the user with no record.
                eventDao.upsert(serverEntity)
                eventDao.deleteById(entity.id)
            } catch (_: Exception) {
                // Leave as LOCAL_ONLY; will retry on next sync
            }
        }
    }

    // --- Local writes (optimistic, sync state managed by use-cases) ---

    suspend fun saveLocal(event: EventEntity) {
        eventDao.upsert(event)
    }

    suspend fun markSynced(event: EventEntity) {
        eventDao.upsert(event.copy(syncState = SyncState.SYNCED, updatedAt = System.currentTimeMillis()))
    }

    suspend fun deleteLocal(id: String) {
        eventDao.deleteById(id)
    }
}
