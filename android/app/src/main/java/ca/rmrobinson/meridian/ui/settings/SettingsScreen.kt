package ca.rmrobinson.meridian.ui.settings

import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import ca.rmrobinson.meridian.ThemeMode

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    // Grant flow: used when permissions are not yet granted.
    val hcPermissionLauncher = rememberLauncherForActivityResult(
        contract = viewModel.getHealthConnectPermissionContract(),
        onResult = viewModel::onHealthConnectPermissionsResult,
    )
    // Manage flow: opens the HC app's permission management screen when permissions are
    // already granted. The grant dialog returns immediately with no UI in that case.
    val hcManageLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult(),
        onResult = { viewModel.onHealthConnectPermissionsResult(emptySet()) },
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 24.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedTextField(
                value = uiState.grpcHost,
                onValueChange = viewModel::updateHost,
                label = { Text("Host") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = uiState.grpcPort,
                onValueChange = viewModel::updatePort,
                label = { Text("Port") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = uiState.bearerToken,
                onValueChange = viewModel::updateToken,
                label = { Text("Bearer Token") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                modifier = Modifier.fillMaxWidth(),
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text("Allow plaintext (no TLS)")
                Switch(
                    checked = uiState.usePlaintext,
                    onCheckedChange = viewModel::updateUsePlaintext,
                )
            }
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Theme")
                val themeModes = listOf(ThemeMode.SYSTEM, ThemeMode.LIGHT, ThemeMode.DARK)
                val themeLabels = listOf("System", "Light", "Dark")
                SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                    themeModes.forEachIndexed { index, mode ->
                        SegmentedButton(
                            selected = uiState.themeMode == mode,
                            onClick = { viewModel.updateThemeMode(mode) },
                            shape = SegmentedButtonDefaults.itemShape(
                                index = index,
                                count = themeModes.size,
                            ),
                        ) {
                            Text(themeLabels[index])
                        }
                    }
                }
            }
            if (uiState.isHealthConnectAvailable) {
                Spacer(modifier = Modifier.height(4.dp))
                HorizontalDivider()
                Spacer(modifier = Modifier.height(4.dp))
                Text("Health Connect", style = MaterialTheme.typography.labelLarge)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        text = if (uiState.hasHealthConnectPermissions) "Permissions granted" else "Permissions required",
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (uiState.hasHealthConnectPermissions) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.error
                        },
                    )
                    OutlinedButton(
                        onClick = {
                            if (uiState.hasHealthConnectPermissions) {
                                hcManageLauncher.launch(viewModel.buildManageHcPermissionsIntent())
                            } else {
                                hcPermissionLauncher.launch(viewModel.getHealthConnectRequiredPermissions())
                            }
                        },
                    ) {
                        Text(if (uiState.hasHealthConnectPermissions) "Manage" else "Grant")
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))
            Button(
                onClick = { viewModel.save(); onBack() },
                enabled = uiState.grpcHost.isNotBlank() && uiState.bearerToken.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Save")
            }
        }
    }
}
