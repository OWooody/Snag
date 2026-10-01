import Foundation

enum RequesterQuestions {
    static let heading = "## Questions for requester"

    /// Body of the requester-questions section, or nil if missing/empty.
    static func extractSection(from summary: String?) -> String? {
        guard let summary, !summary.isEmpty else { return nil }
        guard let headingRange = summary.range(of: heading) else { return nil }

        let afterHeading = String(summary[headingRange.upperBound...])
        let sectionBody: String
        if let nextHeading = afterHeading.range(
            of: #"\n##\s"#,
            options: .regularExpression
        ) {
            sectionBody = String(afterHeading[..<nextHeading.lowerBound])
        } else {
            sectionBody = afterHeading
        }

        let trimmed = sectionBody.trimmingCharacters(in: .whitespacesAndNewlines)
        let emptied = trimmed.unicodeScalars.filter { scalar in
            !(CharacterSet.whitespacesAndNewlines.contains(scalar)
                || scalar == "#" || scalar == "*" || scalar == "-")
        }
        guard !emptied.isEmpty else { return nil }
        return trimmed
    }

    static let planHeading = "## Snag plan"

    /// Remove the machine-readable "## Snag plan" section. Mirrors packages/shared.
    static func stripPlanSection(_ summary: String) -> String {
        guard let headingRange = summary.range(of: planHeading, options: .backwards) else {
            return summary
        }
        let after = summary[headingRange.upperBound...]
        var rest = ""
        if let nextHeading = after.range(of: #"\n##\s"#, options: .regularExpression) {
            rest = String(after[nextHeading.lowerBound...])
        }
        return [String(summary[..<headingRange.lowerBound]), rest]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: "\n\n")
    }

    /// Summary text to show requesters — questions only when needs_input.
    static func displaySummary(status: SnagRequestStatus, summary: String?) -> String? {
        guard let summary else { return nil }
        let trimmed = summary.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        if status == .needsInput, let questions = extractSection(from: summary) {
            return questions
        }
        let display = stripPlanSection(trimmed)
        return display.isEmpty ? nil : display
    }
}
