export type EmailSendResult = {
	sent: boolean;
	error?: string;
};

export function escapeEmailHtml(value: string) {
	return String(value || "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

export async function sendDogearedEmail(input: {
	to: string;
	subject: string;
	htmlContent: string;
	textContent: string;
}): Promise<EmailSendResult> {
	const brevoApiKey = String(import.meta.env.BREVO_API_KEY || "").trim();
	const fromEmail = String(import.meta.env.BREVO_FROM_EMAIL || "").trim();
	const fromName = String(import.meta.env.BREVO_FROM_NAME || "Dogeared").trim();
	if (!brevoApiKey || !fromEmail) {
		return {
			sent: false,
			error: "Email provider is not configured."
		};
	}

	const response = await fetch("https://api.brevo.com/v3/smtp/email", {
		method: "POST",
		headers: {
			"api-key": brevoApiKey,
			accept: "application/json",
			"Content-Type": "application/json"
		},
		body: JSON.stringify({
			sender: {
				name: fromName,
				email: fromEmail
			},
			to: [{ email: input.to }],
			subject: input.subject,
			htmlContent: input.htmlContent,
			textContent: input.textContent
		})
	});
	if (response.ok) return { sent: true };

	const payload = await response.json().catch(() => ({}));
	return {
		sent: false,
		error: String(payload?.message || payload?.code || payload?.error || "Email provider rejected the request.")
	};
}
