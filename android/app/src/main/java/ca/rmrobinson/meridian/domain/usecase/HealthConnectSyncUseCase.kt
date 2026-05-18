package ca.rmrobinson.meridian.domain.usecase

import ca.rmrobinson.meridian.data.healthconnect.HealthActivity
import ca.rmrobinson.meridian.data.healthconnect.HealthConnectPrefs
import ca.rmrobinson.meridian.data.healthconnect.HealthConnectRepository
import ca.rmrobinson.meridian.data.local.HcEventLinkDao
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.Instant
import java.time.temporal.ChronoUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Fetches Health Connect activities within the configured lookback window, deduplicates them
 * against [HcEventLinkDao], and exposes the pending list via [pendingActivities].
 *
 * The full lookback window is always fetched (no timestamp optimization) so that unprocessed
 * pending activities remain visible after navigating away and back to the review screen.
 * Already-imported, merged, or skipped entries are filtered by [HealthConnectImportUseCase].
 *
 * [pendingActivities] always emits after a sync, even when the result is empty, so that
 * collectors (review screen, badge) see the freshly-filtered list rather than a stale replay.
 *
 * A [Mutex] prevents concurrent invocations from double-fetching the same time window.
 */
@Singleton
class HealthConnectSyncUseCase @Inject constructor(
    private val repo: HealthConnectRepository,
    private val prefs: HealthConnectPrefs,
    private val importUseCase: HealthConnectImportUseCase,
    private val hcEventLinkDao: HcEventLinkDao,
) {
    private val _pendingActivities = MutableSharedFlow<List<HealthActivity>>(replay = 1)
    val pendingActivities: SharedFlow<List<HealthActivity>> = _pendingActivities.asSharedFlow()

    private val syncMutex = Mutex()

    suspend operator fun invoke() {
        if (!repo.isAvailable() || !repo.hasPermissions()) return

        // Discard concurrent calls — a sync is already in flight.
        if (!syncMutex.tryLock()) return
        try {
            val lookbackWindow = prefs.getLookbackWindowDays()
            val lookbackStart = Instant.now().minus(lookbackWindow, ChronoUnit.DAYS)
            // Always fetch the full lookback window so that unprocessed pending activities
            // remain visible after navigating away and back. Dedup against HcEventLinkDao
            // handles already-imported/skipped entries without needing a timestamp gate.
            val raw = repo.fetchActivitiesSince(lookbackStart)

            // Prune SKIPPED entries older than the lookback window — they can never reappear
            // in the fetch window so keeping them provides no dedup value.
            hcEventLinkDao.pruneOldSkipped(lookbackStart.toEpochMilli())

            val pending = importUseCase(raw)
            // Always emit so collectors receive the current list, including an empty one
            // after a confirm/skip cycle refreshes the dedup table.
            _pendingActivities.emit(pending)
        } finally {
            syncMutex.unlock()
        }
    }
}
