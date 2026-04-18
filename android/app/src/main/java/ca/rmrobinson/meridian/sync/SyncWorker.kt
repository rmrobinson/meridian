package ca.rmrobinson.meridian.sync

import android.content.Context
import android.util.Log
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import ca.rmrobinson.meridian.domain.usecase.SyncEventsUseCase
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

/**
 * Background WorkManager job that pulls remote events and retries any LOCAL_ONLY
 * placeholders left behind by failed create operations.
 * Scheduled as a periodic job with a CONNECTED network constraint so it only runs
 * when there is an internet-capable network available.
 */
@HiltWorker
class SyncWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val syncEventsUseCase: SyncEventsUseCase,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        Log.d(TAG, "doWork: attempt $runAttemptCount")
        return try {
            syncEventsUseCase()
            Log.d(TAG, "doWork: success")
            Result.success()
        } catch (e: Exception) {
            Log.w(TAG, "doWork: failed (attempt $runAttemptCount)", e)
            if (runAttemptCount < MAX_RETRIES) Result.retry() else Result.failure()
        }
    }

    companion object {
        private const val TAG = "SyncWorker"
        private const val MAX_RETRIES = 3
        const val UNIQUE_WORK_NAME = "meridian_background_sync"
    }
}
