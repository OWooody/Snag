#if canImport(UIKit) && canImport(SwiftUI)
import Combine
import SwiftUI

/// Mirrors `packages/react/src/components/requests-list.tsx`: polls the relay
/// every 20s while visible and lists request status, links, and branch.
struct RequestsListView: View {
    let theme: SnagTheme
    let refreshKey: Int
    let followupsEnabled: Bool

    @StateObject private var model: RequestsListModel
    @Environment(\.scenePhase) private var scenePhase

    private let pollTimer = Timer.publish(every: 20, on: .main, in: .common)
        .autoconnect()

    init(
        overlay: OverlayModel,
        theme: SnagTheme,
        refreshKey: Int,
        followupsEnabled: Bool
    ) {
        self.theme = theme
        self.refreshKey = refreshKey
        self.followupsEnabled = followupsEnabled
        _model = StateObject(wrappedValue: RequestsListModel(overlay: overlay))
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Spacer()
                if followupsEnabled {
                    filterToggle(
                        label: "Needs you",
                        isOn: model.needsAttentionOnly
                    ) {
                        model.needsAttentionOnly.toggle()
                    }
                }
                if model.currentRequester != nil {
                    filterToggle(label: "Mine", isOn: model.mineOnly) {
                        model.mineOnly.toggle()
                    }
                }
                Button {
                    Task { await model.load() }
                } label: {
                    Text(model.refreshing ? "Refreshing…" : "Refresh")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(theme.accent)
                }
                .disabled(model.refreshing)
            }
            .padding(.bottom, 12)

            if model.visibleRows(followupsEnabled: followupsEnabled).isEmpty {
                Text(emptyMessage)
                    .font(.system(size: 14))
                    .foregroundColor(theme.textMuted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 32)
            } else {
                ForEach(model.visibleRows(followupsEnabled: followupsEnabled)) { row in
                    RequestCardView(
                        row: row,
                        theme: theme,
                        followupsEnabled: followupsEnabled,
                        client: model.client,
                        onReplied: { Task { await model.load() } }
                    )
                    .padding(.bottom, 10)
                }
            }
        }
        .task { await model.load() }
        .onChange(of: refreshKey) { _ in
            Task { await model.load() }
        }
        .onReceive(pollTimer) { _ in
            Task { await model.load() }
        }
        .onChange(of: scenePhase) { phase in
            if phase == .active {
                Task { await model.load() }
            }
        }
    }

    private var emptyMessage: String {
        if followupsEnabled && model.needsAttentionOnly && model.mineOnly {
            return "Nothing needs you right now."
        }
        if followupsEnabled && model.needsAttentionOnly {
            return "Nothing needs a reply right now. Uncheck Needs you to see all."
        }
        if model.mineOnly {
            return "No requests from you yet."
        }
        return "No requests yet. Tap the button on any screen to file one."
    }

    private func filterToggle(
        label: String,
        isOn: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: isOn ? "checkmark.square.fill" : "square")
                    .foregroundColor(isOn ? theme.accent : theme.textMuted)
                Text(label)
                    .font(.system(size: 13))
                    .foregroundColor(theme.text)
            }
        }
    }
}

@MainActor
final class RequestsListModel: ObservableObject {
    @Published var rows: [SnagRequestRow] = []
    @Published var refreshing = false
    @Published var currentRequester: String?
    @Published var mineOnly = true
    @Published var needsAttentionOnly = true

    private let overlay: OverlayModel

    var client: RelayClient { overlay.client }

    /// Nonisolated so SwiftUI view initializers (which are not
    /// MainActor-isolated) can construct the model for `@StateObject`.
    nonisolated init(overlay: OverlayModel) {
        self.overlay = overlay
    }

    func visibleRows(followupsEnabled: Bool) -> [SnagRequestRow] {
        rows.filter { row in
            if followupsEnabled && needsAttentionOnly
                && row.status != .needsInput && row.status != .awaitingConfirmation {
                return false
            }
            if mineOnly, let currentRequester, row.requester != currentRequester {
                return false
            }
            return true
        }
    }

    func load() async {
        refreshing = true
        let state = await overlay.client.fetchState()
        let requester = await overlay.requester()
        rows = state.requests ?? []
        currentRequester = requester
        refreshing = false
    }
}

