#if canImport(UIKit) && canImport(SwiftUI)
import SwiftUI
import UIKit

/// Mirrors `packages/react/src/components/request-panel.tsx`: a sheet with a
/// "New request" tab (prompt + screenshot) and a "Requests" status tab.
struct RequestPanelView: View {
    @ObservedObject private var overlay: OverlayModel
    @StateObject private var model: PanelModel
    @Environment(\.dismiss) private var dismiss
    @FocusState private var promptFocused: Bool

    private static let maxPromptLength = 2000

    init(overlay: OverlayModel) {
        _overlay = ObservedObject(wrappedValue: overlay)
        _model = StateObject(wrappedValue: PanelModel(overlay: overlay))
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            tabs
            ScrollView {
                Group {
                    switch model.tab {
                    case .list:
                        RequestsListView(
                            overlay: overlay,
                            theme: overlay.theme,
                            refreshKey: model.listRefreshKey,
                            followupsEnabled: overlay.followupsEnabled
                        )
                    case .new:
                        if model.phase == .done {
                            doneBody
                        } else {
                            composeBody
                        }
                    }
                }
                .padding(20)
            }
        }
        .background(overlay.theme.background.ignoresSafeArea())
        .snagPresentationDetents()
        .onAppear {
            model.applyInitialTab()
        }
    }

    private var header: some View {
        HStack {
            Text("Snag")
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(overlay.theme.text)
            Spacer()
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(overlay.theme.text)
                    .frame(width: 30, height: 30)
                    .background(Circle().fill(overlay.theme.surface))
            }
            .accessibilityLabel("Close")
        }
        .padding(.horizontal, 20)
        .padding(.top, 20)
        .padding(.bottom, 16)
    }

    private var tabs: some View {
        HStack(spacing: 8) {
            tabButton(label: "New request", tab: .new, badgeCount: 0)
            tabButton(
                label: "Requests",
                tab: .list,
                badgeCount: overlay.badgeCount
            )
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 4)
    }

    private func tabButton(label: String, tab: PanelModel.Tab, badgeCount: Int) -> some View {
        let active = model.tab == tab
        return Button {
            withAnimation(.easeInOut(duration: 0.2)) {
                if tab == .new, model.phase == .done {
                    model.startAnother()
                } else {
                    model.tab = tab
                }
            }
        } label: {
            Text(label)
                .font(.system(size: 13, weight: .bold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(active ? overlay.theme.accent : overlay.theme.surface)
                )
                .foregroundColor(active ? .white : overlay.theme.text)
                .overlay(alignment: .topTrailing) {
                    if badgeCount > 0 {
                        Text(badgeCount > 9 ? "9+" : "\(badgeCount)")
                            .font(.system(size: 11, weight: .heavy))
                            .foregroundColor(.white)
                            .padding(.horizontal, 5)
                            .frame(minWidth: 18, minHeight: 18)
                            .background(Capsule().fill(overlay.theme.danger))
                            .offset(x: 6, y: -6)
                    }
                }
        }
        .accessibilityLabel(
            badgeCount > 0
                ? "\(label). \(badgeCount) awaiting your reply"
                : label
        )
    }

    private var composeBody: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("CHANGE REQUEST")
                .font(.system(size: 11, weight: .bold))
                .kerning(0.5)
                .foregroundColor(overlay.theme.textMuted)
                .padding(.bottom, 8)

            ZStack(alignment: .topLeading) {
                TextEditor(text: $model.prompt)
                    .frame(minHeight: 120)
                    .font(.system(size: 14))
                    .foregroundColor(overlay.theme.text)
                    .disabled(model.phase == .submitting)
                    .snagClearTextEditorBackground()
                    .padding(8)
                    .focused($promptFocused)
                    .task {
                        // Focus after the sheet's presentation settles; asking
                        // for first responder mid-transition is dropped.
                        try? await Task.sleep(nanoseconds: 500_000_000)
                        promptFocused = true
                    }
                if model.prompt.isEmpty {
                    Text("What should change on this screen?")
                        .font(.system(size: 14))
                        .foregroundColor(overlay.theme.textMuted)
                        .padding(.top, 16)
                        .padding(.leading, 13)
                        .allowsHitTesting(false)
                }
            }
            .background(
                RoundedRectangle(cornerRadius: 12).fill(overlay.theme.surface)
            )
            .onChange(of: model.prompt) { value in
                if value.count > Self.maxPromptLength {
                    model.prompt = String(value.prefix(Self.maxPromptLength))
                }
            }

            if let screenshot = overlay.screenshot {
                screenshotSection(screenshot)
                    .padding(.top, 16)
            }

            if let error = model.errorMessage {
                Text(error)
                    .font(.system(size: 13))
                    .foregroundColor(overlay.theme.danger)
                    .padding(.top, 12)
            }

            Button {
                Task { await model.submit() }
            } label: {
                Text(model.phase == .submitting ? "Submitting…" : "Submit request")
                    .font(.system(size: 15, weight: .bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
                    .background(
                        RoundedRectangle(cornerRadius: 10)
                            .fill(overlay.theme.accent)
                    )
                    .foregroundColor(.white)
                    .opacity(model.phase == .submitting ? 0.7 : 1)
            }
            .disabled(model.phase == .submitting)
            .padding(.top, 20)
        }
    }

    private func screenshotSection(_ screenshot: SnagScreenshot) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if let data = Data(base64Encoded: screenshot.base64),
               let image = UIImage(data: data) {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(maxWidth: .infinity, maxHeight: 160)
                    .clipped()
                    .cornerRadius(8)
                    .accessibilityLabel("Screenshot preview")
            }
            Toggle(isOn: $model.includeScreenshot) {
                Text("Include screenshot with request")
                    .font(.system(size: 13))
                    .foregroundColor(overlay.theme.text)
            }
            .disabled(model.phase == .submitting)
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12).fill(overlay.theme.surface)
        )
    }

    private var doneBody: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Request submitted. An agent is working on it.")
                .font(.system(size: 15))
                .foregroundColor(overlay.theme.text)
            if let agentUrl = model.agentUrl, let url = URL(string: agentUrl) {
                Link("Open agent", destination: url)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(overlay.theme.accent)
            }
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    model.tab = .list
                }
            } label: {
                Text("View requests")
                    .font(.system(size: 15, weight: .bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
                    .background(
                        RoundedRectangle(cornerRadius: 10)
                            .fill(overlay.theme.accent)
                    )
                    .foregroundColor(.white)
            }
            .padding(.top, 8)
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    model.startAnother()
                }
            } label: {
                Text("New request")
                    .font(.system(size: 15, weight: .bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
                    .background(
                        RoundedRectangle(cornerRadius: 10)
                            .fill(overlay.theme.surface)
                    )
                    .foregroundColor(overlay.theme.text)
            }
        }
    }
}

