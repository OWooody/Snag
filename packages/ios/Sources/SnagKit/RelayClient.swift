/// HTTP client for the Snag relay — mirrors `packages/react/src/api.ts`.
///
/// Auth model: the publishable project key is sent as `x-snag-key`; the app's
/// bundle identifier is sent as `x-snag-app-id` and checked against the
/// project allowlist (`app://<bundle-id>` entries) — the native analog of the
/// browser Origin header.

import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public struct SnagRelayError: LocalizedError {
    public let message: String
    public var errorDescription: String? { message }
}

final class RelayClient: @unchecked Sendable {
    private let endpoint: URL
    private let projectKey: String
    private let appId: String?
    private let requesterProvider: (() async -> String?)?
    private let debug: Bool
    private let session: URLSession

    private static let maxRequesterLength = 128

    init(
        endpoint: URL,
        projectKey: String,
        appId: String?,
        requesterProvider: (() async -> String?)?,
        debug: Bool,
        session: URLSession = .shared
    ) {
        self.endpoint = endpoint
        self.projectKey = projectKey
        self.appId = appId
        self.requesterProvider = requesterProvider
        self.debug = debug
        self.session = session
    }

    /// Probe + request list. Returns `.disabled` on any failure so the
    /// overlay simply stays hidden when the relay is off or unreachable.
    func fetchState() async -> RelayStateResponse {
        do {
            var request = URLRequest(url: endpoint)
            request.httpMethod = "GET"
            await applyHeaders(to: &request)
            debugLog("probe", endpoint.absoluteString)
            let (data, response) = try await send(request)
            debugLog("probe response", String(response.statusCode))
            guard response.statusCode == 200 else { return .disabled }
            let state = try JSONDecoder().decode(RelayStateResponse.self, from: data)
            return state.enabled ? state : .disabled
        } catch {
            debugLog("probe error", String(describing: error))
            return .disabled
        }
    }

    func createRequest(
        prompt: String,
        context: [String: Any],
        screenshot: SnagScreenshot?,
        locale: String?
    ) async throws -> CreateSnagRequestResponse {
        var body: [String: Any] = [
            "prompt": prompt,
            "context": context,
        ]
        if let screenshot {
            body["screenshot"] = [
                "base64": screenshot.base64,
                "width": screenshot.width,
                "height": screenshot.height,
            ]
        }
        if let locale {
            body["locale"] = locale
        }

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        await applyHeaders(to: &request)
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await send(request)
        if response.statusCode == 200,
           let payload = try? JSONDecoder().decode(CreateSnagRequestResponse.self, from: data) {
            return payload
        }

        debugLog("create request failed", String(response.statusCode))
        let serverMessage =
            ((try? JSONSerialization.jsonObject(with: data)) as? [String: Any])?["error"] as? String
        throw SnagRelayError(
            message: serverMessage ?? "Request failed (\(response.statusCode))"
        )
    }

    private func applyHeaders(to request: inout URLRequest) async {
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(projectKey, forHTTPHeaderField: "x-snag-key")
        if let appId, !appId.isEmpty {
            request.setValue(appId, forHTTPHeaderField: "x-snag-app-id")
        }
        if let requesterProvider,
           let requester = await requesterProvider() {
            let trimmed = requester.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty && trimmed.count <= Self.maxRequesterLength {
                request.setValue(trimmed, forHTTPHeaderField: "x-snag-requester")
            }
        }
    }

    private func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        // Continuation-based instead of URLSession.data(for:) so the portable
        // core also builds against swift-corelibs-foundation.
        try await withCheckedThrowingContinuation {
            (continuation: CheckedContinuation<(Data, HTTPURLResponse), Error>) in
            let task = session.dataTask(with: request) { data, response, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                guard let data, let http = response as? HTTPURLResponse else {
                    continuation.resume(throwing: URLError(.badServerResponse))
                    return
                }
                continuation.resume(returning: (data, http))
            }
            task.resume()
        }
    }

    private func debugLog(_ items: String...) {
        guard debug else { return }
        print("[Snag] \(items.joined(separator: " "))")
    }
}
