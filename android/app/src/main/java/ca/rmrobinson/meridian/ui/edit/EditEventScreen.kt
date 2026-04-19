package ca.rmrobinson.meridian.ui.edit

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.AlertDialog
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
import androidx.compose.material3.TimePicker
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.material3.Surface
import androidx.compose.material3.rememberTimePickerState
import meridian.v1.ClimbingType
import meridian.v1.FitnessActivity
import meridian.v1.Visibility
import androidx.compose.material3.rememberDatePickerState
import java.time.LocalTime
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditEventScreen(
    onBack: () -> Unit,
    onSuccess: () -> Unit,
    viewModel: EditEventViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(uiState.error) {
        uiState.error?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.dismissError()
        }
    }

    LaunchedEffect(uiState.isSuccess) {
        if (uiState.isSuccess) onSuccess()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Edit Event") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { innerPadding ->
        when {
            uiState.isLoading -> Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator()
            }
            uiState.notFound -> Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Event not found", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(8.dp))
                    TextButton(onClick = onBack) { Text("Go back") }
                }
            }
            else -> EditEventForm(
                uiState = uiState,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                viewModel = viewModel,
            )
        }
    }
}

// Extracted so that all rememberXxx calls inside are unconditional — rules-of-hooks.
// This composable is only ever called after the event has loaded (isLoading = false,
// notFound = false), so all date fields in uiState are already populated.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun EditEventForm(
    uiState: EditEventViewModel.UiState,
    modifier: Modifier = Modifier,
    viewModel: EditEventViewModel,
) {
    val formatter = remember { DateTimeFormatter.ISO_LOCAL_DATE }
    val timeFormatter = remember { EditEventViewModel.TIME_FORMATTER }
    var showPrimaryDatePicker by remember { mutableStateOf(false) }
    var showStartDatePicker by remember { mutableStateOf(false) }
    var showEndDatePicker by remember { mutableStateOf(false) }
    var showScheduledDeparturePicker by remember { mutableStateOf(false) }
    val today = remember { LocalDate.now() }

    // All picker states hoisted unconditionally; fallback to today/midnight when values absent
    val primaryDatePickerState = rememberDatePickerState(
        initialSelectedDateMillis = (uiState.date ?: uiState.startDate ?: today)
            .atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
    )
    val startPickerState = rememberDatePickerState(
        initialSelectedDateMillis = (uiState.startDate ?: today)
            .atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
    )
    val endPickerState = rememberDatePickerState(
        initialSelectedDateMillis = (uiState.endDate ?: today)
            .atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
    )
    val scheduledDeparturePickerState = rememberTimePickerState(
        initialHour = uiState.scheduledDeparture?.hour ?: 0,
        initialMinute = uiState.scheduledDeparture?.minute ?: 0,
        is24Hour = true,
    )

    Column(
        modifier = modifier
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // Read-only context header
        val createdLabel = if (uiState.createdAt > 0L) {
            "Created: " + Instant.ofEpochMilli(uiState.createdAt)
                .atZone(ZoneId.systemDefault())
                .toLocalDate()
                .format(formatter)
        } else null
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant,
            ),
        ) {
            Column(
                modifier = Modifier.padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        "Family: ${uiState.familyId}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    EventTypeChip(uiState.eventType)
                }
                Text(
                    "Line key: ${uiState.lineKey}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (createdLabel != null) {
                    Text(
                        createdLabel,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        // Common editable: title
        OutlinedTextField(
            value = uiState.title,
            onValueChange = viewModel::setTitle,
            label = { Text("Title *") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )

        // Common editable: description
        OutlinedTextField(
            value = uiState.description,
            onValueChange = viewModel::setDescription,
            label = { Text("Description (optional)") },
            minLines = 2,
            maxLines = 5,
            modifier = Modifier.fillMaxWidth(),
        )

        // Visibility selector
        VisibilitySelector(
            selected = uiState.visibility,
            onSelect = viewModel::setVisibility,
        )

        // Date field(s) — layout depends on event type
        if (uiState.eventType == "span") {
            OutlinedButton(
                onClick = { showStartDatePicker = true },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Start: ${uiState.startDate?.format(formatter) ?: "Select date"}")
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OutlinedButton(
                    onClick = { showEndDatePicker = true },
                    modifier = Modifier.weight(1f),
                ) {
                    Text(
                        uiState.endDate?.format(formatter)
                            ?.let { "End: $it" }
                            ?: "End date (optional)",
                    )
                }
                if (uiState.endDate != null) {
                    Spacer(Modifier.width(8.dp))
                    TextButton(onClick = { viewModel.setEndDate(null) }) { Text("Clear") }
                }
            }
        } else {
            val primaryDate = uiState.date ?: uiState.startDate
            if (uiState.metadataType == "flight") {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OutlinedButton(
                        onClick = { showPrimaryDatePicker = true },
                        modifier = Modifier.weight(1f),
                    ) {
                        Text("Date: ${primaryDate?.format(formatter) ?: "Select date"}")
                    }
                    OutlinedButton(
                        onClick = { showScheduledDeparturePicker = true },
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(uiState.scheduledDeparture?.format(timeFormatter)?.let { "Dep: $it" } ?: "Sched. dep.")
                    }
                }
                if (uiState.scheduledDeparture != null) {
                    TextButton(onClick = { viewModel.setScheduledDeparture(null) }) {
                        Text("Clear sched. dep.")
                    }
                }
            } else {
                OutlinedButton(
                    onClick = { showPrimaryDatePicker = true },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Date: ${primaryDate?.format(formatter) ?: "Select date"}")
                }
            }
        }

        // Family-specific metadata fields.
        // film_tv only rendered when the subtype is known — UNSPECIFIED has no editable
        // metadata fields and submit() would silently drop any input.
        when (uiState.metadataType) {
            "book"    -> BookMetadataSection(uiState, viewModel)
            "film_tv" -> if (uiState.filmTvSubtype == "FILM_TV_TYPE_MOVIE" ||
                             uiState.filmTvSubtype == "FILM_TV_TYPE_TV") {
                FilmTvMetadataSection(uiState, viewModel)
            }
            "flight"  -> FlightMetadataSection(uiState, viewModel)
            "fitness" -> FitnessMetadataSection(uiState, viewModel)
        }

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
                Text("Save Changes")
            }
        }
    }

    // Date picker dialogs — shown conditionally outside the Column
    if (showPrimaryDatePicker) {
        DatePickerDialog(
            onDismissRequest = { showPrimaryDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    primaryDatePickerState.selectedDateMillis?.let { millis ->
                        viewModel.setPrimaryDate(
                            Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate(),
                        )
                    }
                    showPrimaryDatePicker = false
                }) { Text("OK") }
            },
            dismissButton = {
                TextButton(onClick = { showPrimaryDatePicker = false }) { Text("Cancel") }
            },
        ) { DatePicker(state = primaryDatePickerState) }
    }

    if (showStartDatePicker) {
        DatePickerDialog(
            onDismissRequest = { showStartDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    startPickerState.selectedDateMillis?.let { millis ->
                        viewModel.setPrimaryDate(
                            Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate(),
                        )
                    }
                    showStartDatePicker = false
                }) { Text("OK") }
            },
            dismissButton = {
                TextButton(onClick = { showStartDatePicker = false }) { Text("Cancel") }
            },
        ) { DatePicker(state = startPickerState) }
    }

    if (showEndDatePicker) {
        DatePickerDialog(
            onDismissRequest = { showEndDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    endPickerState.selectedDateMillis?.let { millis ->
                        viewModel.setEndDate(
                            Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate(),
                        )
                    }
                    showEndDatePicker = false
                }) { Text("OK") }
            },
            dismissButton = {
                TextButton(onClick = { showEndDatePicker = false }) { Text("Cancel") }
            },
        ) { DatePicker(state = endPickerState) }
    }

    if (showScheduledDeparturePicker) {
        AlertDialog(
            onDismissRequest = { showScheduledDeparturePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.setScheduledDeparture(LocalTime.of(scheduledDeparturePickerState.hour, scheduledDeparturePickerState.minute))
                    showScheduledDeparturePicker = false
                }) { Text("OK") }
            },
            dismissButton = {
                TextButton(onClick = { showScheduledDeparturePicker = false }) { Text("Cancel") }
            },
            text = { TimePicker(state = scheduledDeparturePickerState) },
        )
    }
}

