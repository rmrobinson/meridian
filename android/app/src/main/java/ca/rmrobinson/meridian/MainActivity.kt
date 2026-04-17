package ca.rmrobinson.meridian

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import ca.rmrobinson.meridian.ui.entry.hobbies.HobbyLandingScreen
import ca.rmrobinson.meridian.ui.entry.hobbies.book.BookManualScreen
import ca.rmrobinson.meridian.ui.entry.hobbies.book.BookScanScreen
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

    @Inject lateinit var appConfigStore: AppConfigStore

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MeridianTheme {
                val navController = rememberNavController()
                val startDestination = if (appConfigStore.current.isConfigured) "timeline" else "setup"

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
                            onNavigateToEntry = { navController.navigate("entry/hobbies") },
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

                    composable("entry/hobbies") {
                        HobbyLandingScreen(
                            onNavigateToBook = { navController.navigate("entry/hobbies/book/scan") },
                            onBack = { navController.popBackStack() },
                        )
                    }

                    composable("entry/hobbies/book/scan") { backStackEntry ->
                        val scanResult by backStackEntry.savedStateHandle
                            .getStateFlow<String?>(SCAN_RESULT_KEY, null)
                            .collectAsState()
                        BookScanScreen(
                            scanResult = scanResult,
                            onNavigateToScanner = { navController.navigate("scanner/isbn") },
                            onNavigateToManual = { isbn ->
                                val route = if (isbn.isEmpty()) "entry/hobbies/book/manual"
                                            else "entry/hobbies/book/manual?isbn=$isbn"
                                navController.navigate(route)
                            },
                            onBack = { navController.popBackStack() },
                            onClearScanResult = {
                                backStackEntry.savedStateHandle.remove<String>(SCAN_RESULT_KEY)
                            },
                        )
                    }

                    composable(
                        route = "entry/hobbies/book/manual?isbn={isbn}",
                        arguments = listOf(
                            navArgument("isbn") {
                                type = NavType.StringType
                                defaultValue = ""
                            },
                        ),
                    ) {
                        BookManualScreen(
                            onBack = { navController.popBackStack() },
                            onSuccess = {
                                navController.popBackStack("timeline", inclusive = false)
                            },
                        )
                    }

                    // Placeholder routes — implemented in later phases
                    composable("edit/{eventId}") { /* TODO Phase 7 */ }
                    composable("entry/flight") { /* TODO Phase 5 */ }
                    composable("entry/fitness") { /* TODO Phase 8 */ }
                }
            }
        }
    }
}
