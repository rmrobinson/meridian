package ca.rmrobinson.meridian.ui.entry.fitness

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import meridian.v1.ClimbingType
import meridian.v1.FitnessActivity
import meridian.v1.Visibility
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FitnessScreen(
    onBack: () -> Unit,
    onSuccess: () -> Unit,
    viewModel: FitnessEntryViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val formatter = remember { DateTimeFormatter.ISO_LOCAL_DATE }

    LaunchedEffect(uiState.error) {
        uiState.error?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.dismissError()
        }
    }
    LaunchedEffect(uiState.isSuccess) {
        if (uiState.isSuccess) onSuccess()
    }

    var showDatePicker by remember { mutableStateOf(false) }
    val datePickerState = rememberDatePickerState(
        initialSelectedDateMillis = uiState.date
            .atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Add ${activityLabel(viewModel.activity)}") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // Title
            OutlinedTextField(
                value = uiState.title,
                onValueChange = viewModel::setTitle,
                label = { Text("Title *") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            // Date
            OutlinedButton(
                onClick = { showDatePicker = true },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Date: ${uiState.date.format(formatter)}")
            }

            // Duration
            OutlinedTextField(
                value = uiState.duration,
                onValueChange = viewModel::setDuration,
                label = { Text("Duration (e.g. 1:23:45)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            // Distance (run, cycle, hike, ski)
            if (viewModel.activity in distanceActivities) {
                OutlinedTextField(
                    value = uiState.distanceKm,
                    onValueChange = viewModel::setDistanceKm,
                    label = { Text("Distance (km)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            // Elevation gain (cycle, hike, ski)
            if (viewModel.activity in elevationActivities) {
                OutlinedTextField(
                    value = uiState.elevationGainM,
                    onValueChange = viewModel::setElevationGainM,
                    label = { Text("Elevation gain (m)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            // Avg heart rate (cardio activities)
            if (viewModel.activity in heartRateActivities) {
                OutlinedTextField(
                    value = uiState.avgHeartRate,
                    onValueChange = viewModel::setAvgHeartRate,
                    label = { Text("Avg heart rate (bpm)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            // Activity-specific fields
            when (viewModel.activity) {
                FitnessActivity.FITNESS_ACTIVITY_RUN -> RunFields(uiState, viewModel)
                FitnessActivity.FITNESS_ACTIVITY_CYCLE -> CycleFields(uiState, viewModel)
                FitnessActivity.FITNESS_ACTIVITY_HIKE -> HikeFields(uiState, viewModel)
                FitnessActivity.FITNESS_ACTIVITY_SKI -> SkiFields(uiState, viewModel)
                FitnessActivity.FITNESS_ACTIVITY_SCUBA -> ScubaFields(uiState, viewModel)
                FitnessActivity.FITNESS_ACTIVITY_CLIMB -> ClimbFields(uiState, viewModel)
                FitnessActivity.FITNESS_ACTIVITY_GOLF -> GolfFields(uiState, viewModel)
                FitnessActivity.FITNESS_ACTIVITY_SQUASH -> SquashFields(uiState, viewModel)
                else -> {}
            }

            // Garmin URL (optional for all)
            OutlinedTextField(
                value = uiState.garminUrl,
                onValueChange = viewModel::setGarminUrl,
                label = { Text("Garmin activity URL (optional)") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                modifier = Modifier.fillMaxWidth(),
            )

            VisibilitySelector(
                selected = uiState.visibility,
                onSelect = viewModel::setVisibility,
            )

            Spacer(Modifier.height(4.dp))

            Button(
                onClick = viewModel::submit,
                enabled = !uiState.isSubmitting,
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (uiState.isSubmitting) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                } else {
                    Text("Save ${activityLabel(viewModel.activity)}")
                }
            }
        }
    }

    if (showDatePicker) {
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    datePickerState.selectedDateMillis?.let { millis ->
                        viewModel.setDate(
                            Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate(),
                        )
                    }
                    showDatePicker = false
                }) { Text("OK") }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) { Text("Cancel") }
            },
        ) { DatePicker(state = datePickerState) }
    }
}

// ---------------------------------------------------------------------------
// Activity-specific field sections
// ---------------------------------------------------------------------------

@Composable
private fun RunFields(
    uiState: FitnessEntryViewModel.UiState,
    viewModel: FitnessEntryViewModel,
) {
    OutlinedTextField(
        value = uiState.avgPaceMinKm,
        onValueChange = viewModel::setAvgPaceMinKm,
        label = { Text("Avg pace (min/km)") },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun CycleFields(
    uiState: FitnessEntryViewModel.UiState,
    viewModel: FitnessEntryViewModel,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        OutlinedTextField(
            value = uiState.bike,
            onValueChange = viewModel::setBike,
            label = { Text("Bike (optional)") },
            singleLine = true,
            modifier = Modifier.weight(1f),
        )
        OutlinedTextField(
            value = uiState.avgSpeedKmh,
            onValueChange = viewModel::setAvgSpeedKmh,
            label = { Text("Avg speed (km/h)") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun HikeFields(
    uiState: FitnessEntryViewModel.UiState,
    viewModel: FitnessEntryViewModel,
) {
    OutlinedTextField(
        value = uiState.trailName,
        onValueChange = viewModel::setTrailName,
        label = { Text("Trail name (optional)") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
    OutlinedTextField(
        value = uiState.alltrailsUrl,
        onValueChange = viewModel::setAlltrailsUrl,
        label = { Text("AllTrails URL (optional)") },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun SkiFields(
    uiState: FitnessEntryViewModel.UiState,
    viewModel: FitnessEntryViewModel,
) {
    OutlinedTextField(
        value = uiState.resort,
        onValueChange = viewModel::setResort,
        label = { Text("Resort (optional)") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        OutlinedTextField(
            value = uiState.verticalDropM,
            onValueChange = viewModel::setVerticalDropM,
            label = { Text("Vertical drop (m)") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.weight(1f),
        )
        OutlinedTextField(
            value = uiState.runs,
            onValueChange = viewModel::setRuns,
            label = { Text("Runs") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun ScubaFields(
    uiState: FitnessEntryViewModel.UiState,
    viewModel: FitnessEntryViewModel,
) {
    OutlinedTextField(
        value = uiState.diveSite,
        onValueChange = viewModel::setDiveSite,
        label = { Text("Dive site (optional)") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        OutlinedTextField(
            value = uiState.maxDepthM,
            onValueChange = viewModel::setMaxDepthM,
            label = { Text("Max depth (m)") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            modifier = Modifier.weight(1f),
        )
        OutlinedTextField(
            value = uiState.avgDepthM,
            onValueChange = viewModel::setAvgDepthM,
            label = { Text("Avg depth (m)") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            modifier = Modifier.weight(1f),
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ClimbFields(
    uiState: FitnessEntryViewModel.UiState,
    viewModel: FitnessEntryViewModel,
) {
    var expanded by remember { mutableStateOf(false) }

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = it },
        modifier = Modifier.fillMaxWidth(),
    ) {
        OutlinedTextField(
            value = climbingTypeLabel(uiState.climbingType),
            onValueChange = {},
            readOnly = true,
            label = { Text("Climbing type") },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier
                .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                .fillMaxWidth(),
        )
        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            climbingTypeOptions.forEach { (type, label) ->
                DropdownMenuItem(
                    text = { Text(label) },
                    onClick = {
                        viewModel.setClimbingType(type)
                        expanded = false
                    },
                )
            }
        }
    }

    // Sport climbing: route name
    if (uiState.climbingType == ClimbingType.CLIMBING_TYPE_SPORT) {
        OutlinedTextField(
            value = uiState.routeName,
            onValueChange = viewModel::setRouteName,
            label = { Text("Route name (optional)") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
    }
    // Bouldering: problem name
    if (uiState.climbingType == ClimbingType.CLIMBING_TYPE_BOULDERING) {
        OutlinedTextField(
            value = uiState.problemName,
            onValueChange = viewModel::setProblemName,
            label = { Text("Problem name (optional)") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
    }
    OutlinedTextField(
        value = uiState.grade,
        onValueChange = viewModel::setGrade,
        label = { Text("Grade (optional)") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun GolfFields(
    uiState: FitnessEntryViewModel.UiState,
    viewModel: FitnessEntryViewModel,
) {
    OutlinedTextField(
        value = uiState.courseName,
        onValueChange = viewModel::setCourseName,
        label = { Text("Course name (optional)") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        OutlinedTextField(
            value = uiState.holes,
            onValueChange = viewModel::setHoles,
            label = { Text("Holes") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.weight(1f),
        )
        OutlinedTextField(
            value = uiState.score,
            onValueChange = viewModel::setScore,
            label = { Text("Score") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun SquashFields(
    uiState: FitnessEntryViewModel.UiState,
    viewModel: FitnessEntryViewModel,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        OutlinedTextField(
            value = uiState.opponent,
            onValueChange = viewModel::setOpponent,
            label = { Text("Opponent (optional)") },
            singleLine = true,
            modifier = Modifier.weight(1f),
        )
        OutlinedTextField(
            value = uiState.result,
            onValueChange = viewModel::setResult,
            label = { Text("Result (optional)") },
            singleLine = true,
            modifier = Modifier.weight(1f),
        )
    }
}

// ---------------------------------------------------------------------------
// Visibility selector
// ---------------------------------------------------------------------------

private val visibilityOptions = listOf(
    Visibility.VISIBILITY_PUBLIC   to "Public",
    Visibility.VISIBILITY_FRIENDS  to "Friends",
    Visibility.VISIBILITY_FAMILY   to "Family",
    Visibility.VISIBILITY_PERSONAL to "Personal",
)

@Composable
private fun VisibilitySelector(
    selected: Visibility,
    onSelect: (Visibility) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text("Visibility", style = MaterialTheme.typography.labelLarge)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            visibilityOptions.forEach { (vis, label) ->
                FilterChip(
                    selected = selected == vis,
                    onClick = { onSelect(vis) },
                    label = { Text(label) },
                )
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Helper data
// ---------------------------------------------------------------------------

private val distanceActivities = setOf(
    FitnessActivity.FITNESS_ACTIVITY_RUN,
    FitnessActivity.FITNESS_ACTIVITY_CYCLE,
    FitnessActivity.FITNESS_ACTIVITY_HIKE,
    FitnessActivity.FITNESS_ACTIVITY_SKI,
)

private val elevationActivities = setOf(
    FitnessActivity.FITNESS_ACTIVITY_CYCLE,
    FitnessActivity.FITNESS_ACTIVITY_HIKE,
    FitnessActivity.FITNESS_ACTIVITY_SKI,
)

private val heartRateActivities = setOf(
    FitnessActivity.FITNESS_ACTIVITY_RUN,
    FitnessActivity.FITNESS_ACTIVITY_CYCLE,
    FitnessActivity.FITNESS_ACTIVITY_HIKE,
    FitnessActivity.FITNESS_ACTIVITY_SKI,
    FitnessActivity.FITNESS_ACTIVITY_SQUASH,
)

private val climbingTypeOptions = listOf(
    ClimbingType.CLIMBING_TYPE_UNSPECIFIED to "Unspecified",
    ClimbingType.CLIMBING_TYPE_SPORT       to "Sport",
    ClimbingType.CLIMBING_TYPE_BOULDERING  to "Bouldering",
    ClimbingType.CLIMBING_TYPE_GYM         to "Gym",
)

private fun climbingTypeLabel(type: ClimbingType): String = when (type) {
    ClimbingType.CLIMBING_TYPE_SPORT       -> "Sport"
    ClimbingType.CLIMBING_TYPE_BOULDERING  -> "Bouldering"
    ClimbingType.CLIMBING_TYPE_GYM         -> "Gym"
    else                                   -> "Unspecified"
}
