import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import {
	DefaultSidebar,
	Excalidraw,
	Footer,
	MainMenu,
	Sidebar,
	useHandleLibrary,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import "./app.css";

const API = new URL("api/", document.baseURI).href;

async function api(action: string, data: object = {}) {
	const res = await fetch(API + action, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(data),
	});
	return res.json();
}

const ERRORS: Record<string, string> = {
	usernameTaken: "That username is already taken.",
	wrongCredentials: "Wrong username or password.",
	notLoggedIn: "Your session expired, please log in again.",
	tooShort: "{0} is too short.",
	tooLong: "{0} is too long.",
	invalidFormat: "{0} contains invalid characters.",
	notSet: "{0} is required.",
};

function message(error: string, args: any[] = []) {
	return (ERRORS[error] || error).replace(/\{(\d+)\}/g, (_, i) => args[i]);
}

function validateLibraryUrl(url: string) {
	const u = new URL(url, location.href);
	return u.origin === location.origin || /(^|\.)excalidraw\.com$/.test(u.hostname);
}

const ANON_LIBRARY_KEY = "excalidraw-anon-library";

const serverLibraryAdapter = {
	async load() {
		const res = await api("library_load");
		return { libraryItems: res.items ?? [] };
	},
	async save({ libraryItems }: { libraryItems: any }) {
		await api("library_save", { data: libraryItems });
	},
};

const localLibraryAdapter = {
	load() {
		try {
			return { libraryItems: JSON.parse(localStorage.getItem(ANON_LIBRARY_KEY) || "[]") };
		} catch {
			return { libraryItems: [] };
		}
	},
	save({ libraryItems }: { libraryItems: any }) {
		localStorage.setItem(ANON_LIBRARY_KEY, JSON.stringify(libraryItems));
	},
};

const icon = (path: string) => (
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
		<path d={path} />
	</svg>
);
const folderIcon = icon("M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z");
const pencilIcon = icon("M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z");
const trashIcon = icon("M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6");
const panelIcon = icon("M4 4h16v16H4zM15 4v16");

const PROJECTS_TAB = "projects";

function Overlay({ className = "", onClick, children }: { className?: string; onClick: () => void; children: React.ReactNode }) {
	const container = document.querySelector(".excalidraw") ?? document.body;
	return createPortal(
		<div className={"modal-overlay " + className} onClick={onClick}>{children}</div>,
		container,
	);
}

function Auth({ onSuccess, onClose }: { onSuccess: (name: string) => void; onClose: () => void }) {
	const [register, setRegister] = useState(false);
	const [error, setError] = useState("");
	async function submit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		const form = Object.fromEntries(new FormData(e.currentTarget) as any);
		const res = await api(register ? "register" : "login", form);
		if (res.error) setError(message(res.error, res.args));
		else onSuccess(res.username);
	}
	return (
		<Overlay onClick={onClose}>
			<form className="modal auth" onClick={e => e.stopPropagation()} onSubmit={submit}>
				<h1>✏️ Excalidraw</h1>
				<p className="modal-sub">{register ? "Create an account to save your work." : "Log in to access your projects."}</p>
				<input name="username" placeholder="username" autoComplete="username" autoFocus />
				<input name="password" type="password" placeholder="password" autoComplete={register ? "new-password" : "current-password"} />
				<button className="modal-primary">{register ? "Create account" : "Log in"}</button>
				{error && <p className="error">{error}</p>}
				<a href="#" onClick={e => { e.preventDefault(); setError(""); setRegister(!register); }}>
					{register ? "I already have an account" : "Create an account"}
				</a>
			</form>
		</Overlay>
	);
}

function Confirm({ title, body, confirmLabel, onConfirm, onCancel }: {
	title: string;
	body: string;
	confirmLabel: string;
	onConfirm: () => void;
	onCancel: () => void;
}) {
	return (
		<Overlay className="confirm-modal" onClick={onCancel}>
			<div className="modal" onClick={e => e.stopPropagation()}>
				<h2>{title}</h2>
				<p className="modal-sub">{body}</p>
				<div className="modal-actions">
					<button className="modal-cancel" onClick={onCancel}>Cancel</button>
					<button className="modal-danger" onClick={onConfirm}>{confirmLabel}</button>
				</div>
			</div>
		</Overlay>
	);
}

