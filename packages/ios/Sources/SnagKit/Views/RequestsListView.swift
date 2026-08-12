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
                if model.currentRequester != nil {
                    Button {
                        model.mineOnly.toggle()
                    } label: {
                        HStack(spacing: 6) {
                            Image(
                                systemName: model.mineOnly
                                    ? "checkmark.square.fill" : "square"
                            )
                            .foregroundColor(
                                model.mineOnly ? theme.accent : theme.textMuted
                            )
                            Text("Mine")
                                .font(.system(size: 13))
                                .foregroundColor(theme.text)
                        }
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

            if model.visibleRows.isEmpty {
                Text(
                    model.mineOnly
                        ? "No requests from you yet."
                        : "No requests yet. Tap the button on any screen to file one."
                )
                .font(.system(size: 14))
                .foregroundColor(theme.textMuted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.top, 32)
            } else {
                ForEach(model.visibleRows) { row in
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
}

@MainActor
final class RequestsListModel: ObservableObject {
    @Published var rows: [SnagRequestRow] = []
    @Published var refreshing = false
    @Published var currentRequester: String?
    @Published var mineOnly = false

    private let overlay: OverlayModel

    var client: RelayClient { overlay.client }

    /// Nonisolated so SwiftUI view initializers (which are not
    /// MainActor-isolated) can construct the model for `@StateObject`.
    nonisolated init(overlay: OverlayModel) {
        self.overlay = overlay
    }

    var visibleRows: [SnagRequestRow] {
        guard mineOnly, let currentRequester else { return rows }
        return rows.filter { $0.requester == currentRequester }
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

    private var canReply: Bool {
        followupsEnabled && row.status == .needsInput
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
            if let summary = row.summary {
                Text(summary)
                    .font(.system(size: 12))
                    .foregroundColor(theme.textMuted)
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
        row.status == .needsInput ? "NEEDS YOUR REPLY" : row.status.rawValue.uppercased()
    }

    private var formattedDate: String {
        guard let date = SnagDates.parse(row.createdAt) else { return row.createdAt }
        return date.formatted(date: .abbreviated, time: .shortened)
    }

    private var statusColor: Color {
        switch row.status {
        case .finished:
            return theme.success
        case .error:
            return theme.danger
        case .queued, .running, .needsInput:
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
#endif
