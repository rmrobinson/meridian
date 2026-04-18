package ca.rmrobinson.meridian.data.local

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface LineFamilyDao {
    @Query("SELECT * FROM line_families")
    fun observeAll(): Flow<List<LineFamilyEntity>>

    @Query("SELECT * FROM line_families WHERE id = :id")
    suspend fun getById(id: String): LineFamilyEntity?

    @Upsert
    suspend fun upsertAll(families: List<LineFamilyEntity>)
}
