const handleResponseData = (url: string, data: any) => {
  console.debug("injected script response:", url, data);
  window.postMessage({
    type: "handleResponseData",
    url,
    data,
  });
};

export default defineUnlistedScript(() => {
  console.log("Hello from the main world!");
  window.injected = "Hello from the injected script!";

  ((xhr) => {
    const XHR = XMLHttpRequest.prototype;

    const open = XHR.open;
    const send = XHR.send;

    XHR.open = function (method, url) {
      this._method = method;
      this._url = url;
      return open.apply(this, arguments);
    };

    XHR.send = function (postData) {
      // console.debug('injected script xhr request:', this._method, this._url, this.getAllResponseHeaders(), postData);
      this.addEventListener("load", function () {
        // console.debug("injected script xhr response:", this.response);
        handleResponseData(this._url, this.response);
      });
      return send.apply(this, arguments);
    };
  })(XMLHttpRequest);

  const { fetch: origFetch } = window;

  window.fetch = async (...args) => {
    const response = await origFetch(...args);
    // console.log('injected script fetch request:', args);
    response
      .clone()
      .blob() // maybe json(), text(), blob()
      .then((data) => {
        // console.debug("injected script fetch response:", data);
        handleResponseData(args[0].toString(), data);
      })
      .catch((err) => console.debug(err));
    return response;
  };
});
