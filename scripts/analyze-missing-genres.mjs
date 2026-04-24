import fs from "fs";
import { neon } from "@neondatabase/serverless";

function loadDotEnv(path) {
	const text = fs.readFileSync(path, "utf8");
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || line.startsWith("#")) continue;
		const i = line.indexOf("=");
		if (i <= 0) continue;
		const key = line.slice(0, i).trim();
		let value = line.slice(i + 1).trim();
		if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}
		process.env[key] = value;
	}
}

loadDotEnv(".env");
const sql = neon(String(process.env.DATABASE_URL || "").trim());

const [summary] = await sql`
	select
		count(*)::int as shelved_rows,
		count(*) filter (where bg.book_id is null)::int as uncategorized_rows
	from user_book ub
	left join book_genre bg on bg.book_id = ub.book_id
`;

const missingBooks = await sql`
	select
		b.id,
		b.title,
		b.primary_author,
		b.google_books_id,
		b.isbn13,
		b.isbn10,
		count(*)::int as shelved_count
	from user_book ub
	join book b on b.id = ub.book_id
	left join book_genre bg on bg.book_id = b.id
	where bg.book_id is null
	group by b.id, b.title, b.primary_author, b.google_books_id, b.isbn13, b.isbn10
	order by shelved_count desc, b.title asc
	limit 30
`;

const idCoverage = await sql`
	select
		count(*)::int as missing_books,
		count(*) filter (where trim(coalesce(google_books_id, '')) <> '')::int as with_google_books_id,
		count(*) filter (where trim(coalesce(isbn13, '')) <> '')::int as with_isbn13,
		count(*) filter (where trim(coalesce(isbn10, '')) <> '')::int as with_isbn10
	from (
		select distinct b.id, b.google_books_id, b.isbn13, b.isbn10
		from user_book ub
		join book b on b.id = ub.book_id
		left join book_genre bg on bg.book_id = b.id
		where bg.book_id is null
	) x
`;

console.log(JSON.stringify({
	summary,
	idCoverage: idCoverage[0],
	examples: missingBooks
}, null, 2));
