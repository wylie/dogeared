import type { APIRoute } from "astro";
import { googleBooksCoverUrl } from "../../../lib/bookCovers";
import { normalizeRedundantSeriesTitle, resolveCanonicalCatalogWorksForSearch, type CatalogBookLookupInput, type CatalogSourceInput } from "../../../lib/catalog";
import { getNeonSql } from "../../../lib/neon";
import { createPublicCacheControl, withRuntimeCache } from "../../../lib/runtimeCache";
import { inferKnownSeriesMetadata } from "../../../lib/series";
import { searchCollections } from "../../../lib/collections";
import { resolveUserBySession } from "../../../lib/auth";
import { classifySearchAnalyticsSubject, recordProductAnalyticsEventSafe } from "../../../lib/productAnalytics";
import { recordPerformanceEventSafe, type PerformanceSpanInput } from "../../../lib/performanceTelemetry";
import { reconcileCanonicalSearchResults, type ReconciledSearchResults } from "../../../lib/searchReconciliation";
import { normalizeSearchResult, type SearchResult } from "../../../lib/searchResults";

export const prerender = false;

type CollectionSearchResult = {
	title: string;
	slug: string;
	subtitle: string;
	description: string;
	heroImage: string;
	category: string;
	bookCount: number;
	featured: boolean;
};

type SearchPhase = "all" | "local" | "external";
type ExternalSearchProvider = "all" | "google_books" | "open_library";
const EXTERNAL_PROVIDER_TIMEOUT_MS = 1_800;
const LOCAL_SEARCH_TIMEOUT_MS = 2_500;
const COLLECTION_SEARCH_TIMEOUT_MS = 900;
const CANONICAL_MATCH_TIMEOUT_MS = 900;
const MAX_CANONICAL_MATCH_CANDIDATES = 24;

class SearchTimeoutError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SearchTimeoutError";
	}
}

function normalizeText(value: string) {
	return String(value || "")
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9\s:]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function canonicalizeTitle(value: string) {
	let text = normalizeText(value);
	text = text.replace(/\([^)]*\)/g, " ");
	text = text.replace(/\b(abridged|unabridged|audio ?book|audiobook|kindle edition|paperback|hardcover|ebook|e-book|digital edition|color edition|spanish edition|french edition|german edition)\b/g, " ");
	text = text.split(":")[0] || text;
	text = text.replace(/^(the|a|an)\s+/g, "");
	return text.replace(/\s+/g, " ").trim();
}

function canonicalizeAuthor(value: string) {
	return normalizeText(value).replace(/^(by\s+)/, "").trim();
}

function detectFormat(input: {
	title?: string;
	subtitle?: string;
	description?: string;
	categories?: string[];
}): string {
	const haystack = normalizeText([
		input.title || "",
		input.subtitle || "",
		input.description || "",
		Array.isArray(input.categories) ? input.categories.join(" ") : ""
	].join(" "));
	if (/\b(ebook|e-book|kindle|digital edition)\b/.test(haystack)) return "Ebook";
	if (/\bpaperback\b/.test(haystack)) return "Paperback";
	if (/\b(hardcover|hardback)\b/.test(haystack)) return "Hardcover";
	return "Book";
}

function normalizedCoverKey(url: string) {
	const value = String(url || "").trim();
	if (!value) return "";
	try {
		const parsed = new URL(value);
		parsed.searchParams.delete("zoom");
		parsed.searchParams.delete("edge");
		parsed.searchParams.delete("source");
		parsed.searchParams.delete("imgtk");
		return parsed.toString();
	} catch {
		return value;
	}
}

function toVariant(result: SearchResult) {
	const authors = Array.isArray(result.authors) ? result.authors : [];
	const language = String(result.language || "").trim().toUpperCase();
	const year = String(result.publishedDate || "").match(/\d{4}/)?.[0] || "";
	const format = detectFormat({
		title: result.title,
		subtitle: result.subtitle,
		description: result.description,
		categories: result.categories
	});
	const summaryParts = [format, language || "Unknown language", year || "Unknown year"].filter(Boolean);
	const detailParts = [
		result.publisher ? `Publisher: ${result.publisher}` : "",
		result.pageCount && result.pageCount > 0 ? `${result.pageCount} pages` : "",
		result.isbn13 ? `ISBN-13 ${result.isbn13}` : (result.isbn10 ? `ISBN-10 ${result.isbn10}` : ""),
		String(result.publishedDate || "").trim() ? `Published ${String(result.publishedDate || "").trim()}` : ""
	].filter(Boolean);
	return {
		title: result.title,
		author: authors[0] || "",
		pageCount: Math.max(0, Number(result.pageCount) || 0),
		thumbnail: result.thumbnail || "",
		language: String(result.language || "").trim(),
		publishedDate: String(result.publishedDate || "").trim(),
		publisher: String(result.publisher || "").trim(),
		isbn10: String(result.isbn10 || "").trim(),
		isbn13: String(result.isbn13 || "").trim(),
		googleBooksId: String(result.googleBooksId || "").trim(),
		sourceWorkId: String(result.sourceWorkId || "").trim(),
		sourceEditionId: String(result.sourceEditionId || "").trim(),
		bookId: Number(result.bookId || 0) || 0,
		authorId: Number(result.authorId || 0) || 0,
		format,
		optionLabel: summaryParts.join(" • "),
		detailLabel: [format, ...detailParts].join(" • ")
	};
}

function scoreResult(result: SearchResult, queryText: string) {
	let score = 0;
	const q = normalizeText(queryText);
	const title = normalizeText(result.title);
	if (q && title.includes(q)) score += 140;
	if (q && title.startsWith(q)) score += 120;
	if (result.thumbnail) score += 65;
	if (result.isbn13) score += 55;
	else if (result.isbn10) score += 35;
	if (result.googleBooksId) score += 40;
	if (result.pageCount && result.pageCount > 0) score += 20;
	if (result.publisher) score += 14;
	if (result.publishedDate) score += 12;
	if (Array.isArray(result.authors) && result.authors.length > 0) score += 12;
	if (Array.isArray(result.categories) && result.categories.length > 0) score += 10;
	if (String(result.language || "").toLowerCase() === "en") score += 10;
	if (result.source === "dbd") score += 300;
	else if (result.source === "google_books") score += 200;
	else if (result.source === "open_library") score += 100;
	return score;
}

function tokenizeQuery(queryText: string) {
	return normalizeText(queryText)
		.split(" ")
		.filter((token) => token.length >= 2);
}

