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

    /// Summary text to show requesters — questions only when needs_input.
    static func displaySummary(status: SnagRequestStatus, summary: String?) -> String? {
        guard let summary else { return nil }
        let trimmed = summary.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        if status == .needsInput {
            return extractSection(from: summary) ?? trimmed
        }
        return trimmed
    }
}
