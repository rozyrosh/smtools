import fs from "fs";
import http from "http";
import https from "https";
import path from "path";

const pfx = fs.readFileSync(path.join(process.cwd(), "certificates", "lan.pfx"));
const server = https.createServer({ pfx, passphrase: "smtools-local" }, (req, res) => {
  const upstream = http.request(
    {
      hostname: "127.0.0.1",
      port: 3000,
      path: req.url,
      method: req.method,
      headers: req.headers,
    },
    (reply) => {
      res.writeHead(reply.statusCode || 502, reply.headers);
      reply.pipe(res);
    }
  );
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502);
    res.end("The desk is not running.");
  });
  req.pipe(upstream);
});

server.on("upgrade", (req, socket, head) => {
  const pathOnly = String(req.url || "").split("?")[0];
  if (pathOnly !== "/api/call/live") {
    socket.destroy();
    return;
  }
  const upstream = http.request({
    hostname: "127.0.0.1",
    port: 3001,
    path: req.url,
    method: "GET",
    headers: req.headers,
  });
  upstream.on("upgrade", (reply, live, liveHead) => {
    const headers = Object.entries(reply.headers).flatMap(([key, value]) => {
      if (Array.isArray(value)) return value.map((item) => `${key}: ${item}`);
      return value ? [`${key}: ${value}`] : [];
    });
    socket.write(`HTTP/1.1 ${reply.statusCode || 101} ${reply.statusMessage || "Switching Protocols"}\r\n${headers.join("\r\n")}\r\n\r\n`);
    if (liveHead.length) socket.write(liveHead);
    if (head.length) live.write(head);
    live.pipe(socket);
    socket.pipe(live);
    live.on("error", () => socket.destroy());
    socket.on("error", () => live.destroy());
  });
  upstream.on("error", () => socket.destroy());
  upstream.end();
});

server.listen(3443, "0.0.0.0", () => {
  console.log("https://0.0.0.0:3443");
});
