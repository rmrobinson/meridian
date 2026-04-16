package ca.rmrobinson.meridian.data.remote

import ca.rmrobinson.meridian.AppConfig
import io.grpc.CallCredentials
import io.grpc.ManagedChannel
import io.grpc.ManagedChannelBuilder
import io.grpc.Metadata
import meridian.v1.TimelineServiceGrpcKt
import java.util.concurrent.Executor
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class GrpcClient @Inject constructor(initialConfig: AppConfig) {

    @Volatile private var channel: ManagedChannel? = null
    @Volatile private var _timelineStub: TimelineServiceGrpcKt.TimelineServiceCoroutineStub? = null

    val timelineStub: TimelineServiceGrpcKt.TimelineServiceCoroutineStub
        get() = _timelineStub ?: error("GrpcClient not configured — complete setup first")

    init {
        if (initialConfig.isConfigured) buildChannel(initialConfig)
    }

    fun reconfigure(config: AppConfig) {
        channel?.shutdown()
        _timelineStub = null
        channel = null
        if (config.isConfigured) buildChannel(config)
    }

    private fun buildChannel(config: AppConfig) {
        val ch = ManagedChannelBuilder
            .forAddress(config.grpcHost, config.grpcPort)
            .useTransportSecurity()
            .build()
        channel = ch
        _timelineStub = TimelineServiceGrpcKt.TimelineServiceCoroutineStub(ch)
            .withCallCredentials(BearerTokenCredentials(config.bearerToken))
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
