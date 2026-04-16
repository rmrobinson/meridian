package ca.rmrobinson.meridian.data

import ca.rmrobinson.meridian.data.local.EventDao
import ca.rmrobinson.meridian.data.local.EventEntity
import ca.rmrobinson.meridian.data.local.LineFamilyDao
import ca.rmrobinson.meridian.data.local.LineFamilyEntity
import ca.rmrobinson.meridian.data.local.SyncState
import ca.rmrobinson.meridian.data.remote.EventRemoteSource
import kotlinx.coroutines.flow.Flow
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
