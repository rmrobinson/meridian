package ca.rmrobinson.meridian.ui.scanner

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import javax.inject.Inject

enum class ScannerMode { ISBN, BCBP }

data class ScannerUiState(
    val mode: ScannerMode = ScannerMode.ISBN,
    /** Set once a barcode is successfully decoded; null while scanning. */
    val scannedValue: String? = null,
    val error: String? = null,
    /** True while the scanner is paused after a successful decode. */
    val isPaused: Boolean = false,
)

/**
 * Key used to post the scan result back to the previous back-stack entry's
 * SavedStateHandle. Callers retrieve their result with:
 *
 *   savedStateHandle.getStateFlow(SCAN_RESULT_KEY, null)
 */
const val SCAN_RESULT_KEY = "scan_result"

@HiltViewModel
class ScannerViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    val mode: ScannerMode = when (savedStateHandle.get<String>("mode")) {
        "bcbp" -> ScannerMode.BCBP
        else   -> ScannerMode.ISBN
    }

    private val _uiState = MutableStateFlow(ScannerUiState(mode = mode))
    val uiState: StateFlow<ScannerUiState> = _uiState.asStateFlow()

    /** Called by the CameraX analyser when a barcode is detected. */
    fun onBarcodeDetected(rawValue: String) {
        if (_uiState.value.isPaused) return   // ignore duplicates
        _uiState.update { it.copy(scannedValue = rawValue, isPaused = true, error = null) }
    }

    /** Called if ML Kit reports an error during analysis. */
    fun onScanError(message: String) {
        if (_uiState.value.isPaused) return
        _uiState.update { it.copy(error = message) }
    }

    /** Re-enables the scanner after the user dismisses an error or retries. */
    fun resumeScanning() {
        _uiState.update { it.copy(scannedValue = null, isPaused = false, error = null) }
    }
}
