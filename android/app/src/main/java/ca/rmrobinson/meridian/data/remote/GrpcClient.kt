package ca.rmrobinson.meridian.data.remote

import android.util.Log
import ca.rmrobinson.meridian.AppConfig
import ca.rmrobinson.meridian.AppConfigStore
import io.grpc.CallCredentials
import io.grpc.ManagedChannel
import io.grpc.ManagedChannelBuilder
import io.grpc.Metadata
import meridian.v1.TimelineServiceGrpcKt
import java.util.concurrent.Executor
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "GrpcClient"

@Singleton
class GrpcClient @Inject constructor(store: AppConfigStore) {

    private var channel: ManagedChannel? = null
    private var _timelineStub: TimelineServiceGrpcKt.TimelineServiceCoroutineStub? = null

    val timelineStub: TimelineServiceGrpcKt.TimelineServiceCoroutineStub
        get() = synchronized(this) {
            _timelineStub ?: error("GrpcClient not configured — complete setup first")
        }

    init {
        val config = store.current
        if (config.isConfigured) buildChannel(config)
    }

    fun reconfigure(config: AppConfig) {
        synchronized(this) {
            Log.i(TAG, "Reconfiguring gRPC channel")
            // shutdownNow() cancels all in-flight calls immediately. This is intentional
            // for a configuration change — the user has explicitly chosen a new server.
            channel?.shutdownNow()
            _timelineStub = null
            channel = null
            if (config.isConfigured) buildChannel(config)
        }
    }

    private fun buildChannel(config: AppConfig) {
        synchronized(this) {
            val transport = if (config.usePlaintext) "plaintext" else "TLS"
            Log.i(TAG, "Building gRPC channel: ${config.grpcHost}:${config.grpcPort} transport=$transport")
            val builder = ManagedChannelBuilder.forAddress(config.grpcHost, config.grpcPort)
            if (config.usePlaintext) {
                builder.usePlaintext()
            } else {
                builder.useTransportSecurity()
            }
            val ch = builder.build()
            channel = ch
            _timelineStub = TimelineServiceGrpcKt.TimelineServiceCoroutineStub(ch)
                .withCallCredentials(BearerTokenCredentials(config.bearerToken))
            Log.i(TAG, "gRPC channel ready")
        }
    }
}

private class BearerTokenCredentials(private val token: String) : CallCredentials() {
    override fun applyRequestMetadata(
        requestInfo: RequestInfo,
        appExecutor: Executor,
        applier: MetadataApplier,
    ) {
        appExecutor.execute {
            val headers = Metadata()
            headers.put(
                Metadata.Key.of("authorization", Metadata.ASCII_STRING_MARSHALLER),
                "Bearer $token",
            )
            applier.apply(headers)
        }
    }
}
