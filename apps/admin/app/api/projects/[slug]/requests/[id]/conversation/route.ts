import { decryptSecret } from "@snag/shared";
import { NextResponse } from "next/server";
import { CursorRequestError, fetchCursorConversation } from "@/lib/cursor";
import { encryptionSecretOrError, requireProjectAccess } from "@/lib/project-route";
import { createServiceClient } from "@/lib/service";

/** The agent's full conversation, read live from Cursor; Snag does not store it. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params;
  const access = await requireProjectAccess(slug, "read");
  if (access.response) return access.response;
  const { project } = access;

  const service = createServiceClient();
  const { data: row } = await service
    .from("snag_requests")
    .select("id, agent_id")
    .eq("id", id)
    .eq("project_id", project.id)
    .maybeSingle<{ id: string; agent_id: string | null }>();
  if (!row) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  if (!row.agent_id) {
    return NextResponse.json({ messages: [] });
  }
  if (!project.cursor_api_key_encrypted) {
    return NextResponse.json({ error: "The project has no Cursor API key." }, { status: 409 });
  }

  const encryption = encryptionSecretOrError();
  if (encryption.response) return encryption.response;
  let cursorKey: string;
  try {
    cursorKey = await decryptSecret(project.cursor_api_key_encrypted, encryption.secret);
  } catch {
    return NextResponse.json({ error: "Cursor API key could not be decrypted" }, { status: 500 });
  }

  try {
    const messages = await fetchCursorConversation(cursorKey, row.agent_id);
    return NextResponse.json({ messages });
  } catch (error) {
    const status = error instanceof CursorRequestError ? error.status : null;
    return NextResponse.json(
      {
        error:
          status === 404
            ? "Cursor no longer has this agent's conversation."
            : "Could not load the conversation from Cursor.",
      },
      { status: 502 },
    );
  }
}
