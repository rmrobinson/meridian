package ca.rmrobinson.meridian.ui.entry.hobbies.book

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import ca.rmrobinson.meridian.util.IsbnValidator

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BookScanScreen(
    scanResult: String?,
    onNavigateToScanner: () -> Unit,
    onNavigateToManual: (String) -> Unit,
    onBack: () -> Unit,
    onClearScanResult: () -> Unit,
) {
    var isbnError by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(scanResult) {
        val raw = scanResult ?: return@LaunchedEffect
        onClearScanResult()
        val normalized = IsbnValidator.normalize(raw)
        if (normalized != null) {
            isbnError = null
            onNavigateToManual(normalized)
        } else {
            isbnError = "Barcode is not a valid ISBN. Please try again."
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Add Book") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 24.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.Top,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(40.dp))

            Text(
                "How would you like to add this book?",
                style = MaterialTheme.typography.titleMedium,
            )

            Spacer(Modifier.height(24.dp))

            Button(
                onClick = onNavigateToScanner,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Scan Barcode")
            }

            Spacer(Modifier.height(8.dp))

            OutlinedButton(
                onClick = { onNavigateToManual("") },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Enter Manually")
            }

            isbnError?.let { error ->
                Spacer(Modifier.height(16.dp))
                Text(
                    text = error,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}
