package ca.rmrobinson.meridian

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import ca.rmrobinson.meridian.ui.scanner.SCAN_RESULT_KEY
import ca.rmrobinson.meridian.ui.scanner.ScannerScreen
import ca.rmrobinson.meridian.ui.settings.SettingsScreen
import ca.rmrobinson.meridian.ui.setup.SetupScreen
import ca.rmrobinson.meridian.ui.theme.MeridianTheme
import ca.rmrobinson.meridian.ui.timeline.TimelineScreen
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject lateinit var appConfig: AppConfig

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MeridianTheme {
                val navController = rememberNavController()
                val startDestination = if (appConfig.isConfigured) "timeline" else "setup"

                NavHost(navController = navController, startDestination = startDestination) {
                    composable("setup") {
                        SetupScreen(onConfigured = {
                            navController.navigate("timeline") {
                                popUpTo("setup") { inclusive = true }
                            }
                        })
                    }

                    composable("timeline") {
                        TimelineScreen(
                            onNavigateToSettings = { navController.navigate("settings") },
                            onNavigateToEntry = { /* TODO Phase 4/5 */ },
                            onNavigateToEdit = { eventId -> navController.navigate("edit/$eventId") },
                        )
                    }

                    composable("settings") {
                        SettingsScreen(onBack = { navController.popBackStack() })
                    }

                    composable("scanner/{mode}") { backStackEntry ->
                        ScannerScreen(
                            onBack = { navController.popBackStack() },
                            onResult = { rawValue ->
                                // Deliver result to the previous back-stack entry's SavedStateHandle
                                navController
                                    .previousBackStackEntry
                                    ?.savedStateHandle
                                    ?.set(SCAN_RESULT_KEY, rawValue)
                            },
                        )
                    }

                    // Placeholder routes — implemented in later phases
                    composable("edit/{eventId}") { /* TODO Phase 7 */ }
                    composable("entry/flight") { /* TODO Phase 5 */ }
                    composable("entry/fitness") { /* TODO Phase 8 */ }
                    composable("entry/hobbies") { /* TODO Phase 4 */ }
                }
            }
        }
    }
}
