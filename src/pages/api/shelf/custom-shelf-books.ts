import type { APIRoute } from "astro";
import { getNeonSql } from "../../../lib/neon";
import { resolveUserBySession } from "../../../lib/auth";
import { ensureCustomShelfSchema } from "../../../lib/customShelves";

export const prerender = false;

function json(status: number, body: Record<string, unknown>) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" }
	});
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const session = await resolveUserBySession(request);
		if (!session?.userId) return json(401, { error: "You must be logged in to update custom shelf books." });
		const body = await request.json().catch(() => ({})) as {
			shelfId?: unknown;
			bookId?: unknown;
			action?: unknown;
		};
		const shelfId = Math.max(0, Number(body.shelfId || 0) || 0);
		const bookId = Math.max(0, Number(body.bookId || 0) || 0);
		const action = String(body.action || "add").trim().toLowerCase();
		if (!shelfId || !bookId) return json(400, { error: "Shelf id and book id are required." });
		if (action !== "add" && action !== "remove") return json(400, { error: "Action must be add or remove." });

		const sql = getNeonSql();
		await ensureCustomShelfSchema(sql);
		const shelfRows = await sql<Array<{ id: number }>>`
			select id
			from user_custom_shelf
			where id = ${shelfId}
				and user_id = ${session.userId}::uuid
			limit 1
		`;
		if (shelfRows.length === 0) return json(404, { error: "Custom shelf not found." });

		if (action === "add") {
			// Single-shelf mode: putting a book on a custom shelf removes it from
			// default shelves and other custom shelves first.
			await sql`
				delete from user_book
				where user_id = ${session.userId}::uuid
					and book_id = ${bookId}
			`;
			await sql`
				delete from user_custom_shelf_book
				where user_id = ${session.userId}::uuid
					and book_id = ${bookId}
			`;
			await sql`
				insert into user_custom_shelf_book (user_id, shelf_id, book_id)
				values (${session.userId}::uuid, ${shelfId}, ${bookId})
				on conflict (user_id, shelf_id, book_id) do nothing
			`;
		} else {
			await sql`
				delete from user_custom_shelf_book
				where user_id = ${session.userId}::uuid
					and shelf_id = ${shelfId}
					and book_id = ${bookId}
			`;
		}

		const countRows = await sql<Array<{ count: number }>>`
			select count(*)::int as count
			from user_custom_shelf_book
			where user_id = ${session.userId}::uuid
				and shelf_id = ${shelfId}
		`;
		return json(200, { ok: true, count: Number(countRows[0]?.count || 0) });
	} catch (error) {
		return json(500, { error: "Failed to update custom shelf book.", detail: error instanceof Error ? error.message : "Unknown error" });
	}
};
