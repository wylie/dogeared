import { neon } from "@neondatabase/serverless";

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();

if (!DATABASE_URL) {
	throw new Error("Missing DATABASE_URL.");
}

const sql = neon(DATABASE_URL);

const [bookCoverageRow] = await sql`
	select
		count(*)::int as total_books,
		count(*) filter (where trim(coalesce(primary_author, '')) = '')::int as missing_author,
		count(*) filter (where trim(coalesce(cover_url, '')) = '')::int as missing_cover,
		count(*) filter (where published_year is null or published_year <= 0)::int as missing_published_year,
		count(*) filter (where trim(coalesce(synopsis, '')) = '')::int as missing_synopsis,
		count(*) filter (
			where coalesce(trim(coalesce(isbn13, '')), trim(coalesce(isbn10, '')), '') = ''
		)::int as missing_isbn
	from book
`;

const [genreCoverageRow] = await sql`
	with genre_counts as (
		select
			b.id as book_id,
			count(bg.genre_slug)::int as genre_count
		from book b
		left join book_genre bg on bg.book_id = b.id
		group by b.id
	)
	select
		count(*)::int as total_books,
		count(*) filter (where genre_count = 0)::int as books_without_genres,
		count(*) filter (where genre_count > 0)::int as books_with_genres
	from genre_counts
`;

const [authorCoverageRow] = await sql`
	select
		count(*)::int as total_authors,
		count(*) filter (where trim(coalesce(bio, '')) = '')::int as authors_without_bio,
		count(*) filter (where trim(coalesce(photo_url, '')) = '')::int as authors_without_photo
	from author
`;

const [importHealthRow] = await sql`
	select
		count(*)::int as total_user_books,
		count(distinct user_id)::int as active_readers,
		count(*) filter (where total_pages = 0)::int as entries_without_total_pages,
		count(*) filter (where status = 'finished' and (finished_date is null))::int as finished_without_date
	from user_book
`;

const [dupByWorkKeyRow] = await sql`
	select count(*)::int as duplicate_groups
	from (
		select canonical_work_key
		from book
		where trim(coalesce(canonical_work_key, '')) <> ''
		group by canonical_work_key
		having count(*) > 1
	) duplicates
`;

function toInt(value) {
	return Number(value || 0);
}

function percentage(part, total) {
	if (!total) return 0;
	return Number(((part / total) * 100).toFixed(2));
}

const totalBooks = toInt(bookCoverageRow?.total_books);
const missingAuthor = toInt(bookCoverageRow?.missing_author);
const missingCover = toInt(bookCoverageRow?.missing_cover);
const missingPublishedYear = toInt(bookCoverageRow?.missing_published_year);
const missingSynopsis = toInt(bookCoverageRow?.missing_synopsis);
const missingIsbn = toInt(bookCoverageRow?.missing_isbn);
const booksWithoutGenres = toInt(genreCoverageRow?.books_without_genres);

const totalAuthors = toInt(authorCoverageRow?.total_authors);
const authorsWithoutBio = toInt(authorCoverageRow?.authors_without_bio);
const authorsWithoutPhoto = toInt(authorCoverageRow?.authors_without_photo);

const qualityReport = {
	generatedAt: new Date().toISOString(),
	books: {
		total: totalBooks,
		missingAuthor,
		missingCover,
		missingPublishedYear,
		missingSynopsis,
		missingIsbn,
		withoutGenres: booksWithoutGenres,
		coverage: {
			authorPct: percentage(totalBooks - missingAuthor, totalBooks),
			coverPct: percentage(totalBooks - missingCover, totalBooks),
			publishedYearPct: percentage(totalBooks - missingPublishedYear, totalBooks),
			synopsisPct: percentage(totalBooks - missingSynopsis, totalBooks),
			genrePct: percentage(totalBooks - booksWithoutGenres, totalBooks)
		}
	},
	authors: {
		total: totalAuthors,
		withoutBio: authorsWithoutBio,
		withoutPhoto: authorsWithoutPhoto,
		coverage: {
			bioPct: percentage(totalAuthors - authorsWithoutBio, totalAuthors),
			photoPct: percentage(totalAuthors - authorsWithoutPhoto, totalAuthors)
		}
	},
	importHealth: {
		totalUserBooks: toInt(importHealthRow?.total_user_books),
		activeReaders: toInt(importHealthRow?.active_readers),
		entriesWithoutTotalPages: toInt(importHealthRow?.entries_without_total_pages),
		finishedWithoutDate: toInt(importHealthRow?.finished_without_date)
	},
	dedupeHealth: {
		duplicateCanonicalWorkKeyGroups: toInt(dupByWorkKeyRow?.duplicate_groups)
	}
};

console.log(JSON.stringify(qualityReport, null, 2));
