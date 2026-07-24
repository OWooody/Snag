/// Context merging — the native analog of `packages/react/src/auto-context.ts`.

import Foundation

enum ContextBuilder {
    /// Relay rejects context JSON above this length (`MAX_CONTEXT_JSON_LENGTH`).
    static let maxContextJSONLength = 4000

    /// Merge auto-captured device context with host context. Host top-level
    /// keys win. If the JSON would exceed the relay cap, fall back to host
    /// context only (still may be rejected by the relay).
    static func merge(auto: [String: Any], host: [String: Any]) -> [String: Any] {
        let safeHost = sanitize(host)
        var merged: [String: Any] = ["snag_auto": auto]
        for (key, value) in safeHost {
            merged[key] = value
        }

        if jsonLength(of: merged) <= maxContextJSONLength {
            return merged
        }
        return safeHost
    }

    /// Serialized length of a JSON object, or Int.max when not serializable
    /// so oversized/invalid payloads are never sent.
    static func jsonLength(of object: [String: Any]) -> Int {
        guard JSONSerialization.isValidJSONObject(object),
              let data = try? JSONSerialization.data(withJSONObject: object)
        else {
            return Int.max
        }
        return data.count
    }

    /// Drop host-context values that JSONSerialization cannot encode so one
    /// bad value never discards the whole request context.
    static func sanitize(_ object: [String: Any]) -> [String: Any] {
        var result: [String: Any] = [:]
        for (key, value) in object {
            if let sanitized = sanitizeValue(value) {
                result[key] = sanitized
            }
        }
        return result
    }

    private static func sanitizeValue(_ value: Any) -> Any? {
        switch value {
        case let string as String:
            return string
        case let number as NSNumber:
            return number
        case is NSNull:
            return value
        case let array as [Any]:
            return array.compactMap { sanitizeValue($0) }
        case let dict as [String: Any]:
            return sanitize(dict)
        default:
            return nil
        }
    }

    static func truncate(_ value: String, max: Int) -> String {
        guard value.count > max else { return value }
        return String(value.prefix(max - 1)) + "…"
    }
}
