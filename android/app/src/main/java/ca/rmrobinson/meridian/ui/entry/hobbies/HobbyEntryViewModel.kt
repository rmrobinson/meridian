package ca.rmrobinson.meridian.ui.entry.hobbies

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

enum class HobbyType { BOOK, FILM, TV, CONCERT, OTHER }

/**
 * Shared ViewModel for the hobby entry flow. Centralises the mapping from hobby
 * type to backend family_id so that sub-screens (BookEntryViewModel, future
 * FilmEntryViewModel, etc.) all reference one authoritative source.
 */
@HiltViewModel
class HobbyEntryViewModel @Inject constructor() : ViewModel() {

    fun familyIdFor(type: HobbyType): String = Companion.familyIdFor(type)

    companion object {
        fun familyIdFor(type: HobbyType): String = when (type) {
            HobbyType.BOOK    -> "books"
            HobbyType.FILM    -> "tv"
            HobbyType.TV      -> "tv"
            HobbyType.CONCERT -> "concerts"
            HobbyType.OTHER   -> ""
        }
    }
}
