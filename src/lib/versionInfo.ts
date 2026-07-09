export function resolveAppVersion() {
	const raw = String(import.meta.env.PUBLIC_APP_VERSION || import.meta.env.npm_package_version || "0.1.1").trim();
	const version = raw.startsWith("v") ? raw : `v${raw}`;
	return version.includes("beta") ? version : `${version}-beta`;
}

export function resolveGitCommit() {
	return String(
		import.meta.env.VERCEL_GIT_COMMIT_SHA
		|| import.meta.env.PUBLIC_GIT_COMMIT
		|| import.meta.env.GIT_COMMIT
		|| ""
	).trim();
}
