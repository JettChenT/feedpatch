/**
 * Network interceptor utility for capturing fetch and XMLHttpRequest responses
 */

type ResponseHandler = (url: string, data: string) => void;

interface ExtendedXMLHttpRequest extends XMLHttpRequest {
	_method?: string;
	_url?: string | URL;
}

/**
 * Sets up network interception for both fetch and XMLHttpRequest
 * @param handleResponseData - Callback function to handle intercepted responses
 */
export function setupNetworkInterception(
	handleResponseData: ResponseHandler,
): void {
	// Intercept XMLHttpRequest
	const XHR = XMLHttpRequest.prototype;
	const open = XHR.open;
	const send = XHR.send;

	XHR.open = function (
		this: ExtendedXMLHttpRequest,
		method: string,
		url: string | URL,
		...rest: unknown[]
	) {
		this._method = method;
		this._url = url;
		return open.apply(this, [method, url, ...rest] as Parameters<typeof open>);
	};

	XHR.send = function (
		this: ExtendedXMLHttpRequest,
		postData?: Document | XMLHttpRequestBodyInit | null,
	) {
		this.addEventListener("load", function (this: ExtendedXMLHttpRequest) {
			if (this._url) {
				handleResponseData(this._url.toString(), this.response);
			}
		});
		return send.call(this, postData);
	};

	// Intercept fetch
	const { fetch: origFetch } = window;

	window.fetch = async (...args: Parameters<typeof fetch>) => {
		const response = await origFetch(...args);
		response
			.clone()
			.blob()
			.then((data) => {
				handleResponseData(args[0].toString(), data.toString());
			})
			.catch((err) => console.debug(err));
		return response;
	};
}