struct RequestCardView: View {
    let row: SnagRequestRow
    let theme: SnagTheme
    let followupsEnabled: Bool
    let client: RelayClient
    let onReplied: () -> Void

    @State private var reply = ""
    @State private var sending = false
    @State private var replyError: String?
    @State private var feedbackOpen = false
    @State private var feedback = ""
    @State private var confirming = false
    @State private var confirmError: String?

    private var canReply: Bool {
        followupsEnabled && row.status == .needsInput
    }

    private var canConfirm: Bool {
        row.status == .awaitingConfirmation
    }

    private var summaryText: String? {
        RequesterQuestions.displaySummary(status: row.status, summary: row.summary)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(statusLabel)
                    .font(.system(size: 11, weight: .heavy))
                    .kerning(0.5)
                    .foregroundColor(statusColor)
                Spacer()
                Text(formattedDate)
                    .font(.system(size: 11))
                    .foregroundColor(theme.textMuted)
            }
            Text(row.prompt)
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(theme.text)
            if let requester = row.requester {
                Text(requester)
                    .font(.system(size: 12))
                    .foregroundColor(theme.textMuted)
            }
            if let summaryText {
                SummaryMarkdownView(text: summaryText, color: theme.textMuted)
            }
            if let error = row.error {
                Text(error)
                    .font(.system(size: 12))
                    .foregroundColor(theme.danger)
            }
            if canReply {
                ZStack(alignment: .topLeading) {
                    TextEditor(text: $reply)
                        .frame(minHeight: 72)
                        .font(.system(size: 13))
                        .foregroundColor(theme.text)
                        .disabled(sending)
                        .snagClearTextEditorBackground()
                        .padding(8)
                    if reply.isEmpty {
                        Text("Answer the questions above…")
                            .font(.system(size: 13))
                            .foregroundColor(theme.textMuted)
                            .padding(.top, 16)
                            .padding(.leading, 12)
                            .allowsHitTesting(false)
                    }
                }
                .background(RoundedRectangle(cornerRadius: 10).fill(theme.background))
                .onChange(of: reply) { value in
                    if value.count > 2000 {
                        reply = String(value.prefix(2000))
                    }
                }
                if let replyError {
                    Text(replyError)
                        .font(.system(size: 12))
                        .foregroundColor(theme.danger)
                }
                Button {
                    Task { await submitReply() }
                } label: {
                    Text(sending ? "Sending…" : "Send reply")
                        .font(.system(size: 13, weight: .bold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(RoundedRectangle(cornerRadius: 10).fill(theme.accent))
                        .foregroundColor(.white)
                }
                .disabled(sending)
            }
            if canConfirm {
                confirmSection
            }
            if let link = row.prUrl ?? row.agentUrl, let url = URL(string: link) {
                Link(
                    row.prUrl != nil ? "Open pull request" : "Open agent",
                    destination: url
                )
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(theme.accent)
                .padding(.top, 2)
            }
            if let branch = row.branchName {
                Text(branch)
                    .font(.system(size: 11))
                    .foregroundColor(theme.textMuted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 12).fill(theme.surface))
    }

    private var statusLabel: String {
        switch row.status {
        case .queued: return "QUEUED"
        case .running, .unknown: return "IN PROGRESS"
        case .needsInput: return "NEEDS YOUR REPLY"
        case .awaitingApproval: return "WAITING FOR A DEVELOPER"
        case .awaitingReview: return "IN DEVELOPER REVIEW"
        case .awaitingConfirmation: return "READY FOR YOU TO CHECK"
        case .finished: return "FINISHED"
        case .merged: return "LIVE"
        case .error: return "ERROR"
        }
    }

    @ViewBuilder
    private var confirmSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Your change is ready to try. Check the preview, then tell us if it looks right — it goes live once you confirm.")
                .font(.system(size: 13))
                .foregroundColor(theme.text)
                .fixedSize(horizontal: false, vertical: true)
            if let preview = row.previewUrl, let url = URL(string: preview) {
                Link(destination: url) {
                    Text("Open preview")
                        .font(.system(size: 13, weight: .bold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(RoundedRectangle(cornerRadius: 10).fill(theme.background))
                        .foregroundColor(theme.accent)
                }
            }
            if feedbackOpen {
                ZStack(alignment: .topLeading) {
                    TextEditor(text: $feedback)
                        .frame(minHeight: 72)
                        .font(.system(size: 13))
                        .foregroundColor(theme.text)
                        .disabled(confirming)
                        .snagClearTextEditorBackground()
                        .padding(8)
                    if feedback.isEmpty {
                        Text("What should be different?")
                            .font(.system(size: 13))
                            .foregroundColor(theme.textMuted)
                            .padding(.top, 16)
                            .padding(.leading, 12)
                            .allowsHitTesting(false)
                    }
                }
                .background(RoundedRectangle(cornerRadius: 10).fill(theme.background))
                .onChange(of: feedback) { value in
                    if value.count > 2000 {
                        feedback = String(value.prefix(2000))
                    }
                }
                HStack(spacing: 8) {
                    secondaryButton("Cancel") { feedbackOpen = false }
                    primaryButton(confirming ? "Sending…" : "Send feedback") {
                        Task { await submitConfirm(looksRight: false) }
                    }
                }
            } else {
                HStack(spacing: 8) {
                    secondaryButton("Not right") { feedbackOpen = true }
                    primaryButton(confirming ? "Confirming…" : "Looks right") {
                        Task { await submitConfirm(looksRight: true) }
                    }
                }
            }
            if let confirmError {
                Text(confirmError)
                    .font(.system(size: 12))
                    .foregroundColor(theme.danger)
            }
        }
        .padding(.top, 4)
    }

    private func primaryButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 13, weight: .bold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(RoundedRectangle(cornerRadius: 10).fill(theme.accent))
                .foregroundColor(.white)
        }
        .disabled(confirming)
    }

    private func secondaryButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 13, weight: .bold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(theme.accent, lineWidth: 1))
                .foregroundColor(theme.accent)
        }
        .disabled(confirming)
    }

    private func submitConfirm(looksRight: Bool) async {
        let trimmed = feedback.trimmingCharacters(in: .whitespacesAndNewlines)
        if !looksRight && trimmed.isEmpty {
            confirmError = "Tell us what is not right first."
            return
        }
        confirming = true
        confirmError = nil
        do {
            _ = try await client.confirm(
                requestId: row.id,
                decision: looksRight ? .looksRight : .notRight(feedback: trimmed)
            )
            feedback = ""
            feedbackOpen = false
            onReplied()
        } catch {
            confirmError = (error as? SnagRelayError)?.message ?? "Something went wrong"
        }
        confirming = false
    }

    private var formattedDate: String {
        guard let date = SnagDates.parse(row.createdAt) else { return row.createdAt }
        return date.formatted(date: .abbreviated, time: .shortened)
    }

    private var statusColor: Color {
        switch row.status {
        case .finished, .merged:
            return theme.success
        case .error:
            return theme.danger
        case .queued, .running, .needsInput, .awaitingApproval, .awaitingReview,
             .awaitingConfirmation, .unknown:
            return theme.accent
        }
    }

    private func submitReply() async {
        let trimmed = reply.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            replyError = "Write a reply first."
            return
        }
        sending = true
        replyError = nil
        do {
            _ = try await client.reply(requestId: row.id, message: trimmed)
            reply = ""
            onReplied()
        } catch {
            replyError = (error as? SnagRelayError)?.message ?? "Reply failed"
        }
        sending = false
    }
}

/// Renders agent summaries with Markdown (bold/lists); falls back to plain text.
private struct SummaryMarkdownView: View {
    let text: String
    let color: Color

    var body: some View {
        Group {
            if let attributed = try? AttributedString(
                markdown: text,
                options: AttributedString.MarkdownParsingOptions(
                    interpretedSyntax: .full
                )
            ) {
                Text(attributed)
            } else {
                Text(text)
            }
        }
        .font(.system(size: 12))
        .foregroundColor(color)
        .frame(maxWidth: .infinity, alignment: .leading)
        .fixedSize(horizontal: false, vertical: true)
    }
}
#endif
