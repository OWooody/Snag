/// Snag wire contract — the SDK <-> relay protocol.
///
/// Mirrors `packages/react/src/protocol.ts`. Any backend implementing these
/// shapes works with the SDK unchanged.

import Foundation

public enum SnagRequestStatus: String, Codable, Sendable {
    case queued
    case running
    case finished
    case error
}

/// JPEG image data, base64-encoded (no data-URI prefix).
public struct SnagScreenshot: Codable, Equatable, Sendable {
    public let base64: String
    public let width: Int
    public let height: Int

    public init(base64: String, width: Int, height: Int) {
        self.base64 = base64
        self.width = width
        self.height = height
    }
}

/// Response to `POST <endpoint>`.
public struct CreateSnagRequestResponse: Decodable, Sendable {
    public let id: String
    /// Link to the launched agent task, when the provider returns one.
    public let agentUrl: String?

    enum CodingKeys: String, CodingKey {
        case id
        case agentUrl = "agent_url"
    }
}

public struct SnagRequestRow: Decodable, Identifiable, Sendable {
    public let id: String
    public let prompt: String
    public let status: SnagRequestStatus
    public let agentUrl: String?
    public let branchName: String?
    public let prUrl: String?
    public let summary: String?
    public let error: String?
    /// Host-supplied display id from the `requester` provider, when present.
    public let requester: String?
    public let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case prompt
        case status
        case agentUrl = "agent_url"
        case branchName = "branch_name"
        case prUrl = "pr_url"
        case summary
        case error
        case requester
        case createdAt = "created_at"
    }
}

/// Response to `GET <endpoint>` — doubles as the SDK's "am I enabled?" probe.
/// The SDK treats any non-200 (or network failure) as disabled and never
/// shows the button.
public struct RelayStateResponse: Decodable, Sendable {
    public let enabled: Bool
    public let requests: [SnagRequestRow]?

    public static let disabled = RelayStateResponse(enabled: false, requests: nil)

    init(enabled: Bool, requests: [SnagRequestRow]?) {
        self.enabled = enabled
        self.requests = requests
    }

    enum CodingKeys: String, CodingKey {
        case enabled
        case requests
    }
}
