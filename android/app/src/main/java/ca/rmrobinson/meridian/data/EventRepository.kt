package ca.rmrobinson.meridian.data

import android.util.Log
import ca.rmrobinson.meridian.data.healthconnect.HealthActivity
import ca.rmrobinson.meridian.data.local.EventDao
import ca.rmrobinson.meridian.data.local.EventEntity
import ca.rmrobinson.meridian.data.local.HcEventLinkDao
import ca.rmrobinson.meridian.data.local.HcEventLinkEntity
import ca.rmrobinson.meridian.data.local.HcLinkStatus
import ca.rmrobinson.meridian.data.local.LineFamilyDao
import ca.rmrobinson.meridian.data.local.LineFamilyEntity
import ca.rmrobinson.meridian.data.local.SyncState
import ca.rmrobinson.meridian.data.remote.EventRemoteSource
import kotlinx.coroutines.flow.Flow
import meridian.v1.CreateEventRequest
import meridian.v1.UpdateEventRequest
import ca.rmrobinson.meridian.data.toUpdateRequest
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "EventRepository"

@Singleton
class EventRepository @Inject constructor(
    private val eventDao: EventDao,
    private val lineFamilyDao: LineFamilyDao,
    private val hcEventLinkDao: HcEventLinkDao,
    private val remote: EventRemoteSource,
) {
    // --- Local reads ---

    fun observeEvents(): Flow<List<EventEntity>> = eventDao.observeAll()

    fun observeOpenSpans(): Flow<List<EventEntity>> = eventDao.observeOpenSpans()

    fun observeLineFamilies(): Flow<List<LineFamilyEntity>> = lineFamilyDao.observeAll()

    suspend fun getEvent(id: String): EventEntity? = eventDao.getById(id)

    suspend fun getLineKeysByFamilyId(familyId: String): Set<String> =
        eventDao.getLineKeysByFamilyId(familyId).toSet()

    /**
     * Returns the next available line key for a given family and date in the form
     * `{familyId}-{date}-{n}` where `n` is one greater than the highest existing suffix.
     * The first event on a given day gets `-1`; subsequent events on the same day get
     * `-2`, `-3`, etc.
     */
    suspend fun nextLineKeyForDate(familyId: String, date: String): String {
        val prefix = "$familyId-$date-"
        val maxSuffix = eventDao.getLineKeysByFamilyId(familyId)
            .filter { it.startsWith(prefix) }
            .mapNotNull { it.removePrefix(prefix).toIntOrNull() }
            .maxOrNull() ?: 0
        return "$prefix${maxSuffix + 1}"
    }

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
     * On success for each event: saves the server entity, then deletes the local placeholder.
     * Failures are swallowed per-event so a single failure doesn't block the rest.
     */
    suspend fun retryLocalOnly() {
        val localOnly = eventDao.getLocalOnly()
        Log.d(TAG, "retryLocalOnly: ${localOnly.size} LOCAL_ONLY events to retry")
        for (entity in localOnly) {
            try {
                val serverEntity = createEventRemote(entity.toCreateRequest()) ?: continue
                // Write the server entity before deleting the placeholder so a Room failure
                // can't leave the user with no record.
                eventDao.upsert(serverEntity)
                eventDao.deleteById(entity.id)
                Log.d(TAG, "retryLocalOnly: promoted localId=${entity.id} to serverId=${serverEntity.id}")
            } catch (e: Exception) {
                Log.w(TAG, "retryLocalOnly: failed for localId=${entity.id}, will retry on next sync", e)
            }
        }
    }

    /**
     * Attempts to push all PENDING_UPDATE events to the server.
     * These are events that were optimistically updated locally but whose RPC never completed
     * (e.g. because the app crashed mid-flight). On success the server entity (SYNCED) replaces
     * the local row. Failures are swallowed per-event.
     */
    suspend fun retryPendingUpdates() {
        val pending = eventDao.getPendingUpdate()
        Log.d(TAG, "retryPendingUpdates: ${pending.size} PENDING_UPDATE events to retry")
        for (entity in pending) {
            try {
                val serverEntity = updateEventRemote(entity.toUpdateRequest()) ?: continue
                eventDao.upsert(serverEntity)
                Log.d(TAG, "retryPendingUpdates: synced id=${entity.id}")
            } catch (e: Exception) {
                Log.w(TAG, "retryPendingUpdates: failed for id=${entity.id}, will retry on next sync", e)
            }
        }
    }

    // --- Health Connect import / merge ---

    /**
     * Returns fitness events whose primary date falls within ±3 days of [date].
     * Used to populate merge candidates in the HC review screen.
     */
    suspend fun getFitnessEventsNear(date: LocalDate): List<EventEntity> {
        val from = date.minusDays(3).toString()
        val to = date.plusDays(3).toString()
        return eventDao.getFitnessEventsNear(from, to)
    }

    /**
     * Imports a Health Connect activity as a new Meridian event:
     * 1. Writes a LOCAL_ONLY Room placeholder (metadataJson includes hc_id for dedup).
     * 2. Sends CreateEvent gRPC call.
     * 3. On success: patches hc_id back into the server entity's metadataJson, upserts,
     *    and deletes the placeholder. On failure: placeholder stays for retry.
     */
    suspend fun createFromHealthConnect(activity: HealthActivity) {
        val fitnessActivity = healthExerciseTypeToFitnessActivity(activity.exerciseType)
        val localId = UUID.randomUUID().toString()
        val now = System.currentTimeMillis()
        val dateStr = activity.startTime.atZone(ZoneId.systemDefault()).toLocalDate().toString()
        val lineKey = nextLineKeyForDate("fitness", dateStr)

        // Write LOCAL_ONLY placeholder immediately so dedup in hc_event_links is consistent.
        eventDao.upsert(activity.toLocalEntity(localId, now).copy(lineKey = lineKey))
        // Record the link as IMPORTED immediately so a second sync during the RPC won't
        // re-present this activity to the user.
        hcEventLinkDao.upsert(
            HcEventLinkEntity(
                hcId = activity.healthConnectId,
                eventId = localId,
                status = HcLinkStatus.IMPORTED,
                createdAt = now,
            ),
        )

        try {
            val serverEvent = remote.createEvent(
                activity.toCreateRequest(fitnessActivity).toBuilder().setLineKey(lineKey).build(),
            ) ?: return
            // Patch hc_id + source into the server entity before saving to Room so the
            // metadata survives subsequent server syncs that would otherwise strip it.
            val serverEntity = serverEvent.toEntity(now).let { e ->
                e.copy(metadataJson = patchHcFieldsIntoMetadataJson(e.metadataJson, activity))
            }
            eventDao.upsert(serverEntity)
            eventDao.deleteById(localId)
            // Update the link to point at the canonical server ID.
            hcEventLinkDao.upsert(
                HcEventLinkEntity(
                    hcId = activity.healthConnectId,
                    eventId = serverEntity.id,
                    status = HcLinkStatus.IMPORTED,
                    createdAt = now,
                ),
            )
            Log.d(TAG, "createFromHealthConnect: promoted localId=$localId to serverId=${serverEntity.id}")
        } catch (e: Exception) {
            Log.w(TAG, "createFromHealthConnect: gRPC failed for hcId=${activity.healthConnectId}, stays LOCAL_ONLY", e)
        }
    }

    /**
     * Merges Health Connect data into an existing fitness event:
     * patches hc_id, source, and any missing distance/elevation into its metadataJson,
     * writes PENDING_UPDATE, then sends UpdateEvent gRPC call.
     */
    suspend fun mergeHealthConnect(eventId: String, activity: HealthActivity) {
        val entity = eventDao.getById(eventId) ?: return
        val now = System.currentTimeMillis()
        val patched = entity.copy(
            metadataJson = patchHcFieldsIntoMetadataJson(entity.metadataJson, activity),
            syncState = SyncState.PENDING_UPDATE,
            updatedAt = now,
        )
        eventDao.upsert(patched)
        hcEventLinkDao.upsert(
            HcEventLinkEntity(
                hcId = activity.healthConnectId,
                eventId = eventId,
                status = HcLinkStatus.MERGED,
                createdAt = now,
            ),
        )

        try {
            val serverEvent = remote.updateEvent(patched.toUpdateRequest()) ?: return
            eventDao.upsert(serverEvent.toEntity())
            Log.d(TAG, "mergeHealthConnect: synced eventId=$eventId with hcId=${activity.healthConnectId}")
        } catch (e: Exception) {
            Log.w(TAG, "mergeHealthConnect: gRPC failed for eventId=$eventId, stays PENDING_UPDATE", e)
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
