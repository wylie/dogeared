import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("admin dashboard and users pages require admin session", () => {
	for (const path of ["src/pages/admin.astro", "src/pages/admin/users.astro", "src/pages/admin/users/[username].astro"]) {
		const source = readFileSync(path, "utf8");
		assert.equal(source.includes("resolveAdminSession"), true);
		assert.equal(source.includes("if (!admin.isAdmin) return Astro.redirect(\"/\")"), true);
		assert.equal(source.includes('robots="noindex,nofollow"'), true);
	}
});

test("admin overview displays real site statistics and quick links", () => {
	const page = readFileSync("src/pages/admin.astro", "utf8");
	const data = readFileSync("src/lib/adminData.ts", "utf8");
	for (const label of [
		"Total books",
		"Total authors",
		"Total users",
		"Total shelf entries",
		"Total reviews",
		"Total comments",
		"Currently Reading",
		"Completed books"
	]) {
		assert.equal(page.includes(label), true);
	}
	assert.equal(page.includes('href: "/admin/data-health"'), true);
	assert.equal(page.includes('href: "/admin/users"'), true);
	assert.equal(page.includes('href: "/metrics"'), true);
	assert.equal(page.includes('href: "/roadmap"'), true);
	assert.equal(data.includes("loadAdminOverviewStats"), true);
	assert.equal(data.includes("from user_activity_comment"), true);
});

test("admin users support search, detail counts, and safe deletion", () => {
	const list = readFileSync("src/pages/admin/users.astro", "utf8");
	const detail = readFileSync("src/pages/admin/users/[username].astro", "utf8");
	const data = readFileSync("src/lib/adminData.ts", "utf8");
	assert.equal(list.includes('name="q"'), true);
	assert.equal(data.includes("searchAdminUsers"), true);
	assert.equal(data.includes("lower(coalesce(u.email, '')) like"), true);
	assert.equal(detail.includes('name="confirmUsername"'), true);
	assert.equal(detail.includes("Admins cannot delete their own account"), true);
	assert.equal(detail.includes("window.confirm"), true);
	assert.equal(data.includes("targetId === actorId"), true);
	assert.equal(data.includes("sql.transaction"), true);
	assert.equal(data.includes("delete from auth_session"), true);
	assert.equal(data.includes("delete from user_book"), true);
	assert.equal(data.includes("delete from app_user"), true);
	assert.equal(data.includes("password"), false);
	assert.equal(data.includes("token_hash text not null unique"), true);
});

test("custom shelf dropdown options match built-in option styling", () => {
	const source = readFileSync("src/components/ShelfDropdown.astro", "utf8");
	assert.equal(source.includes(".shelf-menu [data-custom-shelf-options]"), true);
	assert.equal(source.includes("display: contents"), true);
	assert.equal(source.includes("background: transparent !important"), true);
	assert.equal(source.includes("box-shadow: none"), true);
});

test("temporary feedback messages avoid layout shifts and announce status", () => {
	const rating = readFileSync("src/components/RatingControl.astro", "utf8");
	const shelf = readFileSync("src/components/ShelfDropdown.astro", "utf8");
	const index = readFileSync("src/pages/index.astro", "utf8");
	const book = readFileSync("src/pages/book.astro", "utf8");
	const following = readFileSync("src/pages/following.astro", "utf8");
	const profile = readFileSync("src/pages/profile/[username].astro", "utf8");
	assert.equal(rating.includes('role="status" aria-live="polite"'), true);
	assert.equal(rating.includes(".rating-feedback[hidden]"), true);
	assert.equal(rating.includes("min-height: 1rem"), true);
	assert.equal(shelf.includes('role="status" aria-live="polite"'), true);
	assert.equal(shelf.includes("position: absolute"), true);
	for (const source of [index, book, following, profile]) {
		assert.equal(source.includes('role="status" aria-live="polite"'), true);
		assert.equal(source.includes("[hidden]"), true);
		assert.equal(source.includes("visibility: hidden"), true);
	}
});
