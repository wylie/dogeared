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
		title: "Reading goal improvements",
		description: "Help readers keep gentle momentum with clearer goals, progress, and context that never turns reading into a chore.",
		status: "In Progress",
		category: "now",
		priority: "High"
	},
	{
		title: "Reader profiles",
		description: "Give every reader a warmer home for shelves, reviews, current reads, and the reading identity they want to share.",
		status: "In Progress",
		category: "now",
		priority: "High"
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
		title: "Recommendation engine",
		description: "Help readers discover books they will genuinely enjoy without relying on engagement algorithms.",
		status: "Planning",
		category: "next",
		priority: "Primary"
	},
	{
		title: "Better search",
		description: "Make it dramatically easier to find books, authors, shelves, and reading history.",
		status: "Planning",
		category: "next",
		priority: "High"
	},
	{
		title: "Personalized discovery",
		description: "Turn shelves, ratings, follows, and reading patterns into quieter paths toward the next good book.",
		status: "Planning",
		category: "next",
		priority: "High"
	},
	{
		title: "Reading statistics",
		description: "Show useful reading patterns over time without making the experience feel competitive or gamified.",
		status: "Planning",
		category: "next",
		priority: "Medium"
	},
	{
		title: "Reading history visualization",
		description: "Give readers a clear, beautiful way to look back at what they read and when they read it.",
		status: "Research",
		category: "next",
		priority: "Medium"
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
		title: "DNF shelf",
		description: "Made it possible to stop reading a book cleanly without treating it as unfinished progress.",
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
