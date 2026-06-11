import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Excalidraw, MainMenu } from "@excalidraw/excalidraw";
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

function Auth({ onAuth }: { onAuth: (name: string) => void }) {
	const [register, setRegister] = useState(false);
	const [error, setError] = useState("");
	async function submit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		const form = Object.fromEntries(new FormData(e.currentTarget) as any);
		const res = await api(register ? "register" : "login", form);
		if (res.error) setError(message(res.error, res.args));
		else onAuth(res.username);
	}
	return (
		<form className="auth" onSubmit={submit}>
			<h1>✏️ Excalidraw</h1>
			<input name="username" placeholder="username" autoComplete="username" autoFocus />
			<input name="password" type="password" placeholder="password" autoComplete={register ? "new-password" : "current-password"} />
			<button>{register ? "Create account" : "Log in"}</button>
			{error && <p className="error">{error}</p>}
			<a href="#" onClick={e => { e.preventDefault(); setError(""); setRegister(!register); }}>
				{register ? "I already have an account" : "Create an account"}
			</a>
		</form>
	);
}

function Editor({ username, onLogout }: { username: string; onLogout: () => void }) {
	const [initialData, setInitialData] = useState<any>();
	const [status, setStatus] = useState("");
	const timer = useRef<number>();
	const libTimer = useRef<number>();
	useEffect(() => {
		Promise.all([api("scene_load"), api("library_load")]).then(([scene, lib]) =>
			setInitialData({ ...(scene.data ?? { elements: [] }), libraryItems: lib.items ?? [] }),
		);
	}, []);
	const onChange = useCallback((elements: any, appState: any, files: any) => {
		clearTimeout(timer.current);
		setStatus("saving…");
		timer.current = window.setTimeout(async () => {
			const res = await api("scene_save", {
				data: { elements, files, appState: { viewBackgroundColor: appState.viewBackgroundColor } },
			});
			setStatus(res.error ? message(res.error, res.args) : "saved");
		}, 800);
	}, []);
	const onLibraryChange = useCallback((items: any) => {
		clearTimeout(libTimer.current);
		libTimer.current = window.setTimeout(() => api("library_save", { data: items }), 800);
	}, []);
	async function logout() {
		await api("logout");
		onLogout();
	}
	if (initialData === undefined) return <Loading />;
	return (
		<div className="editor">
			<Excalidraw initialData={initialData} onChange={onChange} onLibraryChange={onLibraryChange}>
				<MainMenu>
					<MainMenu.DefaultItems.ToggleTheme />
					<MainMenu.DefaultItems.ChangeCanvasBackground />
					<MainMenu.DefaultItems.SaveAsImage />
					<MainMenu.DefaultItems.ClearCanvas />
					<MainMenu.Separator />
					<MainMenu.Item icon={null as any} onSelect={logout}>
						Log out ({username})
					</MainMenu.Item>
				</MainMenu>
			</Excalidraw>
			{status && <span className="status">{status}</span>}
		</div>
	);
}

function Loading() {
	return <div className="loading">Loading…</div>;
}

function App() {
	const [user, setUser] = useState<string | null | undefined>();
	useEffect(() => {
		api("whoami").then(res => setUser(res.username));
	}, []);
	if (user === undefined) return <Loading />;
	if (user === null) return <Auth onAuth={setUser} />;
	return <Editor username={user} onLogout={() => setUser(null)} />;
}

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
