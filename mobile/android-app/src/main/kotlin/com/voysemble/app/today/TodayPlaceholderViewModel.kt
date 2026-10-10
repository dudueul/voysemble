// Copyright 2026- At Day. All rights reserved.
// Slice 002 placeholder: proves :core -> API round trip from Compose. Replaced by the real Today
// screen in P1. State is a sealed value; the UI never sees exceptions.

package com.voysemble.app.today

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.voysemble.core.api.ApiClient
import com.voysemble.core.api.ApiClientConfig
import com.voysemble.core.api.ApiResult
import com.voysemble.core.api.HealthResponse
import com.voysemble.core.defaultUserAgent
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.engine.okhttp.OkHttp
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

sealed interface HealthUiState {
    data object Idle : HealthUiState
    data object Loading : HealthUiState
    data class Reachable(val health: HealthResponse) : HealthUiState
    data class ServerError(val code: String, val correlationId: String) : HealthUiState
    data class Offline(val reason: String) : HealthUiState
}

class TodayPlaceholderViewModel(
    host: String,
    engine: HttpClientEngine,
) : ViewModel() {
    private val client = ApiClient(ApiClientConfig(host = host, userAgent = defaultUserAgent()), engine)

    private val _state = MutableStateFlow<HealthUiState>(HealthUiState.Idle)
    val state: StateFlow<HealthUiState> = _state

    fun checkHealth() {
        _state.value = HealthUiState.Loading
        viewModelScope.launch {
            _state.value = when (val r = client.health()) {
                is ApiResult.Ok -> HealthUiState.Reachable(r.value)
                is ApiResult.Failed -> HealthUiState.ServerError(r.error.code, r.error.correlationId)
                is ApiResult.Unreachable -> HealthUiState.Offline(r.reason)
            }
        }
    }

    override fun onCleared() {
        client.close()
    }

    companion object {
        fun factory(host: String): ViewModelProvider.Factory = viewModelFactory {
            initializer { TodayPlaceholderViewModel(host, OkHttp.create()) }
        }
    }
}