function expandedQueryVariants(queryText: string) {
	const normalized = normalizeText(queryText);
	const canonical = canonicalizeTitle(queryText);
	const tokens = normalized.split(" ").filter(Boolean);
	const nonStop = tokens.filter((token) => !["the", "a", "an", "of", "and", "for", "to", "in", "on", "at", "by", "with"].includes(token));
	const variants = [
		queryText,
		canonical,
		nonStop.slice(0, 4).join(" "),
		nonStop.slice(0, 3).join(" ")
	]
		.map((value) => String(value || "").trim())
		.filter(Boolean);
	return Array.from(new Set(variants));
}

function providerQueryVariants(queryText: string) {
	const variants = new Map<string, string>();
	for (const variant of expandedQueryVariants(queryText)) {
		const normalized = normalizeText(variant);
		if (!normalized || variants.has(normalized)) continue;
		variants.set(normalized, variant);
	}
	return Array.from(variants.values());
}

function normalizeSearchPhase(value: unknown): SearchPhase {
	const phase = String(value || "").trim().toLowerCase();
	if (phase === "local" || phase === "external") return phase;
	return "all";
}

function normalizeExternalSearchProvider(value: unknown): ExternalSearchProvider {
	const provider = String(value || "").trim().toLowerCase().replace(/[-\s]+/g, "_");
	if (provider === "google_books" || provider === "open_library") return provider;
	return "all";
}

function externalProviderFetchInit(requestSignal?: AbortSignal): RequestInit {
	if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
		const timeoutSignal = AbortSignal.timeout(EXTERNAL_PROVIDER_TIMEOUT_MS);
		if (requestSignal && typeof AbortSignal.any === "function") {
			return { signal: AbortSignal.any([requestSignal, timeoutSignal]) };
		}
		return { signal: timeoutSignal };
	}
	if (requestSignal) return { signal: requestSignal };
	return {};
}

function isRequestAborted(signal: AbortSignal | undefined) {
	return signal?.aborted === true;
}

function isTimeoutLikeError(error: unknown) {
	if (!(error instanceof Error)) return false;
	return /abort|timeout/i.test(error.name) || /abort|timeout/i.test(error.message);
}

async function withSearchTimeout<T>(label: string, timeoutMs: number, work: () => Promise<T>): Promise<T> {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	const timeoutPromise = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => {
			reject(new SearchTimeoutError(`${label} timed out after ${timeoutMs}ms`));
		}, Math.max(1, timeoutMs));
	});
	try {
		return await Promise.race([work(), timeoutPromise]);
	} finally {
		if (timeoutId) clearTimeout(timeoutId);
	}
}

function searchCacheKeyPart(value: unknown) {
	return normalizeText(String(value || "")).slice(0, 160) || "empty";
}

function parseExcludedBookIds(value: unknown) {
	return new Set(
		String(value || "")
			.split(",")
			.map((item) => Math.max(0, Number(item.trim()) || 0))
			.filter((id) => id > 0)
	);
}

function titleStem(value: string) {
	const tokens = canonicalizeTitle(value)
		.split(" ")
		.map((token) => token.trim())
		.filter(Boolean)
		.filter((token) => !["the", "a", "an", "of", "and", "for", "to", "in", "on", "at", "by", "with"].includes(token));
	return tokens.slice(0, 3).join(" ");
}

function isLikelyMatch(result: SearchResult, queryText: string) {
	const tokens = tokenizeQuery(queryText);
	if (tokens.length === 0) return true;
	const haystack = normalizeText([
		result.title,
		result.subtitle,
		...(Array.isArray(result.authors) ? result.authors : [])
	].join(" "));
	const strongTokens = tokens.filter((token) => token.length >= 4);
	if (strongTokens.length > 0) {
		return strongTokens.some((token) => haystack.includes(token));
	}
	return tokens.some((token) => haystack.includes(token));
}

function passesQualityGate(result: SearchResult) {
	const title = String(result.title || "").trim();
	const hasCover = !!String(result.thumbnail || "").trim();
	const hasDescription = !!String(result.description || "").trim();
	const hasIdentifier = !!String(result.isbn13 || result.isbn10 || result.googleBooksId || "").trim();
	// Keep this intentionally permissive: only drop extreme low-signal records.
	if (!hasCover && !hasDescription && !hasIdentifier && title.length > 220) return false;
	return true;
}

function formatSeriesSearchLabel(seriesName: string, bookOrder: number) {
	const name = String(seriesName || "").trim();
	if (!name) return "";
	const order = Number(bookOrder || 0);
	return order > 0 ? `${name} • Book ${order}` : name;
}

