import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";

const databaseUrl = String(process.env.DATABASE_URL || "").trim();
const filePath = String(process.argv[2] || "").trim();

if (!databaseUrl) {
	throw new Error("Missing DATABASE_URL.");
}

if (!filePath) {
	throw new Error("Usage: node scripts/run-sql-file.mjs <path-to-sql-file>");
}

const resolvedPath = resolve(filePath);
const sqlText = readFileSync(resolvedPath, "utf8").trim();

if (!sqlText) {
	throw new Error(`SQL file is empty: ${resolvedPath}`);
}

const sql = neon(databaseUrl);
function splitSqlStatements(source) {
	const statements = [];
	let current = "";
	let quote = "";
	let dollarQuote = "";
	let lineComment = false;
	let blockComment = false;

	for (let index = 0; index < source.length; index += 1) {
		const char = source[index];
		const next = source[index + 1] || "";

		if (lineComment) {
			current += char;
			if (char === "\n") lineComment = false;
			continue;
		}

		if (blockComment) {
			current += char;
			if (char === "*" && next === "/") {
				current += next;
				index += 1;
				blockComment = false;
			}
			continue;
		}

		if (dollarQuote) {
			current += char;
			if (source.startsWith(dollarQuote, index)) {
				current += source.slice(index + 1, index + dollarQuote.length);
				index += dollarQuote.length - 1;
				dollarQuote = "";
			}
			continue;
		}

		if (quote) {
			current += char;
			if (char === quote) {
				if (next === quote) {
					current += next;
					index += 1;
				} else {
					quote = "";
				}
			}
			continue;
		}

		if (char === "-" && next === "-") {
			current += char + next;
			index += 1;
			lineComment = true;
			continue;
		}

		if (char === "/" && next === "*") {
			current += char + next;
			index += 1;
			blockComment = true;
			continue;
		}

		if (char === "'" || char === "\"") {
			current += char;
			quote = char;
			continue;
		}

		if (char === "$") {
			const match = source.slice(index).match(/^\$[A-Za-z0-9_]*\$/);
			if (match) {
				dollarQuote = match[0];
				current += dollarQuote;
				index += dollarQuote.length - 1;
				continue;
			}
		}

		if (char === ";") {
			const statement = current.trim();
			if (statement) statements.push(statement);
			current = "";
			continue;
		}

		current += char;
	}

	const tail = current.trim();
	if (tail) statements.push(tail);
	return statements;
}

const statements = splitSqlStatements(sqlText);
for (const [index, statement] of statements.entries()) {
	await sql.query(statement);
	console.log(`Applied statement ${index + 1}/${statements.length}`);
}

console.log(`Applied SQL file: ${resolvedPath}`);
