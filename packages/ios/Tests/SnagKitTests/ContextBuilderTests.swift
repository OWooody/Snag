import XCTest
@testable import SnagKit

final class ContextBuilderTests: XCTestCase {
    func testMergePutsAutoUnderSnagAuto() {
        let merged = ContextBuilder.merge(
            auto: ["platform": "ios"],
            host: ["environment": "staging"]
        )
        XCTAssertEqual(merged["environment"] as? String, "staging")
        let auto = merged["snag_auto"] as? [String: Any]
        XCTAssertEqual(auto?["platform"] as? String, "ios")
    }

    func testHostTopLevelKeysWin() {
        let merged = ContextBuilder.merge(
            auto: ["platform": "ios"],
            host: ["snag_auto": "overridden"]
        )
        XCTAssertEqual(merged["snag_auto"] as? String, "overridden")
    }

    func testOversizedMergeFallsBackToHostOnly() {
        let bigAuto = ["blob": String(repeating: "x", count: 5000)]
        let merged = ContextBuilder.merge(
            auto: bigAuto,
            host: ["environment": "staging"]
        )
        XCTAssertNil(merged["snag_auto"])
        XCTAssertEqual(merged["environment"] as? String, "staging")
    }

    func testSanitizeDropsNonJSONValues() {
        struct NotJSON {}
        let sanitized = ContextBuilder.sanitize([
            "ok": "value",
            "number": 42,
            "flag": true,
            "nested": ["inner": Date(), "kept": "yes"],
            "bad": NotJSON(),
        ])
        XCTAssertEqual(sanitized["ok"] as? String, "value")
        XCTAssertEqual(sanitized["number"] as? Int, 42)
        XCTAssertEqual(sanitized["flag"] as? Bool, true)
        XCTAssertNil(sanitized["bad"])
        let nested = sanitized["nested"] as? [String: Any]
        XCTAssertEqual(nested?["kept"] as? String, "yes")
        XCTAssertNil(nested?["inner"])
        XCTAssertNotEqual(ContextBuilder.jsonLength(of: sanitized), Int.max)
    }

    func testTruncate() {
        XCTAssertEqual(ContextBuilder.truncate("short", max: 10), "short")
        XCTAssertEqual(ContextBuilder.truncate("abcdefghij", max: 5), "abcd…")
    }
}
