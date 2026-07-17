# Workspace Customization Guidelines (AI-Smart & Token-Efficient)

To ensure high-performance, cost-effective, and token-efficient pair programming in this large ERP codebase:

1. **Concise Responses**: Keep all chat communication extremely brief. Summarize actions in 1-2 sentences. Avoid long pleasantries.
2. **Targeted Reading**: When inspecting code, read only the exact line range of interest using [view_file](file:///absolute/path/to/file) rather than viewing full files to conserve context window tokens.
3. **Helper Reuse**: Do not write redundant utility logic. Always check existing helpers in `backend/utils/` and common controllers before writing new code.
4. **Minimal Diffs**: Make targeted edits (using replace_file_content for contiguous changes) instead of rewriting large sections of files.
5. **No Code Re-Summarization**: Do not re-summarize completed code changes or walkthrough contents in chat responses; simply point the user to the updated files or walkthrough.md.
6. **Shopify Active Theme Safe Sync**: Always run `node scratch/pull_theme_settings.js` to fetch and back up the most recent live settings (`settings_data.json` and `templates/index.json`) from the Shopify active theme before applying or packaging theme updates. Never upload local overrides of settings or index templates to avoid overwriting merchant configurations.

