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

server.listen(3443, "0.0.0.0", () => {
  console.log("https://0.0.0.0:3443");
});
