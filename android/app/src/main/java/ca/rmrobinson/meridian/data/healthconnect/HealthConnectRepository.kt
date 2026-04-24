package ca.rmrobinson.meridian.data.healthconnect

import android.content.Context
import androidx.activity.result.contract.ActivityResultContract
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ElevationGainedRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

interface HealthConnectRepository {
    suspend fun isAvailable(): Boolean
    suspend fun hasPermissions(): Boolean
    fun getRequiredPermissions(): Set<String>
    fun getPermissionContract(): ActivityResultContract<Set<String>, Set<String>>
    suspend fun fetchActivitiesSince(from: Instant): List<HealthActivity>
}

@Singleton
class HealthConnectRepositoryImpl @Inject constructor(
    @ApplicationContext private val context: Context,
) : HealthConnectRepository {

    private val requiredPermissions = setOf(
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        HealthPermission.getReadPermission(DistanceRecord::class),
        HealthPermission.getReadPermission(ElevationGainedRecord::class),
    )

    private val client: HealthConnectClient? by lazy {
        if (HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE) {
            HealthConnectClient.getOrCreate(context)
        } else {
            null
        }
    }

    override suspend fun isAvailable(): Boolean =
        HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE

    override suspend fun hasPermissions(): Boolean {
        val c = client ?: return false
        val granted = c.permissionController.getGrantedPermissions()
        return granted.containsAll(requiredPermissions)
    }

    override fun getRequiredPermissions(): Set<String> = requiredPermissions

    override fun getPermissionContract(): ActivityResultContract<Set<String>, Set<String>> =
        PermissionController.createRequestPermissionResultContract()

    override suspend fun fetchActivitiesSince(from: Instant): List<HealthActivity> {
        val c = client ?: return emptyList()
        return withContext(Dispatchers.IO) {
            val now = Instant.now()
            val timeRange = TimeRangeFilter.between(from, now)

            val sessions = c.readRecords(
                ReadRecordsRequest(ExerciseSessionRecord::class, timeRange),
            ).records

            if (sessions.isEmpty()) return@withContext emptyList()

            // Batch-read all distance and elevation records for the full window in two calls,
            // rather than two calls per session (which would be an N+1 pattern).
            val allDistances = c.readRecords(
                ReadRecordsRequest(DistanceRecord::class, timeRange),
            ).records

            val allElevations = c.readRecords(
                ReadRecordsRequest(ElevationGainedRecord::class, timeRange),
            ).records

            sessions.map { session ->
                val sourcePackage = session.metadata.dataOrigin.packageName

                // Filter to records that:
                //  (a) belong to the same source app as the session, and
                //  (b) fall within the session's time bounds.
                // This prevents double-counting when multiple apps (e.g. Garmin + Google Fit)
                // wrote overlapping records for the same workout.
                val distanceMeters = allDistances
                    .filter { r ->
                        r.metadata.dataOrigin.packageName == sourcePackage &&
                            !r.startTime.isBefore(session.startTime) &&
                            !r.endTime.isAfter(session.endTime)
                    }
                    .sumOf { it.distance.inMeters }
                    .takeIf { it > 0.0 }

                val elevationGainedMeters = allElevations
                    .filter { r ->
                        r.metadata.dataOrigin.packageName == sourcePackage &&
                            !r.startTime.isBefore(session.startTime) &&
                            !r.endTime.isAfter(session.endTime)
                    }
                    .sumOf { it.elevation.inMeters }
                    .takeIf { it > 0.0 }

                HealthActivity(
                    healthConnectId = session.metadata.id,
                    exerciseType = session.exerciseType,
                    title = session.title,
                    startTime = session.startTime,
                    endTime = session.endTime,
                    distanceMeters = distanceMeters,
                    elevationGainedMeters = elevationGainedMeters,
                    sourcePackageName = sourcePackage,
                )
            }
        }
    }
}
