package ca.rmrobinson.meridian.ui.entry.fitness

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.DirectionsBike
import androidx.compose.material.icons.automirrored.filled.DirectionsRun
import androidx.compose.material.icons.filled.DownhillSkiing
import androidx.compose.material.icons.filled.GolfCourse
import androidx.compose.material.icons.filled.Hiking
import androidx.compose.material.icons.filled.Landscape
import androidx.compose.material.icons.filled.ScubaDiving
import androidx.compose.material.icons.filled.SportsTennis
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import ca.rmrobinson.meridian.ui.entry.fitness.FitnessEntryViewModel.Companion.ALL_ACTIVITIES
import meridian.v1.FitnessActivity

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FitnessLandingScreen(
    onNavigateToActivity: (String) -> Unit,
    onNavigateToHealthConnectReview: () -> Unit,
    onBack: () -> Unit,
    viewModel: FitnessLandingViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = viewModel.getPermissionContract(),
        onResult = viewModel::onPermissionsResult,
    )

    // Consume one-shot events from the ViewModel via Channel (delivered exactly once).
    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                is FitnessLandingViewModel.UiEvent.NavigateToReview -> onNavigateToHealthConnectReview()
                is FitnessLandingViewModel.UiEvent.PermissionsDenied ->
                    snackbarHostState.showSnackbar("Health Connect permissions are required to import activities")
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Add Fitness Activity") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (uiState.isHealthConnectAvailable) {
                item {
                    HealthConnectReviewCard(
                        pendingCount = uiState.pendingImportCount,
                        hasPermissions = uiState.hasPermissions,
                        onClick = {
                            if (uiState.hasPermissions) {
                                onNavigateToHealthConnectReview()
                            } else {
                                permissionLauncher.launch(viewModel.getRequiredPermissions())
                            }
                        },
                    )
                }
            }

            items(ALL_ACTIVITIES, key = { it.slug }) { entry ->
                ActivityTypeCard(
                    label = entry.label,
                    icon = activityIcon(entry.activity),
                    onClick = { onNavigateToActivity(entry.slug) },
                )
            }
        }
    }
}

@Composable
private fun HealthConnectReviewCard(
    pendingCount: Int,
    hasPermissions: Boolean,
    onClick: () -> Unit,
) {
    OutlinedCard(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            BadgedBox(
                badge = {
                    if (pendingCount > 0) {
                        Badge { Text(pendingCount.toString()) }
                    }
                },
            ) {
                Icon(
                    imageVector = Icons.Default.Sync,
                    contentDescription = null,
                    modifier = Modifier.size(24.dp),
                    tint = MaterialTheme.colorScheme.primary,
                )
            }
            Spacer(Modifier.width(12.dp))
            Text(
                text = if (hasPermissions) "Review Health Connect imports" else "Connect Health Connect",
                style = MaterialTheme.typography.titleMedium,
            )
        }
    }
}

@Composable
private fun ActivityTypeCard(
    label: String,
    icon: ImageVector,
    onClick: () -> Unit,
) {
    OutlinedCard(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(24.dp),
                tint = MaterialTheme.colorScheme.primary,
            )
            Spacer(Modifier.width(12.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.titleMedium,
            )
        }
    }
}

private fun activityIcon(activity: FitnessActivity): ImageVector = when (activity) {
    FitnessActivity.FITNESS_ACTIVITY_RUN    -> Icons.AutoMirrored.Filled.DirectionsRun
    FitnessActivity.FITNESS_ACTIVITY_CYCLE  -> Icons.AutoMirrored.Filled.DirectionsBike
    FitnessActivity.FITNESS_ACTIVITY_HIKE   -> Icons.Default.Hiking
    FitnessActivity.FITNESS_ACTIVITY_SKI    -> Icons.Default.DownhillSkiing
    FitnessActivity.FITNESS_ACTIVITY_SCUBA  -> Icons.Default.ScubaDiving
    FitnessActivity.FITNESS_ACTIVITY_CLIMB  -> Icons.Default.Landscape
    FitnessActivity.FITNESS_ACTIVITY_GOLF   -> Icons.Default.GolfCourse
    FitnessActivity.FITNESS_ACTIVITY_SQUASH -> Icons.Default.SportsTennis
    else                                    -> Icons.AutoMirrored.Filled.DirectionsRun
}
