import { writeFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

const connectionString = String(process.env.DATABASE_URL || "").trim();
if (!connectionString) {
	throw new Error("DATABASE_URL is required");
}
const sql = neon(connectionString);

const genres = await sql`
  select genre_slug, genre_name, count(distinct book_id)::int as books
  from book_genre
  group by genre_slug, genre_name
  order by books desc, genre_slug asc
`;

const tags = await sql`
  select tag_slug, tag_name, count(distinct book_id)::int as books
  from book_tag
  group by tag_slug, tag_name
  order by books desc, tag_slug asc
`;

await writeFile("tmp/all-genres.json", `${JSON.stringify(genres, null, 2)}\n`);
await writeFile("tmp/all-tags.json", `${JSON.stringify(tags, null, 2)}\n`);

const toCsv = (rows, slugKey, nameKey) => [
  "slug,name,books",
  ...rows.map((r) => `${JSON.stringify(r[slugKey] ?? "")},${JSON.stringify(r[nameKey] ?? "")},${Number(r.books ?? 0)}`)
].join("\n") + "\n";

await writeFile("tmp/all-genres.csv", toCsv(genres, "genre_slug", "genre_name"));
await writeFile("tmp/all-tags.csv", toCsv(tags, "tag_slug", "tag_name"));

console.log(JSON.stringify({ genres: genres.length, tags: tags.length }, null, 2));
