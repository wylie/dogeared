import { neon } from "@neondatabase/serverless";

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const TEST_USERNAME = String(process.env.TEST_USERNAME || "test").trim().replace(/^@+/, "").toLowerCase();

if (!DATABASE_URL) {
	throw new Error("Missing DATABASE_URL.");
}

const sql = neon(DATABASE_URL);

function canonicalize(value) {
	return String(value || "")
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\([^)]*\)/g, " ")
		.replace(/^(the|a|an)\s+/g, "")
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function canonicalWorkKey(book) {
	return `seed:${canonicalize(book.title) || "untitled"}|${canonicalize(book.author) || "unknown"}`;
}

const books = [
	{
		title: "The Midnight Library",
		author: "Matt Haig",
		status: "want_to_read",
		eventType: "want_to_read",
		coverUrl: "https://covers.openlibrary.org/b/isbn/9780525559474-L.jpg",
		language: "en",
		offsetMinutes: 8
	},
	{
		title: "Project Hail Mary",
		author: "Andy Weir",
		status: "reading",
		eventType: "reading",
		totalPages: 496,
		currentPage: 184,
		coverUrl: "https://covers.openlibrary.org/b/isbn/9780593135204-L.jpg",
		language: "en",
		offsetMinutes: 42
	},
	{
		title: "Braiding Sweetgrass",
		author: "Robin Wall Kimmerer",
		status: "finished",
		eventType: "finished",
		rating: 5,
		totalPages: 408,
		currentPage: 408,
		finishedDate: "2026-05-04",
		coverUrl: "https://covers.openlibrary.org/b/isbn/9781571313560-L.jpg",
		language: "en",
		offsetMinutes: 95
	},
	{
		title: "Tomorrow, and Tomorrow, and Tomorrow",
		author: "Gabrielle Zevin",
		status: "want_to_read",
		eventType: "want_to_read",
		coverUrl: "https://covers.openlibrary.org/b/isbn/9780593321201-L.jpg",
		language: "en",
		offsetMinutes: 150
	},
	{
		title: "Sea of Tranquility",
		author: "Emily St. John Mandel",
		status: "finished",
		eventType: "finished",
		rating: 4,
		totalPages: 272,
		currentPage: 272,
		finishedDate: "2026-05-03",
		coverUrl: "https://covers.openlibrary.org/b/isbn/9780593321447-L.jpg",
		language: "en",
		offsetMinutes: 230
	}
];

const testProfile = {
	avatar: "https://i.pravatar.cc/160?img=15",
	name: "Testy McTesterson",
	username: "@test",
	location: "Chapel Hill, NC",
	readingGoal: "18 books in 2026",
	favoriteBook: "The Hobbit",
	favoriteAuthor: "Terry Pratchett",
	blurb: "A local-only test reader for checking Following layouts and activity cards.",
	genres: ["Fantasy", "Cozy Mystery"],
	settings: {
		privacy: {
			profileVisibility: "public",
			shareLocation: true,
			shareActivity: true
		}
	}
};

const users = await sql`
	select id::text as id, username, profile_data
	from app_user
	where lower(coalesce(username, '')) = ${TEST_USERNAME}
		or lower(coalesce(profile_data->>'name', '')) = 'test'
	order by case when lower(coalesce(username, '')) = ${TEST_USERNAME} then 0 else 1 end, created_at desc
	limit 1
`;

const testUser = users[0];
if (!testUser?.id) {
	throw new Error(`Could not find a Test account. Set TEST_USERNAME=username if it is not @${TEST_USERNAME}.`);
}

await sql`
	update app_user
	set
		username = ${TEST_USERNAME},
		profile_data = ${JSON.stringify(testProfile)}::jsonb
	where id = ${testUser.id}::uuid
`;

const seededBookIds = [];
for (const book of books) {
	const authorRows = await sql`
		insert into author (name)
		values (${book.author})
		on conflict (name) do update set name = excluded.name
		returning id
	`;
	const authorId = Number(authorRows[0]?.id || 0) || null;
	const bookRows = await sql`
		insert into book (
			canonical_work_key,
			title,
			primary_author,
			author_id,
			cover_url,
			language,
			updated_at
		)
		values (
			${canonicalWorkKey(book)},
			${book.title},
			${book.author},
			${authorId},
			${book.coverUrl || ""},
			${book.language || "en"},
			now()
		)
		on conflict (canonical_work_key) do update set
			title = excluded.title,
			primary_author = excluded.primary_author,
			author_id = excluded.author_id,
			cover_url = excluded.cover_url,
			language = excluded.language,
			updated_at = now()
		returning id
	`;
	const bookId = Number(bookRows[0]?.id || 0);
	if (!bookId) continue;
	seededBookIds.push(bookId);
	await sql`
		insert into user_book (
			user_id,
			book_id,
			status,
			total_pages,
			current_page,
			finished_date,
			rating,
			updated_at
		)
		values (
			${testUser.id}::uuid,
			${bookId},
			${book.status},
			${Math.max(0, Number(book.totalPages || 0) || 0)},
			${Math.max(0, Number(book.currentPage || 0) || 0)},
			${book.finishedDate || null},
			${book.rating || null},
			now() - (${Math.max(1, Number(book.offsetMinutes || 1) || 1)} || ' minutes')::interval
		)
		on conflict (user_id, book_id) do update set
			status = excluded.status,
			total_pages = excluded.total_pages,
			current_page = excluded.current_page,
			finished_date = excluded.finished_date,
			rating = excluded.rating,
			updated_at = excluded.updated_at
	`;
}

if (seededBookIds.length > 0) {
	await sql`
		delete from user_activity
		where user_id = ${testUser.id}::uuid
			and book_id = any(${seededBookIds}::bigint[])
	`;
}

for (const book of books) {
	const rows = await sql`
		select id
		from book
		where canonical_work_key = ${canonicalWorkKey(book)}
		limit 1
	`;
	const bookId = Number(rows[0]?.id || 0);
	if (!bookId) continue;
	await sql`
		insert into user_activity (user_id, book_id, event_type, rating, created_at)
		values (
			${testUser.id}::uuid,
			${bookId},
			${book.eventType},
			${book.rating || null},
			now() - (${Math.max(1, Number(book.offsetMinutes || 1) || 1)} || ' minutes')::interval
		)
	`;
}

console.log(`Seeded ${books.length} activity items for @${testUser.username || TEST_USERNAME}.`);
