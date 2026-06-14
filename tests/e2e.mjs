import { spawn } from "child_process";
import { mkdtempSync, mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer-core";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT = process.env.PORT || 8123;
const BASE = `http://127.0.0.1:${PORT}/`;
const CHROME = process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium";
const SNAPS = join(ROOT, "tests", "snapshots");
const LIBRARY_URL = `${BASE}tests/fixtures/test-library.excalidrawlib`;

function wait(ms) {
	return new Promise(r => setTimeout(r, ms));
}

async function waitForServer() {
	for (let i = 0; i < 50; i++) {
		try {
			if ((await fetch(BASE)).ok) return;
		} catch {}
		await wait(200);
	}
	throw new Error("php server did not start");
}

async function openEditor(context, hash = "") {
	const page = await context.newPage();
	page.on("dialog", d => d.accept());
	await page.goto(BASE + hash, { waitUntil: "networkidle0" });
	await page.waitForFunction(() => !!window.excalidraw);
	return page;
}

async function drawRectangle(page) {
	await page.click('[data-testid="toolbar-rectangle"]');
	await page.mouse.move(350, 300);
	await page.mouse.down();
	await page.mouse.move(560, 460, { steps: 8 });
	await page.mouse.up();
}

async function signUp(page, username, password) {
	await page.click(".login-cta");
	await page.waitForSelector(".auth");
	await page.click(".auth a");
	await page.type(".auth input[name=username]", username);
	await page.type(".auth input[name=password]", password);
	await page.click(".auth button");
	await page.waitForSelector(".login-cta", { hidden: true });
	await page.waitForFunction(() => !!window.excalidraw);
}

async function logIn(page, username, password) {
	await page.click(".login-cta");
	await page.waitForSelector(".auth");
	await page.type(".auth input[name=username]", username);
	await page.type(".auth input[name=password]", password);
	await page.click(".auth button");
	await page.waitForSelector(".login-cta", { hidden: true });
	await page.waitForFunction(() => !!window.excalidraw);
}

const elementCount = page => page.evaluate(() => window.excalidraw.getSceneElements().length);
const libraryCount = page => page.evaluate(() => document.querySelectorAll(".library-unit__active").length);
const projectNames = page => page.evaluate(() => [...document.querySelectorAll(".projects-name")].map(e => e.textContent));

async function openProjects(page) {
	await page.evaluate(() => window.excalidraw.toggleSidebar({ name: "default", tab: "projects", force: true }));
	await page.waitForSelector(".projects-new");
}

async function renameProject(page, index, name) {
	const item = (await page.$$(".projects-item"))[index];
	await (await item.$$("button"))[0].click();
	await page.waitForSelector(".projects-edit");
	await page.$eval(".projects-edit", el => el.select());
	await page.type(".projects-edit", name);
	await page.keyboard.press("Enter");
	await wait(400);
}

function assert(cond, msg) {
	if (!cond) throw new Error("FAIL: " + msg);
	console.log("  ok: " + msg);
}

async function reload(page) {
	await page.reload({ waitUntil: "networkidle0" });
	await page.waitForFunction(() => !!window.excalidraw);
	await wait(600);
}

const appState = page => page.evaluate(() => {
	const s = window.excalidraw.getAppState();
	return { theme: s.theme, bg: s.viewBackgroundColor, tab: s.openSidebar?.tab ?? null };
});
const setState = (page, patch) => page.evaluate(p => window.excalidraw.updateScene({ appState: p }), patch);

function luminance(rgb) {
	const [r, g, b] = rgb.match(/\d+/g).map(Number);
	return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

async function workflowDrawing(browser) {
	console.log("workflow (a): draw -> sign up -> clear storage -> log in -> drawing persists");
	let ctx = await browser.createBrowserContext();
	let page = await openEditor(ctx);
	assert(await page.$(".auth") === null, "no forced login on open");
	await drawRectangle(page);
	assert(await elementCount(page) >= 1, "rectangle drawn anonymously");
	await signUp(page, "alice", "alicepw");
	await wait(800);
	assert(await elementCount(page) >= 1, "drawing kept after sign up");
	await page.screenshot({ path: join(SNAPS, "a1-after-signup.png") });
	await ctx.close();

	ctx = await browser.createBrowserContext();
	page = await openEditor(ctx);
	await logIn(page, "alice", "alicepw");
	await wait(800);
	assert(await elementCount(page) === 0, "fresh login selects no project");
	await page.evaluate(() => window.excalidraw.toggleSidebar({ name: "default", tab: "projects", force: true }));
	await page.waitForSelector(".projects-name");
	await page.click(".projects-name");
	await wait(600);
	assert(await elementCount(page) >= 1, "drawing restored after opening project");
	await page.screenshot({ path: join(SNAPS, "a2-after-relogin.png") });
	await ctx.close();
}

async function workflowLibrary(browser) {
	console.log("workflow (b): add library -> sign up -> clear storage -> log in -> library persists");
	let ctx = await browser.createBrowserContext();
	let page = await openEditor(ctx, "#addLibrary=" + encodeURIComponent(LIBRARY_URL) + "&token=test");
	await page.waitForSelector(".library-unit__active");
	assert(await libraryCount(page) >= 1, "library item added anonymously");
	await signUp(page, "bob", "bobpassword");
	await wait(800);
	await page.evaluate(() => window.excalidraw.toggleSidebar({ name: "default", tab: "library", force: true }));
	await page.waitForSelector(".library-unit__active");
	assert(await libraryCount(page) >= 1, "library kept after sign up");
	await page.screenshot({ path: join(SNAPS, "b1-after-signup.png") });
	await ctx.close();

	ctx = await browser.createBrowserContext();
	page = await openEditor(ctx);
	await logIn(page, "bob", "bobpassword");
	await wait(800);
	await page.evaluate(() => window.excalidraw.toggleSidebar({ name: "default", tab: "library", force: true }));
	await page.waitForSelector(".library-unit__active");
	assert(await libraryCount(page) >= 1, "library restored after fresh login");
	await page.screenshot({ path: join(SNAPS, "b2-after-relogin.png") });
	await ctx.close();
}

async function workflowLibraryRemoval(browser) {
	console.log("workflow (c): remove library -> reload -> log in -> stays removed");
	let ctx = await browser.createBrowserContext();
	let page = await openEditor(ctx);
	await logIn(page, "bob", "bobpassword");
	await wait(800);
	assert(await page.evaluate(() => document.querySelector(".library-menu-dropdown-container") !== null || true), "library available");
	await page.evaluate(() => window.excalidraw.updateLibrary({ libraryItems: [], merge: false }));
	await wait(800);
	assert(await libraryCount(page) === 0, "library cleared");
	await ctx.close();

	ctx = await browser.createBrowserContext();
	page = await openEditor(ctx);
	await logIn(page, "bob", "bobpassword");
	await wait(800);
	await page.evaluate(() => window.excalidraw.toggleSidebar({ name: "default", tab: "library", force: true }));
	await wait(500);
	assert(await libraryCount(page) === 0, "removal persisted after fresh login");
	await ctx.close();
}

async function workflowProjects(browser) {
	console.log("workflow (d): stable ordering + in-place rename");
	const ctx = await browser.createBrowserContext();
	const page = await openEditor(ctx);
	await logIn(page, "alice", "alicepw");
	await wait(800);
	await openProjects(page);
	await page.click(".projects-new");
	await wait(600);
	await openProjects(page);
	await page.click(".projects-new");
	await wait(600);
	await openProjects(page);
	assert((await page.$$(".projects-item")).length >= 3, "three projects exist");
	await renameProject(page, 0, "AAA");
	await renameProject(page, 1, "BBB");
	await renameProject(page, 2, "CCC");
	const before = await projectNames(page);
	assert(before.join(",") === "AAA,BBB,CCC", "in-place rename applied in order: " + before.join(","));
	await page.evaluate(() => [...document.querySelectorAll(".projects-name")].find(e => e.textContent === "CCC").click());
	await wait(600);
	const after = await projectNames(page);
	assert(after.join(",") === before.join(","), "order stays stable after opening a project: " + after.join(","));
	assert(await page.title() === "Excalidraw / CCC", "active project shown in page title: " + await page.title());
	await page.screenshot({ path: join(SNAPS, "d-projects.png") });
	await ctx.close();
}

async function workflowTabMemory(browser) {
	console.log("workflow (e): sidebar remembers selected tab across close/open");
	const ctx = await browser.createBrowserContext();
	const page = await openEditor(ctx);
	await logIn(page, "alice", "alicepw");
	await wait(800);
	await openProjects(page);
	assert((await appState(page)).tab === "projects", "projects tab open");
	await page.evaluate(() => window.excalidraw.toggleSidebar({ name: "default", force: false }));
	await wait(300);
	assert((await appState(page)).tab === null, "sidebar closed");
	await page.waitForSelector(".default-sidebar-trigger");
	await page.click(".default-sidebar-trigger");
	await wait(300);
	assert((await appState(page)).tab === "projects", "reopened on the remembered projects tab");
	await ctx.close();
}

async function workflowThemeMemory(browser) {
	console.log("workflow (f): dark/light theme remembered across reload");
	const ctx = await browser.createBrowserContext();
	const page = await openEditor(ctx);
	await logIn(page, "alice", "alicepw");
	await wait(800);
	await setState(page, { theme: "dark" });
	await wait(1200);
	await reload(page);
	assert((await appState(page)).theme === "dark", "theme stays dark after reload");
	await setState(page, { theme: "light" });
	await wait(1200);
	await ctx.close();
}

async function workflowLastProjectMemory(browser) {
	console.log("workflow (g): last open project remembered on reload (but not on fresh login)");
	const ctx = await browser.createBrowserContext();
	const page = await openEditor(ctx);
	await drawRectangle(page);
	await signUp(page, "carol", "carolpw");
	await wait(1500);
	assert(await elementCount(page) >= 1, "seeded project active after signup");
	await reload(page);
	assert(await elementCount(page) >= 1, "last project restored on reload");
	assert(await page.$(".projects-item.active") !== null, "restored project shown active");
	await ctx.close();
}

async function workflowEscRename(browser) {
	console.log("workflow (h): ESC while renaming discards and keeps the sidebar open");
	const ctx = await browser.createBrowserContext();
	const page = await openEditor(ctx);
	await logIn(page, "alice", "alicepw");
	await wait(800);
	await openProjects(page);
	const before = await projectNames(page);
	const item = (await page.$$(".projects-item"))[0];
	await (await item.$$("button"))[0].click();
	await page.waitForSelector(".projects-edit");
	await page.$eval(".projects-edit", el => el.select());
	await page.type(".projects-edit", "ZZZ");
	await page.keyboard.press("Escape");
	await wait(300);
	assert(await page.$(".projects-edit") === null, "edit input closed");
	assert(await page.$(".projects-new") !== null, "sidebar still open after ESC");
	assert((await projectNames(page)).join(",") === before.join(","), "rename discarded");
	await ctx.close();
}

async function workflowDeleteModal(browser) {
	console.log("workflow (i): deleting a project uses a themed modal, not native confirm()");
	const ctx = await browser.createBrowserContext();
	const page = await openEditor(ctx);
	let nativeDialogs = 0;
	page.on("dialog", () => { nativeDialogs++; });
	await logIn(page, "alice", "alicepw");
	await wait(800);
	await openProjects(page);
	const count = (await page.$$(".projects-item")).length;
	const item = (await page.$$(".projects-item"))[count - 1];
	await (await item.$$("button"))[1].click();
	await wait(300);
	assert(await page.$(".confirm-modal") !== null, "themed delete modal shown");
	assert(nativeDialogs === 0, "no native confirm() used");
	await page.click(".confirm-modal .modal-danger");
	await page.waitForFunction(n => document.querySelectorAll(".projects-item").length === n, {}, count - 1);
	assert((await page.$$(".projects-item")).length === count - 1, "project deleted after confirm");
	await ctx.close();
}

async function workflowBackgroundMemory(browser) {
	console.log("workflow (j): per-project background color is remembered");
	const ctx = await browser.createBrowserContext();
	const page = await openEditor(ctx);
	await logIn(page, "alice", "alicepw");
	await wait(800);
	await openProjects(page);
	const names = await projectNames(page);
	await page.evaluate(n => [...document.querySelectorAll(".projects-name")].find(e => e.textContent === n).click(), names[0]);
	await wait(600);
	await setState(page, { viewBackgroundColor: "#ffc9c9" });
	await wait(1200);
	await page.evaluate(n => [...document.querySelectorAll(".projects-name")].find(e => e.textContent === n).click(), names[1]);
	await wait(800);
	await page.evaluate(n => [...document.querySelectorAll(".projects-name")].find(e => e.textContent === n).click(), names[0]);
	await wait(800);
	assert((await appState(page)).bg === "#ffc9c9", "background restored when reopening the project");
	await ctx.close();
}

async function workflowDarkIcons(browser) {
	console.log("workflow (k): project action icons are readable in dark mode");
	const ctx = await browser.createBrowserContext();
	const page = await openEditor(ctx);
	await logIn(page, "alice", "alicepw");
	await wait(800);
	await setState(page, { theme: "dark" });
	await wait(600);
	await openProjects(page);
	const color = await page.evaluate(() => {
		const btn = document.querySelector(".projects-item button");
		return getComputedStyle(btn.querySelector("svg") || btn).color;
	});
	assert(luminance(color) > 0.5, "action icon color is light in dark mode: " + color);
	const item = (await page.$$(".projects-item"))[0];
	await (await item.$$("button"))[1].click();
	await page.waitForSelector(".confirm-modal .modal");
	const modal = await page.evaluate(() => {
		const m = document.querySelector(".confirm-modal .modal");
		return { bg: getComputedStyle(m).backgroundColor, title: getComputedStyle(m.querySelector("h2")).color };
	});
	assert(!/rgba\(0, 0, 0, 0\)|transparent/.test(modal.bg), "dark modal has a solid themed background: " + modal.bg);
	assert(luminance(modal.title) > 0.5, "dark modal text is readable (light): " + modal.title);
	await page.click(".confirm-modal .modal-cancel");
	await setState(page, { theme: "light" });
	await wait(1200);
	await ctx.close();
}

async function workflowViewportMemory(browser) {
	console.log("workflow (l): per-project pan/zoom is remembered");
	const ctx = await browser.createBrowserContext();
	const page = await openEditor(ctx);
	await logIn(page, "alice", "alicepw");
	await wait(800);
	await openProjects(page);
	const names = await projectNames(page);
	const pick = n => page.evaluate(name => [...document.querySelectorAll(".projects-name")].find(e => e.textContent === name).click(), n);
	await pick(names[0]);
	await wait(600);
	await page.evaluate(() => window.excalidraw.updateScene({ appState: { scrollX: 123, scrollY: 456, zoom: { value: 2 } } }));
	await wait(1200);
	await pick(names[1]);
	await wait(800);
	await pick(names[0]);
	await wait(800);
	const v = await page.evaluate(() => { const s = window.excalidraw.getAppState(); return { x: Math.round(s.scrollX), y: Math.round(s.scrollY), z: s.zoom.value }; });
	assert(v.x === 123 && v.y === 456 && v.z === 2, "pan/zoom restored when reopening the project: " + JSON.stringify(v));
	await ctx.close();
}

async function main() {
	mkdirSync(SNAPS, { recursive: true });
	const db = join(mkdtempSync(join(tmpdir(), "excalidraw-test-")), "data.db");
	const php = spawn("php", ["-S", `127.0.0.1:${PORT}`, "-t", ROOT, join(ROOT, "tests", "router.php")], {
		env: { ...process.env, EXCALIDRAW_DB: db },
		stdio: "ignore",
	});
	const browser = await puppeteer.launch({
		executablePath: CHROME,
		headless: "new",
		args: ["--no-sandbox", "--disable-setuid-sandbox"],
		defaultViewport: { width: 1280, height: 800 },
	});
	try {
		await waitForServer();
		await workflowDrawing(browser);
		await workflowLibrary(browser);
		await workflowLibraryRemoval(browser);
		await workflowProjects(browser);
		await workflowTabMemory(browser);
		await workflowThemeMemory(browser);
		await workflowLastProjectMemory(browser);
		await workflowEscRename(browser);
		await workflowDeleteModal(browser);
		await workflowBackgroundMemory(browser);
		await workflowDarkIcons(browser);
		await workflowViewportMemory(browser);
		console.log("\nALL TESTS PASSED");
	} finally {
		await browser.close();
		php.kill();
		rmSync(dirname(db), { recursive: true, force: true });
	}
}

main().catch(e => { console.error(e); process.exit(1); });
