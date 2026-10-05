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
    static let developerNotesHeading = "## Notes for developers"

    /// Remove one Markdown section, keeping any text before it and after the next heading.
    static func stripHeadingSection(_ summary: String, heading: String) -> String {
        guard let headingRange = summary.range(of: heading) else {
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

    /// Remove the fenced JSON copy of the questions (read by the web SDK) from the questions section.
    static func stripQuestionsJSON(_ summary: String) -> String {
        guard let headingRange = summary.range(of: heading) else { return summary }
        let after = summary[headingRange.upperBound...]
        let sectionEnd = after.range(of: #"\n##\s"#, options: .regularExpression)?.lowerBound
            ?? summary.endIndex
        let section = String(summary[headingRange.upperBound..<sectionEnd])
            .replacingOccurrences(
                of: #"```(?:json)?[ \t]*\n[\s\S]*?\n\s*```"#,
                with: "",
                options: .regularExpression
            )
            .replacingOccurrences(of: #"\n{3,}"#, with: "\n\n", options: .regularExpression)
        var trimmedSection = section
        while trimmedSection.last?.isWhitespace == true { trimmedSection.removeLast() }
        let rest = String(summary[sectionEnd...])
        return String(summary[..<headingRange.upperBound]) + trimmedSection
            + (rest.isEmpty ? "" : "\n") + rest
    }

    /// Summary text to show requesters.
    /// needs_input shows the answer above the questions, and hides developer notes and the plan block.
    static func displaySummary(status: SnagRequestStatus, summary rawSummary: String?) -> String? {
        guard let rawSummary else { return nil }
        let summary = stripQuestionsJSON(rawSummary)
        let trimmed = summary.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        if status == .needsInput, let questions = extractSection(from: summary) {
            guard let headingRange = summary.range(of: heading), headingRange.lowerBound > summary.startIndex else {
                return questions
            }
            let before = String(summary[..<headingRange.lowerBound])
            let answer = stripHeadingSection(
                stripPlanSection(before),
                heading: developerNotesHeading
            ).trimmingCharacters(in: .whitespacesAndNewlines)
            if answer.isEmpty { return questions }
            return "\(answer)\n\n\(heading)\n\n\(questions)"
        }
        let display = stripPlanSection(trimmed)
        return display.isEmpty ? nil : display
    }
}