type Scene = { id: number; name: string; updated?: string };

function Editor({ user, initialSceneId, restore, onAuthenticated, onLogout }: {
	user: string | null;
	initialSceneId?: number;
	restore: boolean;
	onAuthenticated: (name: string, sceneId?: number) => void;
	onLogout: () => void;
}) {
	const loggedIn = !!user;
	const [initialData, setInitialData] = useState<any>();
	const [scenes, setScenes] = useState<Scene[]>([]);
	const [activeId, setActiveId] = useState<number>(0);
	const [editingId, setEditingId] = useState<number>(0);
	const [editingName, setEditingName] = useState("");
	const [lastTab, setLastTab] = useState(PROJECTS_TAB);
	const [status, setStatus] = useState("");
	const [showAuth, setShowAuth] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState<Scene | null>(null);
	const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
	const activeIdRef = useRef(0);
	const libraryRef = useRef<any[]>([]);
	const saveTimer = useRef<number>();
	const prefsTimer = useRef<number>();
	const desiredSidebar = useRef<{ name: string; tab: string } | null>(null);
	const openedRef = useRef(false);

	useHandleLibrary({
		excalidrawAPI,
		adapter: loggedIn ? serverLibraryAdapter : localLibraryAdapter,
		validateLibraryUrl,
	});

	const refreshScenes = useCallback(async () => {
		const res = await api("scene_list");
		const list = (res.scenes ?? []) as Scene[];
		setScenes(list);
		return list;
	}, []);

	useEffect(() => {
		if (!loggedIn) {
			setInitialData({ elements: [] });
			return;
		}
		(async () => {
			const [list, prefsRes] = await Promise.all([refreshScenes(), api("prefs_load")]);
			const prefs = prefsRes.prefs ?? {};
			if (prefs.openSidebar?.tab) setLastTab(prefs.openSidebar.tab);
			let openId = initialSceneId;
			if (!openId && restore && prefs.lastSceneId && list.some((s: Scene) => s.id === prefs.lastSceneId))
				openId = prefs.lastSceneId;
			if (!openId && list.length === 0) {
				const created = await api("scene_create", { name: "Untitled" });
				openId = created.id;
				await refreshScenes();
			}
			let data: any = { elements: [] };
			if (openId) {
				activeIdRef.current = openId;
				setActiveId(openId);
				const scene = await api("scene_load", { id: openId });
				data = scene.data ?? { elements: [] };
			}
			desiredSidebar.current = restore
				? (prefs.openSidebar === undefined ? { name: "default", tab: PROJECTS_TAB } : prefs.openSidebar)
				: { name: "default", tab: PROJECTS_TAB };
			setInitialData({
				...data,
				appState: {
					...(data.appState ?? {}),
					...(prefs.theme ? { theme: prefs.theme } : {}),
					defaultSidebarDockedPreference: prefs.docked ?? true,
				},
			});
		})();
	}, [loggedIn, initialSceneId, restore, refreshScenes]);

	useEffect(() => {
		const active = scenes.find(s => s.id === activeId);
		document.title = active ? `Excalidraw / ${active.name}` : "Excalidraw";
	}, [activeId, scenes]);

	useEffect(() => {
		if (loggedIn && excalidrawAPI && !openedRef.current) {
			openedRef.current = true;
			if (desiredSidebar.current)
				excalidrawAPI.toggleSidebar({ name: desiredSidebar.current.name, tab: desiredSidebar.current.tab, force: true });
		}
	}, [loggedIn, excalidrawAPI]);

	const saveScene = useCallback((id: number, elements: any, files: any, appState: any) =>
		api("scene_save", {
			id,
			data: {
				elements,
				files,
				appState: {
					viewBackgroundColor: appState.viewBackgroundColor,
					scrollX: appState.scrollX,
					scrollY: appState.scrollY,
					zoom: appState.zoom,
				},
			},
		}), []);

	const onChange = useCallback((elements: any[], appState: any, files: any) => {
		if (!loggedIn) return;
		if (appState.openSidebar?.tab) setLastTab(appState.openSidebar.tab);
		clearTimeout(prefsTimer.current);
		prefsTimer.current = window.setTimeout(() => api("prefs_save", {
			data: {
				theme: appState.theme,
				lastSceneId: activeIdRef.current || null,
				openSidebar: appState.openSidebar || null,
				docked: appState.defaultSidebarDockedPreference,
			},
		}), 800);
		clearTimeout(saveTimer.current);
		setStatus("saving…");
		saveTimer.current = window.setTimeout(async () => {
			let id = activeIdRef.current;
			if (!id) {
				if (!elements.length) { setStatus(""); return; }
				const created = await api("scene_create", { name: "Untitled" });
				id = created.id;
				activeIdRef.current = id;
				setActiveId(id);
				await refreshScenes();
			}
			const res = await saveScene(id, elements, files, appState);
			setStatus(res.error ? message(res.error, res.args) : "saved");
		}, 800);
	}, [loggedIn, saveScene, refreshScenes]);

	const onLibraryChange = useCallback((items: any[]) => {
		libraryRef.current = items;
	}, []);

	const handleAuthSuccess = useCallback(async (username: string) => {
		setShowAuth(false);
		let seededId: number | undefined;
		if (excalidrawAPI) {
			const elements = excalidrawAPI.getSceneElements();
			if (elements.length) {
				const created = await api("scene_create", { name: "Untitled" });
				await saveScene(created.id, elements, excalidrawAPI.getFiles(), excalidrawAPI.getAppState());
				seededId = created.id;
			}
		}
		const localLib = libraryRef.current;
		if (localLib && localLib.length) {
			const existing = (await api("library_load")).items ?? [];
			const byId = new Map<string, any>();
			for (const item of [...existing, ...localLib]) byId.set(item.id, item);
			await api("library_save", { data: [...byId.values()] });
			localStorage.removeItem(ANON_LIBRARY_KEY);
		}
		onAuthenticated(username, seededId);
	}, [excalidrawAPI, saveScene, onAuthenticated]);

	const openScene = useCallback(async (id: number) => {
		if (!excalidrawAPI || id === activeIdRef.current) return;
		clearTimeout(saveTimer.current);
		if (activeIdRef.current)
			await saveScene(activeIdRef.current, excalidrawAPI.getSceneElements(), excalidrawAPI.getFiles(), excalidrawAPI.getAppState());
		const scene = await api("scene_load", { id });
		const data = scene.data ?? { elements: [] };
		activeIdRef.current = id;
		setActiveId(id);
		const view = data.appState ?? {};
		const patch: any = {};
		if (view.viewBackgroundColor) patch.viewBackgroundColor = view.viewBackgroundColor;
		if (view.scrollX != null) patch.scrollX = view.scrollX;
		if (view.scrollY != null) patch.scrollY = view.scrollY;
		if (view.zoom) patch.zoom = view.zoom;
		excalidrawAPI.updateScene({ elements: data.elements ?? [], appState: patch });
		if (data.files) excalidrawAPI.addFiles(Object.values(data.files));
		if (view.scrollX == null) excalidrawAPI.scrollToContent(undefined, { fitToContent: true });
	}, [excalidrawAPI, saveScene]);

	const newScene = useCallback(async () => {
		const created = await api("scene_create", { name: "Untitled" });
		await refreshScenes();
		openScene(created.id);
	}, [refreshScenes, openScene]);

	const startRename = useCallback((scene: Scene) => {
		setEditingId(scene.id);
		setEditingName(scene.name);
	}, []);

	const commitRename = useCallback(async () => {
		const id = editingId;
		const name = editingName.trim();
		setEditingId(0);
		if (!id || !name) return;
		const current = scenes.find(s => s.id === id);
		if (current && current.name === name) return;
		await api("scene_rename", { id, name });
		refreshScenes();
	}, [editingId, editingName, scenes, refreshScenes]);

	const deleteScene = useCallback(async (scene: Scene) => {
		setConfirmDelete(null);
		await api("scene_delete", { id: scene.id });
		const list = await refreshScenes();
		if (scene.id === activeIdRef.current) {
			activeIdRef.current = 0;
			setActiveId(0);
			if (list[0]) openScene(list[0].id);
			else excalidrawAPI?.updateScene({ elements: [] });
		}
	}, [refreshScenes, openScene, excalidrawAPI]);

	if (initialData === undefined) return <Loading />;
	return (
		<div className="editor">
			<Excalidraw
				initialData={initialData}
				onChange={onChange}
				onLibraryChange={onLibraryChange}
				onExcalidrawAPI={api => { setExcalidrawAPI(api); (window as any).excalidraw = api; }}
				libraryReturnUrl={window.location.origin + window.location.pathname}
			>
				<MainMenu>
					<MainMenu.DefaultItems.ToggleTheme />
					<MainMenu.DefaultItems.ChangeCanvasBackground />
					<MainMenu.DefaultItems.SaveAsImage />
					<MainMenu.DefaultItems.ClearCanvas />
					<MainMenu.Separator />
					{loggedIn ? (
						<>
							<MainMenu.Item icon={folderIcon} onSelect={() => excalidrawAPI?.toggleSidebar({ name: "default", tab: PROJECTS_TAB, force: true })}>
								Projects
							</MainMenu.Item>
							<MainMenu.Item icon={null as any} onSelect={async () => { await api("logout"); onLogout(); }}>
								Log out ({user})
							</MainMenu.Item>
						</>
					) : (
						<MainMenu.Item icon={null as any} onSelect={() => setShowAuth(true)}>
							Log in / Sign up
						</MainMenu.Item>
					)}
				</MainMenu>
				{loggedIn && (
					<>
						<DefaultSidebar.Trigger tab={lastTab} icon={panelIcon} title="Projects & library" />
						<DefaultSidebar>
							<DefaultSidebar.TabTriggers>
								<Sidebar.TabTrigger tab={PROJECTS_TAB}>{folderIcon}</Sidebar.TabTrigger>
							</DefaultSidebar.TabTriggers>
							<Sidebar.Tab tab={PROJECTS_TAB}>
								<div className="projects">
									<h2 className="projects-title">Projects</h2>
									<button className="projects-new" onClick={newScene}>+ New project</button>
									{scenes.map(scene => editingId === scene.id ? (
										<input
											key={scene.id}
											className="projects-edit"
											value={editingName}
											autoFocus
											onChange={e => setEditingName(e.target.value)}
											onBlur={commitRename}
											onKeyDown={e => {
												e.stopPropagation();
												if (e.key === "Enter") commitRename();
												else if (e.key === "Escape") setEditingId(0);
											}}
										/>
									) : (
										<div key={scene.id} className={"projects-item" + (scene.id === activeId ? " active" : "")}>
											<span className="projects-name" onClick={() => openScene(scene.id)} onDoubleClick={() => startRename(scene)}>{scene.name}</span>
											<button className="projects-action" title="Rename" onClick={() => startRename(scene)}>{pencilIcon}</button>
											<button className="projects-action" title="Delete" onClick={() => setConfirmDelete(scene)}>{trashIcon}</button>
										</div>
									))}
								</div>
							</Sidebar.Tab>
						</DefaultSidebar>
					</>
				)}
				{!loggedIn && (
					<Footer>
						<button className="login-cta" onClick={() => setShowAuth(true)}>Log in to save</button>
					</Footer>
				)}
			</Excalidraw>
			{showAuth && <Auth onSuccess={handleAuthSuccess} onClose={() => setShowAuth(false)} />}
			{confirmDelete && (
				<Confirm
					title="Delete project"
					body={`"${confirmDelete.name}" will be permanently deleted.`}
					confirmLabel="Delete"
					onConfirm={() => deleteScene(confirmDelete)}
					onCancel={() => setConfirmDelete(null)}
				/>
			)}
			{status && <span className="status">{status}</span>}
		</div>
	);
}

function Loading() {
	return <div className="loading">Loading…</div>;
}

function App() {
	const [user, setUser] = useState<string | null | undefined>();
	const [seededId, setSeededId] = useState<number>();
	const [restore, setRestore] = useState(false);
	useEffect(() => {
		api("whoami").then(res => { setRestore(true); setUser(res.username); });
	}, []);
	if (user === undefined) return <Loading />;
	return (
		<Editor
			key={user ?? "anon"}
			user={user}
			initialSceneId={seededId}
			restore={restore}
			onAuthenticated={(name, sceneId) => { setRestore(false); setSeededId(sceneId); setUser(name); }}
			onLogout={() => { setRestore(false); setSeededId(undefined); setUser(null); }}
		/>
	);
}

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
