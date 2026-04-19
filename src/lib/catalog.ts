import { getNeonSql } from "./neon";

export type CatalogSource = "google_books" | "open_library" | "nyt";

export type CatalogSourceInput = {
	source: CatalogSource;
	sourceWorkId?: string;
	sourceEditionId?: string;
	sourceUrl?: string;
};

export function normalizeCatalogText(value: unknown) {
	return String(value || "").trim();
}

export function normalizeCatalogIsbn(value: unknown) {
	return String(value || "").replace(/[^0-9Xx]/g, "").toUpperCase();
}

export function getCatalogSourceKey(input: CatalogSourceInput) {
	const workId = normalizeCatalogText(input.sourceWorkId);
	const editionId = normalizeCatalogText(input.sourceEditionId);
	if (workId) return workId;
	if (editionId) return editionId;
	return "";
}

export async function upsertBookSources(
	sql: ReturnType<typeof getNeonSql>,
	bookId: number,
	sources: CatalogSourceInput[]
) {
	for (const source of sources) {
		const sourceKey = getCatalogSourceKey(source);
		if (!sourceKey) continue;
		await sql`
			insert into book_source (
				book_id,
				source,
				source_key,
				source_work_id,
				source_edition_id,
				source_url,
				last_synced_at
			)
			values (
				${bookId},
				${source.source},
				${sourceKey},
				${normalizeCatalogText(source.sourceWorkId)},
				${normalizeCatalogText(source.sourceEditionId)},
				${normalizeCatalogText(source.sourceUrl)},
				now()
			)
			on conflict (source, source_key) do update set
				book_id = excluded.book_id,
				source_work_id = case when excluded.source_work_id <> '' then excluded.source_work_id else book_source.source_work_id end,
				source_edition_id = case when excluded.source_edition_id <> '' then excluded.source_edition_id else book_source.source_edition_id end,
				source_url = case when excluded.source_url <> '' then excluded.source_url else book_source.source_url end,
				last_synced_at = now()
		`;
	}
}
