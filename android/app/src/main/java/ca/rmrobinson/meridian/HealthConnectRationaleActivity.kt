package ca.rmrobinson.meridian

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DirectionsRun
import androidx.compose.material.icons.filled.Straighten
import androidx.compose.material.icons.filled.Terrain
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import ca.rmrobinson.meridian.ui.theme.MeridianTheme

/**
 * Displayed when the user navigates to Meridian from Health Connect's "App permissions" screen
 * via the VIEW_PERMISSION_USAGE intent. Required by Health Connect policy to explain which data
 * types the app reads and why.
 *
 * See: https://developer.android.com/health-and-fitness/guides/health-connect/develop/get-permissions
 */
class HealthConnectRationaleActivity : ComponentActivity() {

    @OptIn(ExperimentalMaterial3Api::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MeridianTheme {
                Scaffold(
                    topBar = {
                        TopAppBar(title = { Text("Health Connect — Privacy") })
                    },
                ) { padding ->
                    RationaleContent(modifier = Modifier.padding(padding))
                }
            }
        }
    }
}

@Composable
private fun RationaleContent(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            text = "How Meridian uses your health data",
            style = MaterialTheme.typography.titleLarge,
        )
        Text(
            text = "Meridian reads the following data from Health Connect to let you record " +
                "fitness activities in your personal timeline. Data is sent to your own Meridian " +
                "server and is never shared with third parties.",
            style = MaterialTheme.typography.bodyMedium,
        )

        HorizontalDivider()

        DataTypeRow(
            icon = Icons.Default.DirectionsRun,
            title = "Exercise sessions",
            description = "Activity type and duration, used to create timeline entries for " +
                "runs, hikes, bike rides, and other workouts.",
        )
        DataTypeRow(
            icon = Icons.Default.Straighten,
            title = "Distance",
            description = "Distance covered during an exercise session, displayed alongside " +
                "the timeline entry.",
        )
        DataTypeRow(
            icon = Icons.Default.Terrain,
            title = "Elevation gained",
            description = "Elevation gain during a session (e.g. hikes, ski runs), displayed " +
                "alongside the timeline entry.",
        )

        HorizontalDivider()

        Text(
            text = "Meridian does not write any data back to Health Connect and does not " +
                "share your health data with any third party. You can revoke access at any time " +
                "from the Health Connect app.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun DataTypeRow(icon: ImageVector, title: String, description: String) {
    Row(
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            modifier = Modifier.size(24.dp),
            tint = MaterialTheme.colorScheme.primary,
        )
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(text = title, style = MaterialTheme.typography.titleSmall)
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
