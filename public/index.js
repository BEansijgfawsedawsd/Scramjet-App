"use strict";
// BEANCHAT browser: tabs, back / forward / reload / home, and an address bar on top of Scramjet.

/** @type {HTMLFormElement} */
const form = document.getElementById("sj-form");
/** @type {HTMLInputElement} */
const address = document.getElementById("sj-address");
/** @type {HTMLInputElement} */
const searchEngine = document.getElementById("sj-search-engine");
/** @type {HTMLParagraphElement} */
const error = document.getElementById("sj-error");
/** @type {HTMLPreElement} */
const errorCode = document.getElementById("sj-error-code");

const landing = document.querySelector(".bc-home");
const tabStrip = document.getElementById("bc-tabs");
const barForm = document.getElementById("bc-bar-form");
const bar = document.getElementById("bc-bar");

const { ScramjetController } = $scramjetLoadController();

const scramjet = new ScramjetController({
	files: {
		wasm: "/scram/scramjet.wasm.wasm",
		all: "/scram/scramjet.all.js",
		sync: "/scram/scramjet.sync.js",
	},
});

scramjet.init();

const connection = new BareMux.BareMuxConnection("/baremux/worker.js");

// ---------- tabs ----------
let nextId = 1;
/** @type {{id:number, frame:any, url:string, title:string}[]} */
const tabs = [];
let activeId = 0;

const activeTab = () => tabs.find((t) => t.id === activeId);

function newTab(focus = true) {
	const tab = { id: nextId++, frame: null, url: "", title: "" };
	tabs.push(tab);
	show(tab);
	if (focus) address.focus();
	return tab;
}

function closeTab(id) {
	const i = tabs.findIndex((t) => t.id === id);
	if (i < 0) return;
	const tab = tabs[i];
	if (tab.frame) tab.frame.frame.remove();
	tabs.splice(i, 1);
	if (!tabs.length) {
		newTab();
		return;
	}
	if (id === activeId) show(tabs[Math.min(i, tabs.length - 1)]);
	else renderTabs();
}

function label(tab) {
	if (tab.title) return tab.title;
	if (tab.url) {
		try {
			return new URL(tab.url).hostname.replace(/^www\./, "");
		} catch (e) {
			return tab.url;
		}
	}
	return "New tab";
}

function renderTabs() {
	tabStrip.innerHTML = "";
	tabs.forEach((tab) => {
		const el = document.createElement("div");
		el.className = "bc-tab" + (tab.id === activeId ? " active" : "");
		el.title = label(tab);
		const text = document.createElement("span");
		text.className = "bc-tt";
		text.textContent = label(tab);
		const x = document.createElement("button");
		x.type = "button";
		x.className = "bc-tx";
		x.setAttribute("aria-label", "Close tab");
		x.innerHTML = "&times;";
		x.onclick = (e) => {
			e.stopPropagation();
			closeTab(tab.id);
		};
		el.onclick = () => show(tab);
		el.appendChild(text);
		el.appendChild(x);
		tabStrip.appendChild(el);
	});
	const plus = document.createElement("button");
	plus.type = "button";
	plus.className = "bc-newtab";
	plus.title = "New tab";
	plus.setAttribute("aria-label", "New tab");
	plus.textContent = "+";
	plus.onclick = () => newTab();
	tabStrip.appendChild(plus);
}

function show(tab) {
	activeId = tab.id;
	tabs.forEach((t) => {
		if (t.frame) t.frame.frame.style.display = t === tab ? "block" : "none";
	});
	landing.style.display = tab.frame ? "none" : "flex";
	bar.value = tab.url || "";
	renderTabs();
}

function showError(message, code) {
	error.textContent = message;
	errorCode.textContent = code || "";
	if (activeTab() && activeTab().frame) alert(message + (code ? "\n" + code : ""));
}

// ---------- opening pages ----------
async function ensureReady() {
	try {
		await registerSW();
	} catch (err) {
		showError("Failed to register service worker.", err.toString());
		throw err;
	}
	const wispUrl =
		(location.protocol === "https:" ? "wss" : "ws") +
		"://" +
		location.host +
		"/wisp/";
	if ((await connection.getTransport()) !== "/libcurl/index.mjs") {
		await connection.setTransport("/libcurl/index.mjs", [
			{ websocket: wispUrl },
		]);
	}
}

async function navigate(raw) {
	raw = String(raw || "").trim();
	if (!raw) return;
	error.textContent = "";
	errorCode.textContent = "";
	try {
		await ensureReady();
	} catch (err) {
		return;
	}
	const url = search(raw, searchEngine.value);
	const tab = activeTab();
	if (!tab.frame) {
		const frame = scramjet.createFrame();
		frame.frame.id = "sj-frame-" + tab.id;
		frame.frame.className = "bc-frame";
		document.body.appendChild(frame.frame);
		frame.addEventListener("urlchange", (e) => {
			tab.url = e.url;
			tab.title = "";
			if (tab.id === activeId) bar.value = e.url;
			renderTabs();
			// the page title becomes readable a moment after it loads
			setTimeout(() => readTitle(tab), 1200);
		});
		tab.frame = frame;
	}
	tab.url = url;
	tab.frame.go(url);
	show(tab);
}

function readTitle(tab) {
	try {
		const t = tab.frame && tab.frame.frame.contentDocument.title;
		if (t && t !== tab.title) {
			tab.title = t.slice(0, 40);
			renderTabs();
		}
	} catch (e) {}
}

function goHome() {
	const tab = activeTab();
	if (tab.frame) {
		tab.frame.frame.remove();
		tab.frame = null;
	}
	tab.url = "";
	tab.title = "";
	address.value = "";
	show(tab);
}

// ---------- wiring ----------
form.addEventListener("submit", (event) => {
	event.preventDefault();
	const v = address.value;
	address.value = "";
	navigate(v);
});

barForm.addEventListener("submit", (event) => {
	event.preventDefault();
	navigate(bar.value);
	bar.blur();
});

document.getElementById("bc-back").onclick = () => {
	const t = activeTab();
	if (t && t.frame) t.frame.back();
};
document.getElementById("bc-fwd").onclick = () => {
	const t = activeTab();
	if (t && t.frame) t.frame.forward();
};
document.getElementById("bc-reload").onclick = () => {
	const t = activeTab();
	if (t && t.frame) t.frame.reload();
};
document.getElementById("bc-home").onclick = goHome;

// keep tab names fresh as pages finish loading
setInterval(() => tabs.forEach(readTitle), 3000);

newTab(false);
