package ca.rmrobinson.meridian.di

import android.content.Context
import android.content.SharedPreferences
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.preferencesDataStore
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import ca.rmrobinson.meridian.data.healthconnect.HealthConnectRepository
import ca.rmrobinson.meridian.data.healthconnect.HealthConnectRepositoryImpl
import ca.rmrobinson.meridian.network.ApplicationScope
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import javax.inject.Singleton

private val Context.healthDataStore: DataStore<Preferences> by preferencesDataStore(name = "meridian_health")

@Module
@InstallIn(SingletonComponent::class)
abstract class AppModule {

    @Binds
    @Singleton
    abstract fun bindHealthConnectRepository(impl: HealthConnectRepositoryImpl): HealthConnectRepository

    companion object {

        @Provides
        @Singleton
        @ApplicationScope
        fun provideApplicationScope(): CoroutineScope =
            CoroutineScope(SupervisorJob() + Dispatchers.Default)

        @Provides
        @Singleton
        fun provideEncryptedSharedPreferences(@ApplicationContext context: Context): SharedPreferences {
            val prefsName = "meridian_prefs"
            fun buildPrefs(): SharedPreferences {
                val masterKey = MasterKey.Builder(context)
                    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                    .build()
                return EncryptedSharedPreferences.create(
                    context,
                    prefsName,
                    masterKey,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
                )
            }
            return try {
                buildPrefs()
            } catch (e: Exception) {
                // The Keystore key was deleted (e.g. app uninstall/reinstall) but the encrypted
                // prefs file survived via backup, making decryption impossible. Delete the stale
                // file and recreate with a fresh key.
                context.deleteSharedPreferences(prefsName)
                buildPrefs()
            }
        }

        @Provides
        @Singleton
        fun provideHealthDataStore(@ApplicationContext context: Context): DataStore<Preferences> =
            context.healthDataStore
    }
}
