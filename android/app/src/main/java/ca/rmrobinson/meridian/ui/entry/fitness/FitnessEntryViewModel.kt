package ca.rmrobinson.meridian.ui.entry.fitness

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ca.rmrobinson.meridian.domain.usecase.CreateEventUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import meridian.v1.ClimbingType
import meridian.v1.CreateEventRequest
import meridian.v1.EventType
import meridian.v1.FitnessActivity
import meridian.v1.FitnessMetadata
import meridian.v1.Visibility
import java.time.LocalDate
import javax.inject.Inject

@HiltViewModel
class FitnessEntryViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val createEventUseCase: CreateEventUseCase,
) : ViewModel() {

    val activity: FitnessActivity = slugToActivity(checkNotNull(savedStateHandle["activity"]))

    data class UiState(
        val title: String = "",
        val date: LocalDate = LocalDate.now(),
        // Common numeric/string fields (stored as strings for text input)
        val duration: String = "",
        val distanceKm: String = "",
        val elevationGainM: String = "",
        val avgHeartRate: String = "",
        val garminUrl: String = "",
        // Run
        val avgPaceMinKm: String = "",
        // Cycle
        val bike: String = "",
        val avgSpeedKmh: String = "",
        // Hike
        val trailName: String = "",
        val alltrailsUrl: String = "",
        // Ski
        val resort: String = "",
        val verticalDropM: String = "",
        val runs: String = "",
        // Scuba
        val diveSite: String = "",
        val maxDepthM: String = "",
        val avgDepthM: String = "",
        // Climb
        val climbingType: ClimbingType = ClimbingType.CLIMBING_TYPE_UNSPECIFIED,
        val routeName: String = "",
        val problemName: String = "",
        val grade: String = "",
        // Golf
        val courseName: String = "",
        val holes: String = "",
        val score: String = "",
        // Squash
        val opponent: String = "",
        val result: String = "",
        // Status
        val visibility: Visibility = Visibility.VISIBILITY_PUBLIC,
        val isSubmitting: Boolean = false,
        val error: String? = null,
        val isSuccess: Boolean = false,
    )

    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    fun setTitle(value: String) = _uiState.update { it.copy(title = value) }
    fun setDate(value: LocalDate) = _uiState.update { it.copy(date = value) }
    fun setDuration(value: String) = _uiState.update { it.copy(duration = value) }
    fun setDistanceKm(value: String) = _uiState.update { it.copy(distanceKm = value) }
    fun setElevationGainM(value: String) = _uiState.update { it.copy(elevationGainM = value) }
    fun setAvgHeartRate(value: String) = _uiState.update { it.copy(avgHeartRate = value) }
    fun setGarminUrl(value: String) = _uiState.update { it.copy(garminUrl = value) }
    fun setAvgPaceMinKm(value: String) = _uiState.update { it.copy(avgPaceMinKm = value) }
    fun setBike(value: String) = _uiState.update { it.copy(bike = value) }
    fun setAvgSpeedKmh(value: String) = _uiState.update { it.copy(avgSpeedKmh = value) }
    fun setTrailName(value: String) = _uiState.update { it.copy(trailName = value) }
    fun setAlltrailsUrl(value: String) = _uiState.update { it.copy(alltrailsUrl = value) }
    fun setResort(value: String) = _uiState.update { it.copy(resort = value) }
    fun setVerticalDropM(value: String) = _uiState.update { it.copy(verticalDropM = value) }
    fun setRuns(value: String) = _uiState.update { it.copy(runs = value) }
    fun setDiveSite(value: String) = _uiState.update { it.copy(diveSite = value) }
    fun setMaxDepthM(value: String) = _uiState.update { it.copy(maxDepthM = value) }
    fun setAvgDepthM(value: String) = _uiState.update { it.copy(avgDepthM = value) }
    fun setClimbingType(value: ClimbingType) = _uiState.update { it.copy(climbingType = value) }
    fun setRouteName(value: String) = _uiState.update { it.copy(routeName = value) }
    fun setProblemName(value: String) = _uiState.update { it.copy(problemName = value) }
    fun setGrade(value: String) = _uiState.update { it.copy(grade = value) }
    fun setCourseName(value: String) = _uiState.update { it.copy(courseName = value) }
    fun setHoles(value: String) = _uiState.update { it.copy(holes = value) }
    fun setScore(value: String) = _uiState.update { it.copy(score = value) }
    fun setOpponent(value: String) = _uiState.update { it.copy(opponent = value) }
    fun setResult(value: String) = _uiState.update { it.copy(result = value) }
    fun setVisibility(value: Visibility) = _uiState.update { it.copy(visibility = value) }
    fun dismissError() = _uiState.update { it.copy(error = null) }

    fun submit() {
        val s = _uiState.value
        if (s.title.isBlank()) {
            _uiState.update { it.copy(error = "Title is required") }
            return
        }

        val ctx = ParseContext()
        val distanceKm = ctx.optDouble(s.distanceKm, "Distance")
        val elevationGainM = ctx.optInt(s.elevationGainM, "Elevation gain")
        val avgHeartRate = ctx.optInt(s.avgHeartRate, "Avg heart rate")
        val avgPaceMinKm = ctx.optDouble(s.avgPaceMinKm, "Avg pace")
        val avgSpeedKmh = ctx.optDouble(s.avgSpeedKmh, "Avg speed")
        val verticalDropM = ctx.optInt(s.verticalDropM, "Vertical drop")
        val runs = ctx.optInt(s.runs, "Runs")
        val maxDepthM = ctx.optDouble(s.maxDepthM, "Max depth")
        val avgDepthM = ctx.optDouble(s.avgDepthM, "Avg depth")
        val holes = ctx.optInt(s.holes, "Holes")
        val score = ctx.optInt(s.score, "Score")

        if (ctx.error != null) {
            _uiState.update { it.copy(error = ctx.error) }
            return
        }

        _uiState.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            try {
                val lineKey = FAMILY_ID
                val metadata = FitnessMetadata.newBuilder()
                    .setActivity(activity)
                    .setDuration(s.duration.trim())
                    .setGarminActivityUrl(s.garminUrl.trim())
                    .apply { if (distanceKm != null) setDistanceKm(distanceKm) }
                    .apply { if (elevationGainM != null) setElevationGainM(elevationGainM) }
                    .apply { if (avgHeartRate != null) setAvgHeartRate(avgHeartRate) }
                    .apply { if (avgPaceMinKm != null) setAvgPaceMinKm(avgPaceMinKm) }
                    .apply { if (s.bike.isNotBlank()) setBike(s.bike.trim()) }
                    .apply { if (avgSpeedKmh != null) setAvgSpeedKmh(avgSpeedKmh) }
                    .apply { if (s.trailName.isNotBlank()) setTrailName(s.trailName.trim()) }
                    .apply { if (s.alltrailsUrl.isNotBlank()) setAlltrailsUrl(s.alltrailsUrl.trim()) }
                    .apply { if (s.resort.isNotBlank()) setResort(s.resort.trim()) }
                    .apply { if (verticalDropM != null) setVerticalDropM(verticalDropM) }
                    .apply { if (runs != null) setRuns(runs) }
                    .apply { if (s.diveSite.isNotBlank()) setDiveSite(s.diveSite.trim()) }
                    .apply { if (maxDepthM != null) setMaxDepthM(maxDepthM) }
                    .apply { if (avgDepthM != null) setAvgDepthM(avgDepthM) }
                    .apply {
                        if (s.climbingType != ClimbingType.CLIMBING_TYPE_UNSPECIFIED) {
                            setClimbingType(s.climbingType)
                        }
                    }
                    .apply { if (s.routeName.isNotBlank()) setRouteName(s.routeName.trim()) }
                    .apply { if (s.problemName.isNotBlank()) setProblemName(s.problemName.trim()) }
                    .apply { if (s.grade.isNotBlank()) setGrade(s.grade.trim()) }
                    .apply { if (s.courseName.isNotBlank()) setCourseName(s.courseName.trim()) }
                    .apply { if (holes != null) setHoles(holes) }
                    .apply { if (score != null) setScore(score) }
                    .apply { if (s.opponent.isNotBlank()) setOpponent(s.opponent.trim()) }
                    .apply { if (s.result.isNotBlank()) setResult(s.result.trim()) }
                    .build()
                val request = CreateEventRequest.newBuilder()
                    .setFamilyId(FAMILY_ID)
                    .setType(EventType.EVENT_TYPE_POINT)
                    .setTitle(s.title.trim())
                    .setDate(s.date.toString())
                    .setLineKey(lineKey)
                    .setVisibility(s.visibility)
                    .setFitnessMetadata(metadata)
                    .build()
                createEventUseCase(request)
                _uiState.update { it.copy(isSubmitting = false, isSuccess = true) }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isSubmitting = false, error = e.message ?: "Failed to save activity")
                }
            }
        }
    }

    companion object {
        const val FAMILY_ID = "fitness"

        /** Single source of truth for activity slug ↔ proto enum ↔ display label. */
        data class ActivityEntry(
            val slug: String,
            val activity: FitnessActivity,
            val label: String,
        )

        val ALL_ACTIVITIES: List<ActivityEntry> = listOf(
            ActivityEntry("run",    FitnessActivity.FITNESS_ACTIVITY_RUN,    "Run"),
            ActivityEntry("cycle",  FitnessActivity.FITNESS_ACTIVITY_CYCLE,  "Cycle"),
            ActivityEntry("hike",   FitnessActivity.FITNESS_ACTIVITY_HIKE,   "Hike"),
            ActivityEntry("ski",    FitnessActivity.FITNESS_ACTIVITY_SKI,    "Ski"),
            ActivityEntry("scuba",  FitnessActivity.FITNESS_ACTIVITY_SCUBA,  "Scuba"),
            ActivityEntry("climb",  FitnessActivity.FITNESS_ACTIVITY_CLIMB,  "Climb"),
            ActivityEntry("golf",   FitnessActivity.FITNESS_ACTIVITY_GOLF,   "Golf"),
            ActivityEntry("squash", FitnessActivity.FITNESS_ACTIVITY_SQUASH, "Squash"),
        )
    }
}

/** Accumulates the first parse error encountered; subsequent calls are no-ops after an error. */
private class ParseContext {
    var error: String? = null

    fun optDouble(value: String, label: String): Double? {
        if (error != null || value.isBlank()) return null
        val parsed = value.toDoubleOrNull()
        if (parsed == null) error = "$label must be a valid number"
        return parsed
    }

    fun optInt(value: String, label: String): Int? {
        if (error != null || value.isBlank()) return null
        val parsed = value.toIntOrNull()
        if (parsed == null) error = "$label must be a whole number"
        return parsed
    }
}

internal fun slugToActivity(slug: String): FitnessActivity =
    FitnessEntryViewModel.ALL_ACTIVITIES.find { it.slug == slug }?.activity
        ?: FitnessActivity.FITNESS_ACTIVITY_UNSPECIFIED

internal fun activityLabel(activity: FitnessActivity): String =
    FitnessEntryViewModel.ALL_ACTIVITIES.find { it.activity == activity }?.label ?: "Activity"
