package ca.rmrobinson.meridian.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.TypeConverters

@Database(
    entities = [EventEntity::class, LineFamilyEntity::class, HcEventLinkEntity::class],
    version = 3,
    exportSchema = true,
)
@TypeConverters(Converters::class)
abstract class MeridianDatabase : RoomDatabase() {
    abstract fun eventDao(): EventDao
    abstract fun lineFamilyDao(): LineFamilyDao
    abstract fun hcEventLinkDao(): HcEventLinkDao
}
