import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  webExt: {
    binaries: {
      helium: "/Applications/Helium.app/Contents/MacOS/Helium",
    },
    chromiumArgs: ["--user-data-dir=./.wxt/browser-data"],
  },
});
