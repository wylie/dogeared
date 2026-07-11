import { getNeonSql } from "./neon";
import {
	canonicalCatalogWorkKey,
	getCatalogSourceKey,
	getCatalogSourceKeys,
	normalizeCatalogIsbn,
	normalizeCatalogText,
	type CatalogSourceInput
} from "./catalogKeys";
import { ensureCanonicalWorkSchema, resolveRepresentativeBookId } from "./catalogWorks";

export {
	canonicalCatalogWorkKey,
	canonicalCatalogEditionKey,
	canonicalCatalogDisplayWorkKey,
	canonicalizeCatalogAuthor,
	canonicalizeCatalogTitle,
	dedupeCatalogItemsByDisplayWork,
	getCatalogSourceKey,
	getCatalogSourceKeys,
	normalizeCatalogIsbn,
	normalizeCatalogText,
	type CatalogSource,
	type CatalogSourceInput
} from "./catalogKeys";

export {
	normalizeRedundantSeriesTitle,
	type CanonicalSeriesTitleInput,
	type CanonicalSeriesTitleResult
} from "./canonicalTitles";

export type CatalogBookLookupInput = {
	canonicalWorkKey?: string;
	title?: string;
	author?: string;
	isbn10?: string;
	isbn13?: string;
	googleBooksId?: string;
	sources?: CatalogSourceInput[];
};

export async function resolveBestCatalogBookId(
	sql: ReturnType<typeof getNeonSql>,
	input: CatalogBookLookupInput
) {
	await ensureCanonicalWorkSchema(sql);
	const isbn13 = normalizeCatalogIsbn(input.isbn13);
	const isbn10 = normalizeCatalogIsbn(input.isbn10);
	const googleBooksId = normalizeCatalogText(input.googleBooksId);
	const explicitWorkKey = normalizeCatalogText(input.canonicalWorkKey);
	const canonicalWorkKey = explicitWorkKey || canonicalCatalogWorkKey({
		title: input.title,
		author: input.author,
		isbn10,
		isbn13
	});
	const titleAuthorKey = canonicalCatalogWorkKey({
		title: input.title,
		author: input.author,
		isbn10: "",
		isbn13: ""
	});

	const rows = await sql<Array<{ id: number }>>`
		select b.id
		from book b
		left join book_work bw on bw.id = b.work_id
		where (
			(${googleBooksId} <> '' and b.google_books_id = ${googleBooksId})
			or (${isbn13} <> '' and b.isbn13 = ${isbn13})
			or (${isbn10} <> '' and b.isbn10 = ${isbn10})
			or (${canonicalWorkKey} <> '' and b.canonical_work_key = ${canonicalWorkKey})
			or (${titleAuthorKey} <> '' and b.canonical_work_key = ${titleAuthorKey})
			or (${canonicalWorkKey} <> '' and bw.work_key = ${canonicalWorkKey})
			or (${titleAuthorKey} <> '' and bw.work_key = ${titleAuthorKey})
		)
		order by
			case
				when ${canonicalWorkKey} <> '' and bw.work_key = ${canonicalWorkKey} then 1
				when ${titleAuthorKey} <> '' and bw.work_key = ${titleAuthorKey} then 2
				when ${googleBooksId} <> '' and b.google_books_id = ${googleBooksId} then 3
				when ${isbn13} <> '' and b.isbn13 = ${isbn13} then 4
				when ${isbn10} <> '' and b.isbn10 = ${isbn10} then 5
				when ${canonicalWorkKey} <> '' and b.canonical_work_key = ${canonicalWorkKey} then 6
				when ${titleAuthorKey} <> '' and b.canonical_work_key = ${titleAuthorKey} then 7
				else 9
			end asc,
			b.updated_at desc,
			b.id desc
		limit 1
	`;
	const directBookId = Number(rows[0]?.id || 0);
	if (directBookId > 0) return resolveRepresentativeBookId(sql, directBookId);

	const sourceCandidates: CatalogSourceInput[] = [...(input.sources || [])];
	if (googleBooksId) sourceCandidates.push({ source: "google_books", sourceWorkId: googleBooksId });
	const seenSources = new Set<string>();
	for (const source of sourceCandidates) {
		for (const sourceKey of getCatalogSourceKeys(source)) {
			const lookupKey = `${source.source}:${sourceKey}`;
			if (seenSources.has(lookupKey)) continue;
			seenSources.add(lookupKey);
			const sourceRows = await sql<Array<{ id: number }>>`
				select b.id
				from book_source bs
				join book b on b.id = bs.book_id
				where bs.source = ${source.source}
					and bs.source_key = ${sourceKey}
				order by b.updated_at desc, b.id desc
				limit 1
			`;
			const sourceBookId = Number(sourceRows[0]?.id || 0);
			if (sourceBookId > 0) return resolveRepresentativeBookId(sql, sourceBookId);
		}
	}

	return 0;
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