function dedupeVariants(input: SearchResult[], queryText: string) {
	const grouped = new Map<string, SearchResult[]>();
	for (const [index, result] of input.entries()) {
		const catalogBookId = Number(result.bookId || 0) || 0;
		const authors = Array.isArray(result.authors) ? result.authors : [];
		const primaryAuthor = authors[0] || "";
		const canonicalTitle = canonicalizeTitle(result.title);
		const stem = titleStem(result.title);
		const canonicalAuthor = canonicalizeAuthor(primaryAuthor);
		const isbnGroup = String(result.isbn13 || result.isbn10 || "").trim();
		const googleGroup = String(result.googleBooksId || "").trim();
		const workGroup = stem
			? `work:${stem}|${canonicalAuthor}`
			: (canonicalTitle ? `work:${canonicalTitle}|${canonicalAuthor}` : "");
		const key = catalogBookId > 0
			? `catalog:${catalogBookId}`
			: (workGroup || (isbnGroup
			? `isbn:${isbnGroup}`
			: (googleGroup ? `gid:${googleGroup}` : `ungrouped_${index}`)));
		const existing = grouped.get(key) || [];
		existing.push(result);
		grouped.set(key, existing);
	}

	const deduped: SearchResult[] = [];
	for (const items of grouped.values()) {
		const sorted = [...items].sort((a, b) => scoreResult(b, queryText) - scoreResult(a, queryText));
		const seenVariantKeys = new Set<string>();
		const variants = sorted.map((item) => toVariant(item)).filter((variant) => {
			const key = [
				normalizeText(variant.googleBooksId),
				normalizeText(variant.isbn13 || variant.isbn10),
				canonicalizeTitle(variant.title),
				canonicalizeAuthor(variant.author),
				normalizeText(variant.format),
				normalizeText(variant.language),
				normalizeText(variant.publishedDate),
				normalizedCoverKey(variant.thumbnail)
			].join("|");
			if (seenVariantKeys.has(key)) return false;
			seenVariantKeys.add(key);
			return true;
		});
		const best = { ...sorted[0], variantCount: variants.length, variants };
		const seriesCarrier = sorted.find((item) => item.seriesName || item.seriesBookOrder || item.seriesLabel);
		if (seriesCarrier) {
			best.seriesName ||= seriesCarrier.seriesName;
			best.seriesBookOrder ||= seriesCarrier.seriesBookOrder;
			best.seriesLabel ||= seriesCarrier.seriesLabel;
		}
		deduped.push(best);
	}

	const sorted = deduped.sort((a, b) => scoreResult(b, queryText) - scoreResult(a, queryText));

	// Second-pass merge for near-duplicate editions that differ only by subtitle expansion.
	const merged: SearchResult[] = [];
	for (const candidate of sorted) {
		const candidateAuthors = Array.isArray(candidate.authors) ? candidate.authors : [];
		const candidateAuthor = canonicalizeAuthor(candidateAuthors[0] || "");
		const candidateTitle = canonicalizeTitle(candidate.title);
		const candidateStem = titleStem(candidate.title);
		let matched = false;
		for (let i = 0; i < merged.length; i += 1) {
			const existing = merged[i];
			if (Number(candidate.bookId || 0) > 0 && Number(existing.bookId || 0) > 0 && Number(candidate.bookId || 0) !== Number(existing.bookId || 0)) continue;
			const existingAuthors = Array.isArray(existing.authors) ? existing.authors : [];
			const existingAuthor = canonicalizeAuthor(existingAuthors[0] || "");
			if (!candidateAuthor || !existingAuthor || candidateAuthor !== existingAuthor) continue;
			const existingTitle = canonicalizeTitle(existing.title);
			const existingStem = titleStem(existing.title);
			const sameStem = candidateStem && existingStem && candidateStem === existingStem;
			const titleContains = candidateTitle && existingTitle && (
				candidateTitle.includes(existingTitle) || existingTitle.includes(candidateTitle)
			);
			if (sameStem || titleContains) {
				// Keep the higher-scored representative (already ordered), optionally backfill missing fields.
				const representative = existing;
				if (!representative.thumbnail && candidate.thumbnail) representative.thumbnail = candidate.thumbnail;
				if (!representative.description && candidate.description) representative.description = candidate.description;
				if (!representative.pageCount && candidate.pageCount) representative.pageCount = candidate.pageCount;
				if (!representative.publisher && candidate.publisher) representative.publisher = candidate.publisher;
				if (!representative.seriesName && candidate.seriesName) representative.seriesName = candidate.seriesName;
				if (!representative.seriesBookOrder && candidate.seriesBookOrder) representative.seriesBookOrder = candidate.seriesBookOrder;
				if (!representative.seriesLabel && candidate.seriesLabel) representative.seriesLabel = candidate.seriesLabel;
				matched = true;
				break;
			}
		}
		if (!matched) merged.push(candidate);
	}

	return merged;
}

function openLibraryId(value: unknown, suffix: "W" | "M") {
	const match = String(value || "").match(new RegExp(`OL[0-9A-Z]+${suffix}`, "i"));
	return match ? match[0] : "";
}

function publishedYear(value: unknown) {
	const match = String(value || "").match(/\d{4}/);
	const year = match ? Number(match[0]) : 0;
	return Number.isFinite(year) && year > 0 ? year : null;
}

function catalogSourcesForResult(result: SearchResult): CatalogSourceInput[] {
	const sources: CatalogSourceInput[] = [];
	if (result.googleBooksId) {
		sources.push({
			source: "google_books",
			sourceWorkId: result.googleBooksId,
			sourceUrl: `https://books.google.com/books?id=${encodeURIComponent(result.googleBooksId)}`
		});
	}
	if (result.source === "open_library" && (result.sourceWorkId || result.sourceEditionId)) {
		sources.push({
			source: "open_library",
			sourceWorkId: result.sourceWorkId || "",
			sourceEditionId: result.sourceEditionId || "",
			sourceUrl: result.sourceWorkId ? `https://openlibrary.org/works/${encodeURIComponent(result.sourceWorkId)}` : ""
		});
	}
	return sources;
}

