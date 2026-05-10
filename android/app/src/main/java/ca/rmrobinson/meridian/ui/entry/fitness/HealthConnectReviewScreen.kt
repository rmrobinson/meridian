package ca.rmrobinson.meridian.ui.entry.fitness

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.DirectionsBike
import androidx.compose.material.icons.automirrored.filled.DirectionsRun
import androidx.compose.material.icons.filled.DownhillSkiing
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material.icons.filled.GolfCourse
import androidx.compose.material.icons.filled.Hiking
import androidx.compose.material.icons.filled.Landscape
import androidx.compose.material.icons.filled.ScubaDiving
import androidx.compose.material.icons.filled.SportsTennis
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import ca.rmrobinson.meridian.data.healthconnect.HealthActivity
import ca.rmrobinson.meridian.data.healthExerciseTypeToFitnessActivity
import ca.rmrobinson.meridian.data.local.EventEntity
import meridian.v1.FitnessActivity
import java.time.Duration
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HealthConnectReviewScreen(
    onBack: () -> Unit,
    onDone: () -> Unit,
    viewModel: HealthConnectReviewViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val mergeSheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    LaunchedEffect(uiState.error) {
        uiState.error?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.dismissError()
        }
    }
    LaunchedEffect(uiState.isDone) {
        if (uiState.isDone) onDone()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Review Health Connect Imports") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    TextButton(
                        onClick = viewModel::skipAll,
                        enabled = uiState.items.isNotEmpty() && !uiState.isConfirming,
                    ) { Text("Skip all") }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { innerPadding ->
        when {
            uiState.isLoading -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator()
                }
            }
            uiState.items.isEmpty() -> {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding)
                        .padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Text("No pending imports", style = MaterialTheme.typography.bodyLarge)
                    Spacer(Modifier.height(8.dp))
                    OutlinedButton(onClick = onBack) { Text("Go back") }
                }
            }
            else -> {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding)
                        .padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(uiState.items, key = { it.activity.healthConnectId }) { item ->
                        ReviewItemCard(
                            item = item,
                            onImport = {
                                viewModel.setAction(
                                    item.activity.healthConnectId,
                                    HealthConnectReviewViewModel.ItemAction.IMPORT,
                                )
                            },
                            onMerge = { viewModel.openMergeSheet(item) },
                            onSkip = { viewModel.skipImmediate(item.activity.healthConnectId) },
                        )
                    }
                    item {
                        Spacer(Modifier.height(8.dp))
                        val anySelected =
                            uiState.items.any { it.action != HealthConnectReviewViewModel.ItemAction.NONE }
                        Button(
                            onClick = viewModel::confirm,
                            enabled = anySelected && !uiState.isConfirming,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            if (uiState.isConfirming) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(18.dp),
                                    strokeWidth = 2.dp,
                                    color = MaterialTheme.colorScheme.onPrimary,
                                )
                            } else {
                                Text("Confirm imports")
                            }
                        }
                        Spacer(Modifier.height(16.dp))
                    }
                }
            }
        }
    }

    uiState.mergeSheetItem?.let { sheetItem ->
        ModalBottomSheet(
            onDismissRequest = viewModel::closeMergeSheet,
            sheetState = mergeSheetState,
        ) {
            MergeCandidatesSheet(
                candidates = uiState.mergeCandidates,
                onSelect = { eventId ->
                    viewModel.selectMergeTarget(sheetItem, eventId)
                },
                onDismiss = viewModel::closeMergeSheet,
            )
        }
    }
}

