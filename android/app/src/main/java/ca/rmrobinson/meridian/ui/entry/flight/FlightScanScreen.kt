package ca.rmrobinson.meridian.ui.entry.flight

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import java.time.LocalTime
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FlightScanScreen(
    scanResult: String?,
    onNavigateToScanner: () -> Unit,
    onSuccess: () -> Unit,
    onBack: () -> Unit,
    onClearScanResult: () -> Unit,
    viewModel: FlightScanViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val formatter = remember { DateTimeFormatter.ISO_LOCAL_DATE }
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(scanResult) {
        val raw = scanResult ?: return@LaunchedEffect
        onClearScanResult()
        viewModel.onBcbpReceived(raw)
    }

    LaunchedEffect(uiState.isSuccess) {
        if (uiState.isSuccess) onSuccess()
    }

    LaunchedEffect(uiState.submitError) {
        uiState.submitError?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.dismissSubmitError()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Scan Boarding Pass") },
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
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.Top,
        ) {
            if (uiState.resolvedFlights.isEmpty()) {
                Spacer(Modifier.height(40.dp))
                Text(
                    text = "Scan your boarding pass barcode",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.align(Alignment.CenterHorizontally),
                )
                Spacer(Modifier.height(24.dp))
                Button(
                    onClick = onNavigateToScanner,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Scan Barcode")
                }
                uiState.parseError?.let { error ->
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = error,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            } else {
                val legLabel = if (uiState.resolvedFlights.size == 1) "Flight found"
                               else "${uiState.resolvedFlights.size} flights found"
                Text(text = legLabel, style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(12.dp))
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    itemsIndexed(
                        items = uiState.resolvedFlights,
                        key = { _, it -> "${it.parsed.originAirport}-${it.parsed.destinationAirport}-${it.parsed.julianDate}" },
                    ) { index, resolved ->
                        FlightSummaryCard(
                            resolved = resolved,
                            formatter = formatter,
                            onSetDeparture = { viewModel.setScheduledDeparture(index, it) },
                        )
                    }
                }
                Spacer(Modifier.height(12.dp))
                Button(
                    onClick = viewModel::confirmAndSave,
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
                        Text(if (uiState.resolvedFlights.size == 1) "Save Flight" else "Save All Flights")
                    }
                }
                Spacer(Modifier.height(8.dp))
                OutlinedButton(
                    onClick = onNavigateToScanner,
                    enabled = !uiState.isSubmitting,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Scan Again")
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FlightSummaryCard(
    resolved: FlightScanViewModel.ResolvedFlight,
    formatter: DateTimeFormatter,
    onSetDeparture: (LocalTime?) -> Unit,
) {
    var showTimePicker by remember { mutableStateOf(false) }
    val timeFormatter = remember { FlightEntryViewModel.TIME_FORMATTER }
    val timePickerState = rememberTimePickerState(
        initialHour = resolved.scheduledDeparture?.hour ?: 0,
        initialMinute = resolved.scheduledDeparture?.minute ?: 0,
        is24Hour = true,
    )

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(text = resolved.title, style = MaterialTheme.typography.titleMedium)
            Text(
                text = resolved.date.format(formatter),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (resolved.parsed.seatNumber.isNotEmpty()) {
                Text(
                    text = "Seat ${resolved.parsed.seatNumber}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { showTimePicker = true }) {
                    Text(resolved.scheduledDeparture?.format(timeFormatter)?.let { "Dep: $it" } ?: "Sched. dep.")
                }
                if (resolved.scheduledDeparture != null) {
                    TextButton(onClick = { onSetDeparture(null) }) { Text("Clear") }
                }
            }
        }
    }

    if (showTimePicker) {
        AlertDialog(
            onDismissRequest = { showTimePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    onSetDeparture(LocalTime.of(timePickerState.hour, timePickerState.minute))
                    showTimePicker = false
                }) { Text("OK") }
            },
            dismissButton = {
                TextButton(onClick = { showTimePicker = false }) { Text("Cancel") }
            },
            text = { TimePicker(state = timePickerState) },
        )
    }
}
