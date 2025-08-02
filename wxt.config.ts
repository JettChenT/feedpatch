import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// See https://wxt.dev/api/config.html
export default defineConfig({
	modules: ["@wxt-dev/module-react"],
	webExt: {
		binaries: {
			helium: "/Applications/Helium.app/Contents/MacOS/Helium",
		},
		chromiumArgs: ["--user-data-dir=./.wxt/browser-data"],
	},
	manifest: {
		permissions: ["storage"],
		web_accessible_resources: [
			{
				resources: ["x-mainworld.js"],
				matches: ["*://*/*"],
			},
		],
	},
	vite: () => ({
		plugins: [tailwindcss()],
		resolve: {
			alias: {
				"@": path.resolve(__dirname, "./"),
			},
		},
	}),
});
