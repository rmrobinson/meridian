package ca.rmrobinson.meridian.di

import android.content.Context
import androidx.room.Room
import ca.rmrobinson.meridian.data.local.EventDao
import ca.rmrobinson.meridian.data.local.LineFamilyDao
import ca.rmrobinson.meridian.data.local.MeridianDatabase
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideMeridianDatabase(@ApplicationContext context: Context): MeridianDatabase =
        Room.databaseBuilder(context, MeridianDatabase::class.java, "meridian.db")
            .fallbackToDestructiveMigration()
            .build()

    @Provides
    fun provideEventDao(db: MeridianDatabase): EventDao = db.eventDao()

    @Provides
    fun provideLineFamilyDao(db: MeridianDatabase): LineFamilyDao = db.lineFamilyDao()
}
