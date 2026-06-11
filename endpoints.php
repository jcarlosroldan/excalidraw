<?php

require_once __DIR__ . "/db.php";
use function Oink\{str, any, check};

function _cookie_path() {
	return rtrim(str_replace("\\", "/", dirname($_SERVER["SCRIPT_NAME"])), "/") . "/";
}

function _set_session($token) {
	setcookie("sid", $token, [
		"path" => _cookie_path(),
		"httponly" => true,
		"secure" => !empty($_SERVER["HTTPS"]),
		"samesite" => "Lax",
		"expires" => time() + 60 * 60 * 24 * 365,
	]);
}

function _current_user() {
	return DB\user_by_session(any("sid", optional: true));
}

function _require_user() {
	$user = _current_user();
	check($user, "notLoggedIn");
	return $user;
}

function register() {
	$username = str("username", min: 3, max: 32, pattern: "/^[a-zA-Z0-9_.-]+$/");
	$password = str("password", min: 6, max: 256);
	check(!DB\user_by_name($username), "usernameTaken");
	$id = DB\create_user($username, $password);
	_set_session(DB\create_session($id));
	return ["username" => $username];
}

function login() {
	$username = str("username");
	$password = str("password");
	$user = DB\user_by_name($username);
	check($user && password_verify($password, $user["password"]), "wrongCredentials");
	_set_session(DB\create_session($user["id"]));
	return ["username" => $user["username"]];
}

function logout() {
	$token = any("sid", optional: true);
	if ($token) DB\delete_session($token);
	setcookie("sid", "", ["path" => _cookie_path(), "expires" => 1]);
}

function whoami() {
	$user = _current_user();
	return ["username" => $user ? $user["username"] : null];
}

function scene_load() {
	$user = _require_user();
	$data = DB\load_scene($user["id"]);
	return ["data" => $data === null ? null : json_decode($data, true)];
}

function scene_save() {
	$user = _require_user();
	$data = any("data");
	DB\save_scene($user["id"], json_encode($data, JSON_UNESCAPED_UNICODE));
}

function library_load() {
	$user = _require_user();
	$data = DB\load_library($user["id"]);
	return ["items" => $data === null ? [] : json_decode($data, true)];
}

function library_save() {
	$user = _require_user();
	$data = any("data");
	DB\save_library($user["id"], json_encode($data, JSON_UNESCAPED_UNICODE));
}