@Composable
private fun ReviewItemCard(
    item: HealthConnectReviewViewModel.ReviewItem,
    onImport: () -> Unit,
    onMerge: () -> Unit,
    onSkip: () -> Unit,
) {
    val activity = item.activity
    val fitnessActivity = healthExerciseTypeToFitnessActivity(activity.exerciseType)
    val zone = ZoneId.systemDefault()
    val startDate = activity.startTime.atZone(zone).toLocalDate()
    val duration = Duration.between(activity.startTime, activity.endTime)

    val cardBorderColor = if (item.hasError) {
        MaterialTheme.colorScheme.error
    } else {
        MaterialTheme.colorScheme.outline
    }

    OutlinedCard(
        modifier = Modifier.fillMaxWidth(),
        border = BorderStroke(1.dp, cardBorderColor),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            // Header row: icon + title + date
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Icon(
                    imageVector = fitnessActivityIcon(fitnessActivity),
                    contentDescription = null,
                    modifier = Modifier.size(24.dp),
                    tint = if (item.hasError) {
                        MaterialTheme.colorScheme.error
                    } else {
                        MaterialTheme.colorScheme.primary
                    },
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = activity.derivedTitle(fitnessActivity),
                        style = MaterialTheme.typography.titleSmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = startDate.format(DateTimeFormatter.ISO_LOCAL_DATE),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            if (item.hasError) {
                Text(
                    text = "Failed to process — tap an action to retry",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }

            // Metrics row: duration · distance · elevation · source
            val metrics = buildList {
                add(formatDuration(duration))
                activity.distanceMeters?.let { add("%.1f km".format(it / 1000.0)) }
                activity.elevationGainedMeters?.let { add("+%.0f m".format(it)) }
                activity.sourcePackageName?.let { add(it) }
            }
            Text(
                text = metrics.joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            HorizontalDivider()

            // Action chips
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(
                    selected = item.action == HealthConnectReviewViewModel.ItemAction.IMPORT,
                    onClick = onImport,
                    label = { Text("Import") },
                )
                FilterChip(
                    selected = item.action == HealthConnectReviewViewModel.ItemAction.MERGE,
                    onClick = onMerge,
                    label = { Text("Merge") },
                )
                // Skip is immediate (removes item from list) so it has no persistent selected
                // state. It is styled with error colours to signal a destructive action.
                FilterChip(
                    selected = false,
                    onClick = onSkip,
                    label = { Text("Skip") },
                    colors = FilterChipDefaults.filterChipColors(
                        labelColor = MaterialTheme.colorScheme.error,
                    ),
                )
            }

            if (item.action == HealthConnectReviewViewModel.ItemAction.MERGE &&
                item.mergeTargetId != null
            ) {
                Text(
                    text = "Will merge into event ${item.mergeTargetId.take(8)}…",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }
    }
}

@Composable
private fun MergeCandidatesSheet(
    candidates: List<EventEntity>,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Text(
            text = "Select event to merge into",
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(bottom = 12.dp),
        )
        if (candidates.isEmpty()) {
            Text(
                text = "No nearby fitness events found (±3 days)",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(vertical = 8.dp),
            )
        } else {
            // LazyColumn with a bounded height so the sheet doesn't overflow on large lists.
            LazyColumn(modifier = Modifier.heightIn(max = 320.dp)) {
                items(candidates, key = { it.id }) { event ->
                    TextButton(
                        onClick = { onSelect(event.id) },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalAlignment = Alignment.Start,
                        ) {
                            Text(event.title, style = MaterialTheme.typography.bodyMedium)
                            Text(
                                text = event.date ?: event.startDate ?: "",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    HorizontalDivider()
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        OutlinedButton(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) { Text("Cancel") }
        Spacer(Modifier.height(16.dp))
    }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** Formats a [Duration] as "1h 23m" or "45m". */
private fun formatDuration(duration: Duration): String {
    val hours = duration.toHours()
    val minutes = duration.toMinutes() % 60
    return if (hours > 0) "${hours}h ${minutes}m" else "${minutes}m"
}

/**
 * Derives the display title for a [HealthActivity].
 * Uses the source-provided title if present; falls back to "{ActivityLabel} on {date}".
 * Single source of truth — [ca.rmrobinson.meridian.data.EventMapper] has the identical logic
 * for the stored title; keep these in sync if activity labels change.
 */
private fun HealthActivity.derivedTitle(fitnessActivity: FitnessActivity): String {
    if (!title.isNullOrBlank()) return title
    val dateLabel = startTime.atZone(ZoneId.systemDefault()).toLocalDate().toString()
    val label = when (fitnessActivity) {
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
    return "$label on $dateLabel"
}

private fun fitnessActivityIcon(activity: FitnessActivity): ImageVector = when (activity) {
    FitnessActivity.FITNESS_ACTIVITY_RUN    -> Icons.AutoMirrored.Filled.DirectionsRun
    FitnessActivity.FITNESS_ACTIVITY_CYCLE  -> Icons.AutoMirrored.Filled.DirectionsBike
    FitnessActivity.FITNESS_ACTIVITY_HIKE   -> Icons.Default.Hiking
    FitnessActivity.FITNESS_ACTIVITY_SKI    -> Icons.Default.DownhillSkiing
    FitnessActivity.FITNESS_ACTIVITY_SCUBA  -> Icons.Default.ScubaDiving
    FitnessActivity.FITNESS_ACTIVITY_CLIMB  -> Icons.Default.Landscape
    FitnessActivity.FITNESS_ACTIVITY_GOLF   -> Icons.Default.GolfCourse
    FitnessActivity.FITNESS_ACTIVITY_SQUASH -> Icons.Default.SportsTennis
    else                                    -> Icons.Default.FitnessCenter
}
