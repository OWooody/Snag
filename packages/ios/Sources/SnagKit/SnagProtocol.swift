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
    case needsInput = "needs_input"
    /// Execute mode: the plan is waiting for a developer's approval.
    case awaitingApproval = "awaiting_approval"
    /// Execute mode: the PR is waiting for a developer to review and merge.
    case awaitingReview = "awaiting_review"
    /// Execute mode: the preview is ready; the requester confirms or sends feedback.
    case awaitingConfirmation = "awaiting_confirmation"
    /// Execute mode: Snag merged the PR.
    case merged
    /// Execute mode: a developer rejected the plan; nothing was changed.
    case rejected
    /// A status this SDK version does not know yet; shown as in progress.
    case unknown

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = SnagRequestStatus(rawValue: raw) ?? .unknown
    }
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

/// Response to `POST <endpoint>` create.
public struct CreateSnagRequestResponse: Decodable, Sendable {
    public let id: String
    /// Link to the launched agent task, when the provider returns one.
    public let agentUrl: String?

    enum CodingKeys: String, CodingKey {
        case id
        case agentUrl = "agent_url"
    }
}

/// Response to `POST <endpoint>` reply.
public struct ReplySnagRequestResponse: Decodable, Sendable {
    public let id: String
    public let status: String
}

/// Requester's answer to `awaiting_confirmation` after checking the preview.
public enum SnagConfirmDecision: Sendable, Equatable {
    case looksRight
    case notRight(feedback: String)
}

/// Response to `POST <endpoint>` confirm.
public struct ConfirmSnagRequestResponse: Decodable, Sendable {
    public let id: String
    public let status: String
}

public struct SnagRequestRow: Decodable, Identifiable, Sendable {
    public let id: String
    public let prompt: String
    public let status: SnagRequestStatus
    public let agentUrl: String?
    public let branchName: String?
    public let prUrl: String?
    /// Preview deployment for the PR, set while `awaitingConfirmation`.
    public let previewUrl: String?
    public let summary: String?
    public let error: String?
    /// The developer's note when the plan was rejected.
    public let rejectionNote: String?
    /// Why the request went to a developer while `awaitingReview`. Informational, not an error.
    public let handoffReason: String?
    /// Execute mode: `planning`, `implementing`, or `delivering`. Nil in plan-only mode.
    public let phase: String?
    /// Short description of an in-progress step, e.g. "Planning" or "Waiting for checks".
    public let stageLabel: String?
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
        case previewUrl = "preview_url"
        case summary
        case error
        case rejectionNote = "rejection_note"
        case handoffReason = "handoff_reason"
        case phase
        case stageLabel = "stage_label"
        case requester
        case createdAt = "created_at"
    }
}

/// Response to `GET <endpoint>` — doubles as the SDK's "am I enabled?" probe.
/// The SDK treats any non-200 (or network failure) as disabled and never
/// shows the button.
public struct RelayStateResponse: Decodable, Sendable {
    public let enabled: Bool
    public let requesterFollowupsEnabled: Bool?
    /// Effective agent mode: `"plan_only"` or `"execute"`.
    public let agentMode: String?
    public let requests: [SnagRequestRow]?

    public static let disabled = RelayStateResponse(
        enabled: false,
        requesterFollowupsEnabled: nil,
        agentMode: nil,
        requests: nil
    )

    init(
        enabled: Bool,
        requesterFollowupsEnabled: Bool?,
        agentMode: String? = nil,
        requests: [SnagRequestRow]?
    ) {
        self.enabled = enabled
        self.requesterFollowupsEnabled = requesterFollowupsEnabled
        self.agentMode = agentMode
        self.requests = requests
    }

    enum CodingKeys: String, CodingKey {
        case enabled
        case requesterFollowupsEnabled = "requester_followups_enabled"
        case agentMode = "agent_mode"
        case requests
    }
}
