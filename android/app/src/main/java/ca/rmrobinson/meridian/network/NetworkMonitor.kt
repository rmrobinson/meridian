package ca.rmrobinson.meridian.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Observes device connectivity and exposes it as a [StateFlow].
 * [isOnline] emits `true` when at least one internet-capable network is available.
 */
@Singleton
class NetworkMonitor @Inject constructor(
    @ApplicationContext context: Context,
    @ApplicationScope scope: CoroutineScope,
) {
    private val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    val isOnline: StateFlow<Boolean> = callbackFlow {
        // Track all networks that satisfy the request. Querying cm.activeNetwork inside
        // onLost() is racy — the OS may not have updated it by the time the callback fires.
        // Instead, maintain a local set: add on available, remove on lost, emit emptiness check.
        val activeNetworks = mutableSetOf<Network>()

        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                activeNetworks.add(network)
                trySend(true)
            }
            override fun onLost(network: Network) {
                activeNetworks.remove(network)
                trySend(activeNetworks.isNotEmpty())
            }
        }

        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        cm.registerNetworkCallback(request, callback)

        // Emit initial state synchronously
        val initiallyOnline = cm.activeNetwork?.let { active ->
            cm.getNetworkCapabilities(active)
                ?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        } ?: false
        trySend(initiallyOnline)

        awaitClose { cm.unregisterNetworkCallback(callback) }
    }.stateIn(
        scope = scope,
        started = SharingStarted.Eagerly,
        initialValue = true, // optimistic until first callback fires
    )
}
