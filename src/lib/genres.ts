export function formatGenreLabel(value: string, fallback = "Genre") {
	const source = String(value || "").trim();
	if (!source) return fallback;

	const acronyms = new Set(["ya", "mg", "us", "uk", "lgbtq", "lgbtqia"]);

	return source
		.replace(/[-_]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase()
		.split(" ")
		.map((word) => {
			if (!word) return word;
			if (acronyms.has(word)) return word.toUpperCase();
			if (word === "and") return "&";
			return `${word[0].toUpperCase()}${word.slice(1)}`;
		})
		.join(" ");
}
