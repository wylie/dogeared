import type { APIRoute } from "astro";
import { resolveUserBySession } from "../../../lib/auth";
import { getNeonSql } from "../../../lib/neon";
import {
	deleteJournalNote,
	loadJournalEntriesForBook,
	saveJournalNote,
	searchJournalEntries,
} from "../../../lib/readingJournal";
import { monitorEvent } from "../../../lib/monitoring";

export const prerender = false;

function jsonResponse(body: Record<string, unknown>, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" }
	});
}

export const GET: APIRoute = async ({ request, url }) => {
	try {
		const session = await resolveUserBySession(request);
		if (!session?.userId) {
			return jsonResponse({ error: "You must be logged in to view your journal." }, 401);
		}
		const sql = getNeonSql();
		const bookId = Math.max(0, Number(url.searchParams.get("bookId") || 0) || 0);
		if (bookId > 0) {
			const entries = await loadJournalEntriesForBook(sql, session.userId, bookId, 20);
			return jsonResponse({ ok: true, entries, entry: entries[0] || null });
		}
		const query = String(url.searchParams.get("q") || "").trim();
		const filterBookId = Math.max(0, Number(url.searchParams.get("filterBookId") || 0) || 0);
		const entries = await searchJournalEntries(sql, session.userId, query, 50, filterBookId);
		return jsonResponse({ ok: true, entries });
	} catch (error) {
		monitorEvent("journal.entries.get.error", { message: error instanceof Error ? error.message : "Unknown error" }, "error");
		return jsonResponse({
			error: "Failed to load journal entries.",
			detail: error instanceof Error ? error.message : "Unknown error"
		}, 500);
	}
};

export const POST: APIRoute = async ({ request }) => {
	try {
		const session = await resolveUserBySession(request);
		if (!session?.userId) {
			return jsonResponse({ error: "You must be logged in to save your journal." }, 401);
		}
		const body = await request.json().catch(() => ({}));
		const sql = getNeonSql();
		const entry = await saveJournalNote(sql, session.userId, body);
		monitorEvent("journal.entries.save.success", { userId: session.userId, bookId: entry.bookId || 0, entryId: entry.id || 0 });
		return jsonResponse({ ok: true, entry });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Failed to save journal entry.";
		const status = /shelf before journaling/i.test(message) ? 403 : (/required|not found|Missing book/i.test(message) ? 400 : 500);
		monitorEvent("journal.entries.save.error", { message }, status >= 500 ? "error" : "warn");
		return jsonResponse({ error: message }, status);
	}
};

export const DELETE: APIRoute = async ({ request, url }) => {
	try {
		const session = await resolveUserBySession(request);
		if (!session?.userId) {
			return jsonResponse({ error: "You must be logged in to delete your journal." }, 401);
		}
		const entryId = Math.max(0, Number(url.searchParams.get("id") || 0) || 0);
		if (!entryId) return jsonResponse({ error: "Missing journal entry." }, 400);
		const sql = getNeonSql();
		const deleted = await deleteJournalNote(sql, session.userId, entryId);
		monitorEvent("journal.entries.delete.success", { userId: session.userId, entryId, deleted });
		return jsonResponse({ ok: true, deleted });
	} catch (error) {
		monitorEvent("journal.entries.delete.error", { message: error instanceof Error ? error.message : "Unknown error" }, "error");
		return jsonResponse({
			error: "Failed to delete journal entry.",
			detail: error instanceof Error ? error.message : "Unknown error"
		}, 500);
	}
};
