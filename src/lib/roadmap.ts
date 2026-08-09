export type RoadmapSectionId = "now" | "next" | "later";

export type RoadmapItem = {
	title: string;
	description: string;
	why: string;
	category: RoadmapSectionId;
};

export const ROADMAP_ITEMS: RoadmapItem[] = [
	{
		title: "Recommendation improvements",
		description: "Make book suggestions feel more personal, more explainable, and easier to tune.",
		why: "Readers should understand why a book appears and feel in control of what DogEared learns from their shelves.",
		category: "now"
	},
	{
		title: "Reading discussions",
		description: "Make reviews and replies feel more like thoughtful book conversation.",
		why: "Good discussion should help readers decide what to read next without turning DogEared into a noisy feed.",
		category: "now"
	},
	{
		title: "Import improvements",
		description: "Make bringing an existing reading history into DogEared clearer, safer, and easier to recover.",
		why: "A reader's history is valuable. Imports should explain what changed and never feel like a black box.",
		category: "now"
	},
	{
		title: "Stability and polish",
		description: "Keep common reading actions and page changes fast, accessible, and predictable across devices.",
		why: "Trust comes from small details working every time: shelves, progress, search, navigation feedback, and import recovery.",
		category: "now"
	},
	{
		title: "Notifications",
		description: "Stay connected to meaningful reading activity without unnecessary noise.",
		why: "Readers should know when something matters, then get back to reading.",
		category: "next"
	},
	{
		title: "Series guidance",
		description: "Easily continue a series and keep track of where you are.",
		why: "Series reading should feel organized without requiring readers to manage another spreadsheet.",
		category: "next"
	},
	{
		title: "Reading timeline",
		description: "Make it easier to revisit what you read, when you read it, and what it meant at the time.",
		why: "DogEared should become a durable memory of a reader's reading life.",
		category: "next"
	},
	{
		title: "Search and discovery",
		description: "Find books, authors, and reading history with less effort.",
		why: "Discovery works best when readers can move naturally from memory, curiosity, or recommendation to the right book.",
		category: "next"
	},
	{
		title: "Reading clubs",
		description: "Give small groups a calm place to read together at their own pace.",
		why: "Shared reading should support conversation and accountability without leaderboards or pressure.",
		category: "later"
	},
	{
		title: "Public API",
		description: "Let readers connect DogEared to personal tools, backups, and reading workflows.",
		why: "Readers should be able to own and reuse their reading data beyond DogEared.",
		category: "later"
	},
	{
		title: "Mobile apps",
		description: "Explore dedicated mobile experiences once the web app has fully settled.",
		why: "The everyday reading workflow should feel natural wherever readers track books.",
		category: "later"
	},
	{
		title: "Library integrations",
		description: "Help readers connect personal reading plans with real-world library availability.",
		why: "Discovery is more useful when it leads to books readers can actually get.",
		category: "later"
	},
	{
		title: "Kindle and Kobo improvements",
		description: "Make it easier to bring reading progress and notes from dedicated reading devices.",
		why: "Many readers already read elsewhere. DogEared should respect that instead of forcing duplicate work.",
		category: "later"
	}
];

export const ROADMAP_SECTIONS: Array<{
	id: RoadmapSectionId;
	title: string;
	kicker: string;
	description: string;
}> = [
	{
		id: "now",
		title: "Building Now",
		kicker: "Active focus",
		description: "A small set of improvements currently receiving attention for the Founding Reader phase."
	},
	{
		id: "next",
		title: "Coming Next",
		kicker: "Direction",
		description: "The next major areas of focus once the current reliability and reader-experience work settles."
	},
	{
		id: "later",
		title: "Looking Ahead",
		kicker: "Longer horizon",
		description: "Aspirational ideas that fit DogEared's direction, but need the core reading experience to mature first."
	}
];
