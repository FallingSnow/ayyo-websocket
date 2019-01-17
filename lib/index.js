import http2 from "http2";
import url from "url";
import querystring from "querystring";

import {Server} from "simple-rpc";
// import {DONE} from "ayyo/symbols";

const {
    HTTP2_HEADER_PATH,
    HTTP2_HEADER_STATUS,
    HTTP2_HEADER_COOKIE,
    // HTTP2_HEADER_CONTENT_TYPE,
    // HTTP2_HEADER_CONTENT_LENGTH
} = http2.constants;

export default class WebsocketAdapter {
    constructor(server, options) {
        this.socketServer = new Server({
            server: server.listener,
            ...options
        });
        this.server = server;

        this.socketServer.on("connection", (ws, req) => {
            // console.debug("Ayyo Websocket: Websocket connection established!");
            ws.initialCookies = parseCookies(req.headers[HTTP2_HEADER_COOKIE]);
            ws.initialHeaders = req.headers;
            // ws.on("message", async message => {
            //     console.debug("Ayyo Websocket: Websocket message received!");
            //     try {
            //         ws.send(await this.messageHandler(ws, message));
            //     } catch (error) {
            //         console.error("Ayyo Websocket:", error);
            //         ws.send(JSON.stringify({error, headers: {
            //             [HTTP2_HEADER_STATUS]: 500
            //         }}));
            //     }
            // });
        });
        this.socketServer.register("*", (data) => {
            // console.log("Ayyo Websocket Data:", data);
        });
    }
    async messageHandler(socket, message) {
        // console.debug("Ayyo Websocket: Incomming message:", message);
        const {id, headers, flags = {}, cookie, body} = JSON.parse(message);

        // console.log("Ayyo Websocket:", {id, headers, flags, cookie, body});

        const parsedUrl = url.URL(headers[HTTP2_HEADER_PATH]);
        const req = {
            headers,
            flags,
            url: parsedUrl,
            query: querystring.parse(parsedUrl.query),
            cookie: [socket.initialCookies, ...cookie],
            body
        };
        let res = {
            headers: {
                [HTTP2_HEADER_STATUS]: 404
            },
            cookies: []
        };

        for (const middleware of this.server.middlewares) {
            const _result = await middleware({
                server: this.server,
                req,
                res
            });
            // if (result === DONE) break;
        }

        // console.log("Ayyo Websocket Result:", res);

        return JSON.stringify({id, ...{headers: res.headers, body: res.body}});
    }
}


// RFC 6265 compliant cookie parsing
function parseCookies(cookies = "") {
    return cookies.split("; ").reduce((obj, keyVal) => {
        const [key, val] = keyVal.split(/=(.+)/);
        obj[key] = val;
        return obj;
    }, {});
}
