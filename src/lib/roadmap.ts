export type RoadmapCategory = "now" | "next" | "later" | "completed";

export type RoadmapStatus = "In Progress" | "Planning" | "Research" | "Future" | "Completed";

export type RoadmapItem = {
	title: string;
	description: string;
	status: RoadmapStatus;
	category: RoadmapCategory;
	priority?: "Primary" | "High" | "Medium" | "Low";
};

export const ROADMAP_ITEMS: RoadmapItem[] = [
	{
		title: "Better reviews and discussion",
		description: "Make reviews feel more useful, more personal, and easier to discuss with readers you trust.",
		status: "In Progress",
		category: "now",
		priority: "Primary"
	},
	{
		title: "Import quality improvements",
		description: "Make moving a reading history into DogEared more reliable, cleaner, and easier to trust.",
		status: "In Progress",
		category: "now",
		priority: "High"
	},
	{
		title: "Performance and accessibility polishing",
		description: "Keep the app fast, readable, keyboard-friendly, and comfortable across everyday reading workflows.",
		status: "In Progress",
		category: "now",
		priority: "High"
	},
	{
		title: "UI modernization",
		description: "Continue refining the interface so books stay central and the product feels calm, polished, and familiar.",
		status: "In Progress",
		category: "now",
		priority: "Medium"
	},
	{
		title: "DNF shelf",
		description: "Make it possible to stop reading a book cleanly without treating it as unfinished progress.",
		status: "Planning",
		category: "next",
		priority: "High"
	},
	{
		title: "Better search",
		description: "Make it dramatically easier to find books, authors, shelves, and reading history.",
		status: "Planning",
		category: "next",
		priority: "High"
	},
	{
		title: "Discovery refinements",
		description: "Deepen transparent community discovery and editorial browsing without opaque engagement algorithms.",
		status: "Planning",
		category: "next",
		priority: "High"
	},
	{
		title: "Mobile experience improvements",
		description: "Make common reading actions faster and more comfortable on smaller screens.",
		status: "Planning",
		category: "next",
		priority: "High"
	},
	{
		title: "Author improvements",
		description: "Make author pages richer, cleaner, and more helpful when readers want to explore a body of work.",
		status: "Planning",
		category: "next",
		priority: "Medium"
	},
	{
		title: "Reading groups and buddy reads",
		description: "Support small, intentional reading circles for people who want to read together at their own pace.",
		status: "Future",
		category: "later",
		priority: "Medium"
	},
	{
		title: "Book clubs",
		description: "Give groups a simple home for selections, timelines, discussion, and shared reading history.",
		status: "Future",
		category: "later",
		priority: "Medium"
	},
	{
		title: "Public reading challenges",
		description: "Let readers join thoughtful challenges that encourage exploration without leaderboard pressure.",
		status: "Future",
		category: "later",
		priority: "Low"
	},
	{
		title: "Reading lists",
		description: "Make it easy to create and share curated lists for moods, themes, genres, and trusted recommendations.",
		status: "Future",
		category: "later",
		priority: "Medium"
	},
	{
		title: "API and integrations",
		description: "Open the door for personal tools, backups, automations, and connections to other reading workflows.",
		status: "Future",
		category: "later",
		priority: "Low"
	},
	{
		title: "Email digests",
		description: "Send occasional, useful summaries of follows, reviews, and books worth noticing.",
		status: "Future",
		category: "later",
		priority: "Low"
	},
	{
		title: "Additional import sources",
		description: "Help more readers bring their existing libraries with them from other services.",
		status: "Future",
		category: "later",
		priority: "Medium"
	},
	{
		title: "Native mobile apps",
		description: "Explore dedicated mobile apps once the core web experience is mature enough to carry them well.",
		status: "Future",
		category: "later",
		priority: "Low"
	},
	{
		title: "Modernized interface",
		description: "Refined the visual system so DogEared feels calmer, lighter, and more book-first.",
		status: "Completed",
		category: "completed"
	},
	{
		title: "Reader profiles",
		description: "Added public profile surfaces for shelves, reading activity, and reader identity.",
		status: "Completed",
		category: "completed"
	},
	{
		title: "Reading goal",
		description: "Introduced annual reading goals with progress that feels informative instead of pressuring.",
		status: "Completed",
		category: "completed"
	},
	{
		title: "Reading streaks",
		description: "Added gentle continuity signals for readers who like seeing their reading rhythm.",
		status: "Completed",
		category: "completed"
	},
	{
		title: "Momentum score",
		description: "Added supportive momentum context for current reads without risk-heavy language.",
		status: "Completed",
		category: "completed"
	},
	{
		title: "My Reading Life",
		description: "Added a private reflective area for yearly progress, timeline history, calendar patterns, insights, and yearly summaries.",
		status: "Completed",
		category: "completed"
	},
	{
		title: "Private Reading Journal",
		description: "Added private journal entries with optional book context, progress/page snapshots, tags, mood, autosaved drafts, search, filters, inline viewing, editing, deletion, and book/progress prompts.",
		status: "Completed",
		category: "completed"
	},
	{
		title: "Guided first experience",
		description: "Added contextual, dismissible first-time tips with per-user progress and Settings controls.",
		status: "Completed",
		category: "completed"
	},
	{
		title: "Community discovery providers",
		description: "Added explainable Home discovery sections powered by transparent community activity rather than black-box recommendations.",
		status: "Completed",
		category: "completed"
	},
	{
		title: "Editorial collections",
		description: "Added curated collection pages, featured Home placement, author/search surfacing, and admin collection management.",
		status: "Completed",
		category: "completed"
	},
	{
		title: "Series support",
		description: "Added first-class series metadata, book-detail series context, continue-series actions, author grouping, and search labels.",
		status: "Completed",
		category: "completed"
	},
	{
		title: "Reader information architecture",
		description: "Clarified Profile, My Reading Life, and Reading Journal so each personal destination has a single purpose.",
		status: "Completed",
		category: "completed"
	},
	{
		title: "Author pages",
		description: "Added author pages that help readers browse related books and discover more context.",
		status: "Completed",
		category: "completed"
	},
	{
		title: "Admin dashboard",
		description: "Added operational tools that make the product easier to maintain and improve.",
		status: "Completed",
		category: "completed"
	},
	{
		title: "Floating actions",
		description: "Made feedback and support easier to reach without interrupting reading workflows.",
		status: "Completed",
		category: "completed"
	},
	{
		title: "Import foundation",
		description: "Built the first migration paths for bringing existing reading data into DogEared.",
		status: "Completed",
		category: "completed"
	}
];

export const ROADMAP_SECTIONS: Array<{
	id: Exclude<RoadmapCategory, "completed">;
	title: string;
	description: string;
}> = [
	{
		id: "now",
		title: "Now",
		description: "Active work focused on making DogEared more useful, stable, and comfortable for everyday readers."
	},
	{
		id: "next",
		title: "Next",
		description: "Planned improvements that deepen discovery, search, and personal reading context."
	},
	{
		id: "later",
		title: "Later",
		description: "Larger ideas that need the core reading experience to be mature before they are ready."
	}
];

export const RECENTLY_COMPLETED_ITEMS = ROADMAP_ITEMS.filter((item) => item.category === "completed").slice(0, 12);