// ---------------------------------------------------------------------------
// Family-specific metadata sections
// ---------------------------------------------------------------------------

@Composable
private fun BookMetadataSection(
    uiState: EditEventViewModel.UiState,
    viewModel: EditEventViewModel,
) {
    OutlinedTextField(
        value = uiState.isbn,
        onValueChange = viewModel::setIsbn,
        label = { Text("ISBN (optional)") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
    StarRatingRow(rating = uiState.rating, onRatingChange = viewModel::setRating)
    OutlinedTextField(
        value = uiState.review,
        onValueChange = viewModel::setReview,
        label = { Text("Review (optional)") },
        minLines = 3,
        maxLines = 6,
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun FilmTvMetadataSection(
    uiState: EditEventViewModel.UiState,
    viewModel: EditEventViewModel,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        OutlinedTextField(
            value = uiState.year,
            onValueChange = { if (it.length <= 4) viewModel.setYear(it) },
            label = { Text("Year (optional)") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.weight(1f),
        )
        if (uiState.filmTvSubtype == "FILM_TV_TYPE_MOVIE") {
            OutlinedTextField(
                value = uiState.director,
                onValueChange = viewModel::setDirector,
                label = { Text("Director (optional)") },
                singleLine = true,
                modifier = Modifier.weight(1f),
            )
        } else {
            OutlinedTextField(
                value = uiState.network,
                onValueChange = viewModel::setNetwork,
                label = { Text("Network (optional)") },
                singleLine = true,
                modifier = Modifier.weight(1f),
            )
        }
    }
    if (uiState.filmTvSubtype == "FILM_TV_TYPE_TV") {
        OutlinedTextField(
            value = uiState.seasonsWatched,
            onValueChange = viewModel::setSeasonsWatched,
            label = { Text("Seasons watched (optional)") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth(),
        )
    }
    StarRatingRow(rating = uiState.rating, onRatingChange = viewModel::setRating)
    OutlinedTextField(
        value = uiState.review,
        onValueChange = viewModel::setReview,
        label = { Text("Review (optional)") },
        minLines = 3,
        maxLines = 6,
        modifier = Modifier.fillMaxWidth(),
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FlightMetadataSection(
    uiState: EditEventViewModel.UiState,
    viewModel: EditEventViewModel,
) {
    var showActualDeparturePicker by remember { mutableStateOf(false) }
    var showActualArrivalPicker by remember { mutableStateOf(false) }
    val actualDeparturePickerState = rememberTimePickerState(
        initialHour = uiState.actualDeparture?.hour ?: 0,
        initialMinute = uiState.actualDeparture?.minute ?: 0,
        is24Hour = true,
    )
    val actualArrivalPickerState = rememberTimePickerState(
        initialHour = uiState.actualArrival?.hour ?: 0,
        initialMinute = uiState.actualArrival?.minute ?: 0,
        is24Hour = true,
    )
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        OutlinedTextField(
            value = uiState.airline,
            onValueChange = viewModel::setAirline,
            label = { Text("Airline") },
            singleLine = true,
            modifier = Modifier.weight(1f),
        )
        OutlinedTextField(
            value = uiState.flightNumber,
            onValueChange = viewModel::setFlightNumber,
            label = { Text("Flight number") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Text,
                capitalization = KeyboardCapitalization.Characters,
            ),
            modifier = Modifier.weight(1f),
        )
    }
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        OutlinedTextField(
            value = uiState.originIata,
            onValueChange = viewModel::setOriginIata,
            label = { Text("Origin IATA") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Text,
                capitalization = KeyboardCapitalization.Characters,
            ),
            modifier = Modifier.weight(1f),
        )
        OutlinedTextField(
            value = uiState.destinationIata,
            onValueChange = viewModel::setDestinationIata,
            label = { Text("Dest IATA") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Text,
                capitalization = KeyboardCapitalization.Characters,
            ),
            modifier = Modifier.weight(1f),
        )
    }
    val timeFormatter = remember { EditEventViewModel.TIME_FORMATTER }
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        OutlinedButton(
            onClick = { showActualDeparturePicker = true },
            modifier = Modifier.weight(1f),
        ) {
            Text(uiState.actualDeparture?.format(timeFormatter)?.let { "Dep: $it" } ?: "Actual departure")
        }
        OutlinedButton(
            onClick = { showActualArrivalPicker = true },
            modifier = Modifier.weight(1f),
        ) {
            Text(uiState.actualArrival?.format(timeFormatter)?.let { "Arr: $it" } ?: "Actual arrival")
        }
    }
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (uiState.actualDeparture != null) {
            TextButton(onClick = { viewModel.setActualDeparture(null) }) { Text("Clear departure") }
        }
        if (uiState.actualArrival != null) {
            TextButton(onClick = { viewModel.setActualArrival(null) }) { Text("Clear arrival") }
        }
    }

    if (showActualDeparturePicker) {
        AlertDialog(
            onDismissRequest = { showActualDeparturePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.setActualDeparture(LocalTime.of(actualDeparturePickerState.hour, actualDeparturePickerState.minute))
                    showActualDeparturePicker = false
                }) { Text("OK") }
            },
            dismissButton = {
                TextButton(onClick = { showActualDeparturePicker = false }) { Text("Cancel") }
            },
            text = { TimePicker(state = actualDeparturePickerState) },
        )
    }

    if (showActualArrivalPicker) {
        AlertDialog(
            onDismissRequest = { showActualArrivalPicker = false },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.setActualArrival(LocalTime.of(actualArrivalPickerState.hour, actualArrivalPickerState.minute))
                    showActualArrivalPicker = false
                }) { Text("OK") }
            },
            dismissButton = {
                TextButton(onClick = { showActualArrivalPicker = false }) { Text("Cancel") }
            },
            text = { TimePicker(state = actualArrivalPickerState) },
        )
    }
}

