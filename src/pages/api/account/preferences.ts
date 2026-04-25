import type { APIRoute } from "astro";
import { resolveUserBySession } from "../../../lib/auth";
import { getNeonSql } from "../../../lib/neon";

export const prerender = false;

type Preferences = {
	privacy: {
		profileVisibility: "public" | "private";
		shareLocation: boolean;
		shareActivity: boolean;
	};
	readingDefaults: {
		defaultShelf: "want_to_read" | "reading" | "finished";
		homeSort: "relevance" | "recent" | "rating";
	};
	notifications: {
		browserEnabled: boolean;
		releaseEmail: boolean;
		weeklySummary: boolean;
	};
	dataControls: {
		preferredExportFormat: "json" | "csv";
	};
	importControls: {
		defaultMode: "merge" | "replace";
		dryRunFirst: boolean;
	};
	personalization: {
		favoriteGenres: string[];
		excludedGenres: string[];
		preferredLanguage: string;
	};
	connectedAccounts: {
		goodreadsConnected: boolean;
	};
};

const DEFAULT_PREFERENCES: Preferences = {
	privacy: {
		profileVisibility: "public",
		shareLocation: true,
		shareActivity: true
	},
	readingDefaults: {
		defaultShelf: "want_to_read",
		homeSort: "relevance"
	},
	notifications: {
		browserEnabled: false,
		releaseEmail: false,
		weeklySummary: false
	},
	dataControls: {
		preferredExportFormat: "json"
	},
	importControls: {
		defaultMode: "merge",
		dryRunFirst: true
	},
	personalization: {
		favoriteGenres: [],
		excludedGenres: [],
		preferredLanguage: "en"
	},
	connectedAccounts: {
		goodreadsConnected: false
	}
};

function normalizeText(value: unknown) {
	return String(value || "").trim();
}

function toBool(value: unknown, fallback: boolean) {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		if (normalized === "true") return true;
		if (normalized === "false") return false;
	}
	return fallback;
}

function normalizeGenreList(value: unknown) {
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => normalizeText(item).slice(0, 40))
		.filter(Boolean)
		.slice(0, 20);
}

function normalizePreferences(input: unknown): Preferences {
	const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
	const privacy = source.privacy && typeof source.privacy === "object" ? source.privacy as Record<string, unknown> : {};
	const readingDefaults = source.readingDefaults && typeof source.readingDefaults === "object" ? source.readingDefaults as Record<string, unknown> : {};
	const notifications = source.notifications && typeof source.notifications === "object" ? source.notifications as Record<string, unknown> : {};
	const dataControls = source.dataControls && typeof source.dataControls === "object" ? source.dataControls as Record<string, unknown> : {};
	const importControls = source.importControls && typeof source.importControls === "object" ? source.importControls as Record<string, unknown> : {};
	const personalization = source.personalization && typeof source.personalization === "object" ? source.personalization as Record<string, unknown> : {};
	const connectedAccounts = source.connectedAccounts && typeof source.connectedAccounts === "object" ? source.connectedAccounts as Record<string, unknown> : {};

	const profileVisibility = normalizeText(privacy.profileVisibility).toLowerCase() === "private" ? "private" : "public";
	const defaultShelfRaw = normalizeText(readingDefaults.defaultShelf).toLowerCase();
	const defaultShelf = defaultShelfRaw === "reading" || defaultShelfRaw === "finished" ? defaultShelfRaw : "want_to_read";
	const homeSortRaw = normalizeText(readingDefaults.homeSort).toLowerCase();
	const homeSort = homeSortRaw === "recent" || homeSortRaw === "rating" ? homeSortRaw : "relevance";
	const preferredExportFormat = normalizeText(dataControls.preferredExportFormat).toLowerCase() === "csv" ? "csv" : "json";
	const defaultMode = normalizeText(importControls.defaultMode).toLowerCase() === "replace" ? "replace" : "merge";
	const preferredLanguage = normalizeText(personalization.preferredLanguage).slice(0, 20).toLowerCase() || "en";

	return {
		privacy: {
			profileVisibility,
			shareLocation: toBool(privacy.shareLocation, true),
			shareActivity: toBool(privacy.shareActivity, true)
		},
		readingDefaults: {
			defaultShelf,
			homeSort
		},
		notifications: {
			browserEnabled: toBool(notifications.browserEnabled, false),
			releaseEmail: toBool(notifications.releaseEmail, false),
			weeklySummary: toBool(notifications.weeklySummary, false)
		},
		dataControls: {
			preferredExportFormat
		},
		importControls: {
			defaultMode,
			dryRunFirst: toBool(importControls.dryRunFirst, true)
		},
		personalization: {
			favoriteGenres: normalizeGenreList(personalization.favoriteGenres),
			excludedGenres: normalizeGenreList(personalization.excludedGenres),
			preferredLanguage
		},
		connectedAccounts: {
			goodreadsConnected: toBool(connectedAccounts.goodreadsConnected, false)
		}
	};
}

function json(status: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" }
	});
}

async function ensureProfileSchema() {
	const sql = getNeonSql();
	await sql`alter table app_user add column if not exists profile_data jsonb not null default '{}'::jsonb`;
}

export const GET: APIRoute = async ({ request }) => {
	try {
		await ensureProfileSchema();
		const session = await resolveUserBySession(request);
		if (!session?.userId) return json(401, { error: "You must be logged in to load preferences." });

		const sql = getNeonSql();
		const rows = await sql<Array<{ settings: unknown }>>`
			select coalesce(profile_data->'settings', '{}'::jsonb) as settings
			from app_user
			where id = ${session.userId}::uuid
			limit 1
		`;
		const normalized = normalizePreferences(rows[0]?.settings);
		return json(200, { preferences: normalized });
	} catch (error) {
		return json(500, {
			error: "Failed to load preferences.",
			detail: error instanceof Error ? error.message : "Unknown error"
		});
	}
};

export const POST: APIRoute = async ({ request }) => {
	try {
		await ensureProfileSchema();
		const session = await resolveUserBySession(request);
		if (!session?.userId) return json(401, { error: "You must be logged in to save preferences." });

		const body = await request.json() as { preferences?: unknown };
		const preferences = normalizePreferences(body?.preferences || DEFAULT_PREFERENCES);

		const sql = getNeonSql();
		await sql`
			update app_user
			set profile_data = jsonb_set(
				coalesce(profile_data, '{}'::jsonb),
				'{settings}',
				${JSON.stringify(preferences)}::jsonb,
				true
			)
			where id = ${session.userId}::uuid
		`;

		return json(200, { ok: true, preferences });
	} catch (error) {
		return json(500, {
			error: "Failed to save preferences.",
			detail: error instanceof Error ? error.message : "Unknown error"
		});
	}
};

