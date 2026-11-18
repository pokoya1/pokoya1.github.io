/* 信用ナンピン計画・リスク管理 Service Worker（オフライン用キャッシュ）
   GitHub Pages 等に単独配置した場合に有効。Muse の埋め込み表示では登録できないことがあります。 */
var CACHE = "nanpin-planner-v21";
var CORE = ["./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  if (e.request.url.indexOf("prices.json") >= 0) {
    /* 終値データは鮮度優先：ネットワークを先に試し、失敗したときだけキャッシュを返す */
    e.respondWith(fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () { return caches.match(e.request); }));
    return;
  }
  /* ページ本体（ナビゲーション／index文書）はネットワーク優先（v1.9.2）：
     オンライン時は通常の再読み込みで最新版が表示されるようにし、ネットワークが
     使えない場合に限りキャッシュから返す（オフライン起動は従来どおり維持する）。
     取得できた応答はキャッシュも更新しておき、次回のオフライン起動に備える。
     v2.0.1：取得はキャッシュ再検証（cache: "no-cache"）を指定し、ブラウザのHTTPキャッシュが
     古い文書を返すことを防ぐ。再検証で変更がなければサーバーの 304 応答で済むため転送量は増えない。
     v2.2：キャッシュ名を nanpin-planner-v21 へ更新（簡易／詳細モードと前提サマリーの折りたたみ追加に伴う版上げ） */
  var isNavigation = e.request.mode === "navigate";
  var isIndexDocument = /(^|\/)index\.html([?#]|$)/.test(e.request.url) || /\/$/.test(new URL(e.request.url).pathname);
  if (isNavigation || isIndexDocument) {
    var revalidateRequest = new Request(e.request, { cache: "no-cache" });
    e.respondWith(fetch(revalidateRequest).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () {
      return caches.match(e.request).then(function (hit) {
        return hit || caches.match("./index.html", { ignoreSearch: true });
      });
    }));
    return;
  }
  e.respondWith(caches.match(e.request).then(function (hit) {
    return hit || fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return res;
    });
  }));
});