export const GET: APIRoute = async ({ request, url }) => {
	const query = String(url.searchParams.get("q") || "").trim();
	const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
	const pageSize = Math.min(40, Math.max(10, Number(url.searchParams.get("pageSize") || 20) || 20));
	const phase = normalizeSearchPhase(url.searchParams.get("mode"));
	const externalProviderFilter = normalizeExternalSearchProvider(url.searchParams.get("provider"));
	const excludedBookIds = parseExcludedBookIds(url.searchParams.get("excludeBookIds"));
	const requestSignal = request.signal;
	if (!query) {
		return new Response(JSON.stringify({ results: [], hasMore: false }), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		});
	}

	const startIndex = (page - 1) * pageSize;
	const apiKey = String(import.meta.env.GOOGLE_BOOKS_API_KEY || "").trim();
	const perfStartedAt = performance.now();
	const perfStages: Record<string, number> = {};
	const perfSpanDurations: PerformanceSpanInput[] = [];
	let providerTimeoutCount = 0;
	let localTimeoutCount = 0;
	let canonicalTimeoutCount = 0;
	let canonicalCandidateCount = 0;
	let canonicalResolvedCount = 0;
	let canonicalDbQueryCount = 0;
	let canonicalDogEaredCandidateCount = 0;
	let canonicalComparisonCount = 0;
	let canonicalCacheHits = 0;
	let canonicalCacheMisses = 0;
	let canonicalCandidateSetTruncated = false;
	let reconciliationInputCount = 0;
	let reconciliationOutputCount = 0;
	let reconciliationGroupsMerged = 0;
	let reconciliationProviderGroupsMerged = 0;
	let reconciliationIdentifierMergeCount = 0;
	let reconciliationMetadataMergeCount = 0;
	let reconciliationEditionVariantCount = 0;
	let reconciliationFalseMergeGuardCount = 0;
	const providerTimeouts = new Set<string>();
	const markPerfStage = (stage: string) => {
		perfStages[stage] = Math.round((performance.now() - perfStartedAt) * 10) / 10;
	};
	const recordSearchSpan = (name: string, durationMs: number, startMs?: number, parentName?: string) => {
		perfSpanDurations.push({
			name,
			durationMs: Math.round(Math.max(0, durationMs) * 10) / 10,
			...(Number.isFinite(startMs) && Number(startMs) >= 0 ? { startMs: Math.round(Number(startMs) * 10) / 10 } : {}),
			...(parentName ? { parentName } : {})
		});
	};
	const measureSearchSpan = async <T>(name: string, work: () => Promise<T>) => {
		const startedAt = performance.now();
		try {
			return await work();
		} finally {
			recordSearchSpan(name, performance.now() - startedAt, startedAt - perfStartedAt);
		}
	};
	const measureSearchSpanSync = <T>(name: string, work: () => T) => {
		const startedAt = performance.now();
		try {
			return work();
		} finally {
			recordSearchSpan(name, performance.now() - startedAt, startedAt - perfStartedAt);
		}
	};
	const rememberReconciliationMetrics = (payload: ReconciledSearchResults) => {
		reconciliationInputCount += payload.metrics.inputCount;
		reconciliationOutputCount += payload.metrics.outputCount;
		reconciliationGroupsMerged += payload.metrics.groupsMerged;
		reconciliationProviderGroupsMerged += payload.metrics.providerGroupsMerged;
		reconciliationIdentifierMergeCount += payload.metrics.identifierMergeCount;
		reconciliationMetadataMergeCount += payload.metrics.metadataMergeCount;
		reconciliationEditionVariantCount += payload.metrics.editionVariantCount;
		reconciliationFalseMergeGuardCount += payload.metrics.falseMergeGuardCount;
		return payload.results;
	};
	const logPerf = (outcome: string, extra: Record<string, unknown> = {}) => {
		if (!import.meta.env.DEV) return;
		console.info("[perf.search.books]", {
			query,
			page,
			pageSize,
			externalProviderFilter,
			outcome,
			totalMs: Math.round((performance.now() - perfStartedAt) * 10) / 10,
			stages: perfStages,
			spans: perfSpanDurations,
			...extra
		});
	};
	const recordSearchPerformance = (outcome: "success" | "error", extra: Record<string, unknown> = {}) => {
		recordPerformanceEventSafe(getNeonSql(), {
			operationName: "search.books",
			route: "/api/books/search",
			totalMs: performance.now() - perfStartedAt,
			success: outcome === "success",
			httpStatus: outcome === "success" ? 200 : 500,
			spans: perfSpanDurations.length > 0 ? perfSpanDurations : perfStages,
			metadata: {
				page,
				pageSize,
				phase,
				provider: externalProviderFilter,
				providerTimeoutCount,
				providerTimeouts: Array.from(providerTimeouts).join(","),
				localTimeoutCount,
				canonicalCandidateCount,
				canonicalResolvedCount,
				canonicalTimeoutCount,
				canonicalDbQueryCount,
				canonicalDogEaredCandidateCount,
				canonicalComparisonCount,
				canonicalCacheHits,
				canonicalCacheMisses,
				canonicalCandidateSetTruncated,
				reconciliationInputCount,
				reconciliationOutputCount,
				reconciliationGroupsMerged,
				reconciliationProviderGroupsMerged,
				reconciliationIdentifierMergeCount,
				reconciliationMetadataMergeCount,
				reconciliationEditionVariantCount,
				reconciliationFalseMergeGuardCount,
				timeout: providerTimeoutCount > 0 || localTimeoutCount > 0 || canonicalTimeoutCount > 0,
				clientAborted: isRequestAborted(requestSignal),
				retryCount: 0,
				...extra
			}
		});
	};

	try {
			const sql = getNeonSql();
			const fetchGoogleItems = async (q: string) => {
				if (!apiKey) return [] as any[];
				const providerStartedAt = performance.now();
				const params = new URLSearchParams({
					q,
					key: apiKey,
					maxResults: String(pageSize),
					startIndex: String(startIndex),
					printType: "books",
					orderBy: "relevance",
					langRestrict: "en"
				});
				try {
					if (isRequestAborted(requestSignal)) return [];
					const response = await fetch(`https://www.googleapis.com/books/v1/volumes?${params.toString()}`, externalProviderFetchInit(requestSignal));
					if (!response.ok) {
						recordPerformanceEventSafe(sql, {
							operationName: "external.google-books",
							route: "/api/books/search",
							totalMs: performance.now() - providerStartedAt,
							success: false,
							httpStatus: response.status,
							externalProvider: "google-books",
							metadata: { page, pageSize, resultCount: 0 }
						});
						return [];
					}
					const data = await response.json();
					const items = Array.isArray(data.items) ? data.items : [];
					recordPerformanceEventSafe(sql, {
						operationName: "external.google-books",
						route: "/api/books/search",
						totalMs: performance.now() - providerStartedAt,
						success: true,
						httpStatus: response.status,
						externalProvider: "google-books",
						metadata: { page, pageSize, resultCount: items.length }
					});
					return items;
				} catch (error) {
					const requestAborted = isRequestAborted(requestSignal);
					const timedOut = isTimeoutLikeError(error) && !requestAborted;
					if (timedOut) {
						providerTimeoutCount += 1;
						providerTimeouts.add("google-books");
					}
					recordPerformanceEventSafe(sql, {
						operationName: "external.google-books",
						route: "/api/books/search",
						totalMs: performance.now() - providerStartedAt,
						success: false,
						httpStatus: requestAborted ? 499 : (timedOut ? 408 : 0),
						externalProvider: "google-books",
						metadata: {
							page,
							pageSize,
							resultCount: 0,
							timeout: timedOut,
							clientAborted: requestAborted,
							errorType: requestAborted ? "client_abort" : (timedOut ? "timeout" : "provider_error"),
							retryCount: 0
						}
					});
					return [];
				}
			};

			const fetchOpenLibraryItems = async (q: string) => {
				const providerStartedAt = performance.now();
				const params = new URLSearchParams({
					q,
					limit: String(pageSize),
					offset: String(startIndex)
				});
				try {
					if (isRequestAborted(requestSignal)) return [] as any[];
					const response = await fetch(`https://openlibrary.org/search.json?${params.toString()}`, externalProviderFetchInit(requestSignal));
					if (!response.ok) {
						recordPerformanceEventSafe(sql, {
							operationName: "external.open-library",
							route: "/api/books/search",
							totalMs: performance.now() - providerStartedAt,
							success: false,
							httpStatus: response.status,
							externalProvider: "open-library",
							metadata: { page, pageSize, resultCount: 0 }
						});
						return [] as any[];
					}
					const payload = await response.json().catch(() => null) as { docs?: any[] } | null;
					const docs = Array.isArray(payload?.docs) ? payload.docs : [];
					recordPerformanceEventSafe(sql, {
						operationName: "external.open-library",
						route: "/api/books/search",
						totalMs: performance.now() - providerStartedAt,
						success: true,
						httpStatus: response.status,
						externalProvider: "open-library",
						metadata: { page, pageSize, resultCount: docs.length }
					});
					return docs;
				} catch (error) {
					const requestAborted = isRequestAborted(requestSignal);
					const timedOut = isTimeoutLikeError(error) && !requestAborted;
					if (timedOut) {
						providerTimeoutCount += 1;
						providerTimeouts.add("open-library");
					}
					recordPerformanceEventSafe(sql, {
						operationName: "external.open-library",
						route: "/api/books/search",
						totalMs: performance.now() - providerStartedAt,
						success: false,
						httpStatus: requestAborted ? 499 : (timedOut ? 408 : 0),
						externalProvider: "open-library",
						metadata: {
							page,
							pageSize,
							resultCount: 0,
							timeout: timedOut,
							clientAborted: requestAborted,
							errorType: requestAborted ? "client_abort" : (timedOut ? "timeout" : "provider_error"),
							retryCount: 0
						}
					});
					return [] as any[];
				}
			};

			const collectionResultsPromise = page === 1 && phase !== "external"
				? withRuntimeCache(
					`search:collections:${searchCacheKeyPart(query)}:${page}:4`,
					20_000,
					() => searchCollections(sql, query, 4)
				).then((collections): CollectionSearchResult[] => collections.map((collection) => ({
					title: collection.title,
				slug: collection.slug,
				subtitle: collection.subtitle,
				description: collection.description,
				heroImage: collection.heroImage,
				category: collection.category,
				bookCount: collection.bookCount,
				featured: collection.featured
			}))).catch(() => [])
				: Promise.resolve([] as CollectionSearchResult[]);
			const queryLike = `%${query}%`;
			const queryDigits = query.replace(/[^0-9Xx]/g, "").toUpperCase();
			const queryTokenPatterns = tokenizeQuery(query)
				.filter((token) => token.length >= 3)
				.slice(0, 8)
				.map((token) => `%${token}%`);
			const dbdRowsPromise = withRuntimeCache(
				`search:dbd:${searchCacheKeyPart(query)}:${page}:${pageSize}`,
				20_000,
				() => sql<Array<{
				id: number;
				author_id: number | null;
				title: string;
				primary_author: string;
				synopsis: string;
				published_year: number | null;
				language: string;
				cover_url: string;
				isbn10: string;
				isbn13: string;
				google_books_id: string;
				page_count: number;
				publisher: string;
				series_name: string;
				series_book_order: number;
			}>>`
				select
					b.id,
					b.author_id,
					coalesce(nullif(trim(b.title), ''), 'Untitled') as title,
					coalesce(nullif(trim(b.primary_author), ''), 'Unknown') as primary_author,
					coalesce(nullif(trim(b.synopsis), ''), '') as synopsis,
					b.published_year,
					coalesce(nullif(trim(b.language), ''), '') as language,
					coalesce(nullif(trim(be.cover_url), ''), nullif(trim(b.cover_url), ''), nullif(trim(bw.preferred_cover_url), ''), '') as cover_url,
					coalesce(nullif(trim(b.isbn10), ''), '') as isbn10,
					coalesce(nullif(trim(b.isbn13), ''), '') as isbn13,
					coalesce(nullif(trim(b.google_books_id), ''), '') as google_books_id,
					coalesce(nullif(trim(b.publisher), ''), '') as publisher,
					coalesce(s.name, '') as series_name,
					coalesce(sb.book_order, 0)::numeric as series_book_order,
					coalesce(nullif(b.page_count, 0), 0)::int as page_count
				from book b
				left join book_work bw on bw.id = b.work_id
				left join lateral (
					select cover_candidate.cover_url
					from book_edition cover_candidate
					where (cover_candidate.book_id = b.id or (b.work_id is not null and cover_candidate.work_id = b.work_id))
						and nullif(trim(cover_candidate.cover_url), '') is not null
					order by
						case when cover_candidate.book_id = b.id then 0 else 1 end,
						cover_candidate.updated_at desc,
						cover_candidate.id desc
					limit 1
				) be on true
				left join series_book sb on sb.book_id = b.id
				left join series s on s.id = sb.series_id
					where
						b.title ilike ${queryLike}
						or b.primary_author ilike ${queryLike}
						or s.name ilike ${queryLike}
						or (
							cardinality(${queryTokenPatterns}::text[]) > 1
							and (
								select count(*)
								from unnest(${queryTokenPatterns}::text[]) token_pattern
								where concat_ws(' ', b.title, b.primary_author, s.name) ilike token_pattern
							) = cardinality(${queryTokenPatterns}::text[])
						)
						or (${queryDigits} <> '' and (replace(coalesce(b.isbn13, ''), '-', '') = ${queryDigits} or replace(coalesce(b.isbn10, ''), '-', '') = ${queryDigits}))
					order by
						case
							when lower(coalesce(b.title, '')) = lower(${query}) then 0
							when lower(coalesce(b.title, '')) like lower(${`${query}%`}) then 1
							when lower(coalesce(b.primary_author, '')) = lower(${query}) then 2
							when lower(coalesce(s.name, '')) = lower(${query}) then 3
							when cardinality(${queryTokenPatterns}::text[]) > 1
								and (
									select count(*)
									from unnest(${queryTokenPatterns}::text[]) token_pattern
									where concat_ws(' ', b.title, b.primary_author, s.name) ilike token_pattern
								) = cardinality(${queryTokenPatterns}::text[]) then 4
							else 9
						end,
					b.updated_at desc,
					b.id desc
				limit ${pageSize}
					offset ${startIndex}
				`
			);

			const mapCatalogRows = (dbdRows: Awaited<typeof dbdRowsPromise>): SearchResult[] => dbdRows.map((row) => ({
				source: "dbd",
				title: row.title,
			subtitle: "",
			authors: [String(row.primary_author || "").trim()].filter(Boolean),
			description: row.synopsis || "",
			publisher: row.publisher || "",
			publishedDate: row.published_year ? String(row.published_year) : "",
			printType: "BOOK",
			pageCount: Number(row.page_count || 0) || null,
			categories: [],
			language: row.language || "",
			thumbnail: row.cover_url || "",
			isbn10: row.isbn10 || "",
			isbn13: row.isbn13 || "",
			googleBooksId: row.google_books_id || "",
			bookId: Number(row.id || 0) || 0,
			authorId: Number(row.author_id || 0) || 0,
			seriesName: String(row.series_name || "").trim(),
			seriesBookOrder: Number(row.series_book_order || 0) || 0,
				seriesLabel: formatSeriesSearchLabel(String(row.series_name || ""), Number(row.series_book_order || 0) || 0)
			}));

			const normalizeAndDedupe = (input: SearchResult[], source: string) => {
				const normalized = input
					.map((result, index) => normalizeSearchResult(result, { source, index, query }))
					.filter((result): result is SearchResult => !!result)
					.filter((result) => isLikelyMatch(result, query))
					.filter((result) => passesQualityGate(result));
				return rememberReconciliationMetrics(reconcileCanonicalSearchResults(normalized, query))
					.map((result, index) => normalizeSearchResult(result, { source: `${source}.reconciled`, index, query }))
					.filter((result): result is SearchResult => !!result);
			};

			const loadLocalResults = async () => {
				const localStartedAt = performance.now();
				const [dbdRows, collectionResults] = await Promise.all([
					withSearchTimeout("local catalog search", LOCAL_SEARCH_TIMEOUT_MS, () => dbdRowsPromise)
						.catch((error) => {
							if (error instanceof SearchTimeoutError) {
								localTimeoutCount += 1;
								return [] as Awaited<typeof dbdRowsPromise>;
							}
							throw error;
						}),
					withSearchTimeout("collection search", COLLECTION_SEARCH_TIMEOUT_MS, () => collectionResultsPromise)
						.catch((error) => {
							if (error instanceof SearchTimeoutError) {
								localTimeoutCount += 1;
								return [] as CollectionSearchResult[];
							}
							throw error;
						})
				]);
				recordSearchSpan("local catalog search", performance.now() - localStartedAt, localStartedAt - perfStartedAt);
				markPerfStage("local_catalog_loaded");
				const results = measureSearchSpanSync("rendering preparation", () => normalizeAndDedupe(mapCatalogRows(dbdRows), "api.books.search.local"));
				return {
					results,
					collectionResults,
					hasMore: dbdRows.length >= pageSize
				};
			};

			const loadExternalResults = async () => withRuntimeCache(
				`search:external-resolved:${externalProviderFilter}:${searchCacheKeyPart(query)}:${page}:${pageSize}`,
				30_000,
				async () => {
					const googleQueries = externalProviderFilter === "open_library" ? [] : providerQueryVariants(query);
					const googleFetchedSetsPromise = googleQueries.length > 0
						? measureSearchSpan("Google Books", () => Promise.all(
							googleQueries.map((q) => withRuntimeCache(
								`search:google:${searchCacheKeyPart(q)}:${page}:${pageSize}`,
								45_000,
								() => fetchGoogleItems(q)
							))
						))
						: Promise.resolve([] as any[][]);
					const openQueries = externalProviderFilter === "google_books" ? [] : providerQueryVariants(query);
					const openFetchedSetsPromise = openQueries.length > 0
						? measureSearchSpan("Open Library", () => Promise.all(
							openQueries.map((q) => withRuntimeCache(
								`search:openlibrary:${searchCacheKeyPart(q)}:${page}:${pageSize}`,
								45_000,
								() => fetchOpenLibraryItems(q)
							))
						))
						: Promise.resolve([] as any[][]);
					const [googleFetchedSets, openFetchedSets] = await Promise.all([
						googleFetchedSetsPromise,
						openFetchedSetsPromise
					]);
					if (isRequestAborted(requestSignal)) return { results: [] as SearchResult[], hasMore: false };
					markPerfStage("external_providers_loaded");
					const metadataStartedAt = performance.now();
					const byId = new Map<string, any>();
					for (const set of googleFetchedSets) {
						for (const item of Array.isArray(set) ? set : []) {
							const id = String(item?.id || "");
							if (!id) continue;
							if (!byId.has(id)) byId.set(id, item);
						}
					}
					const items = Array.from(byId.values());
					const googleMapped: SearchResult[] = items.map((item) => {
						const info = item.volumeInfo ?? {};
						const authors = Array.isArray(info.authors) ? info.authors : [];
						const inferredSeries = inferKnownSeriesMetadata({ title: info.title ?? "", author: authors[0] || "" });
						const title = normalizeRedundantSeriesTitle({
							title: info.title ?? "Untitled",
							seriesName: inferredSeries?.seriesName || "",
							bookOrder: inferredSeries?.bookOrder || 0
						}).title || "Untitled";
						const identifiers = Array.isArray(info.industryIdentifiers) ? info.industryIdentifiers : [];
						const isbn13 = String(
							(identifiers.find((entry) => String(entry?.type || "") === "ISBN_13")?.identifier || "")
						).replace(/[^0-9Xx]/g, "").toUpperCase();
						const isbn10 = String(
							(identifiers.find((entry) => String(entry?.type || "") === "ISBN_10")?.identifier || "")
						).replace(/[^0-9Xx]/g, "").toUpperCase();
						return {
							source: "google_books",
							title,
							subtitle: info.subtitle ?? "",
							authors,
							description: info.description ?? "",
							publisher: info.publisher ?? "",
							publishedDate: info.publishedDate ?? "",
							printType: info.printType ?? "",
							pageCount: typeof info.pageCount === "number" ? info.pageCount : null,
							categories: Array.isArray(info.categories) ? info.categories : [],
							language: info.language ?? "",
							thumbnail: googleBooksCoverUrl(info.imageLinks, "card"),
							isbn10,
							isbn13,
							googleBooksId: String(item?.id || "").trim(),
							sourceWorkId: String(item?.id || "").trim(),
							sourceEditionId: "",
							seriesName: inferredSeries?.seriesName || "",
							seriesBookOrder: inferredSeries?.bookOrder || 0,
							seriesLabel: formatSeriesSearchLabel(inferredSeries?.seriesName || "", inferredSeries?.bookOrder || 0)
						};
					});
					const openByWork = new Map<string, any>();
					for (const set of openFetchedSets) {
						for (const doc of Array.isArray(set) ? set : []) {
							const key = String(doc?.key || "").trim() || [
								normalizeText(doc?.title),
								normalizeText(Array.isArray(doc?.author_name) ? doc.author_name[0] : ""),
								normalizeText(Array.isArray(doc?.isbn) ? doc.isbn[0] : "")
							].join("|");
							if (!openByWork.has(key)) openByWork.set(key, doc);
						}
					}
					const openItems = Array.from(openByWork.values());
					const openLibraryMapped: SearchResult[] = openItems.map((doc) => {
						const authorNames = Array.isArray(doc?.author_name) ? doc.author_name.map((v: unknown) => String(v || "").trim()).filter(Boolean) : [];
						const inferredSeries = inferKnownSeriesMetadata({ title: doc?.title || "", author: authorNames[0] || "" });
						const title = normalizeRedundantSeriesTitle({
							title: doc?.title || "Untitled",
							seriesName: inferredSeries?.seriesName || "",
							bookOrder: inferredSeries?.bookOrder || 0
						}).title || "Untitled";
						const isbns = Array.isArray(doc?.isbn) ? doc.isbn.map((v: unknown) => String(v || "").replace(/[^0-9Xx]/g, "").toUpperCase()).filter(Boolean) : [];
						const isbn13 = isbns.find((value: string) => value.length === 13) || "";
						const isbn10 = isbns.find((value: string) => value.length === 10) || "";
						const coverId = Number(doc?.cover_i || 0) || 0;
						const pageCount = Number(doc?.number_of_pages_median || 0) || 0;
						const sourceWorkId = openLibraryId(doc?.key, "W");
						const editionKeys = Array.isArray(doc?.edition_key) ? doc.edition_key : [];
						const sourceEditionId = openLibraryId(editionKeys[0] || "", "M");
						return {
							source: "open_library",
							title,
							subtitle: "",
							authors: authorNames,
							description: "",
							publisher: Array.isArray(doc?.publisher) ? String(doc.publisher[0] || "").trim() : "",
							publishedDate: doc?.first_publish_year ? String(doc.first_publish_year) : "",
							printType: "BOOK",
							pageCount: pageCount > 0 ? pageCount : null,
							categories: Array.isArray(doc?.subject) ? doc.subject.slice(0, 5).map((v: unknown) => String(v || "").trim()).filter(Boolean) : [],
							language: Array.isArray(doc?.language) ? String(doc.language[0] || "").trim() : "",
							thumbnail: coverId > 0 ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : "",
							isbn10,
							isbn13,
							googleBooksId: "",
							sourceWorkId,
							sourceEditionId,
							seriesName: inferredSeries?.seriesName || "",
							seriesBookOrder: inferredSeries?.bookOrder || 0,
							seriesLabel: formatSeriesSearchLabel(inferredSeries?.seriesName || "", inferredSeries?.bookOrder || 0)
						};
					});

					const mapped = [...googleMapped, ...openLibraryMapped]
						.map((result, index) => normalizeSearchResult(result, { source: "api.books.search.external", index, query }))
						.filter((result): result is SearchResult => !!result)
						.filter((result) => isLikelyMatch(result, query))
						.filter((result) => passesQualityGate(result));
					recordSearchSpan("provider normalization", performance.now() - metadataStartedAt, metadataStartedAt - perfStartedAt);
					if (isRequestAborted(requestSignal)) return { results: [] as SearchResult[], hasMore: false };
					const preCanonicalPayload = measureSearchSpanSync("metadata merge", () => reconcileCanonicalSearchResults(mapped, query));
					const canonicalCandidates = rememberReconciliationMetrics(preCanonicalPayload)
						.slice(0, Math.max(pageSize, MAX_CANONICAL_MATCH_CANDIDATES))
						.map((result, index) => normalizeSearchResult(result, { source: "api.books.search.precatalog", index, query }))
						.filter((result): result is SearchResult => !!result);
					canonicalCandidateCount = canonicalCandidates.length;

					const canonicalInputs = canonicalCandidates.map((item): { item: SearchResult; cacheKey: string; lookup: CatalogBookLookupInput } => {
						const authors = Array.isArray(item.authors) ? item.authors : [];
						const inferredSeries = item.seriesName ? null : inferKnownSeriesMetadata({ title: item.title, author: authors[0] || "" });
						const seriesName = item.seriesName || inferredSeries?.seriesName || "";
						const seriesBookOrder = Number(item.seriesBookOrder || 0) > 0
							? Number(item.seriesBookOrder || 0)
							: (inferredSeries?.bookOrder || 0);
						const title = normalizeRedundantSeriesTitle({
							title: item.title,
							seriesName,
							bookOrder: seriesBookOrder
						}).title || item.title;
						const cacheKey = [
							item.googleBooksId || "",
							item.source || "",
							item.sourceWorkId || "",
							item.sourceEditionId || "",
							item.isbn13 || "",
							item.isbn10 || "",
							title,
							authors[0] || "",
							seriesName,
							seriesBookOrder
						].join("|");
						return {
							item,
							cacheKey,
							lookup: {
								title,
								author: authors[0] || "",
								isbn10: item.isbn10,
								isbn13: item.isbn13,
								googleBooksId: item.googleBooksId,
								sources: catalogSourcesForResult(item),
								seriesName,
								seriesBookOrder,
								pageCount: item.pageCount,
								publishedYear: publishedYear(item.publishedDate)
							}
						};
					});
					let canonicalResolutions: Awaited<ReturnType<typeof resolveCanonicalCatalogWorksForSearch>> | null = null;
					const canonicalMatchingStartedAt = performance.now();
					try {
						canonicalResolutions = await withSearchTimeout("canonical Work matching", CANONICAL_MATCH_TIMEOUT_MS, () => resolveCanonicalCatalogWorksForSearch(
							sql,
							canonicalInputs.map(({ cacheKey, lookup }) => ({ ...lookup, cacheKey })),
							{
								skipSchemaBackfill: true,
								maxDatabaseCandidates: Math.max(80, MAX_CANONICAL_MATCH_CANDIDATES * 8)
							}
						));
					} catch (error) {
						if (error instanceof SearchTimeoutError) {
							canonicalTimeoutCount += canonicalInputs.length;
						} else {
							throw error;
						}
					} finally {
						recordSearchSpan("canonical Work matching", performance.now() - canonicalMatchingStartedAt, canonicalMatchingStartedAt - perfStartedAt);
					}
					if (canonicalResolutions) {
						canonicalDbQueryCount = canonicalResolutions.metrics.dbQueryCount;
						canonicalDogEaredCandidateCount = canonicalResolutions.metrics.dogEaredCandidateCount;
						canonicalComparisonCount = canonicalResolutions.metrics.candidateComparisons;
						canonicalCacheHits = canonicalResolutions.metrics.cacheHits;
						canonicalCacheMisses = canonicalResolutions.metrics.cacheMisses;
						canonicalCandidateSetTruncated = canonicalResolutions.metrics.truncatedCandidateSet;
						canonicalResolvedCount = canonicalResolutions.resolutions.size;
						for (const span of canonicalResolutions.spans) {
							const childStart = Number.isFinite(span.startMs)
								? (canonicalMatchingStartedAt - perfStartedAt) + Number(span.startMs)
								: undefined;
							recordSearchSpan(`canonical ${span.name}`, span.durationMs, childStart, "canonical Work matching");
						}
					}
					const resolveSearchResult = ({ item, cacheKey, lookup }: { item: SearchResult; cacheKey: string; lookup: CatalogBookLookupInput }) => {
						const authors = Array.isArray(item.authors) ? item.authors : [];
						const resolution = canonicalResolutions?.resolutions.get(cacheKey) || null;
						const seriesName = String(lookup.seriesName || "");
						const seriesBookOrder = Number(lookup.seriesBookOrder || 0) || 0;
						const title = String(lookup.title || item.title);
						const resolvedSeriesName = resolution?.seriesName || seriesName;
						const resolvedSeriesBookOrder = Number(resolution?.seriesBookOrder || 0) || seriesBookOrder;
						const resolvedAuthor = resolution?.author || authors[0] || "";
						return {
							...item,
							title: resolution?.title || title,
							authors: resolvedAuthor ? [resolvedAuthor] : authors,
							description: resolution?.description || item.description,
							thumbnail: resolution?.coverUrl || item.thumbnail,
							bookId: resolution?.bookId || Number(item.bookId || 0) || 0,
							authorId: resolution?.authorId || Number(item.authorId || 0) || 0,
							isbn10: item.isbn10 || resolution?.isbn10 || "",
							isbn13: item.isbn13 || resolution?.isbn13 || "",
							googleBooksId: item.googleBooksId || resolution?.googleBooksId || "",
							pageCount: item.pageCount || resolution?.pageCount || null,
							publishedDate: item.publishedDate || (resolution?.publishedYear ? String(resolution.publishedYear) : ""),
							seriesName: resolvedSeriesName,
							seriesBookOrder: resolvedSeriesBookOrder,
							seriesLabel: item.seriesLabel || formatSeriesSearchLabel(resolvedSeriesName, resolvedSeriesBookOrder)
						};
					};
					const mappedWithIds = measureSearchSpanSync("rendering preparation", () => canonicalInputs.map(resolveSearchResult))
						.map((result, index) => normalizeSearchResult(result, { source: "api.books.search.catalog", index, query }))
						.filter((result): result is SearchResult => !!result);
					markPerfStage("canonical_resolution_complete");
					const results = measureSearchSpanSync("result ranking", () => rememberReconciliationMetrics(reconcileCanonicalSearchResults(mappedWithIds, query))
						.map((result, index) => normalizeSearchResult(result, { source: "api.books.search.dedupe", index, query }))
						.filter((result): result is SearchResult => !!result));
					return {
						results,
						hasMore: items.length >= pageSize || openItems.length >= pageSize
					};
				}
			);

			const localPayload = phase !== "external" ? await loadLocalResults() : {
				results: [] as SearchResult[],
				collectionResults: [] as CollectionSearchResult[],
				hasMore: false
			};

			if (phase === "local") {
				void resolveUserBySession(request)
					.catch(() => null)
					.then((session) => recordProductAnalyticsEventSafe(sql, {
						eventName: "search_performed",
						eventGroup: "search",
						userId: session?.userId || "",
						route: "/search",
						source: "book_search",
						subjectType: classifySearchAnalyticsSubject({ query, results: localPayload.results }),
						query,
						resultCount: localPayload.results.length + localPayload.collectionResults.length,
						metadata: {
							page,
							phase,
							hasCollections: localPayload.collectionResults.length > 0,
							hasMore: localPayload.hasMore
						}
					}))
					.catch(() => undefined);
				markPerfStage("analytics_queued");
				logPerf("success", {
					phase,
					resultCount: localPayload.results.length,
					collectionCount: localPayload.collectionResults.length,
					hasMore: localPayload.hasMore
				});
				recordSearchPerformance("success", {
					resultCount: localPayload.results.length,
					collectionCount: localPayload.collectionResults.length,
					hasMore: localPayload.hasMore,
					partial: true
				});
				return new Response(JSON.stringify({
					results: localPayload.results,
					collectionResults: localPayload.collectionResults,
					hasMore: localPayload.hasMore,
					page,
					phase,
					partial: true
				}), {
					status: 200,
					headers: {
						"Content-Type": "application/json",
						"Cache-Control": createPublicCacheControl(15, 60)
					}
				});
			}

			const externalPayload = await loadExternalResults();
			const excluded = new Set([
				...excludedBookIds,
				...(phase === "all" ? localPayload.results.map((result) => Number(result.bookId || 0)).filter((id) => id > 0) : [])
			]);
			const externalResults = externalPayload.results.filter((result) => {
				const bookId = Number(result.bookId || 0) || 0;
				return !(bookId > 0 && excluded.has(bookId));
			});
			const results = measureSearchSpanSync("rendering preparation", () => phase === "external"
				? externalResults
				: rememberReconciliationMetrics(reconcileCanonicalSearchResults([...localPayload.results, ...externalResults], query))
					.map((result, index) => normalizeSearchResult(result, { source: "api.books.search.final", index, query }))
					.filter((result): result is SearchResult => !!result));
			const collectionResults = localPayload.collectionResults;
			markPerfStage("results_merged");
			const hasMore = localPayload.hasMore || externalPayload.hasMore;
			if (phase !== "external") {
				void resolveUserBySession(request)
					.catch(() => null)
					.then((session) => recordProductAnalyticsEventSafe(sql, {
						eventName: "search_performed",
						eventGroup: "search",
						userId: session?.userId || "",
						route: "/search",
						source: "book_search",
						subjectType: classifySearchAnalyticsSubject({ query, results }),
						query,
						resultCount: results.length + collectionResults.length,
						metadata: {
							page,
							phase,
							hasCollections: collectionResults.length > 0,
							hasMore
						}
					}))
					.catch(() => undefined);
				markPerfStage("analytics_queued");
			}
			logPerf("success", {
				phase,
				resultCount: results.length,
				collectionCount: collectionResults.length,
				hasMore
			});
			recordSearchPerformance("success", {
				resultCount: results.length,
				collectionCount: collectionResults.length,
				hasMore,
				partial: false
			});
			return new Response(JSON.stringify({ results, collectionResults, hasMore, page, phase, partial: false }), {
				status: 200,
				headers: {
					"Content-Type": "application/json",
					"Cache-Control": createPublicCacheControl(30, 120)
				}
			});
		} catch (error) {
			logPerf("error", { error: error instanceof Error ? error.message : "Unknown error" });
			recordSearchPerformance("error", { resultCount: 0, collectionCount: 0 });
			return new Response(JSON.stringify({ results: [], hasMore: false }), {
				status: 200,
				headers: { "Content-Type": "application/json" }
			});
		}
	};
