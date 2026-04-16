package ca.rmrobinson.meridian.ui.timeline

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import ca.rmrobinson.meridian.data.local.EventEntity
import ca.rmrobinson.meridian.data.local.LineFamilyEntity
import ca.rmrobinson.meridian.data.local.SyncState
import ca.rmrobinson.meridian.data.local.toColor
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TimelineScreen(
    onNavigateToSettings: () -> Unit,
    onNavigateToEntry: () -> Unit,
    onNavigateToEdit: (String) -> Unit,
    viewModel: TimelineViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val darkTheme = isSystemInDarkTheme()

    LaunchedEffect(uiState.error) {
        uiState.error?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.dismissError()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Meridian") },
                actions = {
                    if (uiState.isSyncing) {
                        Box(modifier = Modifier.padding(end = 8.dp)) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(24.dp),
                                strokeWidth = 2.dp,
                            )
                        }
                    }
                    IconButton(onClick = onNavigateToSettings) {
                        Icon(Icons.Default.Settings, contentDescription = "Settings")
                    }
                },
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = onNavigateToEntry) {
                Icon(Icons.Default.Add, contentDescription = "Add event")
            }
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            // Filter chip row
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp),
            ) {
                FilterChip(
                    selected = uiState.showOpenSpansOnly,
                    onClick = { viewModel.toggleOpenSpansFilter() },
                    label = { Text("In Progress") },
                )
            }

            PullToRefreshBox(
                isRefreshing = uiState.isSyncing,
                onRefresh = { viewModel.sync() },
                modifier = Modifier.fillMaxSize(),
            ) {
                if (uiState.items.isEmpty() && !uiState.isSyncing) {
                    EmptyState(showOpenSpansOnly = uiState.showOpenSpansOnly)
                } else {
                    LazyColumn(modifier = Modifier.fillMaxSize()) {
                        items(uiState.items, key = { item ->
                            when (item) {
                                is TimelineItem.YearHeader -> "year-${item.year}"
                                is TimelineItem.EventRow -> item.event.id
                            }
                        }) { item ->
                            when (item) {
                                is TimelineItem.YearHeader -> YearHeaderRow(item.year)
                                is TimelineItem.EventRow -> EventCard(
                                    event = item.event,
                                    family = uiState.lineFamilies[item.event.familyId],
                                    darkTheme = darkTheme,
                                    showMarkComplete = uiState.showOpenSpansOnly,
                                    onClick = { onNavigateToEdit(item.event.id) },
                                    onMarkComplete = { viewModel.requestMarkComplete(item.event) },
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    // Mark-complete bottom sheet
    uiState.markCompleteEvent?.let { event ->
        MarkCompleteSheet(
            event = event,
            onDismiss = { viewModel.dismissMarkComplete() },
            onConfirm = { date -> viewModel.confirmMarkComplete(event, date) },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MarkCompleteSheet(
    event: EventEntity,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var showDatePicker by remember { mutableStateOf(false) }
    var selectedDate by remember { mutableStateOf(LocalDate.now()) }
    val formatter = remember { DateTimeFormatter.ISO_LOCAL_DATE }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("Mark complete", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(4.dp))
            Text(
                event.title,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(16.dp))
            OutlinedButton(onClick = { showDatePicker = true }) {
                Text("Completion date: ${selectedDate.format(formatter)}")
            }
            Spacer(Modifier.height(16.dp))
            Button(
                onClick = { onConfirm(selectedDate.format(formatter)) },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Confirm")
            }
            Spacer(Modifier.height(8.dp))
            TextButton(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) {
                Text("Cancel")
            }
            Spacer(Modifier.height(16.dp))
        }
    }

    if (showDatePicker) {
        val datePickerState = rememberDatePickerState(
            initialSelectedDateMillis = selectedDate
                .atStartOfDay(ZoneOffset.UTC)
                .toInstant()
                .toEpochMilli(),
        )
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    datePickerState.selectedDateMillis?.let { millis ->
                        selectedDate = Instant.ofEpochMilli(millis)
                            .atZone(ZoneOffset.UTC)
                            .toLocalDate()
                    }
                    showDatePicker = false
                }) { Text("OK") }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) { Text("Cancel") }
            },
        ) {
            DatePicker(state = datePickerState)
        }
    }
}

@Composable
private fun EmptyState(showOpenSpansOnly: Boolean) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                if (showOpenSpansOnly) "No events in progress" else "No events yet",
                style = MaterialTheme.typography.titleMedium,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                if (showOpenSpansOnly) "Events without an end date will appear here"
                else "Pull down to sync or tap + to add one",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun YearHeaderRow(year: Int) {
    Text(
        text = year.toString(),
        fontWeight = FontWeight.Bold,
        fontSize = 20.sp,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
    )
}

@Composable
private fun EventCard(
    event: EventEntity,
    family: LineFamilyEntity?,
    darkTheme: Boolean,
    showMarkComplete: Boolean,
    onClick: () -> Unit,
    onMarkComplete: () -> Unit,
) {
    val familyColor: Color = family?.toColor(darkTheme) ?: MaterialTheme.colorScheme.primary
    val isUnsynced = event.syncState != SyncState.SYNCED

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Family color dot
            Box(
                modifier = Modifier
                    .size(12.dp)
                    .clip(CircleShape)
                    .background(familyColor),
            )
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = event.title,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                val dateLabel = formatDateLabel(event)
                if (dateLabel.isNotBlank()) {
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = dateLabel,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (!event.description.isNullOrBlank()) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = event.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                    )
                }
                if (showMarkComplete && event.type == "span" && event.endDate == null) {
                    Spacer(Modifier.height(8.dp))
                    TextButton(
                        onClick = onMarkComplete,
                        modifier = Modifier.padding(0.dp),
                    ) {
                        Text("Mark complete", style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                if (family != null) {
                    Text(
                        text = family.label,
                        style = MaterialTheme.typography.labelSmall,
                        color = familyColor,
                    )
                }
                // Unsynced dot — shown only when not yet confirmed by server
                if (isUnsynced) {
                    Spacer(Modifier.height(4.dp))
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.tertiary),
                    )
                }
            }
        }
    }
}

private fun formatDateLabel(event: EventEntity): String {
    return when {
        event.date != null -> event.date
        event.startDate != null && event.endDate != null -> "${event.startDate} – ${event.endDate}"
        event.startDate != null -> "from ${event.startDate}"
        else -> ""
    }
}
