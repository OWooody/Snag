import XCTest
@testable import SnagKit

final class ProtocolTests: XCTestCase {
    func testDecodesRelayState() throws {
        let json = """
        {
          "enabled": true,
          "requester_followups_enabled": true,
          "requests": [
            {
              "id": "6f1d9d7e-9b1f-4f7e-8a3c-2f4b8f0f2b11",
              "prompt": "Make the header blue",
              "status": "running",
              "agent_url": "https://cursor.com/agents?id=abc",
              "branch_name": "cursor/header-blue-01a2",
              "pr_url": null,
              "summary": null,
              "error": null,
              "requester": "dev@example.com",
              "created_at": "2026-07-24T14:20:33.123456+00:00"
            }
          ]
        }
        """
        let state = try JSONDecoder().decode(
            RelayStateResponse.self,
            from: Data(json.utf8)
        )
        XCTAssertTrue(state.enabled)
        XCTAssertEqual(state.requesterFollowupsEnabled, true)
        let row = try XCTUnwrap(state.requests?.first)
        XCTAssertEqual(row.status, .running)
        XCTAssertEqual(row.agentUrl, "https://cursor.com/agents?id=abc")
        XCTAssertEqual(row.branchName, "cursor/header-blue-01a2")
        XCTAssertNil(row.prUrl)
        XCTAssertEqual(row.requester, "dev@example.com")
    }

    func testDecodesNeedsInputStatus() throws {
        let json = """
        {
          "enabled": true,
          "requester_followups_enabled": true,
          "requests": [
            {
              "id": "6f1d9d7e-9b1f-4f7e-8a3c-2f4b8f0f2b11",
              "prompt": "Make the header blue",
              "status": "needs_input",
              "agent_url": null,
              "branch_name": null,
              "pr_url": null,
              "summary": "## Questions for requester\\n- Which blue?",
              "error": null,
              "requester": null,
              "created_at": "2026-07-24T14:20:33.123456+00:00"
            }
          ]
        }
        """
        let state = try JSONDecoder().decode(
            RelayStateResponse.self,
            from: Data(json.utf8)
        )
        XCTAssertEqual(state.requests?.first?.status, .needsInput)
    }

    func testDecodesDisabledStateWithoutRequests() throws {
        let state = try JSONDecoder().decode(
            RelayStateResponse.self,
            from: Data(#"{"enabled":false}"#.utf8)
        )
        XCTAssertFalse(state.enabled)
        XCTAssertNil(state.requests)
    }

    func testDecodesCreateResponse() throws {
        let payload = try JSONDecoder().decode(
            CreateSnagRequestResponse.self,
            from: Data(#"{"id":"abc","agent_url":null}"#.utf8)
        )
        XCTAssertEqual(payload.id, "abc")
        XCTAssertNil(payload.agentUrl)
    }

    func testParsesPostgresTimestamps() {
        // Microsecond precision (Postgres default).
        XCTAssertNotNil(SnagDates.parse("2026-07-24T14:20:33.123456+00:00"))
        // Millisecond precision.
        XCTAssertNotNil(SnagDates.parse("2026-07-24T14:20:33.123Z"))
        // No fraction.
        XCTAssertNotNil(SnagDates.parse("2026-07-24T14:20:33Z"))
        XCTAssertNil(SnagDates.parse("not a date"))
    }

    func testExtractsRequesterQuestionsSection() {
        let summary = """
        Plan text above
        ## Questions for requester
        - Which shade of blue?
        - Keep it on home only?

        ## Notes for developers
        - Check ThemeProvider
        """
        XCTAssertEqual(
            RequesterQuestions.extractSection(from: summary),
            "- Which shade of blue?\n- Keep it on home only?"
        )
        XCTAssertEqual(
            RequesterQuestions.displaySummary(status: .needsInput, summary: summary),
            "- Which shade of blue?\n- Keep it on home only?"
        )
        XCTAssertEqual(
            RequesterQuestions.displaySummary(status: .finished, summary: summary),
            summary.trimmingCharacters(in: .whitespacesAndNewlines)
        )
    }
}
