import Foundation

enum SnagDates {
    private static let fractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let plain: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    /// Parse relay `created_at` timestamps. Postgres emits microsecond
    /// precision ("2026-07-24T14:20:33.123456+00:00") which the strict
    /// 3-digit `.withFractionalSeconds` parser rejects, so fall back to
    /// stripping the fractional part entirely.
    static func parse(_ string: String) -> Date? {
        if let date = fractional.date(from: string) ?? plain.date(from: string) {
            return date
        }
        guard let dotIndex = string.firstIndex(of: ".") else { return nil }
        let tail = string[string.index(after: dotIndex)...]
        guard let zoneIndex = tail.firstIndex(where: { !$0.isNumber }) else {
            return nil
        }
        return plain.date(from: String(string[..<dotIndex]) + String(tail[zoneIndex...]))
    }
}
