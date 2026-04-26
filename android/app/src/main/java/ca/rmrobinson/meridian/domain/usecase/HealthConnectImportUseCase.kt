package ca.rmrobinson.meridian.domain.usecase

import ca.rmrobinson.meridian.data.healthconnect.HealthActivity
import ca.rmrobinson.meridian.data.local.HcEventLinkDao
import javax.inject.Inject

/**
 * Filters a raw list of [HealthActivity] items down to those which have not already been
 * imported into Room (via [HcEventLinkDao]) and have not been explicitly skipped.
 */
class HealthConnectImportUseCase @Inject constructor(
    private val hcEventLinkDao: HcEventLinkDao,
) {
    suspend operator fun invoke(activities: List<HealthActivity>): List<HealthActivity> =
        activities.filter { activity ->
            hcEventLinkDao.findByHcId(activity.healthConnectId) == null
        }
}
