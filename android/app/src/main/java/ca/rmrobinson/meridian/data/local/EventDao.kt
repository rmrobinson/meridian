package ca.rmrobinson.meridian.data.local

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface EventDao {
    @Query("SELECT * FROM events ORDER BY COALESCE(date, start_date) DESC")
    fun observeAll(): Flow<List<EventEntity>>

    @Query("SELECT * FROM events WHERE end_date IS NULL AND type = 'span' ORDER BY COALESCE(date, start_date) DESC")
    fun observeOpenSpans(): Flow<List<EventEntity>>

    @Query("SELECT * FROM events WHERE id = :id")
    suspend fun getById(id: String): EventEntity?

    @Upsert
    suspend fun upsert(event: EventEntity)

    @Upsert
    suspend fun upsertAll(events: List<EventEntity>)

    @Query("SELECT line_key FROM events WHERE family_id = :familyId")
    suspend fun getLineKeysByFamilyId(familyId: String): List<String>

    @Query("SELECT * FROM events WHERE sync_state = 'LOCAL_ONLY'")
    suspend fun getLocalOnly(): List<EventEntity>

    @Query("SELECT * FROM events WHERE sync_state = 'PENDING_UPDATE'")
    suspend fun getPendingUpdate(): List<EventEntity>

    @Query("DELETE FROM events WHERE id = :id")
    suspend fun deleteById(id: String)
}
