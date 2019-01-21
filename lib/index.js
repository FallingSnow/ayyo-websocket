import http2 from "http2";

import {Request, HTTPError, Middleware} from "ayyo";

const Server = require("simple-rpc").Server;

const {
    HTTP2_HEADER_STATUS,
    HTTP2_HEADER_CONTENT_TYPE,
    HTTP2_HEADER_CONTENT_LENGTH
} = http2.constants;

export default class WebsocketAdapter {
    constructor(server, {namespace = "http", ...options}) {
        this.socketServer = new Server({
            server: server.listener,
            ...options
        });
        this.server = server;

        this.socketServer.on("connection", (ws, req) => {
            // console.debug("Ayyo Websocket: Websocket connection established!");
            ws.initialHeaders = req.headers;
        });
        const _self = this;
        this.socketServer.register(namespace, async function namespaceHandler(
            data
        ) {
            return await _self.messageHandler.call(this, _self, data);
        });
    }
    async messageHandler(_self, {headers = {}, flags = {}, body}) {
        // console.debug("Ayyo Websocket: Incomming message:", {headers, flags, body});
        let res = {
            headers: {
                [HTTP2_HEADER_STATUS]: 404
            },
            cookies: []
        };

        const req = new Request.default(
            {...this.initialHeaders, ...headers},
            flags
        );
        await req.parseBody(body);
        try {
            for (const middleware of _self.server.middlewares) {
                const result = await middleware.call(_self.server, {
                    server: _self.server,
                    req,
                    res
                });
                if (result === Middleware.Middleware.DONE) break;
            }
            if (res.headers[HTTP2_HEADER_STATUS] === 404) {
                throw new HTTPError(404);
            }
        } catch (error) {
            // If this isn't already an HTTPError, we can assume this is an unhandled
            // error and should be treated as an internal server error
            if (!(error instanceof HTTPError)) {
                // eslint-disable-next-line no-ex-assign
                error = new HTTPError(500, undefined, error);
            }

            // Add error details to response
            res.headers[HTTP2_HEADER_STATUS] = error.code;

            await _self.onError({
                req,
                res,
                error
            });
        } finally {
            if (res.body) {
                // If no content-length header has been registered, lets calculate the body length and set it
                if (
                    !res.headers[HTTP2_HEADER_CONTENT_TYPE] &&
                    typeof res.body === "object"
                ) {
                    res.body = JSON.stringify(res.body);
                    res.headers[HTTP2_HEADER_CONTENT_TYPE] = "application/json";
                }
                if (!res.headers[HTTP2_HEADER_CONTENT_TYPE]) {
                    res.headers[HTTP2_HEADER_CONTENT_TYPE] = "text/plain";
                }
                if (!res.headers[HTTP2_HEADER_CONTENT_LENGTH]) {
                    res.headers[HTTP2_HEADER_CONTENT_LENGTH] = res.body.length;
                }
            }
            res = httpToWS(res);
        }

        // console.log("Ayyo Websocket: Result:", res);
        return res;
    }
    onError({req, res, error}) {
        res.body = error.message;
        // eslint-disable-next-line no-console
        console.error(
            `Unable to serve request "${req.url.path}"`,
            error.data || error
        );
    }
}

function httpToWS(res) {
    // Cookies cannot be handled by the websocket protocol
    delete res.cookies;

    // Remove access control headers, not needed for websocket protocol
    Object.keys(res.headers)
        .filter(headerName => headerName.startsWith("access-control-"))
        .map(headerName => delete res.headers[headerName]);

    return res;
}
