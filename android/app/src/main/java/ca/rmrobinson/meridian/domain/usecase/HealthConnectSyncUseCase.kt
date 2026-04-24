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
 * Fetches Health Connect activities since the last sync, deduplicates them against
 * [HcEventLinkDao], and exposes the pending list via [pendingActivities].
 *
 * [pendingActivities] always emits after a sync, even when the result is empty, so that
 * collectors (review screen, badge) see the freshly-filtered list rather than a stale replay.
 *
 * A [Mutex] prevents concurrent invocations from double-fetching the same time window.
 *
 * Future enhancement: call from MainActivity.onResume() and auto-navigate to the review
 * screen when [pendingActivities] emits a non-empty list.
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
            val lookbackWindow = 7L // days
            val lookbackStart = Instant.now().minus(lookbackWindow, ChronoUnit.DAYS)
            // Cap `from` to the lookback window: if lastSync is older than 7 days, fetching
            // from that earlier timestamp would include activities whose SKIPPED dedup entries
            // are about to be pruned, causing them to re-appear as pending.
            val savedSync = prefs.getLastSync()
            val from = if (savedSync != null && savedSync.isAfter(lookbackStart)) savedSync else lookbackStart
            val raw = repo.fetchActivitiesSince(from)

            // Write timestamp before dedup so a crash during review doesn't re-fetch the same window.
            prefs.setLastSync(Instant.now())

            // Prune SKIPPED entries older than the fetch window — they can never reappear
            // in the fetch window so keeping them provides no dedup value.
            val pruneBeforeMs = from.toEpochMilli()
            hcEventLinkDao.pruneOldSkipped(pruneBeforeMs)

            val pending = importUseCase(raw)
            // Always emit so collectors receive the current list, including an empty one
            // after a confirm/skip cycle refreshes the dedup table.
            _pendingActivities.emit(pending)
        } finally {
            syncMutex.unlock()
        }
    }
}