@MainActor
final class PanelModel: ObservableObject {
    enum Tab { case new, list }
    enum Phase { case editing, submitting, done }

    @Published var tab: Tab = .new
    @Published var phase: Phase = .editing
    @Published var prompt = ""
    @Published var includeScreenshot = true
    @Published var agentUrl: String?
    @Published var errorMessage: String?
    /// Bumped after submit to force the list tab to reload.
    @Published var listRefreshKey = 0

    private let overlay: OverlayModel

    /// Nonisolated so SwiftUI view initializers (which are not
    /// MainActor-isolated) can construct the model for `@StateObject`.
    nonisolated init(overlay: OverlayModel) {
        self.overlay = overlay
    }

    @MainActor
    func applyInitialTab() {
        if overlay.preferListTab {
            tab = .list
        }
    }

    /// Clears the success screen so another request can be composed in place.
    func startAnother() {
        phase = .editing
        prompt = ""
        includeScreenshot = true
        agentUrl = nil
        errorMessage = nil
        tab = .new
    }

    func submit() async {
        let trimmed = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            errorMessage = "Describe the change first."
            return
        }
        phase = .submitting
        errorMessage = nil
        do {
            let context = await overlay.resolveContext()
            let response = try await overlay.client.createRequest(
                prompt: trimmed,
                context: context,
                screenshot: includeScreenshot ? overlay.screenshot : nil,
                locale: context["locale"] as? String
            )
            agentUrl = response.agentUrl
            phase = .done
            listRefreshKey += 1
        } catch {
            errorMessage = (error as? SnagRelayError)?.message ?? "Request failed"
            phase = .editing
        }
    }
}

extension View {
    @ViewBuilder
    func snagPresentationDetents() -> some View {
        if #available(iOS 16.0, *) {
            self.presentationDetents([.large])
        } else {
            self
        }
    }

    /// TextEditor ships an opaque background below iOS 16.
    @ViewBuilder
    func snagClearTextEditorBackground() -> some View {
        if #available(iOS 16.0, *) {
            self.scrollContentBackground(.hidden).background(Color.clear)
        } else {
            self.onAppear {
                UITextView.appearance().backgroundColor = .clear
            }
        }
    }
}
#endif