@Composable
private fun FitnessMetadataSection(
    uiState: EditEventViewModel.UiState,
    viewModel: EditEventViewModel,
) {
    val activity = uiState.fitnessActivity

    // Activity label (read-only)
    Text(
        "Activity: ${fitnessActivityLabel(activity)}",
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )

    // Duration
    OutlinedTextField(
        value = uiState.duration,
        onValueChange = viewModel::setDuration,
        label = { Text("Duration (e.g. 1:23:45)") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )

    // Distance (run, cycle, hike, ski)
    if (activity in fitnessDistanceActivities) {
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
    if (activity in fitnessElevationActivities) {
        OutlinedTextField(
            value = uiState.elevationGainM,
            onValueChange = viewModel::setElevationGainM,
            label = { Text("Elevation gain (m)") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth(),
        )
    }

    // Heart rate (run, cycle, hike, ski, squash)
    if (activity in fitnessHeartRateActivities) {
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
    when (activity) {
        FitnessActivity.FITNESS_ACTIVITY_RUN -> OutlinedTextField(
            value = uiState.avgPaceMinKm,
            onValueChange = viewModel::setAvgPaceMinKm,
            label = { Text("Avg pace (min/km)") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            modifier = Modifier.fillMaxWidth(),
        )
        FitnessActivity.FITNESS_ACTIVITY_CYCLE -> Row(
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
        FitnessActivity.FITNESS_ACTIVITY_HIKE -> {
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
        FitnessActivity.FITNESS_ACTIVITY_SKI -> {
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
        FitnessActivity.FITNESS_ACTIVITY_SCUBA -> {
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
        FitnessActivity.FITNESS_ACTIVITY_CLIMB -> FitnessClimbFields(uiState, viewModel)
        FitnessActivity.FITNESS_ACTIVITY_GOLF -> {
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
        FitnessActivity.FITNESS_ACTIVITY_SQUASH -> Row(
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
        else -> {}
    }

    // Garmin URL
    OutlinedTextField(
        value = uiState.garminUrl,
        onValueChange = viewModel::setGarminUrl,
        label = { Text("Garmin activity URL (optional)") },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
        modifier = Modifier.fillMaxWidth(),
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FitnessClimbFields(
    uiState: EditEventViewModel.UiState,
    viewModel: EditEventViewModel,
) {
    var expanded by remember { mutableStateOf(false) }

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = it },
        modifier = Modifier.fillMaxWidth(),
    ) {
        OutlinedTextField(
            value = fitnessClimbingTypeLabel(uiState.climbingType),
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
            fitnessClimbingTypeOptions.forEach { (type, label) ->
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

    if (uiState.climbingType == ClimbingType.CLIMBING_TYPE_SPORT) {
        OutlinedTextField(
            value = uiState.routeName,
            onValueChange = viewModel::setRouteName,
            label = { Text("Route name (optional)") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
    }
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

private val fitnessDistanceActivities = setOf(
    FitnessActivity.FITNESS_ACTIVITY_RUN,
    FitnessActivity.FITNESS_ACTIVITY_CYCLE,
    FitnessActivity.FITNESS_ACTIVITY_HIKE,
    FitnessActivity.FITNESS_ACTIVITY_SKI,
)

private val fitnessElevationActivities = setOf(
    FitnessActivity.FITNESS_ACTIVITY_CYCLE,
    FitnessActivity.FITNESS_ACTIVITY_HIKE,
    FitnessActivity.FITNESS_ACTIVITY_SKI,
)

private val fitnessHeartRateActivities = setOf(
    FitnessActivity.FITNESS_ACTIVITY_RUN,
    FitnessActivity.FITNESS_ACTIVITY_CYCLE,
    FitnessActivity.FITNESS_ACTIVITY_HIKE,
    FitnessActivity.FITNESS_ACTIVITY_SKI,
    FitnessActivity.FITNESS_ACTIVITY_SQUASH,
)

private val fitnessClimbingTypeOptions = listOf(
    ClimbingType.CLIMBING_TYPE_UNSPECIFIED to "Unspecified",
    ClimbingType.CLIMBING_TYPE_SPORT       to "Sport",
    ClimbingType.CLIMBING_TYPE_BOULDERING  to "Bouldering",
    ClimbingType.CLIMBING_TYPE_GYM         to "Gym",
)

private fun fitnessClimbingTypeLabel(type: ClimbingType): String = when (type) {
    ClimbingType.CLIMBING_TYPE_SPORT       -> "Sport"
    ClimbingType.CLIMBING_TYPE_BOULDERING  -> "Bouldering"
    ClimbingType.CLIMBING_TYPE_GYM         -> "Gym"
    else                                   -> "Unspecified"
}

private fun fitnessActivityLabel(activity: FitnessActivity): String = when (activity) {
    FitnessActivity.FITNESS_ACTIVITY_RUN    -> "Run"
    FitnessActivity.FITNESS_ACTIVITY_CYCLE  -> "Cycle"
    FitnessActivity.FITNESS_ACTIVITY_HIKE   -> "Hike"
    FitnessActivity.FITNESS_ACTIVITY_SKI    -> "Ski"
    FitnessActivity.FITNESS_ACTIVITY_SCUBA  -> "Scuba"
    FitnessActivity.FITNESS_ACTIVITY_CLIMB  -> "Climb"
    FitnessActivity.FITNESS_ACTIVITY_GOLF   -> "Golf"
    FitnessActivity.FITNESS_ACTIVITY_SQUASH -> "Squash"
    else                                    -> "Activity"
}

// ---------------------------------------------------------------------------
// Shared composables
// ---------------------------------------------------------------------------

@Composable
private fun EventTypeChip(eventType: String) {
    val (label, color) = when (eventType) {
        "span" -> "Span"  to MaterialTheme.colorScheme.secondaryContainer
        else   -> "Point" to MaterialTheme.colorScheme.primaryContainer
    }
    Surface(shape = MaterialTheme.shapes.small, color = color) {
        Text(
            text = label,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private val VISIBILITY_OPTIONS = listOf(
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
            VISIBILITY_OPTIONS.forEach { (vis, label) ->
                FilterChip(
                    selected = selected == vis,
                    onClick = { onSelect(vis) },
                    label = { Text(label) },
                )
            }
        }
    }
}

@Composable
private fun StarRatingRow(rating: Int, onRatingChange: (Int) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text("Rating", style = MaterialTheme.typography.labelLarge)
        Row(
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            for (i in 1..5) {
                val selected = i <= rating
                Text(
                    text = if (selected) "★" else "☆",
                    modifier = Modifier
                        .semantics {
                            role = Role.Button
                            contentDescription = if (selected) "Rating $i of 5, selected"
                                                else "Rate $i of 5"
                        }
                        .minimumInteractiveComponentSize()
                        .clickable { onRatingChange(if (i == rating) 0 else i) },
                    style = MaterialTheme.typography.headlineSmall,
                    color = if (selected) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.outline,
                )
            }
            if (rating > 0) {
                Spacer(Modifier.width(8.dp))
                Text(
                    "$rating/5",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
