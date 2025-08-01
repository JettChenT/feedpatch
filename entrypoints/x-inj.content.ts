import * as Bippy from 'bippy'; // must be imported BEFORE react

export default defineContentScript({
  matches: ["*://x.com/*"],
  world: "MAIN",
  runAt: "document_start",
  main(){
    console.log(Bippy.BIPPY_INSTRUMENTATION_STRING)
    window.Bippy = Bippy;
  }
})