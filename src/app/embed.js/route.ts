export const dynamic = "force-dynamic";

const script = `(function () {
  var script = document.currentScript;
  if (!script) return;
  var id = script.getAttribute("data-agent") || "";
  if (!/^call_[a-f0-9]{12}$/.test(id)) return;
  var origin = new URL(script.src).origin;
  var page = location.pathname || "/";
  if (document.getElementById("smtools-call")) return;

  function el(tag, css) {
    var node = document.createElement(tag);
    if (css) node.style.cssText = css;
    return node;
  }

  function paint(cfg) {
    var root = document.getElementById("smtools-call");
    if (!root || !cfg || !cfg.show) {
      if (root && cfg && !cfg.show) root.remove();
      return;
    }
    var color = /^#[0-9a-f]{6}$/.test(cfg.color) ? cfg.color : "#2563eb";
    var name = root.querySelector("[data-name]");
    var dot = root.querySelector("[data-dot]");
    var title = root.querySelector("[data-title]");
    var hello = root.querySelector("[data-hello]");
    var head = root.querySelector("[data-head]");
    if (name) {
      name.textContent = cfg.name || "Ask";
      name.style.display = cfg.label === false ? "none" : "";
    }
    if (title) title.textContent = cfg.name || "Ask";
    if (hello && !root.getAttribute("data-talked")) hello.textContent = cfg.greeting || "";
    if (dot) dot.style.background = color;
    if (head) head.style.background = color;
    var ask = root.querySelector("[data-ask]");
    if (ask) ask.style.background = color;
    root.setAttribute("data-chat", cfg.chat === false ? "0" : "1");
    var card = root.querySelector("[data-card]");
    if (card && cfg.chat === false) card.style.display = "none";
  }

  function mount(cfg) {
    if (!cfg || !cfg.show) return;
    var color = /^#[0-9a-f]{6}$/.test(cfg.color) ? cfg.color : "#2563eb";
    var root = el("div");
    root.id = "smtools-call";
    root.style.cssText = "all:initial;position:fixed;right:20px;bottom:20px;z-index:2147483000;font-family:Segoe UI,Helvetica,Arial,sans-serif;";

    var row = el("div", "display:flex;align-items:flex-end;gap:10px;");
    var chip = el("button", "border:0;background:#fff;color:#122033;border-radius:999px;padding:8px 12px;font:700 13px Segoe UI,sans-serif;box-shadow:0 8px 24px rgba(16,40,70,.16);cursor:pointer;");
    chip.setAttribute("data-name", "1");
    chip.type = "button";
    chip.textContent = cfg.name || "Ask";
    if (cfg.label === false) chip.style.display = "none";
    var dot = el("button", "width:58px;height:58px;border:0;border-radius:50%;cursor:pointer;box-shadow:0 10px 24px rgba(16,40,70,.22);");
    dot.type = "button";
    dot.setAttribute("data-dot", "1");
    dot.style.background = color;
    dot.setAttribute("aria-label", cfg.name || "Ask");
    dot.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v2a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h2a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L7.1 9.5a16 16 0 0 0 6 6l1.1-1.1a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2z"/></svg>';

    var panel = el("div", "display:none;width:min(340px,calc(100vw - 32px));margin-bottom:12px;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 18px 50px rgba(16,40,70,.22);");
    panel.setAttribute("data-card", "1");
    var head = el("div", "display:flex;align-items:center;justify-content:space-between;gap:8px;padding:14px 14px 12px;color:#fff;");
    head.setAttribute("data-head", "1");
    head.style.background = color;
    var title = el("strong", "font:700 16px Segoe UI,sans-serif;");
    title.setAttribute("data-title", "1");
    title.textContent = cfg.name || "Ask";
    var close = el("button", "border:0;background:transparent;color:#fff;font:700 20px Segoe UI,sans-serif;cursor:pointer;line-height:1;");
    close.type = "button";
    close.textContent = "\\u00d7";
    close.setAttribute("aria-label", "Close");
    head.appendChild(title);
    head.appendChild(close);
    var body = el("div", "padding:14px;display:grid;gap:10px;");
    var hello = el("p", "margin:0;color:#31455c;font:500 14px/1.45 Segoe UI,sans-serif;");
    hello.setAttribute("data-hello", "1");
    hello.textContent = cfg.greeting || "";
    var log = el("div", "display:grid;gap:8px;max-height:220px;overflow:auto;");
    var form = el("form", "display:flex;gap:8px;");
    var input = el("input", "flex:1;border:1px solid #d5e0ee;border-radius:10px;padding:10px 12px;font:500 14px Segoe UI,sans-serif;");
    input.placeholder = "Ask a question";
    input.maxLength = 500;
    var send = el("button", "border:0;border-radius:10px;padding:10px 12px;color:#fff;font:700 14px Segoe UI,sans-serif;cursor:pointer;");
    send.type = "submit";
    send.setAttribute("data-ask", "1");
    send.textContent = "Ask";
    send.style.background = color;
    form.appendChild(input);
    form.appendChild(send);
    body.appendChild(hello);
    body.appendChild(log);
    body.appendChild(form);
    panel.appendChild(head);
    panel.appendChild(body);
    row.appendChild(chip);
    row.appendChild(dot);
    root.appendChild(panel);
    root.appendChild(row);
    document.body.appendChild(root);
    root.setAttribute("data-chat", cfg.chat === false ? "0" : "1");

    function open(show) {
      if (root.getAttribute("data-chat") === "0") {
        panel.style.display = "none";
        return;
      }
      panel.style.display = show ? "block" : "none";
      if (show) refresh();
    }
    chip.onclick = function () { open(panel.style.display === "none"); };
    dot.onclick = function () { open(panel.style.display === "none"); };
    close.onclick = function () { open(false); };

    form.onsubmit = function (event) {
      event.preventDefault();
      var text = input.value.trim();
      if (!text) return;
      input.value = "";
      root.setAttribute("data-talked", "1");
      var mine = el("p", "margin:0;justify-self:end;background:#eef3fb;color:#122033;border-radius:12px;padding:8px 10px;font:500 14px/1.4 Segoe UI,sans-serif;");
      mine.textContent = text;
      var reply = el("p", "margin:0;color:#173ea8;font:650 14px/1.4 Segoe UI,sans-serif;");
      reply.textContent = "One moment...";
      log.appendChild(mine);
      log.appendChild(reply);
      send.disabled = true;
      fetch(origin + "/api/widget/" + id, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, page: page })
      }).then(function (res) { return res.json(); }).then(function (data) {
        reply.textContent = data && data.answer ? data.answer : (data && data.error ? data.error : "That did not work.");
      }).catch(function () {
        reply.textContent = "The page could not reach the agent.";
      }).then(function () { send.disabled = false; });
    };
  }

  function refresh() {
    fetch(origin + "/api/widget/" + id + "?page=" + encodeURIComponent(page), { cache: "no-store" })
      .then(function (res) { return res.json(); })
      .then(function (cfg) {
        if (!document.getElementById("smtools-call")) mount(cfg);
        else paint(cfg);
      })
      .catch(function () {});
  }

  refresh();
})();
`;

export function GET() {
  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
