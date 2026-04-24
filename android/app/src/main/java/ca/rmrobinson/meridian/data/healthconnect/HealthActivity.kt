package ca.rmrobinson.meridian.data.healthconnect

import java.time.Instant

data class HealthActivity(
    val healthConnectId: String,       // ExerciseSessionRecord.metadata.id
    val exerciseType: Int,             // ExerciseSessionRecord type constant
    val title: String?,                // set by some apps, often null
    val startTime: Instant,
    val endTime: Instant,
    val distanceMeters: Double?,       // from DistanceRecord
    val elevationGainedMeters: Double?, // from ElevationGainedRecord; skiing, hiking
    val sourcePackageName: String?,    // from ExerciseSessionRecord.metadata.dataOrigin.packageName
)
